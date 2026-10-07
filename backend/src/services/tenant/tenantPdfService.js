/**
 * Renders a tenant report's print view to a PDF file with headless Chrome, so
 * the download never goes through the browser's print dialog (which, in Safari
 * especially, stamps the page URL, title and date on every page).
 *
 * The page is opened as the requesting user (their token is placed in the
 * page's localStorage), so it sees exactly what they see.
 *
 * The server is short of memory and shared with other deployments, so:
 *   - one render at a time, and none when available memory is low;
 *   - the posts appendix is rendered in slices (one tone, APPENDIX_SLICE posts
 *     at a time, a fresh page per slice) rather than as one huge document;
 *   - the slices are joined and page numbers stamped with pdf-lib.
 */

const fs = require('fs');
const puppeteer = require('puppeteer');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const TenantPost = require('../../models/tenant/TenantPost');
const { TONE_QUERY } = require('./tenantReportService');

const os = require('os');
const path = require('path');

const APPENDIX_SLICE = parseInt(process.env.TENANT_PDF_SLICE || '600', 10);
// Free memory needed (MB). Measured Chrome peaks: about 300 MB for the brief or executive report,
// about 700 MB for a 600-post appendix slice.
const MIN_FREE_MB_REPORT = parseInt(process.env.TENANT_PDF_MIN_FREE_MB || '600', 10);
const MIN_FREE_MB_SLICE = parseInt(process.env.TENANT_PDF_MIN_FREE_MB_SLICE || '900', 10);
// Jobs run in the background, so a render can wait a good while for memory to free up.
const MEMORY_WAIT_MS = 10 * 60000;


const httpError = (status, message) => Object.assign(new Error(message), { status });

/** MemAvailable from /proc/meminfo, in MB (Infinity where unavailable, e.g. macOS). */
const availableMb = () => {
    try {
        const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/);
        return m ? Number(m[1]) / 1024 : Infinity;
    } catch (_) {
        return Infinity;
    }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait (up to a minute) for enough free memory; give up with a 503 only if it never comes. */
const ensureMemory = async (minMb) => {
    const deadline = Date.now() + MEMORY_WAIT_MS;
    while (availableMb() < minMb) {
        if (Date.now() > deadline) throw httpError(503, 'The server is busy right now. Please try the PDF again in a few minutes.');
        await sleep(3000);
    }
};

/**
 * Chrome is started through a small wrapper that sets its out-of-memory score to the
 * maximum, so if the shared server ever runs short the kernel stops the PDF renderer
 * first, never another deployment. Children (renderers) inherit the score.
 */
let wrapperPath = null;
const chromeWrapper = () => {
    if (wrapperPath) return wrapperPath;
    const target = process.env.TENANT_PDF_CHROME_PATH || puppeteer.executablePath();
    if (process.platform !== 'linux' || !target) return target;
    const file = path.join(os.tmpdir(), 'tenant-pdf-chrome.sh');
    fs.writeFileSync(file, `#!/bin/sh\necho 1000 > /proc/self/oom_score_adj 2>/dev/null\nexec "${target}" "$@"\n`, { mode: 0o755 });
    wrapperPath = file;
    return file;
};

const launch = () => puppeteer.launch({
    headless: 'shell',
    // A Chrome already on the host (e.g. Playwright's headless shell); else Puppeteer's own download.
    executablePath: chromeWrapper(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none', '--js-flags=--max-old-space-size=512'],
});

/**
 * Print one print-view URL in its own short-lived Chrome. A shared renderer
 * keeps the memory of earlier parts (it reached 2 GB over a 19,000-post
 * appendix), so each part gets a fresh browser that is closed afterwards.
 */
const printPage = async (url, token, timeout) => {
    const browser = await launch();
    const page = await browser.newPage();
    try {
        await page.evaluateOnNewDocument((t) => { localStorage.setItem('token', t); }, token);
        await page.goto(url, { waitUntil: 'networkidle0', timeout });
        await page.waitForSelector('[data-print-ready="1"], [data-print-error]', { timeout });
        const failed = await page.$eval('[data-print-error]', (el) => el.textContent).catch(() => null);
        if (failed) throw new Error(failed);
        await page.evaluate(() => document.fonts && document.fonts.ready);
        return await page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, timeout });
    } finally {
        await browser.close().catch(() => {});
    }
};

/** Join PDFs in order and stamp "Page X of Y" at the foot of every page. */
const joinAndNumber = async (buffers) => {
    const out = await PDFDocument.create();
    for (const buf of buffers) {
        const doc = await PDFDocument.load(buf);
        const pages = await out.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => out.addPage(p));
    }
    const font = await out.embedFont(StandardFonts.Helvetica);
    const total = out.getPageCount();
    out.getPages().forEach((page, i) => {
        const text = `Page ${i + 1} of ${total}`;
        const size = 8;
        page.drawText(text, {
            x: (page.getWidth() - font.widthOfTextAtSize(text, size)) / 2,
            y: 22,
            size,
            font,
            color: rgb(0.39, 0.45, 0.55),
        });
    });
    return Buffer.from(await out.save());
};

/** Posts per tone in the report's period, for slicing the appendix. */
const toneCounts = async (report) => {
    const base = { tenant_id: report.tenant_id, event_id: report.event_id, 'analysis.is_relevant': true };
    if (report.range_from || report.range_to) {
        base.published_at = {};
        if (report.range_from) base.published_at.$gte = report.range_from;
        if (report.range_to) base.published_at.$lte = report.range_to;
    }
    const entries = await Promise.all(Object.entries(TONE_QUERY).map(async ([tone, q]) => [tone, await TenantPost.countDocuments({ ...base, ...q })]));
    return Object.fromEntries(entries);
};

const renderReportPdf = async ({ baseUrl, token, report, withPosts, executive = false }) => {
    {
        const printUrl = (extra = '') => `${baseUrl}/workspace/print/${encodeURIComponent(report.id)}?pdf=1${extra}`;
        await ensureMemory(MIN_FREE_MB_REPORT);
        const parts = [await printPage(printUrl(executive ? '&format=executive' : ''), token, 120000)];

        if (withPosts) {
            const counts = await toneCounts(report);
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            let first = true;
            for (const tone of ['positive', 'negative', 'neutral']) {
                for (let skip = 0; skip < counts[tone]; skip += APPENDIX_SLICE) {
                    await ensureMemory(MIN_FREE_MB_SLICE);
                    const params = new URLSearchParams({
                        appendix: '1', tone, skip: String(skip), limit: String(APPENDIX_SLICE),
                        tone_total: String(counts[tone]), total: String(total), intro: first ? '1' : '0',
                    });
                    parts.push(await printPage(printUrl(`&${params}`), token, 180000));
                    first = false;
                }
            }
        }
        return await joinAndNumber(parts);
    }
};

// ── Background jobs ──────────────────────────────────────────────────
// A PDF (especially with every post) takes minutes, longer than a request should stay
// open, so downloads are jobs: queued, rendered one at a time, then fetched by id.

const crypto = require('crypto');

const JOB_TTL_MS = 30 * 60000;
const jobs = new Map(); // id → { id, tenant_id, user_id, status, name, file, error, created_at }
let queue = Promise.resolve();

const cleanupJobs = () => {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
        if (job.created_at < cutoff && job.status !== 'running' && job.status !== 'queued') {
            if (job.file) fs.promises.unlink(job.file).catch(() => {});
            jobs.delete(id);
        }
    }
};

/** Queue a PDF render; returns the job (poll getJob, then read job.file when status is 'ready'). */
const startPdfJob = ({ tenantId, userId, name, ...opts }) => {
    cleanupJobs();
    const job = { id: crypto.randomUUID(), tenant_id: tenantId, user_id: userId, status: 'queued', name, file: null, error: null, created_at: Date.now() };
    jobs.set(job.id, job);
    queue = queue.then(async () => {
        job.status = 'running';
        try {
            const pdf = await renderReportPdf(opts);
            job.file = path.join(os.tmpdir(), `tenant-pdf-${job.id}.pdf`);
            await fs.promises.writeFile(job.file, pdf);
            job.status = 'ready';
        } catch (err) {
            console.error('[tenant] PDF job failed:', err.message);
            job.status = 'failed';
            job.error = err.status ? err.message : 'Could not prepare the PDF';
        }
    });
    return job;
};

/** A job, only for the tenant that created it. */
const getJob = (tenantId, id) => {
    const job = jobs.get(id);
    return job && job.tenant_id === tenantId ? job : null;
};

module.exports = { renderReportPdf, startPdfJob, getJob };
