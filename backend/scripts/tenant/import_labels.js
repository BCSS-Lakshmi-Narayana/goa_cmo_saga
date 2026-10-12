/**
 * Loads labels for an event's posts from JSON files (arrays of objects in the
 * classifier's schema, with "post" = the post id), validating them exactly as
 * the pipeline does.
 *
 *   node scripts/tenant/import_labels.js --tenant <id> --event <event id> --model <name> file1.json [file2.json ...]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const mongoose = require('mongoose');
const TenantPost = require('../../src/models/tenant/TenantPost');
const TenantEvent = require('../../src/models/tenant/TenantEvent');
const { importLabels } = require('../../src/services/tenant/tenantClassificationService');

const arg = (name, def = null) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? def : process.argv[i + 1];
};

const main = async () => {
    const tenantId = arg('--tenant');
    const eventId = arg('--event');
    const model = arg('--model', 'external');
    const files = process.argv.slice(2).filter((a, i, all) => a.endsWith('.json') && !['--tenant', '--event', '--model'].includes(all[i - 1]));
    if (!tenantId || !eventId || !files.length) throw new Error('--tenant, --event and at least one file are required');
    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);
    const event = await TenantEvent.findOne({ tenant_id: tenantId, id: eventId }).lean();
    if (!event) throw new Error('event not found');

    let ok = 0; let skipped = 0;
    for (const file of files) {
        const labels = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const raw of labels) {
            if (!raw || !mongoose.isValidObjectId(raw.post) || !raw.category) { skipped += 1; continue; }
            const post = await TenantPost.findOne({ tenant_id: tenantId, event_id: eventId, _id: raw.post }).lean();
            if (!post) { skipped += 1; continue; }
            await importLabels(event, post, raw, model);
            ok += 1;
        }
    }
    const pending = await TenantPost.countDocuments({ tenant_id: tenantId, event_id: eventId, 'analysis.status': { $in: ['pending', 'failed'] } });
    console.log(`imported ${ok} labels, skipped ${skipped}; ${pending} posts still unlabelled`);
    await mongoose.disconnect();
};

main().catch(async (err) => { console.error(err.message); await mongoose.disconnect(); process.exit(1); });
