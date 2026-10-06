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

const TenantPost = require('../../models/tenant/TenantPost');
const xService = require('../rapidApiXService');
const fbService = require('../rapidApiFacebookService');
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
        const posts = (await withRetry(() => fbService.searchPosts(q, undefined, { throwOnCooldown: true }))) || [];
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
        const raw = await igService.fetchUserPosts(account);
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


// ── Facebook pages ───────────────────────────────────────────────────

const collectFacebookPages = async (pages, since, mentionsEvent) => {
    const out = [];
    for (const page of pages) {
        const posts = (await withRetry(() => fbService.fetchPagePosts(page, 40, null, { throwOnCooldown: true }))) || [];
        posts.forEach((p) => {
            if (!p.id || !mentionsEvent(p.text)) return;
            const published = validDate(p.created_at);
            if (since && published && published < since) return;
            out.push({
                query: `page:${page}`,
                post: {
                    platform: 'facebook',
                    platform_post_id: String(p.id),
                    url: p.url || null,
                    author_name: p.author_name || null,
                    author_handle: p.author_id ? String(p.author_id) : null,
                    published_at: published,
                    text: p.text || '',
                    hashtags: extractHashtags(p.text),
                    mentions: extractMentions(p.text),
                    media: (p.media || []).map((m) => ({ kind: null, url: typeof m === 'string' ? m : (m?.url || null) })),
                    post_type: 'original',
                    metrics: {
                        likes: toNum(p.engagement?.likes),
                        comments: toNum(p.engagement?.comments),
                        shares: toNum(p.engagement?.shares),
                        views: toNum(p.engagement?.views) || null,
                    },
                    collected_via: 'facebook_page',
                },
            });
        });
    }
    return out;
};

// ── YouTube ──────────────────────────────────────────────────────────

const ytGet = async (resource, params) => (await blugate.get('youtube', resource, params)).data;

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

// Top comments by relevance per video: enough to read the reaction without flooding the sample.
const COMMENTS_PER_VIDEO = 40;

const collectYouTube = async (queries, since, commentVideos, mentionsEvent) => {
    const out = [];
    const videos = new Map();
    for (const q of queries) {
        try {
            const search = await ytGet('search', {
                part: 'snippet', q, type: 'video', maxResults: 50, order: 'relevance',
                publishedAfter: since ? new Date(since).toISOString() : undefined,
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
        } catch (err) {
            console.warn(`[tenantCollect] YouTube search failed for "${q}": ${err.message}`);
        }
    }

    // Comments on the most-viewed videos that are actually about the event.
    const top = [...videos.values()]
        .filter((v) => mentionsEvent(v.text))
        .sort((a, b) => (b.metrics.views || 0) - (a.metrics.views || 0))
        .slice(0, commentVideos);
    for (const video of top) {
        try {
            const res = await ytGet('commentThreads', {
                part: 'snippet', videoId: video.platform_post_id, maxResults: COMMENTS_PER_VIDEO, order: 'relevance', textFormat: 'plainText',
            });
            (res.items || []).forEach((item) => {
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

/**
 * Collect for one event. Returns a per-platform summary; never throws for a
 * single provider failure — that platform is reported as failed instead.
 */
const ALL_PLATFORMS = ['x', 'youtube', 'facebook', 'instagram', 'reddit', 'telegram'];

const collectForEvent = async (event, { platforms = ALL_PLATFORMS } = {}) => {
    const plan = event.collection_plan || {};
    const since = plan.since || event.start_date || null;
    const summary = { started_at: new Date(), platforms: {} };
    const mentionsEvent = buildMentionMatcher(event);

    const runners = {
        x: () => collectX(plan.x_queries || [], since),
        facebook: async () => [
            ...(await collectFacebook(plan.facebook_queries || [])),
            ...(await collectFacebookPages(plan.facebook_pages || [], since, mentionsEvent)),
        ],
        instagram: () => collectInstagram(plan.instagram_accounts || [], since, mentionsEvent),
        youtube: () => collectYouTube(plan.youtube_queries || [], since, plan.youtube_comment_videos ?? 15, mentionsEvent),
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
