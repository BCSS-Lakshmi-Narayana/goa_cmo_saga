/**
 * Builds the executive report for a tenant event.
 *
 * Every number in the report is computed here from tenant_posts. The LLM is
 * used only to write prose (summary, narrative summaries, recommendations)
 * from those computed figures and the event's sourced facts; it is never
 * asked for numbers, and its output is discarded in favour of plain
 * deterministic text if it fails.
 */

const TenantPost = require('../../models/tenant/TenantPost');
const TenantReport = require('../../models/tenant/TenantReport');
const llm = require('../llmProvider');

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const istDay = (d) => new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const countBy = (items, keyFn) => {
    const m = new Map();
    items.forEach((it) => {
        const keys = [].concat(keyFn(it)).filter((k) => k !== null && k !== undefined && k !== '');
        keys.forEach((k) => m.set(k, (m.get(k) || 0) + 1));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

const postRef = (p) => ({
    platform: p.platform,
    url: p.url,
    author: p.author_handle ? `@${p.author_handle}` : (p.author_name || 'unknown'),
    published_at: p.published_at,
    excerpt: String(p.text || '').replace(/\s+/g, ' ').slice(0, 220),
    engagement: p.engagement_total || 0,
    post_type: p.post_type,
    category: p.analysis?.category || null,
    stance_toward_subject: p.analysis?.stance_toward_subject || null,
});

const topBy = (posts, n, score = (p) => p.engagement_total || 0) =>
    [...posts].sort((a, b) => score(b) - score(a)).slice(0, n);

// ── Computation ──────────────────────────────────────────────────────

const computeStats = (event, all) => {
    const analysed = all.filter((p) => p.analysis?.status === 'done');
    const relevant = analysed.filter((p) => p.analysis.is_relevant);
    const originals = relevant.filter((p) => p.post_type !== 'repost');
    const dated = relevant.filter((p) => p.published_at);

    const byPlatform = ['x', 'facebook', 'instagram'].map((platform) => {
        const rows = relevant.filter((p) => p.platform === platform);
        return {
            platform,
            collected: all.filter((p) => p.platform === platform).length,
            relevant: rows.length,
            originals: rows.filter((p) => p.post_type !== 'repost').length,
            reposts: rows.filter((p) => p.post_type === 'repost').length,
            engagement: rows.reduce((a, p) => a + (p.engagement_total || 0), 0),
        };
    });

    // Daily timeline (IST) — posts and engagement per platform.
    const days = [...new Set(dated.map((p) => istDay(p.published_at)))].sort();
    const timeline = days.map((day) => {
        const rows = dated.filter((p) => istDay(p.published_at) === day);
        return {
            day,
            total: rows.length,
            x: rows.filter((p) => p.platform === 'x').length,
            facebook: rows.filter((p) => p.platform === 'facebook').length,
            instagram: rows.filter((p) => p.platform === 'instagram').length,
            engagement: rows.reduce((a, p) => a + (p.engagement_total || 0), 0),
        };
    });

    // Volume change: last 24h vs the 24h before, anchored on the newest post.
    const newest = dated.reduce((m, p) => Math.max(m, new Date(p.published_at).getTime()), 0);
    const last24 = dated.filter((p) => newest - new Date(p.published_at).getTime() < DAY_MS).length;
    const prev24 = dated.filter((p) => {
        const age = newest - new Date(p.published_at).getTime();
        return age >= DAY_MS && age < 2 * DAY_MS;
    }).length;
    const peak = timeline.reduce((m, d) => (d.total > (m?.total || 0) ? d : m), null);

    const categories = countBy(relevant, (p) => p.analysis.category)
        .map(([key, n]) => ({ key, count: n, pct: pct(n, relevant.length) }));

    const stance = (field) => ['supportive', 'critical', 'neutral', 'unclear'].map((k) => {
        const n = relevant.filter((p) => p.analysis[field] === k).length;
        return { key: k, count: n, pct: pct(n, relevant.length) };
    });
    const sentiment = ['positive', 'negative', 'neutral', 'mixed'].map((k) => {
        const n = relevant.filter((p) => p.analysis.sentiment === k).length;
        return { key: k, count: n, pct: pct(n, relevant.length) };
    });

    const examplesFor = (field, value) => topBy(relevant.filter((p) => p.analysis[field] === value && p.post_type !== 'repost'), 3).map(postRef);

    // Narratives with a simple trend: share of the narrative's posts in the
    // later half of the observed window vs the earlier half.
    const times = dated.map((p) => new Date(p.published_at).getTime());
    const midpoint = times.length ? (Math.min(...times) + Math.max(...times)) / 2 : 0;
    const narrativeDefs = [...(event.narratives || []), { key: 'other', label: 'Other / uncategorised' }];
    const narratives = narrativeDefs.map((n) => {
        const rows = relevant.filter((p) => (p.analysis.narratives || []).includes(n.key));
        const rowsDated = rows.filter((p) => p.published_at);
        const early = rowsDated.filter((p) => new Date(p.published_at).getTime() < midpoint).length;
        const late = rowsDated.length - early;
        let trend = 'insufficient data';
        if (rowsDated.length >= 6) {
            if (late >= early * 1.5) trend = 'growing';
            else if (early >= late * 1.5) trend = 'declining';
            else trend = 'stable';
        }
        return {
            key: n.key,
            label: n.label,
            description: n.description || '',
            count: rows.length,
            pct: pct(rows.length, relevant.length),
            platforms: countBy(rows, (p) => p.platform).map(([k, c]) => ({ platform: k, count: c })),
            stance_toward_subject: countBy(rows, (p) => p.analysis.stance_toward_subject).map(([k, c]) => ({ key: k, count: c })),
            trend,
            early_half: early,
            late_half: late,
            examples: topBy(rows.filter((p) => p.post_type !== 'repost'), 3).map(postRef),
        };
    }).filter((n) => n.count > 0).sort((a, b) => b.count - a.count);

    const hashtags = countBy(relevant, (p) => p.hashtags || []).slice(0, 20).map(([tag, count]) => ({ tag, count }));
    const entities = countBy(relevant, (p) => [...new Set((p.analysis.entities || []).map((e) => e.trim()))])
        .slice(0, 20).map(([name, count]) => ({ name, count }));
    const targets = countBy(relevant, (p) => p.analysis.target).slice(0, 10).map(([name, count]) => ({ name, count }));

    // Accounts: measurable activity only (posts and engagement).
    const accountMap = new Map();
    relevant.forEach((p) => {
        if (!p.author_handle) return;
        const key = `${p.platform}:${p.author_handle.toLowerCase()}`;
        const a = accountMap.get(key) || {
            platform: p.platform, handle: p.author_handle, name: p.author_name, followers: p.author_followers,
            posts: 0, originals: 0, reposts: 0, engagement: 0, stances: {}, top_post: null,
        };
        a.posts += 1;
        if (p.post_type === 'repost') a.reposts += 1; else a.originals += 1;
        a.engagement += p.engagement_total || 0;
        a.followers = a.followers ?? p.author_followers;
        const s = p.analysis.stance_toward_subject || 'unclear';
        a.stances[s] = (a.stances[s] || 0) + 1;
        if (!a.top_post || (p.engagement_total || 0) > (a.top_post.engagement || 0)) a.top_post = postRef(p);
        accountMap.set(key, a);
    });
    const accounts = [...accountMap.values()].map((a) => ({
        ...a,
        dominant_stance: Object.entries(a.stances).sort((x, y) => y[1] - x[1])[0]?.[0] || 'unclear',
    }));
    const topAccountsByEngagement = [...accounts].sort((a, b) => b.engagement - a.engagement).slice(0, 10);
    const topAccountsByVolume = [...accounts].sort((a, b) => b.posts - a.posts).slice(0, 10);

    const allegations = relevant.flatMap((p) => (p.analysis.claims || [])
        .filter((c) => c.kind === 'allegation' || c.kind === 'factual_assertion')
        .map((c) => ({ text: c.text, kind: c.kind, post: postRef(p) })));
    const callsToAction = relevant.flatMap((p) => (p.analysis.claims || [])
        .filter((c) => c.kind === 'call_to_action')
        .map((c) => ({ text: c.text, post: postRef(p) })));

    const totalEngagement = originals.reduce((a, p) => a + (p.engagement_total || 0), 0);
    const highEngagement = topBy(originals, 10).map(postRef);

    return {
        totals: {
            collected: all.length,
            analysed: analysed.length,
            analysis_failed: all.filter((p) => p.analysis?.status === 'failed').length,
            relevant: relevant.length,
            excluded_unrelated: analysed.length - relevant.length,
            originals: originals.length,
            reposts: relevant.length - originals.length,
            total_engagement: totalEngagement,
            first_post_at: dated.length ? new Date(Math.min(...times)) : null,
            last_post_at: dated.length ? new Date(Math.max(...times)) : null,
            undated: relevant.length - dated.length,
        },
        by_platform: byPlatform,
        timeline,
        volume_change: { last_24h: last24, previous_24h: prev24, peak_day: peak ? peak.day : null, peak_posts: peak ? peak.total : 0 },
        categories,
        stance_toward_subject: stance('stance_toward_subject'),
        stance_toward_protest: stance('stance_toward_protest'),
        sentiment,
        stance_examples: {
            supportive_of_subject: examplesFor('stance_toward_subject', 'supportive'),
            critical_of_subject: examplesFor('stance_toward_subject', 'critical'),
            neutral: examplesFor('stance_toward_subject', 'neutral'),
        },
        narratives,
        hashtags,
        entities,
        targets,
        top_accounts_by_engagement: topAccountsByEngagement,
        top_accounts_by_volume: topAccountsByVolume,
        allegations: allegations.slice(0, 60),
        calls_to_action: callsToAction.slice(0, 20),
        high_engagement_posts: highEngagement,
    };
};

// ── Prose (LLM, grounded) ───────────────────────────────────────────

const PROSE_SYSTEM = `You write concise, neutral executive briefings for a public-office holder about public discussion of an event.
Hard rules:
- Use ONLY the facts and figures in the input. Never invent numbers, names, dates, quotes or events.
- Facts marked "verified" may be stated as fact. "single_source" must be attributed ("according to <outlet>"). "claim" must be attributed to whoever claims it.
- Anything from social-media posts is what people are SAYING, not what is true. Label allegations as allegations.
- No persuasion tactics, no messaging aimed at voters or groups, no suggestions to target, discredit or report individuals or accounts.
- Do not speculate about bots, coordination, or intent.
- Plain English, short sentences. Return strict JSON only.`;

const buildProsePrompt = (event, stats) => {
    const compact = {
        event: {
            name: event.name, description: event.description, location: event.location,
            start: event.start_date, subject: event.subject, organisers: event.organisers,
            related_figures: event.related_figures,
            facts: event.facts.map((f) => ({ statement: f.statement, status: f.status, claimed_by: f.claimed_by })),
            watch_items: event.watch_items || [],
        },
        totals: stats.totals,
        by_platform: stats.by_platform,
        volume_change: stats.volume_change,
        categories: stats.categories,
        stance_toward_subject: stats.stance_toward_subject,
        stance_toward_protest: stats.stance_toward_protest,
        sentiment: stats.sentiment,
        narratives: stats.narratives.map((n) => ({ key: n.key, label: n.label, count: n.count, pct: n.pct, trend: n.trend, platforms: n.platforms, sample_texts: n.examples.map((e) => e.excerpt) })),
        top_hashtags: stats.hashtags.slice(0, 10),
        top_entities: stats.entities.slice(0, 10),
        allegations_sample: stats.allegations.slice(0, 25).map((a) => a.text),
        calls_to_action_sample: stats.calls_to_action.slice(0, 10).map((a) => a.text),
    };
    return `INPUT:
${JSON.stringify(compact)}

Write JSON:
{
  "attention": [ {"title": "short headline", "detail": "1-2 sentences, cite the figure from input", "severity": "high"|"medium"|"low"} ],   // 3-6 items, most important first
  "executive_summary": {
    "what_happened": "...", "when_where": "...", "who_involved": "...",
    "why_attention": "...", "social_discussion": "2-3 sentences summarising volume, platforms, stance mix, top narratives with figures"
  },
  "narrative_summaries": { "<narrative key>": "1-2 sentence neutral summary of what posts in this narrative say" },
  "allegation_themes": [ {"theme": "short label for a repeated allegation", "status_note": "e.g. 'Allegation made by CJP; not independently verified' or 'Disputed — see sources'"} ],   // group the allegations_sample, max 6
  "recommendations": {
    "fact_check": ["specific claims that should be checked against official records"],
    "clarifications": ["questions the public is asking that an official clarification could answer"],
    "public_concerns": ["concerns raised that may warrant a factual response"],
    "information_gaps": ["what this data cannot tell us"],
    "continued_monitoring": ["what to keep watching and why"]
  }
}`;
};

const fallbackProse = (event, stats) => {
    const t = stats.totals;
    const crit = stats.stance_toward_subject.find((s) => s.key === 'critical');
    return {
        attention: [
            { title: 'Discussion volume', detail: `${t.relevant} relevant posts collected; ${stats.volume_change.last_24h} in the latest 24 hours vs ${stats.volume_change.previous_24h} in the 24 hours before.`, severity: 'medium' },
            { title: 'Critical stance', detail: `${crit?.pct || 0}% of relevant posts are critical of ${event.subject.name}.`, severity: 'medium' },
        ],
        executive_summary: {
            what_happened: event.description,
            when_where: `${event.location}, from ${istDay(event.start_date)}.`,
            who_involved: [...(event.organisers || []), ...(event.related_figures || [])].map((e) => e.name).join(', '),
            why_attention: 'See verified facts below.',
            social_discussion: `${t.relevant} relevant posts across ${stats.by_platform.filter((p) => p.relevant).map((p) => p.platform).join(', ')}.`,
        },
        narrative_summaries: {},
        allegation_themes: [],
        recommendations: { fact_check: [], clarifications: [], public_concerns: [], information_gaps: [], continued_monitoring: [] },
    };
};

const writeProse = async (event, stats) => {
    try {
        const raw = await llm.chatJson({
            systemPrompt: PROSE_SYSTEM,
            prompt: buildProsePrompt(event, stats),
            maxTokens: 2500,
            temperature: 0.1,
            timeout: 240000,
        });
        if (!raw || !raw.executive_summary) throw new Error('incomplete JSON');
        return { ...fallbackProse(event, stats), ...raw, _source: 'llm' };
    } catch (err) {
        console.warn('[tenantReport] prose generation failed, using deterministic text:', err.message);
        return { ...fallbackProse(event, stats), _source: 'fallback' };
    }
};

// ── Assembly ─────────────────────────────────────────────────────────

const METHODOLOGY = [
    'Posts were collected from public search results (X, Facebook) and from the recent posts of listed public Instagram accounts, through the platform data providers this system uses. Provider search returns a sample, not every post, so counts describe the collected sample.',
    'Each post was labelled by a language model against this event: relevance category, the person/organisation it targets, stance toward the subject, stance toward the protest, and sentiment — each recorded separately. Posts labelled unrelated are excluded from all figures.',
    'Stance is not a fact-check: a critical or supportive post is counted as an opinion. Anything a post asserts about wrongdoing is recorded as an allegation.',
    'Engagement = likes + comments + shares/reposts as reported by the platform at collection time (views are not added). Reposts carry no engagement of their own, so the original is not double-counted.',
    'Times are shown in IST. Posts with no timestamp from the provider are counted but left out of the timeline.',
];

const generateReport = async (event, { generatedBy = null } = {}) => {
    const posts = await TenantPost.find({ tenant_id: event.tenant_id, event_id: event.id }).lean();
    const stats = computeStats(event, posts);
    const prose = await writeProse(event, stats);

    const data = {
        generated_at: new Date(),
        prose_source: prose._source,
        event: {
            name: event.name,
            description: event.description,
            start_date: event.start_date,
            end_date: event.end_date,
            location: event.location,
            subject: event.subject,
            organisers: event.organisers,
            related_figures: event.related_figures,
            keywords: event.keywords,
            hashtags: event.hashtags,
            facts: event.facts,
            sources: event.sources,
            watch_items: event.watch_items || [],
        },
        attention: prose.attention,
        executive_summary: prose.executive_summary,
        narrative_summaries: prose.narrative_summaries || {},
        allegation_themes: prose.allegation_themes || [],
        recommendations: prose.recommendations,
        stats,
        methodology: METHODOLOGY,
        collection: {
            plan: event.collection_plan,
            last_collected_at: event.last_collected_at,
            last_summary: event.last_collection_summary,
        },
    };

    return TenantReport.create({
        tenant_id: event.tenant_id,
        event_id: event.id,
        title: `Executive Report — ${event.name}`,
        period_start: stats.totals.first_post_at,
        period_end: stats.totals.last_post_at,
        post_count: stats.totals.relevant,
        data,
        generated_by: generatedBy,
    });
};

module.exports = { generateReport, computeStats };
