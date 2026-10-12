/**
 * tenantGuard
 * ─────────────────────────────────────────────────────────────────────
 * Mounted on /api ahead of every router. If the request carries a valid token
 * (Authorization header, or ?token= for EventSource streams) belonging to a
 * non-Goa tenant user, only TENANT_API_ALLOWLIST is reachable; every other
 * route answers 403 before its controller runs. That keeps the ~50 Goa
 * routers closed to tenant users without each one having to know about
 * tenancy. Requests without a valid token pass through untouched — the
 * routers' own auth still decides those.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/jwtSecret');
const { tenantOf, isAllowedForTenantUser, DEFAULT_TENANT } = require('../config/tenancy');

const CACHE_MS = 60 * 1000;
const tenantCache = new Map(); // user_id → { tenant, at }

const readToken = (req) => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) return header.slice(7).trim();
    if (req.query && req.query.token) return String(req.query.token).trim();
    return null;
};

const lookupTenant = async (userId) => {
    const hit = tenantCache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.tenant;
    const user = await User.findOne({ id: userId }).select('tenant_id').lean();
    const tenant = user ? tenantOf(user) : null;
    tenantCache.set(userId, { tenant, at: Date.now() });
    return tenant;
};

const tenantGuard = async (req, res, next) => {
    const token = readToken(req);
    if (!token) return next();

    let decoded;
    try {
        decoded = jwt.verify(token, getJwtSecret());
    } catch (_) {
        return next();
    }

    try {
        const tenant = await lookupTenant(decoded.user_id);
        if (!tenant || tenant === DEFAULT_TENANT) return next();
        if (isAllowedForTenantUser(req.method, req.originalUrl.split('?')[0])) return next();
        return res.status(403).json({ message: 'Not available in this workspace' });
    } catch (err) {
        // Fail closed: if we cannot tell whose token this is, do not serve it.
        console.error('[tenantGuard] tenant lookup failed:', err.message);
        return res.status(503).json({ message: 'Temporarily unavailable' });
    }
};

module.exports = { tenantGuard };
