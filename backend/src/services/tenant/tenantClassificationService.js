/**
 * Classifies tenant posts against their event with the deployment's LLM.
 *
 * Relevance category, stance (toward the subject and toward the protest) and
 * sentiment are separate outputs on purpose: a post criticising the subject is
 * a stance, not evidence that what it alleges is true. Allegations are kept
 * as claims, labelled as such.
 *
 * Risk bands are about harm, not disagreement: ordinary criticism, satire and
 * calls for resignation are lawful political speech and stay 'low'.
 *
 * Posts are sent in small batches to keep the number of LLM calls down; a
 * batch that fails to parse is retried one post at a time.
 */

const TenantPost = require('../../models/tenant/TenantPost');
const llm = require('../llmProvider');

const CATEGORIES = ['direct_protest_coverage', 'reaction_support', 'criticism', 'neutral_reporting',
    'counter_reaction', 'news_media_coverage', 'unrelated'];
const STANCES = ['supportive', 'critical', 'neutral', 'unclear'];
const SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed'];
const CLAIM_KINDS = ['allegation', 'factual_assertion', 'call_to_action', 'opinion'];
const ACCOUNT_TYPES = ['news_media', 'journalist', 'public_figure', 'political_party', 'organisation', 'government', 'individual', 'unknown'];
const TARGET_TYPES = ['subject', 'election_commission', 'protest_organisers', 'police', 'political_leader', 'government', 'judiciary', 'media', 'organisation', 'other'];
const ACTIVITY_TYPES = ['protest', 'rally_march', 'meeting', 'press_conference', 'detention_arrest', 'legal_action', 'announcement', 'none'];
const RISK_BANDS = ['critical', 'high', 'medium', 'low'];

const BATCH_SIZE = parseInt(process.env.TENANT_CLASSIFY_BATCH || '8', 10);

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

const SYSTEM_PROMPT = `You are a careful, politically neutral media analyst. You label public social-media posts about one specific event.
Rules:
- Judge only from each post's text and metadata. Do not add outside facts.
- Relevance category says what the post IS (coverage, reaction, criticism...), not whether it is true.
- Stance and sentiment are separate: a sarcastic post can be negative in tone yet supportive of the protest.
- Anything a post asserts about wrongdoing is an "allegation", never a fact.
- Risk band measures potential for harm, NOT disagreement:
  critical = explicit threat of violence or physical harm to a person or institution; incitement to violence; doxxing (home address, phone, family details); impersonation of an official or the Election Commission.
  high = calls to gherao/blockade/disrupt an official's home or office or to break the law; manipulated, AI-generated or misattributed media presented as real; communal or caste-targeted abuse.
  medium = serious unverified allegations against a named official stated as fact (e.g. "traitor", "stole votes"); personal abuse/slurs at a named person; calls for mass mobilisation to a specific place and date.
  low = everything else, including ordinary criticism, satire, memes, demands for resignation, news reports and support.
- Return strict JSON only.`;

const eventContext = (event) => {
    const narratives = (event.narratives || []).map((n) => `  - ${n.key}: ${n.label}`).join('\n');
    const organisers = (event.organisers || []).map((o) => o.name).join(', ');
    return `EVENT: ${event.name}
WHAT IT IS: ${event.description}
SUBJECT (person the protest is directed at): ${event.subject.name} — ${event.subject.role}
ORGANISERS: ${organisers}
NARRATIVE KEYS:
${narratives}
  - other: none of the above`;
};

const postBlock = (post, idx) => `### POST ${idx}
platform: ${post.platform}${post.post_type !== 'original' ? ` (${post.post_type})` : ''}
account: ${post.author_name || ''} (@${post.author_handle || 'unknown'})${post.author_followers ? `, ${post.author_followers} followers` : ''}
published: ${post.published_at ? new Date(post.published_at).toISOString() : 'unknown'}${post.parent_title ? `\ncomment on video: "${post.parent_title}"` : ''}
text: """${String(post.text || '').replace(/"""/g, '"').slice(0, 1800)}"""
media: ${(post.media || []).map((m) => m.kind).filter(Boolean).join(', ') || 'none'}`;

const SCHEMA = `{
  "post": <the POST number>,
  "is_relevant": true|false,        // genuinely about this event, its demands, or the subject in this context
  "category": one of ${JSON.stringify(CATEGORIES)},
  "summary": "one neutral sentence: what the post says",
  "account_type": one of ${JSON.stringify(ACCOUNT_TYPES)},   // judge from the account name/handle; "individual" if a private person
  "target": "the person or organisation the post is mainly about",
  "target_type": one of ${JSON.stringify(TARGET_TYPES)},     // "subject" = the subject named above
  "stance_toward_subject": one of ${JSON.stringify(STANCES)},
  "stance_toward_protest": one of ${JSON.stringify(STANCES)},
  "sentiment": one of ${JSON.stringify(SENTIMENTS)},
  "narratives": [keys from NARRATIVE KEYS],
  "entities": ["people/organisations named or clearly referred to"],
  "places": ["cities or venues named, e.g. Mumbai, Shivaji Park, Jantar Mantar"],
  "activity": {"type": one of ${JSON.stringify(ACTIVITY_TYPES)}, "place": "...", "date_text": "as written, or empty"},
  "claims": [{"text": "short paraphrase", "kind": one of ${JSON.stringify(CLAIM_KINDS)}}],
  "risk_band": one of ${JSON.stringify(RISK_BANDS)},
  "risk_reason": "why, in a few words; empty for low",
  "language": "ISO 639-1 code of the text"
}`;

const buildPrompt = (event, posts) => `${eventContext(event)}

Label each of the ${posts.length} posts below. Return JSON: {"results": [ one object per post ]} where each object is:
${SCHEMA}

${posts.map((p, i) => postBlock(p, i + 1)).join('\n\n')}`;

const strArr = (v, max = 15, len = 120) =>
    (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).map((x) => x.slice(0, len)).slice(0, max);

const normalise = (event, raw) => {
    const narrativeKeys = new Set([...(event.narratives || []).map((n) => n.key), 'other']);
    const category = pick(raw.category, CATEGORIES, 'unrelated');
    const isRelevant = typeof raw.is_relevant === 'boolean' ? raw.is_relevant && category !== 'unrelated' : category !== 'unrelated';
    const activity = raw.activity && typeof raw.activity === 'object' ? raw.activity : {};
    return {
        status: 'done',
        category: isRelevant ? category : 'unrelated',
        is_relevant: isRelevant,
        summary: raw.summary ? String(raw.summary).slice(0, 300) : null,
        account_type: pick(raw.account_type, ACCOUNT_TYPES, 'unknown'),
        target: raw.target ? String(raw.target).slice(0, 160) : null,
        target_type: pick(raw.target_type, TARGET_TYPES, 'other'),
        stance_toward_subject: pick(raw.stance_toward_subject, STANCES, 'unclear'),
        stance_toward_protest: pick(raw.stance_toward_protest, STANCES, 'unclear'),
        sentiment: pick(raw.sentiment, SENTIMENTS, 'neutral'),
        narratives: strArr(raw.narratives, 6, 60).filter((k) => narrativeKeys.has(k)),
        entities: strArr(raw.entities),
        places: strArr(raw.places, 8, 80),
        activity: {
            type: pick(activity.type, ACTIVITY_TYPES, 'none'),
            place: activity.place ? String(activity.place).slice(0, 120) : null,
            date_text: activity.date_text ? String(activity.date_text).slice(0, 60) : null,
        },
        claims: (Array.isArray(raw.claims) ? raw.claims : [])
            .filter((c) => c && c.text)
            .map((c) => ({ text: String(c.text).slice(0, 300), kind: pick(c.kind, CLAIM_KINDS, 'opinion') }))
            .slice(0, 6),
        risk_band: isRelevant ? pick(raw.risk_band, RISK_BANDS, 'low') : 'low',
        risk_reason: raw.risk_reason ? String(raw.risk_reason).slice(0, 300) : null,
        rationale: null,
        analysed_at: new Date(),
        error: null,
        language: raw.language ? String(raw.language).slice(0, 5).toLowerCase() : null,
    };
};

const save = async (event, post, raw) => {
    const { language, ...analysis } = normalise(event, raw);
    // Keep any analyst review already recorded on this post.
    if (post.analysis?.review?.reviewed_at) analysis.review = post.analysis.review;
    const set = { analysis };
    if (!post.language && language) set.language = language;
    await TenantPost.updateOne({ tenant_id: event.tenant_id, event_id: event.id, _id: post._id }, { $set: set });
};

const markFailed = (event, post, message) => TenantPost.updateOne(
    { tenant_id: event.tenant_id, event_id: event.id, _id: post._id },
    { $set: { 'analysis.status': 'failed', 'analysis.error': message, 'analysis.analysed_at': new Date() } },
);

const callLlm = (event, posts) => llm.chatJson({
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildPrompt(event, posts),
    maxTokens: 450 * posts.length + 200,
    temperature: 0,
    timeout: 60000 + 40000 * posts.length,
});

const classifyOne = async (event, post) => {
    try {
        const out = await callLlm(event, [post]);
        const raw = Array.isArray(out?.results) ? out.results[0] : out;
        if (!raw || typeof raw !== 'object' || !raw.category) throw new Error('LLM returned no usable JSON');
        await save(event, post, raw);
        return 'done';
    } catch (err) {
        await markFailed(event, post, err.message);
        return 'failed';
    }
};

/** Classify a batch; anything the batch answer doesn't cover is retried singly. */
const classifyBatch = async (event, posts) => {
    if (posts.length === 1) return [await classifyOne(event, posts[0])];
    let results = [];
    try {
        const out = await callLlm(event, posts);
        results = Array.isArray(out?.results) ? out.results : [];
    } catch (err) {
        console.warn(`[tenantClassify] batch of ${posts.length} failed (${err.message}); retrying singly`);
    }
    const byIndex = new Map();
    results.forEach((r, i) => {
        if (!r || typeof r !== 'object' || !r.category) return;
        const n = Number(r.post);
        byIndex.set(Number.isInteger(n) && n >= 1 && n <= posts.length ? n - 1 : i, r);
    });
    const outcomes = [];
    for (let i = 0; i < posts.length; i++) {
        if (byIndex.has(i)) {
            await save(event, posts[i], byIndex.get(i));
            outcomes.push('done');
        } else {
            outcomes.push(await classifyOne(event, posts[i]));
        }
    }
    return outcomes;
};

/**
 * Video search returns many generic political videos. A video whose title and
 * description name none of the event's terms is marked unrelated without an
 * LLM call. (X results come from targeted queries and comments come only from
 * videos that do mention the event, so neither is pre-filtered.)
 */
const prefilterUnrelated = async (event) => {
    const terms = [...(event.keywords || []), ...(event.hashtags || [])]
        .map((t) => String(t).toLowerCase().replace(/^#/, '').trim())
        .filter((t) => t.length >= 5);
    const candidates = await TenantPost.find({
        tenant_id: event.tenant_id, event_id: event.id, platform: 'youtube', post_type: 'original',
        'analysis.status': { $in: ['pending', 'failed'] },
    }).select('_id text').lean();
    const unrelated = candidates.filter((p) => !terms.some((t) => String(p.text || '').toLowerCase().includes(t)));
    if (unrelated.length) {
        await TenantPost.updateMany(
            { tenant_id: event.tenant_id, event_id: event.id, _id: { $in: unrelated.map((p) => p._id) } },
            { $set: {
                'analysis.status': 'done', 'analysis.is_relevant': false, 'analysis.category': 'unrelated',
                'analysis.risk_band': 'low', 'analysis.rationale': 'Pre-filter: title and description name none of the event terms',
                'analysis.analysed_at': new Date(), 'analysis.error': null,
            } },
        );
    }
    return unrelated.length;
};

/** Classify an event's pending (and optionally failed / all) posts. */
const classifyEvent = async (event, { retryFailed = true, concurrency = parseInt(process.env.TENANT_CLASSIFY_CONCURRENCY || '3', 10), reclassify = false, onProgress, limit = 0 } = {}) => {
    const prefiltered = await prefilterUnrelated(event);
    if (prefiltered) console.log(`[tenantClassify] pre-filtered ${prefiltered} unrelated videos`);
    const statuses = reclassify ? ['pending', 'failed', 'done'] : (retryFailed ? ['pending', 'failed'] : ['pending']);
    const posts = await TenantPost.find({
        tenant_id: event.tenant_id,
        event_id: event.id,
        'analysis.status': { $in: statuses },
        // Never re-send pre-filtered rows on a reclassify.
        'analysis.rationale': { $not: /^Pre-filter/ },
    }).sort({ engagement_total: -1 }).limit(limit > 0 ? limit : 0).lean();

    const batches = [];
    for (let i = 0; i < posts.length; i += BATCH_SIZE) batches.push(posts.slice(i, i + BATCH_SIZE));

    const counts = { total: posts.length, done: 0, failed: 0 };
    let next = 0;
    const worker = async () => {
        while (next < batches.length) {
            const batch = batches[next++];
            (await classifyBatch(event, batch)).forEach((o) => { counts[o] += 1; });
            if (onProgress) onProgress(counts);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
    return counts;
};

/**
 * Store labels produced outside the pipeline (e.g. by an analyst or another
 * model) through the same validation as the pipeline's own output.
 */
const importLabels = async (event, post, raw, model) => {
    await save(event, post, raw);
    await TenantPost.updateOne({ tenant_id: event.tenant_id, event_id: event.id, _id: post._id }, { $set: { 'analysis.model': model } });
};

module.exports = { classifyEvent, importLabels, prefilterUnrelated, CATEGORIES, RISK_BANDS, SYSTEM_PROMPT, SCHEMA, eventContext };
