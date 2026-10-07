/**
 * /api/tenant — the only API a tenant user can reach (see tenantGuard).
 * Every query is pinned to req.tenantId, taken from the signed-in user and
 * never from the request, and Goa users are refused outright.
 */

const TenantWorkspace = require('../models/tenant/TenantWorkspace');
const TenantEvent = require('../models/tenant/TenantEvent');
const TenantPost = require('../models/tenant/TenantPost');
const TenantReport = require('../models/tenant/TenantReport');
const { renderReportPdf } = require('../services/tenant/tenantPdfService');
const { isTenantUser, tenantOf } = require('../config/tenancy');
const { createAuditLog } = require('../services/auditService');
const { runEventPipeline, getPipelineState } = require('../services/tenant/tenantPipeline');
const { completeReport, footageOf, isPublicAccount, TONE_QUERY } = require('../services/tenant/tenantReportService');
const { expand } = require('../services/tenant/textClean');

const requireTenant = (req, res, next) => {
    if (!isTenantUser(req.user)) {
        return res.status(403).json({ message: 'Workspace routes are not available to this account' });
    }
    req.tenantId = tenantOf(req.user);
    next();
};

const findEvent = (req) => TenantEvent.findOne({ tenant_id: req.tenantId, id: req.params.id }).lean();

const getWorkspace = async (req, res) => {
    const workspace = await TenantWorkspace.findOne({ tenant_id: req.tenantId }).lean();
    res.json({ workspace, user: { full_name: req.user.full_name, email: req.user.email } });
};

const listEvents = async (req, res) => {
    const events = await TenantEvent.find({ tenant_id: req.tenantId })
        .select('-_id id name description start_date end_date location status subject last_collected_at')
        .sort({ start_date: -1 })
        .lean();
    res.json({ events });
};

const getEvent = async (req, res) => {
    const event = await findEvent(req);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const counts = await TenantPost.aggregate([
        { $match: { tenant_id: req.tenantId, event_id: event.id } },
        { $group: { _id: { platform: '$platform', relevant: '$analysis.is_relevant' }, n: { $sum: 1 } } },
    ]);
    res.json({ event, counts, pipeline: getPipelineState(req.tenantId, event.id) });
};

const POST_SORTS = { recent: { published_at: -1 }, engagement: { engagement_total: -1 } };

const listPosts = async (req, res) => {
    const event = await findEvent(req);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const filter = { tenant_id: req.tenantId, event_id: event.id };
    const { platform, category, stance, narrative, risk, post_type: postType, q } = req.query;
    if (req.query.include_unrelated !== 'true') filter['analysis.is_relevant'] = true;
    if (['x', 'youtube', 'facebook', 'instagram', 'reddit', 'telegram'].includes(platform)) filter.platform = platform;
    // The analyst's band wins over the model's.
    if (['critical', 'high', 'medium', 'low'].includes(risk)) {
        filter.$or = [{ 'analysis.review.risk_band': risk }, { 'analysis.review.risk_band': null, 'analysis.risk_band': risk }];
    }
    if (category) filter['analysis.category'] = String(category);
    if (stance) filter['analysis.stance_toward_subject'] = String(stance);
    if (narrative) filter['analysis.narratives'] = String(narrative);
    if (postType) filter.post_type = String(postType);
    if (q) filter.text = { $regex: String(q).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const sort = POST_SORTS[req.query.sort] || POST_SORTS.recent;

    const [posts, total] = await Promise.all([
        TenantPost.find(filter).select('-tenant_id -__v').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
        TenantPost.countDocuments(filter),
    ]);
    res.json({ posts, total, page, limit });
};

const listReports = async (req, res) => {
    const event = await findEvent(req);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const reports = await TenantReport.find({ tenant_id: req.tenantId, event_id: event.id })
        .select('-_id id title status error range_from range_to period_start period_end post_count created_at')
        .sort({ created_at: -1 })
        .lean();
    res.json({ reports });
};

const getLatestReport = async (req, res) => {
    const event = await findEvent(req);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    // Latest whole-event report (date-range reports are opened from the list).
    const report = await TenantReport.findOne({ tenant_id: req.tenantId, event_id: event.id, status: 'ready', range_from: null, range_to: null })
        .select('-_id -tenant_id -__v').sort({ created_at: -1 }).lean();
    if (!report) return res.status(404).json({ message: 'No report generated yet' });
    res.json({ report });
};

const getReport = async (req, res) => {
    const report = await TenantReport.findOne({ tenant_id: req.tenantId, id: req.params.reportId })
        .select('-_id -tenant_id -__v').lean();
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json({ report });
};

const istDate = (d) => (d ? new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10) : null);

/** GET /reports/:reportId/pdf?posts=1 — the brief (optionally with every post) as a PDF file. */
const downloadReportPdf = async (req, res) => {
    const report = await TenantReport.findOne({ tenant_id: req.tenantId, id: req.params.reportId })
        .select('id tenant_id event_id title status range_from range_to period_start period_end').lean();
    if (!report) return res.status(404).json({ message: 'Report not found' });
    if (report.status !== 'ready') return res.status(409).json({ message: 'The report is not ready yet' });
    // The page is opened at this fixed address (never one taken from the request), signed in with the caller's token.
    const baseUrl = process.env.TENANT_PRINT_BASE_URL;
    if (!baseUrl) return res.status(503).json({ message: 'PDF download is not configured' });
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token;
    const withPosts = req.query.posts === '1';
    const executive = req.query.format === 'executive';
    try {
        const pdf = await renderReportPdf({ baseUrl: baseUrl.replace(/\/+$/, ''), token, report, withPosts, executive });
        const name = `${String(report.title || 'report').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}`
            + `_${istDate(report.range_from || report.period_start) || 'start'}_to_${istDate(report.range_to || report.period_end) || 'latest'}`
            + `${executive ? '_executive' : ''}${withPosts ? '_with_posts' : ''}.pdf`;
        await createAuditLog(req.user, 'download_report_pdf', 'tenant_report', report.id, { with_posts: withPosts, format: executive ? 'executive' : 'detailed' });
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
        res.send(Buffer.from(pdf));
    } catch (err) {
        console.error('[tenant] PDF failed:', err.message);
        res.status(err.status || 500).json({ message: err.status ? err.message : 'Could not prepare the PDF' });
    }
};

const parseDay = (value, endOfDay) => {
    if (!value) return null;
    // Plain dates are IST calendar days.
    const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:30`)
        : new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
};

const generating = new Set(); // "tenant:event" keys with a report in progress

/** POST /events/:id/reports {from?, to?} — build a report for a period, in the background. */
const createReport = async (req, res) => {
    const event = await findEvent(req);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const from = parseDay(req.body?.from, false);
    const to = parseDay(req.body?.to, true);
    if (from === undefined || to === undefined) return res.status(400).json({ message: 'Invalid date' });
    if (from && to && from > to) return res.status(400).json({ message: '"From" must be before "To"' });
    const lockKey = `${req.tenantId}:${event.id}`;
    if (generating.has(lockKey)) return res.status(409).json({ message: 'A report is already being generated' });

    const report = await TenantReport.create({
        tenant_id: req.tenantId,
        event_id: event.id,
        title: event.short_name || event.name,
        status: 'generating',
        range_from: from,
        range_to: to,
        generated_by: req.user.id,
    });
    generating.add(lockKey);
    completeReport(event, report.id, { from, to })
        .catch((err) => console.error('[tenant] report failed:', err.message))
        .finally(() => generating.delete(lockKey));
    await createAuditLog(req.user, 'create_report', 'tenant_report', report.id, { from, to });
    res.status(202).json({ report: { id: report.id, status: report.status, range_from: from, range_to: to } });
};

/** GET /events/:id/posts/export?from&to — relevant posts in a period, for the spreadsheet download. */
const exportPosts = async (req, res) => {
    const event = await findEvent(req);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const from = parseDay(req.query.from, false);
    const to = parseDay(req.query.to, true);
    if (from === undefined || to === undefined) return res.status(400).json({ message: 'Invalid date' });
    const filter = { tenant_id: req.tenantId, event_id: event.id, 'analysis.is_relevant': true };
    if (from || to) {
        filter.published_at = {};
        if (from) filter.published_at.$gte = from;
        if (to) filter.published_at.$lte = to;
    }
    // Optional slice (one tone, skip/limit) for the PDF appendix, which is rendered in parts.
    if (req.query.tone) {
        if (!TONE_QUERY[req.query.tone]) return res.status(400).json({ message: 'Invalid tone' });
        Object.assign(filter, TONE_QUERY[req.query.tone]);
    }
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const limit = Math.min(50000, Math.max(1, parseInt(req.query.limit, 10) || 50000));
    const posts = await TenantPost.find(filter)
        .select('platform post_type url media author_name author_handle author_followers analysis.account_type published_at text hashtags metrics engagement_total language analysis.sentiment analysis.stance_toward_subject analysis.stance_toward_protest analysis.category analysis.narratives analysis.risk_band analysis.review.risk_band analysis.summary analysis.target')
        .sort({ published_at: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    res.json({
        posts: posts.map((p) => ({
            published_at: p.published_at,
            platform: p.platform,
            post_type: p.post_type,
            account: p.author_name,
            handle: p.author_handle,
            text: p.text,
            url: p.url,
            likes: p.metrics?.likes ?? null,
            comments: p.metrics?.comments ?? null,
            shares: p.metrics?.shares ?? null,
            views: p.metrics?.views ?? null,
            tone: { positive: 'positive', negative: 'negative', mixed: 'negative' }[p.analysis?.sentiment] || 'neutral',
            sentiment: p.analysis?.sentiment,
            stance_toward_subject: p.analysis?.stance_toward_subject,
            stance_toward_protest: p.analysis?.stance_toward_protest,
            category: p.analysis?.category,
            narratives: (p.analysis?.narratives || []).join(', '),
            target: p.analysis?.target,
            risk_band: p.analysis?.review?.risk_band || p.analysis?.risk_band,
            summary: expand(p.analysis?.summary),
            language: p.language,
            footage: footageOf(p),
            public_account: isPublicAccount(p),
        })),
    });
};

/** Collect → classify → report, in the background. Poll GET /events/:id for progress. */
const refreshEvent = async (req, res) => {
    const event = await findEvent(req);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const state = getPipelineState(req.tenantId, event.id);
    if (state && state.running) return res.status(409).json({ message: 'An update is already running', pipeline: state });

    runEventPipeline(req.tenantId, event.id, { generatedBy: req.user.id }).catch((err) =>
        console.error('[tenant] pipeline failed:', err.message));
    await createAuditLog(req.user, 'refresh_event', 'tenant_event', event.id);
    res.status(202).json({ message: 'Update started', pipeline: getPipelineState(req.tenantId, event.id) });
};

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
    console.error('[tenant]', err);
    res.status(500).json({ message: 'Something went wrong' });
});

module.exports = {
    requireTenant,
    getWorkspace: wrap(getWorkspace),
    listEvents: wrap(listEvents),
    getEvent: wrap(getEvent),
    listPosts: wrap(listPosts),
    listReports: wrap(listReports),
    getLatestReport: wrap(getLatestReport),
    getReport: wrap(getReport),
    downloadReportPdf: wrap(downloadReportPdf),
    refreshEvent: wrap(refreshEvent),
    createReport: wrap(createReport),
    exportPosts: wrap(exportPosts),
};
