const AuditLog = require('../models/AuditLog');
const TenantAuditLog = require('../models/tenant/TenantAuditLog');
const { isTenantUser, tenantOf } = require('../config/tenancy');

const createAuditLog = async (user, action, resourceType, resourceId = null, details = null) => {
  try {
    // Tenant activity must not show up in the Goa audit console.
    if (isTenantUser(user)) {
      await TenantAuditLog.create({
        tenant_id: tenantOf(user),
        user_id: user.id,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: details || {}
      });
      return;
    }
    await AuditLog.create({
      user_id: user.id,
      user_email: user.email,
      user_name: user.full_name || user.name || user.email,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details || {}
    });
  } catch (error) {
    console.error(`Failed to create audit log: ${error.message}`);
  }
};

module.exports = { createAuditLog };
