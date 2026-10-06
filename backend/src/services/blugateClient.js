const axios = require('axios');
const zlib = require('zlib');

/**
 * Shared client for BluGate — the metered gateway that fronts YouTube,
 * Twitter/X, Facebook, and Instagram so API usage can be tracked per client.
 * Endpoint paths/params are identical to the underlying provider's own REST
 * API; only the base URL and auth headers differ.
 *
 * The valid routes per provider are listed in backend/BluGate_Provider_Endpoints.xlsx.
 */

const DEFAULT_GATEWAY_BASE = 'https://blugate.blurasaga.com/api/gateway';

const GATEWAY_BASE = String(process.env.BLUGATE_BASE_URL || DEFAULT_GATEWAY_BASE).trim().replace(/\/+$/, '');

/**
 * SOCIAL_API_MODE picks where social calls go:
 *   'blugate'  (default) — the BluGate gateway, authenticated with BLUGATE_*.
 *   'rapidapi' — straight to each RapidAPI provider BluGate fronts. Paths and
 *                params are the same, so only base URL and headers change.
 *
 * Direct-mode config (keys may be comma-separated; they are used round-robin):
 *   X:         RAPIDAPI_X_HOST | RAPIDAPI_HOST (twitter241.p.rapidapi.com),  RAPIDAPI_X_KEY | RAPIDAPI_KEY
 *   Facebook:  RAPIDAPI_FACEBOOK_HOST (facebook-scraper3.p.rapidapi.com),    RAPIDAPI_FACEBOOK_KEY | RAPIDAPI_KEY
 *   Instagram: RAPIDAPI_INSTAGRAM_HOST (instagram120.p.rapidapi.com),        RAPIDAPI_INSTAGRAM_KEYS | RAPIDAPI_KEY
 *   YouTube:   RAPIDAPI_YOUTUBE_HOST + RAPIDAPI_YOUTUBE_KEY | RAPIDAPI_KEY, or, when no host is set,
 *              Google's YouTube Data API v3 directly with YOUTUBE_API_KEY.
 */
const MODE = String(process.env.SOCIAL_API_MODE || 'blugate').trim().toLowerCase() === 'rapidapi' ? 'rapidapi' : 'blugate';

const env = (...names) => names.map((n) => process.env[n]).find((v) => v && String(v).trim()) || '';

const splitKeys = (raw) => String(raw || '').split(',').map((k) => k.trim()).filter(Boolean);

const RAPIDAPI_PROVIDERS = {
    twitter: () => ({ host: env('RAPIDAPI_X_HOST', 'RAPIDAPI_HOST') || 'twitter241.p.rapidapi.com', keys: splitKeys(env('RAPIDAPI_X_KEY', 'RAPIDAPI_KEY')) }),
    facebook: () => ({ host: env('RAPIDAPI_FACEBOOK_HOST') || 'facebook-scraper3.p.rapidapi.com', keys: splitKeys(env('RAPIDAPI_FACEBOOK_KEY', 'RAPIDAPI_KEY')) }),
    instagram: () => ({ host: env('RAPIDAPI_INSTAGRAM_HOST') || 'instagram120.p.rapidapi.com', keys: splitKeys(env('RAPIDAPI_INSTAGRAM_KEYS', 'RAPIDAPI_INSTAGRAM_KEY', 'RAPIDAPI_KEY')) }),
    youtube: () => ({ host: env('RAPIDAPI_YOUTUBE_HOST'), keys: splitKeys(env('RAPIDAPI_YOUTUBE_KEY', 'RAPIDAPI_KEY')) }),
};

const GOOGLE_YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3';

/** YouTube in direct mode without a RapidAPI host goes to Google with an API key. */
const youtubeViaGoogle = () => MODE === 'rapidapi' && !RAPIDAPI_PROVIDERS.youtube().host;

const keyCursor = {};
const nextKey = (platform, keys) => {
    keyCursor[platform] = ((keyCursor[platform] ?? -1) + 1) % keys.length;
    return keys[keyCursor[platform]];
};

/** Base URL for a platform's provider routes, without a trailing slash. */
const baseFor = (platform) => {
    if (MODE === 'blugate') return `${GATEWAY_BASE}/${platform}`;
    if (platform === 'youtube' && youtubeViaGoogle()) return GOOGLE_YOUTUBE_BASE;
    const provider = RAPIDAPI_PROVIDERS[platform];
    if (!provider) throw new Error(`No direct RapidAPI provider configured for '${platform}'`);
    return `https://${provider().host}`;
};

const hasCredentials = (platform) => {
    if (MODE === 'blugate') return !!(process.env.BLUGATE_API_KEY && process.env.BLUGATE_CLIENT_CODE);
    if (!platform) return Object.keys(RAPIDAPI_PROVIDERS).some((p) => hasCredentials(p));
    if (platform === 'youtube' && youtubeViaGoogle()) return !!env('YOUTUBE_API_KEY');
    const provider = RAPIDAPI_PROVIDERS[platform];
    return !!(provider && provider().keys.length);
};

/**
 * Auth headers for a platform. BluGate uses one credential for every platform;
 * direct RapidAPI needs the platform to pick the provider host and key.
 */
const getHeaders = (platform) => {
    if (MODE === 'blugate') {
        const apiKey = process.env.BLUGATE_API_KEY;
        const clientCode = process.env.BLUGATE_CLIENT_CODE;
        if (!apiKey || !clientCode) {
            throw new Error('BLUGATE_API_KEY / BLUGATE_CLIENT_CODE is not configured');
        }
        return {
            Authorization: `Bearer ${apiKey}`,
            'x-client-id': clientCode
        };
    }

    if (!platform) throw new Error('getHeaders(platform) needs a platform in rapidapi mode');
    if (platform === 'youtube' && youtubeViaGoogle()) return {};
    const { host, keys } = RAPIDAPI_PROVIDERS[platform]();
    if (!keys.length) throw new Error(`RapidAPI key for ${platform} is not configured`);
    return { 'x-rapidapi-key': nextKey(platform, keys), 'x-rapidapi-host': host };
};

/** Extra query params a platform needs for auth (Google's YouTube API takes `key`). */
const authParams = (platform) => {
    if (platform === 'youtube' && youtubeViaGoogle()) {
        const key = env('YOUTUBE_API_KEY');
        if (!key) throw new Error('YOUTUBE_API_KEY is not configured');
        return { key };
    }
    return {};
};

/**
 * Drop null / undefined / empty-string / NaN values so BluGate never receives
 * blank params (axios would otherwise send `count=NaN` or silently omit a
 * required param that resolved to null).
 */
const cleanParams = (params) => {
    if (!params || typeof params !== 'object') return undefined;
    const out = {};
    for (const [key, value] of Object.entries(params)) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'string' && value.trim() === '') continue;
        if (typeof value === 'number' && !Number.isFinite(value)) continue;
        out[key] = value;
    }
    return out;
};

/**
 * BluGate labels responses `Content-Encoding: gzip` even when the body is
 * plain JSON, and axios then fails every call with "incorrect header check".
 * So we take the raw bytes and decompress only when the body really is
 * compressed (gzip magic 1f 8b; zlib 78 xx; brotli when labelled and valid),
 * then decode UTF-8 ourselves and parse JSON. Used by EVERY BluGate call —
 * spread `...blugateClient.responseOptions()` into the axios config.
 */
const decodeBody = (data, headers) => {
    let buf = data;
    if (buf instanceof ArrayBuffer) buf = Buffer.from(buf);
    if (!Buffer.isBuffer(buf)) return data;

    const encoding = String((headers && (headers['content-encoding'] || (headers.get && headers.get('content-encoding')))) || '').toLowerCase();
    try {
        if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
        else if (buf.length > 1 && buf[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(buf[1])) buf = zlib.inflateSync(buf);
        else if (encoding.includes('br') && buf[0] !== 0x7b && buf[0] !== 0x5b) buf = zlib.brotliDecompressSync(buf);
    } catch (_) { /* not actually compressed: use the bytes as they are */ }

    const text = buf.toString('utf8');
    try { return JSON.parse(text); } catch (_) { return text; }
};

const responseOptions = () => ({
    decompress: false,
    responseType: 'arraybuffer',
    transformResponse: [decodeBody],
});

/**
 * BluGate throttles bursts with 429 {"error":"Too many gateway requests",
 * "retryAfterSec":35} (and a Retry-After header). How long to wait, in ms.
 */
const retryAfterMs = (error, fallbackMs = 5000) => {
    const res = error && error.response;
    const header = res && res.headers && Number(res.headers['retry-after']);
    const body = res && res.data && Number(res.data.retryAfterSec);
    const sec = Number.isFinite(body) && body > 0 ? body : (Number.isFinite(header) && header > 0 ? header : null);
    return sec ? sec * 1000 : fallbackMs;
};

/**
 * A short-lived BluGate gateway throttle, worth waiting out. A provider quota
 * (e.g. Google's "Quota exceeded ... per day", also sent as 429) resets only
 * the next day, so it is NOT retried.
 */
const isRateLimited = (error) => {
    const res = error && error.response;
    if (!res || res.status !== 429) return false;
    const body = res.data || {};
    const message = String((body.error && body.error.message) || body.error || body.message || '');
    if (/quota exceeded|per day/i.test(message)) return false;
    return true;
};

/**
 * Run a BluGate call, and on 429 wait as long as BluGate asks (capped) and
 * retry. Waits longer than `maxWaitMs` are not slept through: the error is
 * rethrown so the caller's own cooldown / next scheduler tick handles it.
 */
const withRateLimitRetry = async (fn, { retries = 2, maxWaitMs = 60000, label = 'BluGate' } = {}) => {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            if (!isRateLimited(error) || attempt >= retries) throw error;
            const wait = retryAfterMs(error, 5000 * (attempt + 1));
            if (wait > maxWaitMs) throw error;
            console.warn(`[${label}] 429 rate limited, retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${retries})`);
            await new Promise((r) => setTimeout(r, wait));
        }
    }
};

const request = async (platform, { method = 'get', path = '', params, data, headers = {}, timeout = 30000 } = {}) => {
    const cleanPath = String(path || '').replace(/^\/+/, '');
    return withRateLimitRetry(() => axios({
        method,
        url: `${baseFor(platform)}/${cleanPath}`,
        params: cleanParams({ ...params, ...authParams(platform) }),
        data,
        timeout,
        headers: { ...getHeaders(platform), ...headers },
        ...responseOptions(),
    }), { label: `${MODE === 'blugate' ? 'BluGate' : 'RapidAPI'} ${platform}` });
};

const get = (platform, path, params, opts = {}) => request(platform, { method: 'get', path, params, ...opts });
const post = (platform, path, data, opts = {}) => request(platform, { method: 'post', path, data, ...opts });

module.exports = {
    retryAfterMs,
    isRateLimited,
    withRateLimitRetry,
    responseOptions,
    decodeBody,
    GATEWAY_BASE,
    MODE,
    baseFor,
    authParams,
    hasCredentials,
    getHeaders,
    cleanParams,
    request,
    get,
    post
};
