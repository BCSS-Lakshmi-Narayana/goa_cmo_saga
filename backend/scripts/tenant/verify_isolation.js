/**
 * verify_isolation.js
 * ─────────────────────────────────────────────────────────────────────
 * Proves a tenant is sealed off from the Goa tenant, at two levels:
 *
 *  DB    – no Goa collection holds a row created by / pointing at the tenant
 *          (its user id, event ids, report ids); every tenant_* row carries a
 *          tenant_id; tenant models refuse unscoped queries.
 *  API   – against the running server: the tenant user gets 403 from every
 *          Goa router and sees only its own events; a Goa superadmin gets 403
 *          from /api/tenant and does not see the tenant in Goa user lists,
 *          events or reports.
 *
 *   node scripts/tenant/verify_isolation.js --tenant <id> [--api http://127.0.0.1:8010]
 *
 * Tokens are minted in-process with the server's JWT secret; nothing secret
 * is printed. Exits non-zero if any check fails.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const TenantEvent = require('../../src/models/tenant/TenantEvent');
const TenantPost = require('../../src/models/tenant/TenantPost');
const TenantReport = require('../../src/models/tenant/TenantReport');
const { getJwtSecret } = require('../../src/config/jwtSecret');
const { goaUserFilter } = require('../../src/config/tenancy');

const arg = (name, def = null) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? def : process.argv[i + 1];
};

const results = [];
const check = (level, name, pass, detail = '') => {
    results.push({ level, name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  [${level}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const dbChecks = async (tenantId) => {
    const db = mongoose.connection.db;
    const users = await User.find({ tenant_id: tenantId }).lean();
    check('DB', 'tenant has at least one user', users.length > 0, `${users.length} user(s)`);
    const userIds = users.map((u) => u.id);
    const events = await TenantEvent.find({ tenant_id: tenantId }).select('id name').lean();
    const eventIds = events.map((e) => e.id);
    const reportIds = (await TenantReport.find({ tenant_id: tenantId }).select('id').lean()).map((r) => r.id);
    const ids = [...userIds, ...eventIds, ...reportIds];

    // 1. No Goa collection references the tenant.
    const REF_FIELDS = ['user_id', 'created_by', 'generated_by', 'event_id', 'owner_id', 'assigned_to', 'resource_id', 'id'];
    const collections = (await db.listCollections().toArray()).map((c) => c.name)
        .filter((n) => !n.startsWith('tenant_') && !n.startsWith('system.') && n !== 'users');
    const leaks = [];
    for (const name of collections) {
        const or = REF_FIELDS.map((f) => ({ [f]: { $in: ids } }));
        const n = await db.collection(name).countDocuments({ $or: or });
        if (n) leaks.push(`${name}:${n}`);
    }
    check('DB', `no Goa collection references tenant ids (${collections.length} collections scanned)`, leaks.length === 0, leaks.join(', '));

    // 1b. Tenant event names do not appear in the Goa events collection.
    const goaEventHits = await db.collection('events').countDocuments({ name: { $in: events.map((e) => e.name) } });
    check('DB', 'tenant event names absent from Goa events', goaEventHits === 0, `${goaEventHits} hit(s)`);

    // 2. Every tenant_* row is stamped with a tenant_id.
    const tenantCols = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => n.startsWith('tenant_'));
    for (const name of tenantCols) {
        const missing = await db.collection(name).countDocuments({ $or: [{ tenant_id: { $exists: false } }, { tenant_id: null }, { tenant_id: '' }] });
        check('DB', `${name}: every row has tenant_id`, missing === 0, `${missing} missing`);
    }

    // 3. Tenant posts / reports belong only to this tenant's events.
    const strayPosts = await TenantPost.countDocuments({ tenant_id: tenantId, event_id: { $nin: eventIds } });
    check('DB', 'tenant posts reference only this tenant\'s events', strayPosts === 0, `${strayPosts} stray`);
    const foreignPosts = await db.collection('tenant_posts').countDocuments({ event_id: { $in: eventIds }, tenant_id: { $ne: tenantId } });
    check('DB', 'no other tenant has rows on these events', foreignPosts === 0, `${foreignPosts} foreign`);

    // 4. The model layer refuses unscoped queries.
    for (const [label, run] of [
        ['find', () => TenantPost.find({}).exec()],
        ['countDocuments', () => TenantEvent.countDocuments({}).exec()],
        ['aggregate', () => TenantReport.aggregate([{ $match: {} }]).exec()],
        ['updateMany', () => TenantPost.updateMany({}, { $set: { x: 1 } }).exec()],
    ]) {
        let refused = false;
        try { await run(); } catch (e) { refused = /tenantScoped/.test(e.message); }
        check('DB', `unscoped ${label} on tenant model is refused`, refused);
    }

    // 5. Tenant users are invisible to the Goa user filter used by admin screens.
    const visible = await User.countDocuments({ $and: [goaUserFilter(), { tenant_id: tenantId }] });
    check('DB', 'tenant users excluded by Goa admin user filter', visible === 0);

    return { users, events };
};

const apiChecks = async (api, tenantUser, events) => {
    const goaAdmin = await User.findOne({ ...goaUserFilter(), role: { $in: ['superadmin', 'super_admin'] }, is_active: { $ne: false } }).lean();
    const sign = (u) => jwt.sign({ user_id: u.id }, getJwtSecret(), { expiresIn: '10m' });
    const tenantAuth = { headers: { Authorization: `Bearer ${sign(tenantUser)}` }, validateStatus: () => true, timeout: 30000 };
    const goaAuth = goaAdmin ? { headers: { Authorization: `Bearer ${sign(goaAdmin)}` }, validateStatus: () => true, timeout: 60000 } : null;

    const me = await axios.get(`${api}/api/auth/me`, tenantAuth);
    check('API', 'tenant user: /api/auth/me works', me.status === 200 && me.data.tenant_id === tenantUser.tenant_id, `status ${me.status}`);
    const evs = await axios.get(`${api}/api/tenant/events`, tenantAuth);
    const ownIds = new Set(events.map((e) => e.id));
    check('API', 'tenant user: sees only own events', evs.status === 200 && evs.data.events.every((e) => ownIds.has(e.id)),
        `status ${evs.status}, ${evs.data?.events?.length ?? 0} event(s)`);

    // Every Goa router prefix mounted in index.js must answer 403 to the tenant.
    const indexSrc = fs.readFileSync(path.resolve(__dirname, '../../src/index.js'), 'utf8');
    const prefixes = [...new Set([...indexSrc.matchAll(/app\.(?:use|get|post)\('(\/api\/[^'*:]+)/g)].map((m) => m[1]))]
        .filter((p) => !p.startsWith('/api/tenant') && p !== '/api/auth' && p !== '/api');
    const samplePaths = [...prefixes, '/api/auth/register', '/api/auth/constituency-users', '/api/events', '/api/content',
        '/api/alerts', '/api/keywords', '/api/reports', '/api/rbac/users', '/api/audit', '/api/search/global?q=goa',
        '/api/analytics/overview', '/api/youtube-live/stream'];
    const notBlocked = [];
    for (const p of [...new Set(samplePaths)]) {
        const r = await axios.get(`${api}${p}`, tenantAuth);
        if (r.status !== 403) notBlocked.push(`${p}→${r.status}`);
    }
    const sse = await axios.get(`${api}/api/youtube-live/stream?token=${sign(tenantUser)}`, { validateStatus: () => true, timeout: 10000, responseType: 'stream' })
        .catch((e) => ({ status: e.response?.status || 'error' }));
    if (sse.data?.destroy) sse.data.destroy();
    if (sse.status !== 403) notBlocked.push(`/api/youtube-live/stream?token→${sse.status}`);
    check('API', `tenant user: all ${samplePaths.length + 1} Goa endpoints return 403`, notBlocked.length === 0, notBlocked.join(', '));

    if (!goaAuth) {
        check('API', 'Goa superadmin checks', false, 'no active Goa superadmin found');
        return;
    }
    const t = await axios.get(`${api}/api/tenant/events`, goaAuth);
    check('API', 'Goa superadmin: /api/tenant/* refused', t.status === 403, `status ${t.status}`);
    if (events[0]) {
        const t2 = await axios.get(`${api}/api/tenant/events/${events[0].id}/posts`, goaAuth);
        check('API', 'Goa superadmin: tenant posts by id refused', t2.status === 403, `status ${t2.status}`);
    }
    const users = await axios.get(`${api}/api/rbac/users`, goaAuth);
    const leaked = Array.isArray(users.data) && users.data.some((u) => u.email === tenantUser.email);
    check('API', 'Goa superadmin: tenant user absent from /api/rbac/users', users.status === 200 && !leaked, `status ${users.status}`);
    const perm = await axios.get(`${api}/api/rbac/permissions/${tenantUser.id}`, goaAuth);
    check('API', 'Goa superadmin: cannot open tenant user permissions', perm.status === 404, `status ${perm.status}`);
    const goaEvents = await axios.get(`${api}/api/events`, goaAuth);
    const body = JSON.stringify(goaEvents.data || '');
    check('API', 'Goa superadmin: tenant events absent from /api/events', goaEvents.status === 200 && events.every((e) => !body.includes(e.id) && !body.includes(e.name)), `status ${goaEvents.status}`);
    const audit = await axios.get(`${api}/api/audit`, goaAuth);
    check('API', 'Goa superadmin: tenant activity absent from audit log', audit.status === 200 && !JSON.stringify(audit.data || '').includes(tenantUser.id), `status ${audit.status}`);
};

const main = async () => {
    const tenantId = arg('--tenant');
    if (!tenantId) throw new Error('--tenant is required');
    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);

    const { users, events } = await dbChecks(tenantId);
    const api = arg('--api');
    if (api && users[0]) await apiChecks(api.replace(/\/+$/, ''), users[0], events);

    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await mongoose.disconnect();
    process.exit(failed.length ? 1 : 0);
};

main().catch(async (err) => {
    console.error('verify failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
});
