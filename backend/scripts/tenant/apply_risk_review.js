/**
 * Records an analyst's risk review: per-post band decisions (which override
 * the model's band in reports) and the event-level analyst assessment that is
 * carried into every report.
 *
 *   node scripts/tenant/apply_risk_review.js --tenant <id> --event <event id> --file review_decisions.json
 *
 * File format:
 *   {
 *     "reviewer": "name",
 *     "posts": [ { "id": "<post _id>", "risk_band": "low|medium|high|critical", "note": "why" } ],
 *     "analyst_review": { "bottom_line": "...", "risk_assessment": "...", "notes": ["..."] }
 *   }
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const mongoose = require('mongoose');
const TenantPost = require('../../src/models/tenant/TenantPost');
const TenantEvent = require('../../src/models/tenant/TenantEvent');

const BANDS = ['critical', 'high', 'medium', 'low'];

const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? null : process.argv[i + 1];
};

const main = async () => {
    const tenantId = arg('--tenant');
    const eventId = arg('--event');
    const file = arg('--file');
    if (!tenantId || !eventId || !file) throw new Error('--tenant, --event and --file are required');
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    const reviewer = input.reviewer || 'analyst';
    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);

    let applied = 0;
    for (const d of input.posts || []) {
        if (!BANDS.includes(d.risk_band) || !mongoose.isValidObjectId(d.id)) {
            console.warn(`skipped invalid decision ${JSON.stringify(d)}`);
            continue;
        }
        const res = await TenantPost.updateOne(
            { tenant_id: tenantId, event_id: eventId, _id: d.id },
            { $set: { 'analysis.review': { risk_band: d.risk_band, note: d.note || null, reviewed_by: reviewer, reviewed_at: new Date() } } },
        );
        applied += res.matchedCount;
    }

    if (input.analyst_review) {
        await TenantEvent.updateOne(
            { tenant_id: tenantId, id: eventId },
            { $set: { analyst_review: { ...input.analyst_review, reviewed_by: reviewer, reviewed_at: new Date() } } },
        );
    }
    console.log(`applied ${applied} post decision(s)${input.analyst_review ? ' and the event analyst review' : ''}`);
    await mongoose.disconnect();
};

main().catch(async (err) => { console.error(err.message); await mongoose.disconnect(); process.exit(1); });
