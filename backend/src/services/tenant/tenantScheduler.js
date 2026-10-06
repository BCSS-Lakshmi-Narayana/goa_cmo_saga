/**
 * Keeps tenant events current. Every few minutes it looks for active events
 * with auto_refresh enabled and, when due, collects what is new since the
 * last run (X every x_minutes, YouTube every youtube_hours) and classifies it.
 * Reports are not generated here — users build them for the period they want.
 */

const TenantEvent = require('../../models/tenant/TenantEvent');
const { runEventPipeline, getPipelineState } = require('./tenantPipeline');

const TICK_MS = 5 * 60 * 1000;
// Re-read a little before the last run so posts indexed late are not missed.
const OVERLAP_MS = 2 * 60 * 60 * 1000;

const due = (last, everyMs, now) => !last || now - new Date(last).getTime() >= everyMs;

const tick = async () => {
    // A cross-tenant scan of scheduling metadata only; each run below is pinned to its event's tenant.
    const events = await TenantEvent.collection.find(
        { status: 'active', 'auto_refresh.enabled': true },
        { projection: { tenant_id: 1, id: 1, auto_refresh: 1, last_collected_at: 1 } },
    ).toArray();
    const now = Date.now();
    for (const ev of events) {
        if (getPipelineState(ev.tenant_id, ev.id)?.running) continue;
        const cfg = ev.auto_refresh || {};
        const platforms = [];
        if (due(cfg.last_x_at, (cfg.x_minutes || 60) * 60000, now)) platforms.push('x');
        if (due(cfg.last_youtube_at, (cfg.youtube_hours || 6) * 3600000, now)) platforms.push('youtube');
        if (!platforms.length) continue;
        // Facebook/Instagram/Reddit ride along with X when their providers are available.
        if (platforms.includes('x')) platforms.push('facebook', 'instagram', 'reddit', 'telegram');

        const lastRun = Math.min(
            ...[cfg.last_x_at, cfg.last_youtube_at, ev.last_collected_at].filter(Boolean).map((d) => new Date(d).getTime()),
            now,
        );
        const incrementalSince = new Date(lastRun - OVERLAP_MS);
        const stamp = {};
        if (platforms.includes('x')) stamp['auto_refresh.last_x_at'] = new Date();
        if (platforms.includes('youtube')) stamp['auto_refresh.last_youtube_at'] = new Date();
        await TenantEvent.updateOne({ tenant_id: ev.tenant_id, id: ev.id }, { $set: stamp });

        console.log(`[tenantScheduler] refreshing ${ev.tenant_id}/${ev.id}: ${platforms.join(',')} since ${incrementalSince.toISOString()}`);
        runEventPipeline(ev.tenant_id, ev.id, { platforms, skipReport: true, incrementalSince, generatedBy: 'scheduler' })
            .catch((err) => console.error(`[tenantScheduler] ${ev.tenant_id}/${ev.id} failed: ${err.message}`));
    }
};

let timer = null;
const startTenantScheduler = () => {
    if (timer || process.env.TENANT_SCHEDULER === 'off') return;
    timer = setInterval(() => tick().catch((err) => console.error('[tenantScheduler]', err.message)), TICK_MS);
    setTimeout(() => tick().catch((err) => console.error('[tenantScheduler]', err.message)), 60000);
};

module.exports = { startTenantScheduler };
