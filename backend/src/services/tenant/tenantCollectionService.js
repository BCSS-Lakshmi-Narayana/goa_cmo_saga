/**
 * Collects public X, Facebook and Instagram posts for a tenant event into
 * tenant_posts, using the deployment's existing provider clients.
 *
 *   X         — search queries (Top, plus paginated Latest)
 *   Facebook  — post search queries, and recent posts of listed public pages
 *               (kept only if they mention the event)
 *   Instagram — recent posts of the event's listed accounts (the provider has
 *               no hashtag search), kept only if they mention the event
 *   YouTube   — video search in the event window, plus comments on the most
 *               viewed relevant videos
 *   Reddit    — public search
 *   Telegram  — global search of public channels; only inside the running
 *               backend, which owns the Telegram session (a second connection
 *               from a script would invalidate it)
 *
 * Only what a provider returns is stored; a missing timestamp or metric stays
 * null. Posts are de-duplicated on (tenant, event, platform, post id), and
 * reposts are stored as their own rows pointing at the original.
 */

const axios = require('axios');
const TenantPost = require('../../models/tenant/TenantPost');
const xService = require('../rapidApiXService');
const igService = require('../rapidApiInstagramService');
const blugate = require('../blugateClient');
const redditService = require('../redditService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Providers rate-limit in bursts. Wait out a 429/cooldown and try again, but
// never retry an empty answer or a hard refusal (403 "not subscribed", 404):
// those will not change by waiting.
const PROVIDER_RETRY_WAIT_MS = parseInt(process.env.TENANT_PROVIDER_RETRY_WAIT_MS || '60000', 10);
const isRateLimit = (err) => err?.response?.status === 429 || /cooldown|rate.?limit|429/i.test(String(err?.code || err?.message || ''));
const withRetry = async (fn, attempts = 3) => {
    for (let i = 0; ; i++) {
        try {
            return await fn();
        } catch (err) {
            if (!isRateLimit(err) || i >= attempts - 1) {
                console.warn(`[tenantCollect] provider error: ${err.response?.status || ''} ${err.message}`);
                return null;
            }
            await sleep(PROVIDER_RETRY_WAIT_MS);
        }
    }
};

const toNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const validDate = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v);
    return Number.isNaN(d.getTime()) ? null : d;
};

const extractHashtags = (text) =>
    [...new Set((String(text || '').match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.toLowerCase()))];

const extractMentions = (text) =>
    [...new Set((String(text || '').match(/@[A-Za-z0-9_.]+/g) || []).map((h) => h.toLowerCase()))];

const sumEngagement = (m) => ['likes', 'comments', 'shares', 'views']
    .reduce((acc, k) => acc + (k === 'views' ? 0 : (m[k] || 0)), 0);

// ── X ────────────────────────────────────────────────────────────────

const fromTweet = (t) => {
    const raw = t.raw_data || {};
    const outer = raw.result || raw.tweet || raw;
    const outerLegacy = outer.legacy || {};
    const outerUser = outer.core?.user_results?.result?.legacy || {};
    const isRepost = Boolean(t.is_repost);

    // normalizeTweet resolves a retweet to the original tweet; keep the
    // retweet itself as the row and point at the original.
    const postId = isRepost ? (outerLegacy.id_str || outer.rest_id || null) : t.id;
    const handle = isRepost ? (outerUser.screen_name || null) : t.author_handle;
    const quoted = Boolean(t.quoted_content);
    const reply = Boolean(t.in_reply_to_id);

    // A retweet carries the original's counters; giving them to the repost row
    // would double-count, so reposts get no metrics of their own.
    const metrics = isRepost ? { likes: null, comments: null, shares: null, views: null } : {
        likes: toNum(t.metrics?.like),
        comments: toNum(t.metrics?.reply),
        shares: (toNum(t.metrics?.retweet) || 0) + (toNum(t.metrics?.quote) || 0),
        views: toNum(t.metrics?.views) || null,
    };

    return {
        platform: 'x',
        platform_post_id: String(postId || t.id),
        url: isRepost && handle ? `https://x.com/${handle}/status/${postId}` : t.url,
        author_name: isRepost ? (outerUser.name || null) : (t.author || null),
        author_handle: handle && handle !== 'unknown' ? handle : null,
        author_followers: toNum(isRepost ? outerUser.followers_count
            : outer.core?.user_results?.result?.legacy?.followers_count),
        author_verified: typeof t.verified === 'boolean' ? t.verified : null,
        published_at: validDate(isRepost ? outerLegacy.created_at : t.created_at),
        text: t.text || '',
        hashtags: extractHashtags(t.text),
        mentions: extractMentions(t.text),
        media: (t.media || []).map((m) => ({ kind: m.type || m.kind || null, url: m.url || m.media_url_https || null })),
        language: outerLegacy.lang && outerLegacy.lang !== 'und' ? outerLegacy.lang : null,
        location: null,
        post_type: isRepost ? 'repost' : quoted ? 'quote' : reply ? 'reply' : 'original',
        original_post_id: isRepost ? t.id : null,
        original_author_handle: isRepost ? t.author_handle : (t.quoted_content?.author_handle || null),
        metrics,
        collected_via: 'x_search',
    };
};

// Pull tweets and the bottom cursor out of a raw search timeline response.
const readSearchPage = (data) => {
    const instructions = data?.result?.timeline?.instructions
        || data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions
        || data?.timeline?.instructions || [];
    const tweets = [];
    let cursor = null;
    instructions.forEach((ins) => {
        const entries = ins.entries || (ins.entry ? [ins.entry] : []);
        entries.forEach((entry) => {
            const c = entry.content || {};
            if (c.cursorType === 'Bottom' || /cursor-bottom/.test(entry.entryId || '')) cursor = c.value || cursor;
            const raws = [c.itemContent?.tweet_results?.result, ...(c.items || []).map((i) => i?.item?.itemContent?.tweet_results?.result)];
            raws.filter(Boolean).forEach((r) => {
                const t = xService.normalizeTweet(r);
                if (t) tweets.push(t);
            });
        });
    });
    return { tweets, cursor };
};

const X_LATEST_PAGES = 3;

/**
 * Top results via the shared searchTweets, plus up to `latestPages` pages of
 * Latest. With `stopBefore`, paging stops at the first page whose tweets are
 * all older than it — an incremental refresh then costs a page or two.
 */
const collectX = async (queries, since, latestPages = X_LATEST_PAGES, stopBefore = null) => {
    const sinceStr = since ? new Date(since).toISOString().slice(0, 10) : null;
    const out = [];
    for (const q of queries) {
        const top = await xService.searchTweets(q, sinceStr);
        top.forEach((t) => out.push({ query: q, post: fromTweet(t) }));

        let cursor = null;
        let empty = 0;
        for (let page = 0; page < latestPages; page++) {
            try {
                const params = { query: sinceStr ? `${q} since:${sinceStr}` : q, type: 'Latest', count: 40 };
                if (cursor) params.cursor = cursor;
                const res = readSearchPage(await xService.rapidGet('search', params));
                res.tweets.forEach((t) => out.push({ query: q, post: fromTweet(t) }));
                // Stop at the end of results, after two pages that add nothing,
                // or once a whole page predates the incremental cut-off.
                empty = res.tweets.length ? 0 : empty + 1;
                if (!res.cursor || res.cursor === cursor || empty >= 2) break;
                if (stopBefore && res.tweets.length && res.tweets.every((t) => t.created_at && new Date(t.created_at) < stopBefore)) break;
                cursor = res.cursor;
            } catch (err) {
                console.warn(`[tenantCollect] X Latest page ${page + 1} failed for "${q}": ${err.message}`);
                break;
            }
        }
    }
    return out;
};

// ── Facebook ─────────────────────────────────────────────────────────
// facebook-scraper3: /search/posts and /page/posts return a few posts per
// call plus a `cursor` for the next page.

const fbGet = async (path, params) => (await blugate.get('facebook', path, params)).data;

const fbDay = (d) => new Date(d).toISOString().slice(0, 10);

const fromFacebook = (r, via) => {
    const text = r.message || r.text || '';
    const files = r.video_files || {};
    const media = [];
    const video = files.video_hd_file || files.video_sd_file || r.video || null;
    if (video) media.push({ kind: 'video', url: video });
    if (r.image) media.push({ kind: 'photo', url: typeof r.image === 'string' ? r.image : (r.image.uri || r.image.url || null) });
    return {
        platform: 'facebook',
        platform_post_id: String(r.post_id || r.id),
        url: r.url || null,
        author_name: r.author?.name || null,
        author_handle: r.author?.url ? r.author.url.replace(/^https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, '') : (r.author?.id || null),
        published_at: validDate(r.timestamp),
        text,
        hashtags: extractHashtags(text),
        mentions: [],
        media: media.filter((m) => m.url),
        post_type: r.attached_post || r.attached_post_url ? 'quote' : 'original',
        metrics: {
            likes: toNum(r.reactions_count),
            comments: toNum(r.comments_count),
            shares: toNum(r.reshare_count),
            views: toNum(r.video_view_count),
        },
        collected_via: via,
    };
};

/** Page through a cursor-based endpoint, keeping posts inside the window. */
const fbPaged = async (path, params, maxPages, since, via, label) => {
    const out = [];
    let cursor;
    let stale = 0;
    for (let page = 0; page < maxPages; page++) {
        let data;
        try {
            data = await withRetry(() => fbGet(path, { ...params, cursor }));
        } catch (_) { data = null; }
        if (!data) break;
        const rows = data.results || [];
        const posts = rows.map((r) => fromFacebook(r, via)).filter((p) => p.platform_post_id && p.platform_post_id !== 'undefined');
        const fresh = posts.filter((p) => !since || !p.published_at || p.published_at >= since);
        fresh.forEach((post) => out.push({ query: label, post }));
        // Page posts come newest first: two pages with nothing in the window means we are past it.
        stale = fresh.length ? 0 : stale + 1;
        if (!data.cursor || !rows.length || stale >= 2) break;
        cursor = typeof data.cursor === 'string' ? data.cursor : JSON.stringify(data.cursor);
    }
    return out;
};

const collectFacebook = async (queries, since, pagesPerQuery) => {
    const out = [];
    const window = since ? { start_date: fbDay(since), end_date: fbDay(Date.now() + 86400000) } : {};
    for (const q of queries) {
        out.push(...(await fbPaged('search/posts', { query: q, ...window }, pagesPerQuery, since, 'facebook_search', q)));
    }
    return out;
};

const collectFacebookPages = async (pages, since, mentionsEvent, pagesPerPage) => {
    const out = [];
    for (const page of pages) {
        let pageId = /^\d+$/.test(page) ? page : null;
        if (!pageId) {
            try {
                pageId = (await withRetry(() => fbGet('page/page_id', { url: page })))?.page_id || null;
            } catch (_) { pageId = null; }
        }
        if (!pageId) continue;
        const rows = await fbPaged('page/posts', { page_id: pageId }, pagesPerPage, since, 'facebook_page', `page:${page}`);
        // Outlet pages post about everything; keep only posts about this event.
        rows.filter(({ post }) => mentionsEvent(post.text)).forEach((r) => out.push(r));
    }
    return out;
};

// ── Instagram ────────────────────────────────────────────────────────
// ig-downloader-api has no search, so Instagram is collected from accounts:
// each listed account's posts (12 a page, paged with maxId), its reels feed
// and posts that tag it, then the comments on the event's posts and reels
// (15 a page, newest first, paged with minId) — the bulk of the discussion.

const igNode = (p) => p.node?.media || p.node || p;

// Media ids carry their creation time (ms since 2011-08-24, above bit 23) and
// shortcodes encode the id, so reels and tagged posts, which come without a
// timestamp, still get a date.
const IG_EPOCH_MS = 1314220021721n;
const IG_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const igDateFromCode = (code) => {
    if (!code) return null;
    let n = 0n;
    for (const ch of String(code).slice(0, 11)) {
        const i = IG_B64.indexOf(ch);
        if (i < 0) return null;
        n = n * 64n + BigInt(i);
    }
    return validDate(Number((n >> 23n) + IG_EPOCH_MS));
};

const fromInstagram = (node, account, via = 'instagram_account') => {
    const code = node.shortcode || node.code || null;
    const caption = node.caption?.text || node.edge_media_to_caption?.edges?.[0]?.node?.text || '';
    const video = node.video_versions?.[0]?.url || node.video_url || null;
    const image = node.display_url || node.display_uri || node.image_versions2?.candidates?.[0]?.url || null;
    const media = [];
    if (video) media.push({ kind: 'video', url: video });
    if (image) media.push({ kind: 'photo', url: image });
    return {
        platform: 'instagram',
        platform_post_id: String(node.id || node.pk || code),
        url: code ? `https://www.instagram.com/p/${code}/` : null,
        author_name: node.user?.full_name || node.owner?.full_name || null,
        author_handle: node.user?.username || node.owner?.username || account,
        published_at: validDate(node.taken_at || node.taken_at_timestamp) || igDateFromCode(code),
        text: caption,
        hashtags: extractHashtags(caption),
        mentions: extractMentions(caption),
        media,
        location: node.location?.name || null,
        post_type: 'original',
        metrics: {
            likes: toNum(node.like_count ?? node.edge_liked_by?.count ?? node.edge_media_preview_like?.count),
            comments: toNum(node.comment_count ?? node.edge_media_to_comment?.count),
            shares: toNum(node.reshare_count),
            views: toNum(node.play_count ?? node.view_count ?? node.video_view_count),
        },
        collected_via: via,
    };
};

const igFeedPage = (feed, account, maxId) => (feed === 'posts'
    ? igService.fetchUserPosts(account, maxId)
    : igService.fetchUserFeed(feed, account, maxId));

/** Page one feed of an account back to `since`, calling onPost for each post in the window. */
const pageIgFeed = async (feed, account, pages, since, onPost) => {
    let maxId = '';
    for (let page = 0; page < pages; page++) {
        const raw = await igFeedPage(feed, account, maxId);
        if (!raw) break;
        const result = raw.result || raw;
        const edges = result.edges || raw.edges || raw.items || [];
        if (!edges.length) break;
        let older = 0;
        for (const e of edges) {
            const node = igNode(e);
            const post = fromInstagram(node, account, `instagram_${feed}`);
            if (since && post.published_at && post.published_at < since) { older += 1; continue; }
            onPost(post, node);
        }
        // Pinned posts can be old, so stop only when most of a page predates the window.
        if (older >= Math.ceil(edges.length / 2)) break;
        const next = result.page_info?.end_cursor || raw.next_max_id || '';
        if (!next || result.page_info?.has_next_page === false) break;
        maxId = next;
    }
};

/**
 * Posts, reels and tagged posts of the listed accounts. Posts by the
 * organisers' own accounts are all kept (their captions often don't name the
 * event) and judged at labelling; anything else must mention the event.
 * Reels mostly repeat the posts grid (with play counts but no caption), so a
 * reel only adds play counts to a known post; organisers' reels missing from
 * the grid are returned as comment sources. Returns { items, reels }.
 */
const collectInstagram = async (accounts, since, mentionsEvent, { pages = 5, reelPages = 3, taggedPages = 3, ownAccounts = new Set() } = {}) => {
    const byCode = new Map();
    const reels = [];
    for (const account of accounts) {
        const own = ownAccounts.has(String(account).toLowerCase());
        await pageIgFeed('posts', account, pages, since, (post) => {
            if (!own && !mentionsEvent(post.text)) return;
            byCode.set(post.url, { query: `@${account}`, post });
        });
        await pageIgFeed('reels', account, reelPages, since, (post) => {
            const known = byCode.get(post.url);
            if (known) {
                known.post.metrics.views = known.post.metrics.views ?? post.metrics.views;
                return;
            }
            if (own && post.url) reels.push({ ...post, author_handle: account });
        });
        if (own) {
            await pageIgFeed('taggedPosts', account, taggedPages, since, (post) => {
                if (!mentionsEvent(post.text) || byCode.has(post.url)) return;
                byCode.set(post.url, { query: `tagged:@${account}`, post });
            });
        }
    }
    return { items: [...byCode.values()], reels };
};

const igCodeOf = (url) => (String(url || '').match(/instagram\.com\/(?:p|reel)\/([\w-]+)/) || [])[1] || null;

/**
 * Comments on the given parent posts (most-commented first), up to perPost
 * each and maxTotal overall. With stopBefore, paging stops at the first page
 * that reaches older comments (they come newest first).
 */
const collectInstagramComments = async (parents, { perPost = 600, maxTotal = 20000, stopBefore = null } = {}) => {
    const out = [];
    for (const parent of parents) {
        if (out.length >= maxTotal) break;
        const code = igCodeOf(parent.url);
        if (!code) continue;
        let minId = '';
        let got = 0;
        while (got < perPost && out.length < maxTotal) {
            const raw = await igService.fetchComments(code, minId);
            const result = raw?.result || raw;
            const list = result?.comments || [];
            if (!list.length) break;
            let reachedOld = false;
            for (const c of list) {
                const text = c.text || '';
                const published = validDate(c.created_at_utc || c.created_at);
                if (stopBefore && published && published < stopBefore) { reachedOld = true; continue; }
                out.push({
                    query: `comments:${code}`,
                    post: {
                        platform: 'instagram',
                        platform_post_id: String(c.pk || c.id),
                        url: `https://www.instagram.com/p/${code}/c/${c.pk || c.id}/`,
                        author_name: c.user?.full_name || null,
                        author_handle: c.user?.username || null,
                        published_at: published,
                        text,
                        hashtags: extractHashtags(text),
                        mentions: extractMentions(text),
                        post_type: 'comment',
                        parent_post_id: parent.platform_post_id,
                        parent_title: String(parent.text || `Reel by @${parent.author_handle}`).split('\n')[0].slice(0, 200),
                        metrics: { likes: toNum(c.comment_like_count), comments: toNum(c.child_comment_count), shares: null, views: null },
                        collected_via: 'instagram_comments',
                    },
                });
                got += 1;
            }
            minId = result.next_min_id || '';
            if (reachedOld || !minId) break;
        }
    }
    return out;
};

// ── YouTube ──────────────────────────────────────────────────────────

const ytGet = async (resource, params) => (await blugate.get('youtube', resource, params)).data;

/**
 * Video ids from YouTube's public results page (relevance order, uploaded this
 * year). Used when the Data API's daily search quota is spent — the quota for
 * video details and comments is separate, so collection carries on.
 */
const ytSearchPage = async (q) => {
    const res = await axios.get('https://www.youtube.com/results', {
        params: { search_query: q, sp: 'EgIIBQ==' },
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'en' },
        timeout: 30000,
    });
    return [...new Set([...String(res.data).matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]))];
};

const ytVideoPost = (v) => {
    const sn = v.snippet || {};
    const st = v.statistics || {};
    const text = `${sn.title || ''}\n\n${String(sn.description || '').slice(0, 1500)}`.trim();
    return {
        platform: 'youtube',
        platform_post_id: String(v.id),
        url: `https://www.youtube.com/watch?v=${v.id}`,
        author_name: sn.channelTitle || null,
        author_handle: sn.channelId || null,
        published_at: validDate(sn.publishedAt),
        text,
        hashtags: extractHashtags(text),
        mentions: [],
        media: [{ kind: 'video', url: sn.thumbnails?.high?.url || sn.thumbnails?.default?.url || null }],
        language: sn.defaultAudioLanguage || sn.defaultLanguage || null,
        post_type: 'original',
        metrics: {
            likes: toNum(st.likeCount),
            comments: toNum(st.commentCount),
            shares: null,
            views: toNum(st.viewCount),
        },
        collected_via: 'youtube_search',
    };
};

// Top comments by relevance per video (default): enough to read the reaction without flooding the sample.
const COMMENTS_PER_VIDEO = 40;

const collectYouTube = async (queries, since, commentVideos, mentionsEvent, { searchPages = 1, commentsPerVideo = COMMENTS_PER_VIDEO, publishedAfter = null } = {}) => {
    const out = [];
    const videos = new Map();
    for (const q of queries) {
        let pageToken;
        for (let page = 0; page < searchPages; page++) {
            try {
                const search = await ytGet('search', {
                    part: 'snippet', q, type: 'video', maxResults: 50, order: 'relevance', pageToken,
                    publishedAfter: (publishedAfter || since) ? new Date(publishedAfter || since).toISOString() : undefined,
                });
                const ids = (search.items || []).map((i) => i.id?.videoId).filter(Boolean).filter((id) => !videos.has(id));
                for (let i = 0; i < ids.length; i += 50) {
                    const details = await ytGet('videos', { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(',') });
                    (details.items || []).forEach((v) => {
                        const post = ytVideoPost(v);
                        videos.set(v.id, post);
                        out.push({ query: q, post });
                    });
                }
                pageToken = search.nextPageToken;
                if (!pageToken) break;
            } catch (err) {
                if (err.response?.status === 429 || err.response?.status === 403) {
                    // Search quota spent: fall back to the public results page for this query.
                    try {
                        const ids = (await ytSearchPage(q)).filter((id) => !videos.has(id));
                        for (let i = 0; i < ids.length; i += 50) {
                            const details = await ytGet('videos', { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(',') });
                            (details.items || []).forEach((v) => {
                                const post = ytVideoPost(v);
                                videos.set(v.id, post);
                                out.push({ query: q, post });
                            });
                        }
                        console.warn(`[tenantCollect] YouTube search quota spent; "${q}" via results page: ${ids.length} videos`);
                    } catch (e2) {
                        console.warn(`[tenantCollect] YouTube results page failed for "${q}": ${e2.message}`);
                    }
                } else {
                    console.warn(`[tenantCollect] YouTube search failed for "${q}": ${err.message}`);
                }
                break;
            }
        }
    }

    // Comments on the most-viewed videos that are actually about the event.
    const top = [...videos.values()]
        .filter((v) => mentionsEvent(v.text))
        .sort((a, b) => (b.metrics.views || 0) - (a.metrics.views || 0))
        .slice(0, commentVideos);
    for (const video of top) {
        try {
            const items = [];
            let pageToken;
            while (items.length < commentsPerVideo) {
                const res = await ytGet('commentThreads', {
                    part: 'snippet', videoId: video.platform_post_id, maxResults: Math.min(100, commentsPerVideo - items.length),
                    order: 'relevance', textFormat: 'plainText', pageToken,
                });
                items.push(...(res.items || []));
                pageToken = res.nextPageToken;
                if (!pageToken) break;
            }
            items.forEach((item) => {
                const c = item.snippet?.topLevelComment?.snippet;
                if (!c) return;
                out.push({
                    query: `comments:${video.platform_post_id}`,
                    post: {
                        platform: 'youtube',
                        platform_post_id: String(item.id),
                        url: `https://www.youtube.com/watch?v=${video.platform_post_id}&lc=${item.id}`,
                        author_name: c.authorDisplayName || null,
                        author_handle: c.authorChannelId?.value || null,
                        published_at: validDate(c.publishedAt),
                        text: c.textOriginal || c.textDisplay || '',
                        hashtags: extractHashtags(c.textOriginal || c.textDisplay),
                        mentions: [],
                        post_type: 'comment',
                        parent_post_id: video.platform_post_id,
                        parent_title: video.text.split('\n')[0].slice(0, 200),
                        metrics: { likes: toNum(c.likeCount), comments: toNum(item.snippet?.totalReplyCount), shares: null, views: null },
                        collected_via: 'youtube_comments',
                    },
                });
            });
        } catch (err) {
            // Comments disabled or quota: skip this video.
            console.warn(`[tenantCollect] YouTube comments skipped for ${video.platform_post_id}: ${err.response?.status || err.message}`);
        }
    }
    return out;
};

// ── Reddit ───────────────────────────────────────────────────────────

const collectReddit = async (queries) => {
    const out = [];
    for (const q of queries) {
        const posts = await redditService.searchPosts(q);
        posts.forEach((p) => {
            if (!p.id) return;
            out.push({
                query: q,
                post: {
                    platform: 'reddit',
                    platform_post_id: String(p.id),
                    url: p.url || null,
                    author_name: p.author || null,
                    author_handle: p.author_handle || null,
                    published_at: validDate(p.created_at),
                    text: p.text || '',
                    hashtags: extractHashtags(p.text),
                    mentions: [],
                    post_type: 'original',
                    metrics: { likes: toNum(p.metrics?.likes), comments: toNum(p.metrics?.comments), shares: null, views: toNum(p.metrics?.views) || null },
                    collected_via: 'reddit_search',
                },
            });
        });
        await sleep(2000); // Reddit's public JSON is strict about bursts
    }
    return out;
};

// ── Telegram ─────────────────────────────────────────────────────────

const collectTelegram = async (queries, since) => {
    // Loaded lazily: requiring it opens nothing, but getClient() does.
    const { getClient } = require('../telegramService');
    const { Api } = require('telegram');
    const client = await getClient();
    const out = [];
    for (const q of queries) {
        try {
            const res = await client.invoke(new Api.messages.SearchGlobal({
                q,
                filter: new Api.InputMessagesFilterEmpty(),
                minDate: since ? Math.floor(new Date(since).getTime() / 1000) : 0,
                maxDate: 0,
                offsetRate: 0,
                offsetPeer: new Api.InputPeerEmpty(),
                offsetId: 0,
                limit: 100,
                broadcastsOnly: true, // public channels only, never private chats
            }));
            const chats = new Map((res.chats || []).map((c) => [String(c.id), c]));
            (res.messages || []).forEach((m) => {
                const channelId = String(m.peerId?.channelId || '');
                const chat = chats.get(channelId);
                if (!chat || !chat.username || !m.message) return; // public channels with a username only
                out.push({
                    query: q,
                    post: {
                        platform: 'telegram',
                        platform_post_id: `${channelId}_${m.id}`,
                        url: `https://t.me/${chat.username}/${m.id}`,
                        author_name: chat.title || null,
                        author_handle: chat.username,
                        author_followers: toNum(chat.participantsCount),
                        published_at: validDate(m.date),
                        text: m.message,
                        hashtags: extractHashtags(m.message),
                        mentions: extractMentions(m.message),
                        post_type: m.fwdFrom ? 'repost' : 'original',
                        metrics: { likes: null, comments: toNum(m.replies?.replies), shares: toNum(m.forwards), views: toNum(m.views) },
                        collected_via: 'telegram_search',
                    },
                });
            });
        } catch (err) {
            console.warn(`[tenantCollect] Telegram search failed for "${q}": ${err.message}`);
        }
        await sleep(1500);
    }
    return out;
};

// ── Orchestration ────────────────────────────────────────────────────

const buildMentionMatcher = (event) => {
    const terms = [...(event.keywords || []), ...(event.hashtags || [])]
        .map((t) => String(t).toLowerCase().replace(/^#/, '').trim())
        .filter((t) => t.length >= 5); // short terms (e.g. "SIR") match inside unrelated words
    return (text) => {
        const hay = String(text || '').toLowerCase();
        return terms.some((t) => hay.includes(t));
    };
};

const ALL_PLATFORMS = ['x', 'youtube', 'facebook', 'instagram', 'reddit', 'telegram'];

/**
 * Collect for one event. With `incrementalSince`, X paging stops at posts
 * older than that time and YouTube searches only videos published after it
 * (comments on the top videos are still re-read, since they keep arriving).
 * Returns a per-platform summary; a failing provider is reported, not thrown.
 */
const collectForEvent = async (event, { platforms = ALL_PLATFORMS, incrementalSince = null } = {}) => {
    const plan = event.collection_plan || {};
    const since = plan.since || event.start_date || null;
    const summary = { started_at: new Date(), platforms: {} };
    const mentionsEvent = buildMentionMatcher(event);

    const runners = {
        x: () => collectX(plan.x_queries || [], since, plan.x_latest_pages || X_LATEST_PAGES, incrementalSince),
        facebook: async () => [
            ...(await collectFacebook(plan.facebook_queries || [], incrementalSince || since, incrementalSince ? 2 : (plan.facebook_search_pages || 10))),
            ...(await collectFacebookPages(plan.facebook_pages || [], incrementalSince || since, mentionsEvent, incrementalSince ? 1 : (plan.facebook_page_pages || 5))),
        ],
        instagram: async () => {
            // Organisers' own handles, from their "@handle" aliases.
            const ownAccounts = new Set((event.organisers || []).flatMap((o) => o.aliases || [])
                .filter((a) => String(a).startsWith('@')).map((a) => a.slice(1).toLowerCase()));
            const { items, reels } = await collectInstagram(plan.instagram_accounts || [], incrementalSince || since, mentionsEvent, {
                pages: incrementalSince ? 1 : (plan.instagram_pages || 5),
                reelPages: incrementalSince ? 1 : (plan.instagram_reel_pages || 3),
                taggedPages: incrementalSince ? 1 : (plan.instagram_tagged_pages || 3),
                ownAccounts,
            });
            // Comment sources: this run's posts and reels plus the event's stored Instagram posts
            // that weren't labelled unrelated, most-commented first.
            const stored = await TenantPost.find({
                tenant_id: event.tenant_id, event_id: event.id, platform: 'instagram', post_type: 'original',
                'analysis.is_relevant': { $ne: false },
            }).select('platform_post_id url text author_handle metrics').lean();
            const parents = new Map();
            [...stored, ...items.map((i) => i.post), ...reels].forEach((p) => {
                if (!p.url) return;
                if (p.text && !ownAccounts.has(String(p.author_handle || '').toLowerCase()) && !mentionsEvent(p.text)) return;
                const prev = parents.get(p.url);
                parents.set(p.url, prev && prev.text ? { ...prev, metrics: p.metrics } : p);
            });
            const ranked = [...parents.values()]
                .filter((p) => (p.metrics?.comments || 0) > 0)
                .sort((x, y) => (y.metrics?.comments || 0) - (x.metrics?.comments || 0))
                .slice(0, plan.instagram_comment_posts ?? 60);
            const comments = await collectInstagramComments(ranked, {
                perPost: incrementalSince ? 150 : (plan.instagram_comments_per_post || 600),
                maxTotal: plan.instagram_max_comments || 20000,
                stopBefore: incrementalSince,
            });
            return [...items, ...comments];
        },
        youtube: () => collectYouTube(plan.youtube_queries || [], since, plan.youtube_comment_videos ?? 15, mentionsEvent, {
            searchPages: incrementalSince ? 1 : (plan.youtube_search_pages || 1),
            commentsPerVideo: plan.youtube_comments_per_video || COMMENTS_PER_VIDEO,
            publishedAfter: incrementalSince,
        }),
        reddit: () => collectReddit(plan.reddit_queries || []),
        telegram: () => collectTelegram(plan.telegram_queries || [], since),
    };

    const CREDENTIAL_PLATFORM = { x: 'twitter', facebook: 'facebook', instagram: 'instagram', youtube: 'youtube' };
    for (const platform of platforms) {
        const result = { fetched: 0, inserted: 0, updated: 0, skipped_before_window: 0, error: null };
        if (CREDENTIAL_PLATFORM[platform] && !blugate.hasCredentials(CREDENTIAL_PLATFORM[platform])) {
            summary.platforms[platform] = { ...result, error: 'no credentials configured' };
            continue;
        }
        if (platform === 'telegram' && !(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH)) {
            summary.platforms[platform] = { ...result, error: 'Telegram API ID/hash not configured on this deployment' };
            continue;
        }
        try {
            const items = await runners[platform]();
            result.fetched = items.length;
            for (const { query, post } of items) {
                if (!post.platform_post_id) continue;
                if (since && post.published_at && post.published_at < since) {
                    result.skipped_before_window += 1;
                    continue;
                }
                post.engagement_total = sumEngagement(post.metrics);
                const key = {
                    tenant_id: event.tenant_id,
                    event_id: event.id,
                    platform: post.platform,
                    platform_post_id: post.platform_post_id,
                };
                const res = await TenantPost.updateOne(
                    key,
                    {
                        $set: { ...post, ...key },
                        $addToSet: { matched_queries: query },
                        $setOnInsert: { collected_at: new Date() },
                    },
                    { upsert: true },
                );
                if (res.upsertedCount) result.inserted += 1;
                else if (res.modifiedCount) result.updated += 1;
            }
        } catch (err) {
            result.error = err.message;
        }
        summary.platforms[platform] = result;
    }
    summary.finished_at = new Date();
    return summary;
};

module.exports = { collectForEvent, fromTweet, extractHashtags, ALL_PLATFORMS };
