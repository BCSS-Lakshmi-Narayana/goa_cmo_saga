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

const APPENDIX_SLICE = parseInt(process.env.TENANT_PDF_SLICE || '600', 10);
const MIN_FREE_MB_START = parseInt(process.env.TENANT_PDF_MIN_FREE_MB || '1200', 10);
const MIN_FREE_MB_SLICE = Math.round(MIN_FREE_MB_START / 2);

let busy = false;

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

const ensureMemory = (minMb) => {
    if (availableMb() < minMb) throw httpError(503, 'The server is busy right now. Please try the PDF again in a few minutes.');
};

const launch = () => puppeteer.launch({
    headless: 'shell',
    // A Chrome already on the host (e.g. Playwright's headless shell); else Puppeteer's own download.
    executablePath: process.env.TENANT_PDF_CHROME_PATH || undefined,
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
    if (busy) throw httpError(429, 'Another PDF is being prepared. Please try again in a minute.');
    ensureMemory(MIN_FREE_MB_START);
    busy = true;
    try {
        const printUrl = (extra = '') => `${baseUrl}/workspace/print/${encodeURIComponent(report.id)}?pdf=1${extra}`;
        const parts = [await printPage(printUrl(executive ? '&format=executive' : ''), token, 120000)];

        if (withPosts) {
            const counts = await toneCounts(report);
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            let first = true;
            for (const tone of ['positive', 'negative', 'neutral']) {
                for (let skip = 0; skip < counts[tone]; skip += APPENDIX_SLICE) {
                    ensureMemory(MIN_FREE_MB_SLICE);
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
    } finally {
        busy = false;
    }
};

module.exports = { renderReportPdf };
