const mongoose = require('mongoose');
const tenantScoped = require('./tenantScoped');

const mediaSchema = new mongoose.Schema({
    kind: { type: String, default: null },   // photo | video
    url: { type: String, default: null },
}, { _id: false });

const claimSchema = new mongoose.Schema({
    text: { type: String, required: true },
    kind: { type: String, enum: ['allegation', 'factual_assertion', 'call_to_action', 'opinion'], default: 'opinion' },
}, { _id: false });

/**
 * A public social-media post collected for a tenant event. Only fields the
 * platform actually returned are stored — anything unavailable stays null
 * rather than being defaulted (e.g. a missing timestamp is not "now").
 */
const tenantPostSchema = new mongoose.Schema({
    event_id: { type: String, required: true, index: true },
    platform: { type: String, enum: ['x', 'facebook', 'instagram'], required: true },
    platform_post_id: { type: String, required: true },
    url: { type: String, default: null },

    author_name: { type: String, default: null },
    author_handle: { type: String, default: null },
    author_followers: { type: Number, default: null },
    author_verified: { type: Boolean, default: null },

    published_at: { type: Date, default: null },
    text: { type: String, default: '' },
    hashtags: { type: [String], default: [] },
    mentions: { type: [String], default: [] },
    media: { type: [mediaSchema], default: [] },
    language: { type: String, default: null },
    location: { type: String, default: null },

    // 'original' | 'repost' (retweet/share of someone else's post) | 'quote' | 'reply'
    post_type: { type: String, enum: ['original', 'repost', 'quote', 'reply'], default: 'original' },
    original_post_id: { type: String, default: null },
    original_author_handle: { type: String, default: null },

    // null = the platform did not return this metric.
    metrics: {
        likes: { type: Number, default: null },
        comments: { type: Number, default: null },
        shares: { type: Number, default: null },
        views: { type: Number, default: null },
    },
    engagement_total: { type: Number, default: 0 },

    matched_queries: { type: [String], default: [] },
    collected_at: { type: Date, default: Date.now },
    collected_via: { type: String, default: null },

    // Filled by tenantClassificationService. Relevance category, stance and
    // sentiment are separate on purpose: a critical post is not a factual claim.
    analysis: {
        status: { type: String, enum: ['pending', 'done', 'failed'], default: 'pending' },
        category: {
            type: String,
            enum: ['direct_protest_coverage', 'reaction_support', 'criticism', 'neutral_reporting',
                'counter_reaction', 'news_media_coverage', 'unrelated', null],
            default: null,
        },
        is_relevant: { type: Boolean, default: null },
        target: { type: String, default: null },            // person/entity the post is mainly about
        stance_toward_subject: { type: String, enum: ['supportive', 'critical', 'neutral', 'unclear', null], default: null },
        stance_toward_protest: { type: String, enum: ['supportive', 'critical', 'neutral', 'unclear', null], default: null },
        sentiment: { type: String, enum: ['positive', 'negative', 'neutral', 'mixed', null], default: null },
        narratives: { type: [String], default: [] },
        entities: { type: [String], default: [] },
        claims: { type: [claimSchema], default: [] },
        media_description: { type: String, default: null },
        rationale: { type: String, default: null },
        model: { type: String, default: null },
        analysed_at: { type: Date, default: null },
        error: { type: String, default: null },
    },
}, { collection: 'tenant_posts' });

tenantPostSchema.plugin(tenantScoped);
tenantPostSchema.index({ tenant_id: 1, event_id: 1, platform: 1, platform_post_id: 1 }, { unique: true });
tenantPostSchema.index({ tenant_id: 1, event_id: 1, published_at: -1 });

module.exports = mongoose.model('TenantPost', tenantPostSchema);
