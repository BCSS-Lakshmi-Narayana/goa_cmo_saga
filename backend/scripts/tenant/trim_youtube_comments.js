/**
 * Keeps the top N comments (by likes) per video for a tenant event and
 * deletes the rest, so comment-heavy videos don't dominate the sample.
 * Only unclassified comments are removed.
 *
 *   node scripts/tenant/trim_youtube_comments.js --tenant <id> --event <event id> [--keep 40]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const TenantPost = require('../../src/models/tenant/TenantPost');

const arg = (name, def = null) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? def : process.argv[i + 1];
};

const main = async () => {
    const tenantId = arg('--tenant');
    const eventId = arg('--event');
    const keep = parseInt(arg('--keep', '40'), 10);
    if (!tenantId || !eventId) throw new Error('--tenant and --event are required');
    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);

    const base = { tenant_id: tenantId, event_id: eventId, platform: 'youtube', post_type: 'comment' };
    const parents = await TenantPost.distinct('parent_post_id', base);
    let removed = 0;
    for (const parent of parents) {
        const rows = await TenantPost.find({ ...base, parent_post_id: parent }).sort({ 'metrics.likes': -1 }).select('_id analysis.status').lean();
        const drop = rows.slice(keep).filter((r) => r.analysis?.status !== 'done').map((r) => r._id);
        if (drop.length) removed += (await TenantPost.deleteMany({ ...base, _id: { $in: drop } })).deletedCount;
    }
    console.log(`kept up to ${keep} comments on each of ${parents.length} videos; removed ${removed}`);
    await mongoose.disconnect();
};

main().catch(async (err) => { console.error(err.message); await mongoose.disconnect(); process.exit(1); });
