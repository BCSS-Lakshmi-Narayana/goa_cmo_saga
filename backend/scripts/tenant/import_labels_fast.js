/**
 * Same as import_labels.js (same validation via normalise(), same fields
 * written, analyst reviews kept), but batched: one query to load the posts and
 * bulk writes of 500 — for remote databases where per-post round trips are slow.
 *
 *   node scripts/tenant/import_labels_fast.js --tenant <id> --event <event id> --model <name> file1.json [...]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const mongoose = require('mongoose');
const TenantPost = require('../../src/models/tenant/TenantPost');
const TenantEvent = require('../../src/models/tenant/TenantEvent');
const { normalise } = require('../../src/services/tenant/tenantClassificationService');

const arg = (name, def = null) => { const i = process.argv.indexOf(name); return i === -1 ? def : process.argv[i + 1]; };

const main = async () => {
    const tenantId = arg('--tenant');
    const eventId = arg('--event');
    const model = arg('--model', 'external');
    const files = process.argv.slice(2).filter((a, i, all) => a.endsWith('.json') && !['--tenant', '--event', '--model'].includes(all[i - 1]));
    if (!tenantId || !eventId || !files.length) throw new Error('--tenant, --event and at least one file are required');
    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);
    const event = await TenantEvent.findOne({ tenant_id: tenantId, id: eventId }).lean();
    if (!event) throw new Error('event not found');

    const labels = files.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
        .filter((raw) => raw && mongoose.isValidObjectId(raw.post) && raw.category);
    const posts = await TenantPost.find({ tenant_id: tenantId, event_id: eventId, _id: { $in: labels.map((l) => l.post) } })
        .select('_id language analysis.review').lean();
    const byId = new Map(posts.map((p) => [String(p._id), p]));
    const ops = [];
    let skipped = 0;
    labels.forEach((raw) => {
        const post = byId.get(String(raw.post));
        if (!post) { skipped += 1; return; }
        const { language, ...analysis } = normalise(event, raw);
        if (post.analysis?.review?.reviewed_at) analysis.review = post.analysis.review;
        analysis.model = model;
        const set = { analysis };
        if (!post.language && language) set.language = language;
        ops.push({ updateOne: { filter: { tenant_id: tenantId, event_id: eventId, _id: post._id }, update: { $set: set } } });
    });
    for (let i = 0; i < ops.length; i += 500) await TenantPost.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    const pending = await TenantPost.countDocuments({ tenant_id: tenantId, event_id: eventId, 'analysis.status': { $in: ['pending', 'failed'] } });
    console.log(`imported ${ops.length} labels, skipped ${skipped}; ${pending} posts still unlabelled`);
    await mongoose.disconnect();
};

main().catch(async (err) => { console.error(err.message); await mongoose.disconnect(); process.exit(1); });
