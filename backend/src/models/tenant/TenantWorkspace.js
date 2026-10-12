const mongoose = require('mongoose');
const tenantScoped = require('./tenantScoped');

/** One row per tenant: the workspace's name and who it is monitoring for. */
const tenantWorkspaceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    client_description: { type: String, default: '' },
    // Who prepares the reports (name, address, contact, services), shown on the presentation format.
    branding: { type: mongoose.Schema.Types.Mixed, default: null },
    created_at: { type: Date, default: Date.now },
}, { collection: 'tenant_workspaces' });

tenantWorkspaceSchema.plugin(tenantScoped);

module.exports = mongoose.model('TenantWorkspace', tenantWorkspaceSchema);
