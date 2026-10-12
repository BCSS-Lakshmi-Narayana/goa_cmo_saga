const mongoose = require('mongoose');
const tenantScoped = require('./tenantScoped');

const tenantAuditLogSchema = new mongoose.Schema({
    user_id: String,
    action: String,
    resource_type: String,
    resource_id: String,
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    created_at: { type: Date, default: Date.now },
}, { collection: 'tenant_audit_logs' });

tenantAuditLogSchema.plugin(tenantScoped);

module.exports = mongoose.model('TenantAuditLog', tenantAuditLogSchema);
