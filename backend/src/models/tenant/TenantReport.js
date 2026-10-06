const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const tenantScoped = require('./tenantScoped');

/** A generated executive report for a tenant event. `data` is the full structured report. */
const tenantReportSchema = new mongoose.Schema({
    id: { type: String, default: uuidv4, unique: true },
    event_id: { type: String, required: true, index: true },
    title: { type: String, required: true },
    status: { type: String, enum: ['generating', 'ready', 'failed'], default: 'ready' },
    error: { type: String, default: null },
    // The period the user asked for (null = whole event); period_* is the span of posts actually found.
    range_from: { type: Date, default: null },
    range_to: { type: Date, default: null },
    // Rendered PDF on disk, created on first download.
    pdf_path: { type: String, default: null },
    period_start: { type: Date, default: null },
    period_end: { type: Date, default: null },
    post_count: { type: Number, default: 0 },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    generated_by: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
}, { collection: 'tenant_reports' });

tenantReportSchema.plugin(tenantScoped);
tenantReportSchema.index({ tenant_id: 1, event_id: 1, created_at: -1 });

module.exports = mongoose.model('TenantReport', tenantReportSchema);
