/**
 * check_direct_rapidapi.js
 * Calls each social provider once through blugateClient in its current mode
 * (set SOCIAL_API_MODE=rapidapi to test direct RapidAPI) and reports status
 * only — no keys or response bodies are printed.
 *
 *   SOCIAL_API_MODE=rapidapi node scripts/check_direct_rapidapi.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const blugate = require('../src/services/blugateClient');

const CHECKS = [
    ['twitter', 'get', 'search', { query: 'Election Commission', type: 'Latest', count: 5 }],
    ['facebook', 'get', 'search/posts', { query: 'Election Commission' }],
    ['facebook', 'get', 'page/page_id', { url: 'https://www.facebook.com/TimesNow' }],
    ['instagram', 'post', 'api/instagram/posts', { username: 'cockroachjantaparty' }],
    ['youtube', 'get', 'search', { part: 'snippet', q: 'Election Commission India', type: 'video', maxResults: 1 }],
];

(async () => {
    console.log(`mode: ${blugate.MODE}`);
    for (const [platform, method, path, payload] of CHECKS) {
        if (!blugate.hasCredentials(platform)) {
            console.log(`SKIP  ${platform.padEnd(9)} ${path} — no credentials`);
            continue;
        }
        try {
            const res = method === 'get'
                ? await blugate.get(platform, path, payload, { timeout: 30000 })
                : await blugate.post(platform, path, payload, { timeout: 30000 });
            const size = JSON.stringify(res.data || '').length;
            console.log(`OK    ${platform.padEnd(9)} ${path} — HTTP ${res.status}, ${size} bytes`);
        } catch (err) {
            const status = err.response?.status || 'no-response';
            const msg = String(err.response?.data?.message || err.response?.data?.error || err.message || '').slice(0, 120);
            console.log(`FAIL  ${platform.padEnd(9)} ${path} — ${status} ${msg}`);
        }
    }
})();
