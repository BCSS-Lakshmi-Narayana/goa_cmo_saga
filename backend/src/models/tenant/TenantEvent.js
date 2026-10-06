const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const tenantScoped = require('./tenantScoped');

const sourceSchema = new mongoose.Schema({
    title: String,
    publisher: String,
    url: { type: String, required: true },
    published_at: Date,
}, { _id: false });

/** A fact about the event, kept apart from social-media claims, with its sources. */
const factSchema = new mongoose.Schema({
    statement: { type: String, required: true },
    // 'verified' = reported by two or more independent outlets; 'single_source'
    // = one outlet only; 'claim' = asserted by a party and not independently
    // confirmed (claimed_by names who asserts it).
    status: { type: String, enum: ['verified', 'single_source', 'claim'], required: true },
    claimed_by: { type: String, default: null },
    sources: { type: [String], default: [] },
}, { _id: false });

const entitySchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['person', 'organisation', 'party', 'institution', 'place'], default: 'person' },
    role: { type: String, default: '' },
    aliases: { type: [String], default: [] },
}, { _id: false });

const narrativeSchema = new mongoose.Schema({
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
}, { _id: false });

const tenantEventSchema = new mongoose.Schema({
    id: { type: String, default: uuidv4, unique: true },
    name: { type: String, required: true },
    // Short title used on the brief's cover, e.g. "CJP – Gyanesh Kumar & ECI".
    short_name: { type: String, default: null },
    description: { type: String, default: '' },
    start_date: { type: Date, required: true },
    end_date: { type: Date, default: null },
    timezone: { type: String, default: 'Asia/Kolkata' },
    location: { type: String, default: '' },
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active' },

    // Whom the workspace monitors for; stance is recorded relative to this.
    subject: { type: entitySchema, required: true },
    organisers: { type: [entitySchema], default: [] },
    related_figures: { type: [entitySchema], default: [] },

    keywords: { type: [String], default: [] },
    hashtags: { type: [String], default: [] },
    // Platform-specific collection plan: X/Facebook search strings, Instagram accounts.
    collection_plan: {
        x_queries: { type: [String], default: [] },
        facebook_queries: { type: [String], default: [] },
        instagram_accounts: { type: [String], default: [] },
        facebook_pages: { type: [String], default: [] },
        youtube_queries: { type: [String], default: [] },
        youtube_comment_videos: { type: Number, default: 15 },
        reddit_queries: { type: [String], default: [] },
        telegram_queries: { type: [String], default: [] },
        since: { type: Date, default: null },
    },
    // Narratives the classifier tags posts with; 'other' is always available.
    narratives: { type: [narrativeSchema], default: [] },

    facts: { type: [factSchema], default: [] },
    // Written by a human analyst after reading the flagged posts; carried into every report.
    analyst_review: {
        bottom_line: { type: String, default: null },
        risk_assessment: { type: String, default: null },
        notes: { type: [String], default: [] },
        reviewed_by: { type: String, default: null },
        reviewed_at: { type: Date, default: null },
    },
    // Announced or expected offline activity to watch (e.g. a declared next protest).
    watch_items: {
        type: [new mongoose.Schema({
            date: Date,
            description: { type: String, required: true },
            status: { type: String, enum: ['verified', 'single_source', 'claim'], default: 'claim' },
            sources: { type: [String], default: [] },
        }, { _id: false })],
        default: [],
    },
    sources: { type: [sourceSchema], default: [] },

    last_collected_at: { type: Date, default: null },
    last_collection_summary: { type: mongoose.Schema.Types.Mixed, default: null },
    created_by: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
}, { collection: 'tenant_events' });

tenantEventSchema.plugin(tenantScoped);
tenantEventSchema.pre('save', function touch(next) {
    this.updated_at = new Date();
    next();
});

module.exports = mongoose.model('TenantEvent', tenantEventSchema);
