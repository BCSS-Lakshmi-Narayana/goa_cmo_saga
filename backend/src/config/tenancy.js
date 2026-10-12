/**
 * Tenancy
 * ─────────────────────────────────────────────────────────────────────
 * This deployment's own users (Goa CM) belong to the default tenant. Every
 * other tenant is a sealed workspace inside the same instance:
 *
 *   • its users can reach only TENANT_API_ALLOWLIST (see tenantGuard) — every
 *     Goa route, dashboard and background-job collection is closed to them;
 *   • its data lives only in the `tenant_*` collections, which no Goa query
 *     or job reads, and whose models refuse any query without a tenant_id;
 *   • its users are hidden from Goa admin user lists and cannot be edited by
 *     Goa admins (see goaUserFilter).
 *
 * Users created before tenancy have no tenant_id and are Goa users.
 */

const DEFAULT_TENANT = 'goa';

/** Paths (under /api) a non-default-tenant user may call. Everything else is 403. */
const TENANT_API_ALLOWLIST = [
    { method: 'POST', path: /^\/api\/auth\/login\/?$/ },
    { method: 'GET', path: /^\/api\/auth\/me\/?$/ },
    { method: '*', path: /^\/api\/tenant(\/|$)/ },
];

const tenantOf = (user) => (user && user.tenant_id) || DEFAULT_TENANT;

const isTenantUser = (user) => tenantOf(user) !== DEFAULT_TENANT;

const isAllowedForTenantUser = (method, path) =>
    TENANT_API_ALLOWLIST.some((rule) =>
        (rule.method === '*' || rule.method === method) && rule.path.test(path));

/**
 * Mongo filter matching only Goa users. `$in: [null]` also matches documents
 * where the field is missing, which covers every pre-tenancy user.
 */
const goaUserFilter = () => ({ tenant_id: { $in: [null, DEFAULT_TENANT] } });

module.exports = {
    DEFAULT_TENANT,
    TENANT_API_ALLOWLIST,
    tenantOf,
    isTenantUser,
    isAllowedForTenantUser,
    goaUserFilter,
};
