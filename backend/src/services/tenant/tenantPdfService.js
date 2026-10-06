/**
 * Renders a tenant report to PDF with the server's Puppeteer, by opening the
 * frontend's print page for that report. The page gets a short-lived token in
 * the URL fragment (never sent to the server) and sets window.__REPORT_READY__
 * once the brief has rendered. Renders run one at a time to keep memory flat.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../../config/jwtSecret');

const STORAGE_DIR = path.resolve(__dirname, '../../../storage/tenant_reports');

let queue = Promise.resolve();

const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '');

const pdfPathFor = (tenantId, reportId) => path.join(STORAGE_DIR, safe(tenantId), `${safe(reportId)}.pdf`);

const render = async ({ baseUrl, reportId, userId, outPath }) => {
    const puppeteer = require('puppeteer');
    const token = jwt.sign({ user_id: userId }, getJwtSecret(), { expiresIn: '5m' });
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1100, height: 1400 });
        await page.goto(`${baseUrl}/workspace/print/${encodeURIComponent(reportId)}#token=${token}`, { waitUntil: 'networkidle0', timeout: 90000 });
        await page.waitForFunction('window.__REPORT_READY__ === true || window.__REPORT_ERROR__', { timeout: 60000 });
        const failed = await page.evaluate(() => window.__REPORT_ERROR__ || null);
        if (failed) throw new Error(`print page failed: ${failed}`);
        await page.emulateMediaType('print');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        await page.pdf({
            path: outPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' },
        });
    } finally {
        await browser.close();
    }
};

/** Returns the PDF path for a report, rendering it first if needed. */
const ensureReportPdf = ({ tenantId, reportId, userId, baseUrl }) => {
    const outPath = pdfPathFor(tenantId, reportId);
    if (fs.existsSync(outPath)) return Promise.resolve(outPath);
    const job = queue.then(() => (fs.existsSync(outPath) ? null : render({ baseUrl, reportId, userId, outPath })));
    queue = job.catch(() => {});
    return job.then(() => outPath);
};

module.exports = { ensureReportPdf, pdfPathFor };
