/**
 * Collects public X, Facebook and Instagram posts for a tenant event into
 * tenant_posts, using the deployment's existing provider clients.
 *
 *   X         — search queries (Top + Latest), one page each
 *   Facebook  — post search queries
 *   Instagram — recent posts of the event's listed accounts (the provider has
 *               no hashtag search), kept only if they mention the event
 *
 * Only what a provider returns is stored; a missing timestamp or metric stays
 * null. Posts are de-duplicated on (tenant, event, platform, post id), and
 * reposts are stored as their own rows pointing at the original.
 */

const TenantPost = require('../../models/tenant/TenantPost');
const xService = require('../rapidApiXService');
const fbService = require('../rapidApiFacebookService');
const igService = require('../rapidApiInstagramService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The FB/IG providers share quota with the Goa jobs and rate-limit in bursts;
// wait out the cooldown and try again rather than recording nothing.
const PROVIDER_RETRY_WAIT_MS = parseInt(process.env.TENANT_PROVIDER_RETRY_WAIT_MS || '90000', 10);
const withRetry = async (fn, isEmpty, attempts = 3) => {
    let last = null;
    for (let i = 0; i < attempts; i++) {
        try {
            last = await fn();
            if (!isEmpty(last)) return last;
        } catch (err) {
            console.warn(`[tenantCollect] provider error (attempt ${i + 1}): ${err.message}`);
        }
        if (i < attempts - 1) await sleep(PROVIDER_RETRY_WAIT_MS);
    }
    return last;
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

/** Top results via the shared searchTweets, plus up to X_LATEST_PAGES pages of Latest. */
const collectX = async (queries, since) => {
    const sinceStr = since ? new Date(since).toISOString().slice(0, 10) : null;
    const out = [];
    for (const q of queries) {
        const top = await xService.searchTweets(q, sinceStr);
        top.forEach((t) => out.push({ query: q, post: fromTweet(t) }));

        let cursor = null;
        for (let page = 0; page < X_LATEST_PAGES; page++) {
            try {
                const params = { query: sinceStr ? `${q} since:${sinceStr}` : q, type: 'Latest', count: 40 };
                if (cursor) params.cursor = cursor;
                const res = readSearchPage(await xService.rapidGet('search', params));
                res.tweets.forEach((t) => out.push({ query: q, post: fromTweet(t) }));
                if (!res.cursor || !res.tweets.length || res.cursor === cursor) break;
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

const collectFacebook = async (queries) => {
    const out = [];
    for (const q of queries) {
        const posts = (await withRetry(
            () => fbService.searchPosts(q, undefined, { throwOnCooldown: true }),
            (r) => !Array.isArray(r) || r.length === 0,
        )) || [];
        posts.forEach((p) => {
            if (!p.id) return;
            const metrics = {
                likes: toNum(p.metrics?.likes),
                comments: toNum(p.metrics?.comments),
                shares: toNum(p.metrics?.shares),
                views: toNum(p.metrics?.views) || null,
            };
            out.push({
                query: q,
                post: {
                    platform: 'facebook',
                    platform_post_id: String(p.id),
                    url: p.url || null,
                    author_name: p.author && p.author !== 'Facebook User' ? p.author : null,
                    author_handle: p.author_handle ? String(p.author_handle) : null,
                    published_at: validDate(p.created_at),
                    text: p.text || '',
                    hashtags: extractHashtags(p.text),
                    mentions: extractMentions(p.text),
                    media: (p.media || []).map((m) => ({
                        kind: typeof m === 'object' && m?.type ? m.type : null,
                        url: typeof m === 'string' ? m : (m?.url || m?.uri || null),
                    })),
                    post_type: 'original',
                    metrics,
                    collected_via: 'facebook_search',
                },
            });
        });
    }
    return out;
};

// ── Instagram ────────────────────────────────────────────────────────

const igNode = (p) => p.node || p;

const fromInstagram = (node, account) => {
    const code = node.shortcode || node.code || null;
    const caption = node.caption?.text || node.edge_media_to_caption?.edges?.[0]?.node?.text || '';
    const isVideo = node.is_video || node.media_type === 2;
    return {
        platform: 'instagram',
        platform_post_id: String(node.id || node.pk || code),
        url: code ? `https://www.instagram.com/p/${code}/` : null,
        author_name: node.user?.full_name || node.owner?.full_name || null,
        author_handle: node.user?.username || node.owner?.username || account,
        published_at: validDate(node.taken_at || node.taken_at_timestamp),
        text: caption,
        hashtags: extractHashtags(caption),
        mentions: extractMentions(caption),
        media: [{ kind: isVideo ? 'video' : 'photo', url: node.display_url || node.image_versions2?.candidates?.[0]?.url || null }],
        location: node.location?.name || null,
        post_type: 'original',
        metrics: {
            likes: toNum(node.like_count ?? node.edge_liked_by?.count ?? node.edge_media_preview_like?.count),
            comments: toNum(node.comment_count ?? node.edge_media_to_comment?.count),
            shares: null,
            views: toNum(node.view_count ?? node.play_count ?? node.video_view_count),
        },
        collected_via: 'instagram_account',
    };
};

const collectInstagram = async (accounts, since, mentionsEvent) => {
    const out = [];
    for (const account of accounts) {
        const raw = await withRetry(() => igService.fetchUserPosts(account), (r) => !r, 2);
        if (!raw) continue;
        const edges = raw.result?.edges || raw.edges || raw.items || (Array.isArray(raw) ? raw : []);
        for (const e of edges) {
            const post = fromInstagram(igNode(e), account);
            if (since && post.published_at && post.published_at < since) continue;
            // Outlet accounts post about everything; keep only posts about this event.
            if (!mentionsEvent(post.text)) continue;
            out.push({ query: `@${account}`, post });
        }
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

/**
 * Collect for one event. Returns a per-platform summary; never throws for a
 * single provider failure — that platform is reported as failed instead.
 */
const collectForEvent = async (event, { platforms = ['x', 'facebook', 'instagram'] } = {}) => {
    const plan = event.collection_plan || {};
    const since = plan.since || event.start_date || null;
    const summary = { started_at: new Date(), platforms: {} };

    const runners = {
        x: () => collectX(plan.x_queries || [], since),
        facebook: () => collectFacebook(plan.facebook_queries || []),
        instagram: () => collectInstagram(plan.instagram_accounts || [], since, buildMentionMatcher(event)),
    };

    for (const platform of platforms) {
        const result = { fetched: 0, inserted: 0, updated: 0, skipped_before_window: 0, error: null };
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

module.exports = { collectForEvent, fromTweet, extractHashtags };
