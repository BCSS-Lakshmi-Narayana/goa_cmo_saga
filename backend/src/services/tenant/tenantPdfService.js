/**
 * Renders a tenant report's print view to a PDF file with headless Chrome, so
 * the download never goes through the browser's print dialog (which, in Safari
 * especially, stamps the page URL, title and date on every page).
 *
 * The page is opened as the requesting user (their token is placed in the
 * page's localStorage), so it sees exactly what they see. One render at a time:
 * the server is short of memory.
 */

const puppeteer = require('puppeteer');

let busy = false;

const renderReportPdf = async ({ baseUrl, token, reportId, withPosts }) => {
    if (busy) {
        const err = new Error('Another PDF is being prepared. Please try again in a minute.');
        err.status = 429;
        throw err;
    }
    busy = true;
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'shell',
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
        });
        const page = await browser.newPage();
        await page.evaluateOnNewDocument((t) => { localStorage.setItem('token', t); }, token);
        const url = `${baseUrl}/workspace/print/${encodeURIComponent(reportId)}?pdf=1${withPosts ? '&posts=1' : ''}`;
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
        // The print view marks itself ready once the report (and posts, if asked) are rendered.
        await page.waitForSelector('[data-print-ready="1"], [data-print-error]', { timeout: withPosts ? 420000 : 120000 });
        const failed = await page.$eval('[data-print-error]', (el) => el.textContent).catch(() => null);
        if (failed) throw new Error(failed);
        await page.evaluate(() => document.fonts && document.fonts.ready);
        return await page.pdf({
            preferCSSPageSize: true,
            printBackground: true,
            displayHeaderFooter: false,
            timeout: withPosts ? 600000 : 180000,
        });
    } finally {
        busy = false;
        if (browser) await browser.close().catch(() => {});
    }
};

module.exports = { renderReportPdf };
