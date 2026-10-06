/**
 * Exports an event's unclassified posts as compact JSON chunks, plus the
 * labelling instructions, so they can be labelled outside the pipeline and
 * loaded back with import_labels.js.
 *
 *   node scripts/tenant/export_pending_posts.js --tenant <id> --event <event id> --out <dir> [--chunks 6]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const TenantPost = require('../../src/models/tenant/TenantPost');
const TenantEvent = require('../../src/models/tenant/TenantEvent');
const { SYSTEM_PROMPT, SCHEMA, eventContext, prefilterUnrelated } = require('../../src/services/tenant/tenantClassificationService');

const arg = (name, def = null) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? def : process.argv[i + 1];
};

const main = async () => {
    const tenantId = arg('--tenant');
    const eventId = arg('--event');
    const out = arg('--out');
    const chunks = parseInt(arg('--chunks', '6'), 10);
    if (!tenantId || !eventId || !out) throw new Error('--tenant, --event and --out are required');
    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);

    const event = await TenantEvent.findOne({ tenant_id: tenantId, id: eventId }).lean();
    if (!event) throw new Error('event not found');
    await prefilterUnrelated(event);
    const posts = await TenantPost.find({ tenant_id: tenantId, event_id: eventId, 'analysis.status': { $in: ['pending', 'failed'] } })
        .sort({ platform: 1, parent_post_id: 1, published_at: 1 }).lean();

    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'instructions.md'), `${SYSTEM_PROMPT}\n\n${eventContext(event)}\n\nFor each post return one object:\n${SCHEMA}\nUse the post's "id" string as "post".\n`);
    const rows = posts.map((p) => ({
        id: String(p._id),
        platform: p.platform,
        type: p.post_type,
        account: p.author_name || null,
        handle: p.author_handle || null,
        followers: p.author_followers || null,
        published: p.published_at,
        on_video: p.parent_title || undefined,
        // Cut on whole characters so emoji are never split into lone surrogates.
        text: Array.from(String(p.text || '')).slice(0, 1500).join(''),
        media: (p.media || []).map((m) => m.kind).filter(Boolean),
    }));
    const size = Math.ceil(rows.length / chunks);
    for (let i = 0; i < chunks; i++) {
        fs.writeFileSync(path.join(out, `chunk_${i + 1}.json`), JSON.stringify(rows.slice(i * size, (i + 1) * size)));
    }
    console.log(`exported ${rows.length} posts in ${chunks} chunks to ${out}`);
    await mongoose.disconnect();
};

main().catch(async (err) => { console.error(err.message); await mongoose.disconnect(); process.exit(1); });
