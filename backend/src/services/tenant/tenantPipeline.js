/**
 * collect → classify → report for one tenant event, with an in-process lock
 * so the same event is never processed twice at once.
 */

const TenantEvent = require('../../models/tenant/TenantEvent');
const { collectForEvent } = require('./tenantCollectionService');
const { classifyEvent } = require('./tenantClassificationService');
const { generateReport } = require('./tenantReportService');

const states = new Map(); // `${tenant}:${event}` → state

const getPipelineState = (tenantId, eventId) => states.get(`${tenantId}:${eventId}`) || null;

const runEventPipeline = async (tenantId, eventId, { generatedBy = null, platforms, skipCollect = false, skipReport = false, incrementalSince = null, classifyLimit = 0 } = {}) => {
    const key = `${tenantId}:${eventId}`;
    if (states.get(key)?.running) throw new Error('Pipeline already running for this event');
    const state = { running: true, stage: 'collecting', started_at: new Date(), error: null };
    states.set(key, state);

    try {
        const load = () => TenantEvent.findOne({ tenant_id: tenantId, id: eventId }).lean();
        let event = await load();
        if (!event) throw new Error('Event not found');

        if (!skipCollect) {
            const summary = await collectForEvent(event, { ...(platforms ? { platforms } : {}), incrementalSince });
            await TenantEvent.updateOne(
                { tenant_id: tenantId, id: eventId },
                { $set: { last_collected_at: new Date(), last_collection_summary: summary } },
            );
            state.collection = summary;
        }

        state.stage = 'classifying';
        state.classification = await classifyEvent(event, { limit: classifyLimit, onProgress: (c) => { state.progress = { ...c }; } });

        if (skipReport) {
            state.stage = 'done';
            return state;
        }
        state.stage = 'reporting';
        event = await load();
        const report = await generateReport(event, { generatedBy });
        state.report_id = report.id;
        state.stage = 'done';
        return state;
    } catch (err) {
        state.stage = 'failed';
        state.error = err.message;
        throw err;
    } finally {
        state.running = false;
        state.finished_at = new Date();
    }
};

module.exports = { runEventPipeline, getPipelineState };
