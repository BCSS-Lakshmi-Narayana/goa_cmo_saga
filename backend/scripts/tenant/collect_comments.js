/**
 * Collects the comment threads under an event's most-discussed posts:
 * Facebook post comments and X replies (where much of the discussion is).
 * Parents are the event's stored Facebook posts and X tweets, most-commented first.
 *
 *   node scripts/tenant/collect_comments.js --tenant <id> --event <event id>
 *        [--fb-posts 40] [--fb-per-post 300] [--fb-skip 0] [--x-posts 60] [--x-per-post 200] [--x-skip 0] [--only facebook|x]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const TenantPost = require('../../src/models/tenant/TenantPost');
const TenantEvent = require('../../src/models/tenant/TenantEvent');
const blugate = require('../../src/services/blugateClient');
const { fromTweet, extractHashtags, readSearchPage } = require('../../src/services/tenant/tenantCollectionService');

const arg = (name, def = null) => { const i = process.argv.indexOf(name); return i === -1 ? def : process.argv[i + 1]; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const total = (m) => ['likes', 'comments', 'shares', 'views'].reduce((s, k) => s + (Number(m?.[k]) || 0), 0);
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v) || 0);

/** GET with a few retries on rate limits. */
const get = async (platform, path, params) => {
    for (let attempt = 0; attempt < 4; attempt++) {
        try { return (await blugate.get(platform, path, params)).data; }
        catch (err) {
            if (err.response?.status === 429 && attempt < 3) { await sleep(4000 * (attempt + 1)); continue; }
            throw err;
        }
    }
    return null;
};

const main = async () => {
    const tenantId = arg('--tenant');
    const eventId = arg('--event');
    const only = arg('--only'); // 'facebook' | 'x' to run one platform
    // Skip the most-discussed parents already read on an earlier run.
    const fbSkip = parseInt(arg('--fb-skip', '0'), 10);
    const xSkip = parseInt(arg('--x-skip', '0'), 10);
    const fbPosts = parseInt(arg('--fb-posts', '40'), 10);
    const fbPer = parseInt(arg('--fb-per-post', '300'), 10);
    const xPosts = parseInt(arg('--x-posts', '60'), 10);
    const xPer = parseInt(arg('--x-per-post', '200'), 10);
    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);
    const event = await TenantEvent.findOne({ tenant_id: tenantId, id: eventId }).lean();
    if (!event) throw new Error('event not found');
    const since = event.collection_plan?.since ? new Date(event.collection_plan.since) : null;
    const stats = { facebook: { parents: 0, inserted: 0 }, x: { parents: 0, inserted: 0 } };

    const save = async (post, platform) => {
        if (!post.platform_post_id || (since && post.published_at && post.published_at < since)) return;
        post.engagement_total = total(post.metrics);
        const key = { tenant_id: tenantId, event_id: eventId, platform: post.platform, platform_post_id: post.platform_post_id };
        const res = await TenantPost.updateOne(key, { $set: { ...post, ...key }, $addToSet: { matched_queries: `comments:${post.parent_post_id}` }, $setOnInsert: { collected_at: new Date() } }, { upsert: true });
        if (res.upsertedCount) stats[platform].inserted += 1;
    };

    // Facebook comments.
    const fbParents = only === 'x' ? [] : await TenantPost.find({ tenant_id: tenantId, event_id: eventId, platform: 'facebook', post_type: { $ne: 'comment' }, 'metrics.comments': { $gt: 0 } })
        .sort({ 'metrics.comments': -1 }).skip(fbSkip).limit(fbPosts).lean();
    for (const parent of fbParents) {
        stats.facebook.parents += 1;
        let cursor; let got = 0;
        try {
            while (got < fbPer) {
                const d = await get('facebook', 'post/comments', { post_id: parent.platform_post_id, ...(cursor ? { cursor } : {}) });
                const list = d?.results || [];
                if (!list.length) break;
                for (const c of list) {
                    const text = c.message || '';
                    await save({
                        platform: 'facebook',
                        platform_post_id: String(c.legacy_comment_id || c.comment_id),
                        url: parent.url ? `${parent.url}${parent.url.includes('?') ? '&' : '?'}comment_id=${c.legacy_comment_id || ''}` : null,
                        author_name: c.author?.name || null,
                        author_handle: c.author?.id || null,
                        published_at: c.created_time ? new Date(c.created_time * 1000) : null,
                        text,
                        hashtags: extractHashtags(text),
                        mentions: [],
                        media: [],
                        post_type: 'comment',
                        parent_post_id: parent.platform_post_id,
                        parent_title: String(parent.text || '').split('\n')[0].slice(0, 200),
                        metrics: { likes: num(c.reactions_count), comments: num(c.replies_count), shares: null, views: null },
                        collected_via: 'facebook_comments',
                    }, 'facebook');
                    got += 1;
                }
                cursor = d.cursor;
                if (!cursor) break;
            }
        } catch (err) { console.warn(`[comments] facebook ${parent.platform_post_id}: ${err.response?.status || err.message}`); }
    }

    // X replies.
    const xParents = only === 'facebook' ? [] : await TenantPost.find({ tenant_id: tenantId, event_id: eventId, platform: 'x', post_type: { $in: ['original', 'quote'] }, 'metrics.comments': { $gt: 2 } })
        .sort({ 'metrics.comments': -1 }).skip(xSkip).limit(xPosts).lean();
    for (const parent of xParents) {
        stats.x.parents += 1;
        let cursor; let got = 0;
        try {
            while (got < xPer) {
                const d = await get('twitter', 'comments', { pid: parent.platform_post_id, count: 40, rankingMode: 'Relevance', ...(cursor ? { cursor } : {}) });
                // The replies endpoint puts instructions at result.instructions and the cursor at cursor.bottom.
                const parsed = readSearchPage(d?.result?.instructions ? { result: { timeline: { instructions: d.result.instructions } } } : d);
                const tweets = parsed.tweets;
                const next = d?.cursor?.bottom || parsed.cursor;
                const replies = tweets.filter((t) => String(t.id || t.tweet_id || '') !== String(parent.platform_post_id));
                if (!replies.length) break;
                for (const t of replies) {
                    const post = fromTweet(t);
                    if (!post || post.platform_post_id === parent.platform_post_id) continue;
                    await save({ ...post, post_type: 'reply', parent_post_id: parent.platform_post_id, parent_title: String(parent.text || '').split('\n')[0].slice(0, 200), collected_via: 'x_replies' }, 'x');
                    got += 1;
                }
                if (!next || next === cursor) break;
                cursor = next;
            }
        } catch (err) { console.warn(`[comments] x ${parent.platform_post_id}: ${err.response?.status || err.message}`); }
    }
    console.log('comments:', JSON.stringify(stats));
};

main().then(() => mongoose.disconnect()).catch(async (err) => { console.error('failed:', err.message); await mongoose.disconnect(); process.exit(1); });
