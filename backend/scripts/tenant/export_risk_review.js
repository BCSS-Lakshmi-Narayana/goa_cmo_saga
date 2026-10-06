/**
 * Writes every post the classifier put in a critical/high/medium risk band
 * (plus the highest-engagement critical-stance posts) to a JSON file, so an
 * analyst can read them and record decisions with apply_risk_review.js.
 *
 *   node scripts/tenant/export_risk_review.js --tenant <id> --event <event id> --out /tmp/review.json
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const mongoose = require('mongoose');
const TenantPost = require('../../src/models/tenant/TenantPost');

const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? null : process.argv[i + 1];
};

const row = (p) => ({
    id: String(p._id),
    platform: p.platform,
    post_type: p.post_type,
    url: p.url,
    author: p.author_name,
    handle: p.author_handle,
    followers: p.author_followers,
    published_at: p.published_at,
    engagement: p.engagement_total,
    text: p.text,
    model: {
        risk_band: p.analysis.risk_band,
        risk_reason: p.analysis.risk_reason,
        category: p.analysis.category,
        account_type: p.analysis.account_type,
        stance_toward_subject: p.analysis.stance_toward_subject,
        claims: p.analysis.claims,
        summary: p.analysis.summary,
    },
    review: p.analysis.review,
});

const main = async () => {
    const tenantId = arg('--tenant');
    const eventId = arg('--event');
    const out = arg('--out');
    if (!tenantId || !eventId || !out) throw new Error('--tenant, --event and --out are required');
    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);

    const base = { tenant_id: tenantId, event_id: eventId, 'analysis.is_relevant': true };
    const flagged = await TenantPost.find({ ...base, 'analysis.risk_band': { $in: ['critical', 'high', 'medium'] } })
        .sort({ engagement_total: -1 }).lean();
    const topCritical = await TenantPost.find({ ...base, 'analysis.stance_toward_subject': 'critical', 'analysis.risk_band': 'low', post_type: { $ne: 'repost' } })
        .sort({ engagement_total: -1 }).limit(40).lean();

    fs.writeFileSync(out, JSON.stringify({ flagged: flagged.map(row), top_critical_low_band: topCritical.map(row) }, null, 2));
    console.log(`wrote ${flagged.length} flagged + ${topCritical.length} top critical posts to ${out}`);
    await mongoose.disconnect();
};

main().catch(async (err) => { console.error(err.message); await mongoose.disconnect(); process.exit(1); });
