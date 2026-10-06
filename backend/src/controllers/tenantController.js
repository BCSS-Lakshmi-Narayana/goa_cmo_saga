/**
 * /api/tenant — the only API a tenant user can reach (see tenantGuard).
 * Every query is pinned to req.tenantId, taken from the signed-in user and
 * never from the request, and Goa users are refused outright.
 */

const TenantWorkspace = require('../models/tenant/TenantWorkspace');
const TenantEvent = require('../models/tenant/TenantEvent');
const TenantPost = require('../models/tenant/TenantPost');
const TenantReport = require('../models/tenant/TenantReport');
const { isTenantUser, tenantOf } = require('../config/tenancy');
const { createAuditLog } = require('../services/auditService');
const { runEventPipeline, getPipelineState } = require('../services/tenant/tenantPipeline');

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
    const { platform, category, stance, narrative, post_type: postType, q } = req.query;
    if (req.query.include_unrelated !== 'true') filter['analysis.is_relevant'] = true;
    if (['x', 'facebook', 'instagram'].includes(platform)) filter.platform = platform;
    if (category) filter['analysis.category'] = String(category);
    if (stance) filter['analysis.stance_toward_subject'] = String(stance);
    if (narrative) filter['analysis.narratives'] = String(narrative);
    if (postType) filter.post_type = String(postType);
    if (q) filter.text = { $regex: String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100), $options: 'i' };

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
        .select('-_id id title period_start period_end post_count created_at')
        .sort({ created_at: -1 })
        .lean();
    res.json({ reports });
};

const getLatestReport = async (req, res) => {
    const event = await findEvent(req);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const report = await TenantReport.findOne({ tenant_id: req.tenantId, event_id: event.id })
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
    refreshEvent: wrap(refreshEvent),
};
