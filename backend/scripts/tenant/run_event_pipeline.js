/**
 * Runs collect → classify → report for a tenant event from the command line.
 *
 *   node scripts/tenant/run_event_pipeline.js --tenant <id> --event "<name or id>" \
 *       [--platforms x,facebook,instagram] [--skip-collect] [--reclassify]
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const TenantEvent = require('../../src/models/tenant/TenantEvent');
const { collectForEvent } = require('../../src/services/tenant/tenantCollectionService');
const { classifyEvent } = require('../../src/services/tenant/tenantClassificationService');
const { generateReport } = require('../../src/services/tenant/tenantReportService');

const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? null : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(name);

const main = async () => {
    const tenantId = arg('--tenant');
    const ref = arg('--event');
    if (!tenantId || !ref) throw new Error('--tenant and --event are required');
    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);

    const load = () => TenantEvent.findOne({ tenant_id: tenantId, $or: [{ id: ref }, { name: ref }] }).lean();
    let event = await load();
    if (!event) throw new Error('event not found');

    if (!flag('--skip-collect')) {
        const platforms = arg('--platforms') ? arg('--platforms').split(',') : undefined;
        const summary = await collectForEvent(event, platforms ? { platforms } : {});
        await TenantEvent.updateOne({ tenant_id: tenantId, id: event.id },
            { $set: { last_collected_at: new Date(), last_collection_summary: summary } });
        console.log('collection:', JSON.stringify(summary.platforms));
    }
    if (!flag('--skip-classify')) {
        console.log('classification:', await classifyEvent(event, { reclassify: flag('--reclassify') }));
    }
    if (!flag('--skip-report')) {
        event = await load();
        const report = await generateReport(event, { generatedBy: 'cli' });
        console.log(`report: ${report.id} (${report.post_count} relevant posts, prose: ${report.data.prose_source})`);
    }
};

main()
    .then(() => mongoose.disconnect())
    .catch(async (err) => {
        console.error('pipeline failed:', err.message);
        await mongoose.disconnect();
        process.exit(1);
    });
