/**
 * Classifies tenant posts against their event with the deployment's LLM.
 *
 * Relevance category, stance (toward the subject and toward the protest) and
 * sentiment are separate outputs on purpose: a post criticising the subject is
 * a stance, not evidence that what it alleges is true. Allegations are kept
 * as claims, labelled as such.
 */

const TenantPost = require('../../models/tenant/TenantPost');
const llm = require('../llmProvider');

const CATEGORIES = ['direct_protest_coverage', 'reaction_support', 'criticism', 'neutral_reporting',
    'counter_reaction', 'news_media_coverage', 'unrelated'];
const STANCES = ['supportive', 'critical', 'neutral', 'unclear'];
const SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed'];
const CLAIM_KINDS = ['allegation', 'factual_assertion', 'call_to_action', 'opinion'];

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

const SYSTEM_PROMPT = `You are a careful, politically neutral media analyst. You label one public social-media post about a specific event.
Rules:
- Judge only from the post text and metadata given. Do not add outside facts.
- Relevance category describes what the post IS (coverage, reaction, criticism...), not whether it is true.
- Stance and sentiment are separate: e.g. a sarcastic post can be negative in sentiment yet supportive of the protest.
- Anything the post asserts about wrongdoing is an "allegation", never a fact.
- Return strict JSON only.`;

const buildPrompt = (event, post) => {
    const narratives = (event.narratives || []).map((n) => `  - ${n.key}: ${n.label}${n.description ? ` — ${n.description}` : ''}`).join('\n');
    const organisers = (event.organisers || []).map((o) => o.name).join(', ');
    return `EVENT: ${event.name}
WHAT IT IS: ${event.description}
SUBJECT (person the protest is directed at): ${event.subject.name} — ${event.subject.role}
ORGANISERS: ${organisers}
KEYWORDS: ${(event.keywords || []).join(', ')}

POST (${post.platform}${post.post_type !== 'original' ? `, ${post.post_type}` : ''}) by ${post.author_name || ''} (@${post.author_handle || 'unknown'}), published ${post.published_at ? post.published_at.toISOString() : 'unknown'}:
"""
${String(post.text || '').slice(0, 2500)}
"""
Attached media: ${(post.media || []).map((m) => m.kind).filter(Boolean).join(', ') || 'none'}

Return JSON with exactly these keys:
{
  "is_relevant": true|false,           // is the post genuinely about this event / its demands / the subject in this context?
  "category": one of ${JSON.stringify(CATEGORIES)},
  "target": "the person or organisation the post is mainly about",
  "stance_toward_subject": one of ${JSON.stringify(STANCES)},   // toward ${event.subject.name}
  "stance_toward_protest": one of ${JSON.stringify(STANCES)},   // toward the protest / its organisers' demands
  "sentiment": one of ${JSON.stringify(SENTIMENTS)},
  "narratives": [zero or more keys from the list below],
  "entities": ["people, organisations, places named or clearly referred to"],
  "claims": [{"text": "short paraphrase", "kind": one of ${JSON.stringify(CLAIM_KINDS)}}],
  "language": "ISO 639-1 code of the post text, e.g. en, hi, mr",
  "rationale": "one sentence explaining the labels"
}
NARRATIVES:
${narratives}
  - other: none of the above`;
};

const normalise = (event, raw) => {
    const narrativeKeys = new Set([...(event.narratives || []).map((n) => n.key), 'other']);
    const category = pick(raw.category, CATEGORIES, 'unrelated');
    const isRelevant = typeof raw.is_relevant === 'boolean' ? raw.is_relevant && category !== 'unrelated' : category !== 'unrelated';
    return {
        status: 'done',
        category: isRelevant ? category : 'unrelated',
        is_relevant: isRelevant,
        target: raw.target ? String(raw.target).slice(0, 160) : null,
        stance_toward_subject: pick(raw.stance_toward_subject, STANCES, 'unclear'),
        stance_toward_protest: pick(raw.stance_toward_protest, STANCES, 'unclear'),
        sentiment: pick(raw.sentiment, SENTIMENTS, 'neutral'),
        narratives: (Array.isArray(raw.narratives) ? raw.narratives : []).filter((k) => narrativeKeys.has(k)),
        entities: (Array.isArray(raw.entities) ? raw.entities : []).map(String).slice(0, 15),
        claims: (Array.isArray(raw.claims) ? raw.claims : [])
            .filter((c) => c && c.text)
            .map((c) => ({ text: String(c.text).slice(0, 300), kind: pick(c.kind, CLAIM_KINDS, 'opinion') }))
            .slice(0, 6),
        rationale: raw.rationale ? String(raw.rationale).slice(0, 400) : null,
        language: raw.language ? String(raw.language).slice(0, 5).toLowerCase() : null,
        analysed_at: new Date(),
        error: null,
    };
};

const classifyPost = async (event, post) => {
    try {
        const raw = await llm.chatJson({
            systemPrompt: SYSTEM_PROMPT,
            prompt: buildPrompt(event, post),
            maxTokens: 700,
            temperature: 0,
            timeout: 120000,
        });
        if (!raw || typeof raw !== 'object') throw new Error('LLM returned no JSON');
        const { language, ...analysis } = normalise(event, raw);
        const set = { analysis };
        if (!post.language && language) set.language = language;
        await TenantPost.updateOne({ tenant_id: event.tenant_id, event_id: event.id, _id: post._id }, { $set: set });
        return 'done';
    } catch (err) {
        await TenantPost.updateOne(
            { tenant_id: event.tenant_id, event_id: event.id, _id: post._id },
            { $set: { 'analysis.status': 'failed', 'analysis.error': err.message, 'analysis.analysed_at': new Date() } },
        );
        return 'failed';
    }
};

/** Classify every pending (and optionally failed) post of an event, a few at a time. */
const classifyEvent = async (event, { retryFailed = true, concurrency = 3, reclassify = false } = {}) => {
    const statuses = reclassify ? ['pending', 'failed', 'done'] : (retryFailed ? ['pending', 'failed'] : ['pending']);
    const posts = await TenantPost.find({
        tenant_id: event.tenant_id,
        event_id: event.id,
        'analysis.status': { $in: statuses },
    }).lean();

    const counts = { total: posts.length, done: 0, failed: 0 };
    let i = 0;
    const worker = async () => {
        while (i < posts.length) {
            const post = posts[i++];
            counts[await classifyPost(event, post)] += 1;
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, posts.length) }, worker));
    return counts;
};

module.exports = { classifyEvent, classifyPost, CATEGORIES };
