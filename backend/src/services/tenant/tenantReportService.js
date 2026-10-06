/**
 * Builds the monitoring brief for a tenant event.
 *
 * Every number in the brief is computed here from tenant_posts. The LLM only
 * writes prose (bottom line, summaries, recommendations) from those computed
 * figures and the event's sourced facts; it is never asked for numbers, and
 * deterministic text replaces it if it fails. An analyst's review — per-post
 * risk decisions and the event-level assessment — overrides the model.
 */

const TenantPost = require('../../models/tenant/TenantPost');
const TenantReport = require('../../models/tenant/TenantReport');
const llm = require('../llmProvider');

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const PLATFORMS = ['x', 'youtube', 'facebook', 'instagram', 'reddit', 'telegram'];
// Accounts that may be named in the brief. Private individuals never are.
const PUBLIC_ACCOUNT_TYPES = new Set(['news_media', 'journalist', 'public_figure', 'political_party', 'organisation', 'government']);
const PUBLIC_FOLLOWER_FLOOR = 50000;

const istDay = (d) => new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-10-06" → "6 October" */
const dayLabel = (iso) => { const [, m, d] = String(iso).split('-'); return `${Number(d)} ${MONTH_NAMES[Number(m) - 1]}`; };
const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const countBy = (items, keyFn) => {
    const m = new Map();
    items.forEach((it) => {
        [].concat(keyFn(it)).filter((k) => k !== null && k !== undefined && k !== '').forEach((k) => m.set(k, (m.get(k) || 0) + 1));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const titleCase = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const riskBand = (p) => p.analysis?.review?.risk_band || p.analysis?.risk_band || 'low';
const isPublicAccount = (p) => PUBLIC_ACCOUNT_TYPES.has(p.analysis?.account_type) || (p.author_followers || 0) >= PUBLIC_FOLLOWER_FLOOR;
const tone = (p) => ({ positive: 'positive', negative: 'negative', mixed: 'negative' }[p.analysis?.sentiment] || 'neutral');

/** likes + 2×comments + 3×shares + views/10 */
const engagementScore = (m = {}) => Math.round((m.likes || 0) + 2 * (m.comments || 0) + 3 * (m.shares || 0) + (m.views || 0) / 10);

/**
 * Links to the footage itself: the video for a YouTube post, otherwise the
 * attached videos (direct file links for X) and images.
 */
const footageOf = (p) => {
    if (p.platform === 'youtube' && p.post_type !== 'comment' && p.url) return [{ kind: 'video', url: p.url }];
    return (p.media || []).filter((m) => m && m.url)
        .map((m) => ({ kind: /video|gif/.test(m.kind || '') ? 'video' : 'image', url: m.url }))
        .slice(0, 4);
};

const postRef = (p, { maskPrivate = true } = {}) => ({
    id: String(p._id),
    platform: p.platform,
    url: p.url,
    author: maskPrivate && !isPublicAccount(p) ? 'Private account' : (p.author_name || (p.author_handle ? `@${p.author_handle}` : 'unknown')),
    handle: maskPrivate && !isPublicAccount(p) ? null : p.author_handle,
    published_at: p.published_at,
    excerpt: String(p.text || '').replace(/\s+/g, ' ').slice(0, 240),
    summary: p.analysis?.summary || null,
    engagement: p.engagement_total || 0,
    score: engagementScore(p.metrics),
    post_type: p.post_type,
    category: p.analysis?.category || null,
    stance_toward_subject: p.analysis?.stance_toward_subject || null,
    tone: tone(p),
    risk_band: riskBand(p),
    risk_reason: p.analysis?.review?.note || p.analysis?.risk_reason || null,
    reviewed: Boolean(p.analysis?.review?.reviewed_at),
    footage: footageOf(p),
});

/** First `n` posts with distinct authors, keeping the input order. */
const distinctAuthors = (posts, n) => {
    const seen = new Set();
    return posts.filter((p) => {
        const k = `${p.platform}:${String(p.author_handle || p.author_name || '').toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    }).slice(0, n);
};

const topBy = (posts, n, score = (p) => engagementScore(p.metrics)) => [...posts].sort((a, b) => score(b) - score(a)).slice(0, n);

// ── Computation ──────────────────────────────────────────────────────

const computeStats = (event, all) => {
    const analysed = all.filter((p) => p.analysis?.status === 'done');
    const relevant = analysed.filter((p) => p.analysis.is_relevant);
    const originals = relevant.filter((p) => p.post_type !== 'repost');
    const dated = relevant.filter((p) => p.published_at);
    const times = dated.map((p) => new Date(p.published_at).getTime());

    const sumMetric = (rows, k) => rows.reduce((a, p) => a + (p.metrics?.[k] || 0), 0);
    const totals = {
        collected: all.length,
        analysed: analysed.length,
        analysis_failed: all.filter((p) => p.analysis?.status === 'failed').length,
        pending: all.filter((p) => !p.analysis || p.analysis.status === 'pending').length,
        relevant: relevant.length,
        excluded_unrelated: analysed.length - relevant.length,
        originals: originals.length,
        reposts: relevant.length - originals.length,
        comments: relevant.filter((p) => p.post_type === 'comment').length,
        likes: sumMetric(originals, 'likes'),
        comment_count: sumMetric(originals, 'comments'),
        shares: sumMetric(originals, 'shares'),
        views: sumMetric(originals, 'views'),
        engagement: originals.reduce((a, p) => a + (p.engagement_total || 0), 0),
        engagement_score: originals.reduce((a, p) => a + engagementScore(p.metrics), 0),
        first_post_at: times.length ? new Date(Math.min(...times)) : null,
        last_post_at: times.length ? new Date(Math.max(...times)) : null,
        undated: relevant.length - dated.length,
    };

    const byPlatform = PLATFORMS.map((platform) => {
        const rows = relevant.filter((p) => p.platform === platform);
        return {
            platform,
            collected: all.filter((p) => p.platform === platform).length,
            relevant: rows.length,
            originals: rows.filter((p) => p.post_type === 'original' || p.post_type === 'quote').length,
            replies_comments: rows.filter((p) => p.post_type === 'reply' || p.post_type === 'comment').length,
            reposts: rows.filter((p) => p.post_type === 'repost').length,
            engagement: rows.reduce((a, p) => a + (p.engagement_total || 0), 0),
            views: sumMetric(rows, 'views'),
        };
    }).filter((p) => p.collected > 0 || p.relevant > 0);
    const leadPlatform = [...byPlatform].sort((a, b) => b.relevant - a.relevant)[0] || null;

    const toneCounts = ['positive', 'neutral', 'negative'].map((k) => {
        const n = relevant.filter((p) => tone(p) === k).length;
        return { key: k, count: n, pct: pct(n, relevant.length) };
    });

    // Keyword share of voice: relevant posts mentioning each tracked term.
    const terms = [...new Set([...(event.keywords || []), ...(event.hashtags || [])])];
    const shareOfVoice = terms.map((term) => {
        const t = term.toLowerCase().replace(/^#/, '');
        const n = relevant.filter((p) => {
            if (term.startsWith('#')) return (p.hashtags || []).includes(term.toLowerCase());
            return String(p.text || '').toLowerCase().includes(t);
        }).length;
        return { term, count: n };
    }).filter((k) => k.count > 0).sort((a, b) => b.count - a.count);

    // Timeline (IST days).
    const days = [...new Set(dated.map((p) => istDay(p.published_at)))].sort();
    const timeline = days.map((day) => {
        const rows = dated.filter((p) => istDay(p.published_at) === day);
        const row = { day, total: rows.length, engagement: rows.reduce((a, p) => a + (p.engagement_total || 0), 0) };
        PLATFORMS.forEach((pl) => { row[pl] = rows.filter((p) => p.platform === pl).length; });
        row.negative = rows.filter((p) => tone(p) === 'negative').length;
        row.positive = rows.filter((p) => tone(p) === 'positive').length;
        row.neutral = rows.length - row.negative - row.positive;
        row.negative_pct = pct(row.negative, rows.length);
        row.critical_of_subject = rows.filter((p) => p.analysis.stance_toward_subject === 'critical').length;
        row.high_risk = rows.filter((p) => ['critical', 'high'].includes(riskBand(p))).length;
        row.top_narrative = countBy(rows, (p) => (p.analysis.narratives || []).filter((k) => k !== 'other'))[0]?.[0] || null;
        row.top_place = countBy(rows, (p) => [...new Set((p.analysis.places || []).map(titleCase))])[0]?.[0] || null;
        return row;
    });
    const peak = timeline.reduce((m, d) => (d.total > (m?.total || 0) ? d : m), null);
    const newest = times.length ? Math.max(...times) : 0;
    const inWindow = (from, to) => dated.filter((p) => {
        const age = newest - new Date(p.published_at).getTime();
        return age >= from && age < to;
    }).length;
    const volume = { last_24h: inWindow(0, DAY_MS), previous_24h: inWindow(DAY_MS, 2 * DAY_MS), peak_day: peak?.day || null, peak_posts: peak?.total || 0 };

    // Activity: offline events the posts report, grouped by type and place.
    const activityPosts = relevant.filter((p) => p.analysis.activity?.type && p.analysis.activity.type !== 'none');
    const activityGroups = new Map();
    activityPosts.forEach((p) => {
        const a = p.analysis.activity;
        const place = a.place ? titleCase(a.place) : 'Unspecified';
        const key = `${a.type}|${place}`;
        const g = activityGroups.get(key) || { type: a.type, place, posts: 0, news: 0, critical_of_subject: 0, supportive_of_subject: 0, dates: new Map(), days: new Map(), top: null };
        if (p.published_at) { const day = istDay(p.published_at); g.days.set(day, (g.days.get(day) || 0) + 1); }
        g.posts += 1;
        if (['news_media_coverage', 'neutral_reporting', 'direct_protest_coverage'].includes(p.analysis.category)) g.news += 1;
        if (p.analysis.stance_toward_subject === 'critical') g.critical_of_subject += 1;
        if (p.analysis.stance_toward_subject === 'supportive') g.supportive_of_subject += 1;
        if (a.date_text) g.dates.set(a.date_text, (g.dates.get(a.date_text) || 0) + 1);
        if (!g.top || engagementScore(p.metrics) > g.top._score) g.top = { ...postRef(p), _score: engagementScore(p.metrics) };
        activityGroups.set(key, g);
    });
    const activities = [...activityGroups.values()]
        .map((g) => {
            const days = [...g.days.keys()].sort();
            const peakDay = [...g.days.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
            return {
                ...g,
                dates: [...g.dates.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d]) => d),
                days: undefined,
                first_day: days[0] || null,
                last_day: days[days.length - 1] || null,
                peak_day: peakDay,
                top: g.top,
            };
        })
        .sort((a, b) => b.posts - a.posts)
        .slice(0, 12);

    // Places named in posts.
    const placeCounts = new Map();
    relevant.forEach((p) => {
        new Set((p.analysis.places || []).map(titleCase)).forEach((pl) => {
            const r = placeCounts.get(pl) || { place: pl, posts: 0, negative: 0, top: null };
            r.posts += 1;
            if (tone(p) === 'negative') r.negative += 1;
            if (!r.top || engagementScore(p.metrics) > r.top._score) r.top = { ...postRef(p), _score: engagementScore(p.metrics) };
            placeCounts.set(pl, r);
        });
    });
    const places = [...placeCounts.values()].sort((a, b) => b.posts - a.posts);

    // Location trends: daily posts for the most-named places.
    const trendPlaces = places.slice(0, 8).map((r) => r.place);
    const locationTrends = {
        days,
        places: trendPlaces.map((place) => {
            const rows = dated.filter((p) => (p.analysis.places || []).some((x) => titleCase(x) === place));
            const byDay = days.map((day) => rows.filter((p) => istDay(p.published_at) === day).length);
            const peakIdx = byDay.indexOf(Math.max(...byDay));
            return {
                place,
                total: rows.length,
                negative_pct: pct(rows.filter((p) => tone(p) === 'negative').length, rows.length),
                by_day: byDay,
                peak_day: days[peakIdx] || null,
            };
        }),
    };

    // Target type × tone.
    const targetTable = countBy(relevant, (p) => p.analysis.target_type || 'other').map(([type, n]) => {
        const rows = relevant.filter((p) => (p.analysis.target_type || 'other') === type);
        return {
            type,
            posts: n,
            positive: rows.filter((p) => tone(p) === 'positive').length,
            neutral: rows.filter((p) => tone(p) === 'neutral').length,
            negative: rows.filter((p) => tone(p) === 'negative').length,
        };
    });
    const targets = countBy(relevant, (p) => p.analysis.target).slice(0, 12).map(([name, count]) => ({ name, count }));

    // Stance.
    const stance = (field) => ['supportive', 'critical', 'neutral', 'unclear'].map((k) => {
        const n = relevant.filter((p) => p.analysis[field] === k).length;
        return { key: k, count: n, pct: pct(n, relevant.length) };
    });
    const publicOriginals = originals.filter(isPublicAccount);
    const examplesFor = (field, value) => topBy(publicOriginals.filter((p) => p.analysis[field] === value), 3).map((p) => postRef(p));

    // Narratives with trend (later half of the window vs earlier half).
    const midpoint = times.length ? (Math.min(...times) + Math.max(...times)) / 2 : 0;
    const narratives = [...(event.narratives || []), { key: 'other', label: 'Other / uncategorised' }].map((n) => {
        const rows = relevant.filter((p) => (p.analysis.narratives || []).includes(n.key));
        const rowsDated = rows.filter((p) => p.published_at);
        const early = rowsDated.filter((p) => new Date(p.published_at).getTime() < midpoint).length;
        const late = rowsDated.length - early;
        let trend = 'insufficient data';
        if (rowsDated.length >= 6) trend = late >= early * 1.5 ? 'growing' : (early >= late * 1.5 ? 'declining' : 'stable');
        return {
            key: n.key,
            label: n.label,
            description: n.description || '',
            count: rows.length,
            pct: pct(rows.length, relevant.length),
            platforms: countBy(rows, (p) => p.platform).map(([k, c]) => ({ platform: k, count: c })),
            negative: rows.filter((p) => tone(p) === 'negative').length,
            trend,
            examples: distinctAuthors(topBy(rows.filter((p) => p.post_type !== 'repost' && isPublicAccount(p)
                && (n.key !== 'questioning_cjp' || p.analysis.stance_toward_protest === 'critical')), 30), 3).map((p) => postRef(p)),
        };
    }).filter((n) => n.count > 0).sort((a, b) => b.count - a.count);

    const hashtags = countBy(relevant, (p) => p.hashtags || []).slice(0, 15).map(([tag, count]) => ({ tag, count }));
    const entities = countBy(relevant, (p) => [...new Set((p.analysis.entities || []).map((e) => e.trim()))]).slice(0, 15).map(([name, count]) => ({ name, count }));

    // Influencer ecosystem: public accounts only, by engagement score.
    const accounts = new Map();
    relevant.filter((p) => p.author_handle && isPublicAccount(p)).forEach((p) => {
        const key = `${p.platform}:${String(p.author_handle).toLowerCase()}`;
        const a = accounts.get(key) || {
            platform: p.platform, handle: p.author_handle, name: p.author_name, account_type: p.analysis.account_type,
            followers: p.author_followers, posts: 0, score: 0, likes: 0, comments: 0, shares: 0, views: 0, stances: {}, top: null,
        };
        a.posts += 1;
        a.score += engagementScore(p.metrics);
        ['likes', 'comments', 'shares', 'views'].forEach((k) => { a[k] += p.metrics?.[k] || 0; });
        a.followers = a.followers ?? p.author_followers;
        const s = p.analysis.stance_toward_subject || 'unclear';
        a.stances[s] = (a.stances[s] || 0) + 1;
        if (!a.top || engagementScore(p.metrics) > a.top.score) a.top = postRef(p);
        accounts.set(key, a);
    });
    const influencers = [...accounts.values()]
        .map((a) => ({ ...a, dominant_stance: Object.entries(a.stances).sort((x, y) => y[1] - x[1])[0]?.[0] || 'unclear' }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
    const influencerTotals = {
        accounts: accounts.size,
        top_platform: countBy([...accounts.values()], (a) => a.platform)[0]?.[0] || null,
        top_score: influencers[0]?.score || 0,
        likes: [...accounts.values()].reduce((x, a) => x + a.likes, 0),
        comments: [...accounts.values()].reduce((x, a) => x + a.comments, 0),
        shares: [...accounts.values()].reduce((x, a) => x + a.shares, 0),
    };

    // Evidence register: what news outlets and journalists reported, by reach;
    // topped up from other public accounts only if outlets are too few.
    const MEDIA_TYPES = new Set(['news_media', 'journalist']);
    const COVERAGE = new Set(['news_media_coverage', 'direct_protest_coverage', 'neutral_reporting']);
    const mediaPosts = publicOriginals.filter((p) => MEDIA_TYPES.has(p.analysis.account_type) && p.post_type !== 'comment' && COVERAGE.has(p.analysis.category));
    const evidencePool = mediaPosts.length >= 10 ? mediaPosts : publicOriginals;
    const evidence = topBy(evidencePool, 15).map((p) => postRef(p))
        .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));

    // Risk bands (analyst review overrides the model).
    const bandCounts = ['critical', 'high', 'medium', 'low'].map((k) => {
        const n = relevant.filter((p) => riskBand(p) === k).length;
        return { key: k, count: n, pct: pct(n, relevant.length) };
    });
    const riskRows = topBy(relevant.filter((p) => ['critical', 'high'].includes(riskBand(p))), 25).map((p) => postRef(p));
    const mediumRows = topBy(relevant.filter((p) => riskBand(p) === 'medium'), 10).map((p) => postRef(p));
    const reviewed = relevant.filter((p) => p.analysis.review?.reviewed_at).length;
    const modelFlagged = relevant.filter((p) => ['critical', 'high', 'medium'].includes(p.analysis.risk_band)).length;

    const allegations = relevant.flatMap((p) => (p.analysis.claims || [])
        .filter((c) => c.kind === 'allegation' || c.kind === 'factual_assertion')
        .map((c) => ({ text: c.text, kind: c.kind, platform: p.platform, engagement: p.engagement_total || 0 })))
        .sort((a, b) => b.engagement - a.engagement);
    const callsToAction = relevant.flatMap((p) => (p.analysis.claims || [])
        .filter((c) => c.kind === 'call_to_action').map((c) => ({ text: c.text, engagement: p.engagement_total || 0 })))
        .sort((a, b) => b.engagement - a.engagement);

    // ── Key intelligence: each point computed from the posts ──
    const NARR = (k) => ((event.narratives || []).find((n) => n.key === k) || {}).label || k;
    const keyIntel = [];
    if (timeline.length >= 2 && peak) {
        const others = timeline.filter((d) => d.day !== peak.day).map((d) => d.total).sort((a, b) => a - b);
        const median = others.length ? others[Math.floor(others.length / 2)] : 0;
        keyIntel.push({
            key: 'volume_spike',
            title: `Public conversation peaked on ${dayLabel(peak.day)}`,
            detail: `${peak.total.toLocaleString('en-IN')} relevant posts that day${median ? `, about ${(peak.total / median).toFixed(1)}× the median day (${median.toLocaleString('en-IN')})` : ''}; ${peak.negative_pct}% negative in tone.`,
            caveat: 'X search returns the newest posts first, so the most recent days are over-represented; read late peaks as directional.',
        });
    }
    const criticalOfSubject = relevant.filter((p) => p.analysis.stance_toward_subject === 'critical');
    if (criticalOfSubject.length) {
        const linked = criticalOfSubject.filter((p) => (p.analysis.narratives || []).some((k) => ['resignation_demand', 'sir_voter_roll'].includes(k))).length;
        const topNarr = countBy(criticalOfSubject, (p) => (p.analysis.narratives || []).filter((k) => k !== 'other')).slice(0, 3);
        const share = pct(linked, criticalOfSubject.length);
        keyIntel.push({
            key: 'criticism_drivers',
            title: `Criticism of ${event.subject?.name || 'the subject'} is ${share >= 60 ? 'predominantly' : 'partly'} linked to the resignation and SIR narratives`,
            detail: `${share}% of the ${criticalOfSubject.length.toLocaleString('en-IN')} posts critical of ${event.subject?.name || 'the subject'} carry the resignation-demand or SIR/voter-roll narrative. Most common: ${topNarr.map(([k, c]) => `${NARR(k)} (${pct(c, criticalOfSubject.length)}%)`).join(', ')}.`,
        });
    }
    {
        const aboutSubject = relevant.filter((p) => p.analysis.target_type === 'subject').length;
        const topTargets = countBy(relevant, (p) => p.analysis.target_type || 'other').slice(0, 4);
        const TL = { subject: event.subject?.name || 'the subject', election_commission: 'the Election Commission', protest_organisers: 'the protest organisers', police: 'the police', political_leader: 'political leaders', government: 'the government', judiciary: 'the judiciary', media: 'the media', organisation: 'organisations', other: 'other subjects' };
        keyIntel.push({
            key: 'broader_than_subject',
            title: pct(criticalOfSubject.length, relevant.length) < 60
                ? `Protest conversation is broader than criticism of ${event.subject?.name || 'the subject'}`
                : `Most protest conversation is criticism of ${event.subject?.name || 'the subject'}`,
            detail: `${pct(criticalOfSubject.length, relevant.length)}% of relevant posts are critical of ${event.subject?.name || 'the subject'}, and ${pct(aboutSubject, relevant.length)}% are mainly about ${event.subject?.name || 'the subject'}. By what they are about: ${topTargets.map(([k, c]) => `${TL[k] || k} ${pct(c, relevant.length)}%`).join(', ')}.`,
        });
    }
    {
        const threats = relevant.filter((p) => ['critical', 'high'].includes(riskBand(p)));
        const crit = threats.filter((p) => riskBand(p) === 'critical');
        const atSubject = crit.filter((p) => ['subject', 'election_commission'].includes(p.analysis.target_type)).length;
        const atOrganisers = crit.filter((p) => p.analysis.target_type === 'protest_organisers').length;
        const maxReach = crit.reduce((m, p) => Math.max(m, p.engagement_total || 0), 0);
        keyIntel.push({
            key: 'threats',
            title: pct(crit.length, relevant.length) < 2
                ? 'Explicit threats are limited in volume but need separate monitoring'
                : 'Explicit threats are a notable share of the conversation',
            detail: `${crit.length.toLocaleString('en-IN')} posts (${pct(crit.length, relevant.length)}%) contain explicit calls for violence and ${(threats.length - crit.length).toLocaleString('en-IN')} more are high-risk (communal or gendered abuse, misattributed media). Of the explicit calls, ${atSubject} target ${event.subject?.name || 'the subject'} or the Commission and ${atOrganisers} target the protest organisers; the most-engaged reached ${maxReach.toLocaleString('en-IN')} engagements.`,
        });
    }
    {
        const misattributed = relevant.filter((p) => (p.analysis.narratives || []).includes('misattributed_content')
            || /misattribut|fabricat|manipulat|ai-generated|edited|unverif/i.test(`${p.analysis.review?.note || ''} ${p.analysis.risk_reason || ''}`));
        const allegationPosts = relevant.filter((p) => (p.analysis.claims || []).some((c) => c.kind === 'allegation')).length;
        keyIntel.push({
            key: 'information_risk',
            title: 'Misattributed media and unverified claims are recurring information risks',
            detail: `${misattributed.length.toLocaleString('en-IN')} posts involve misattributed, edited or unverifiable media or claims, and ${allegationPosts.toLocaleString('en-IN')} posts make allegations stated as fact. Examples: ${topBy(misattributed, 3).map((p) => p.analysis.review?.note || p.analysis.summary).filter(Boolean).map((t) => t.replace(/\.$/, '')).join('; ')}.`,
        });
    }
    {
        const lastDay = times.length ? new Date(Math.max(...times)) : new Date();
        const next = (event.watch_items || []).filter((w) => w.date && new Date(w.date) >= new Date(lastDay.getTime() - DAY_MS))
            .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
        if (next) {
            const mobil = relevant.filter((p) => (p.analysis.narratives || []).includes('oct10_mobilisation'));
            const recent = mobil.filter((p) => p.published_at && lastDay - new Date(p.published_at) < 2 * DAY_MS).length;
            keyIntel.push({
                key: 'next_point',
                title: `Next significant monitoring point: ${dayLabel(istDay(next.date))}`,
                detail: `${next.description} ${mobil.length.toLocaleString('en-IN')} posts carry mobilisation for it, ${recent.toLocaleString('en-IN')} of them in the last two days of the period.`,
            });
        }
    }

    // Footage: the most-engaged posts that carry video (or, failing that, images).
    const withVideo = originals.filter((p) => footageOf(p).some((f) => f.kind === 'video'));
    const withImage = originals.filter((p) => footageOf(p).some((f) => f.kind === 'image'));
    const footage = {
        videos: withVideo.length,
        images: withImage.length,
        top: distinctAuthors(topBy(withVideo.length >= 10 ? withVideo : [...withVideo, ...withImage], 80), 20).map((p) => postRef(p)),
    };

    // Positive / negative / neutral, each broken down on its own.
    const toneSections = ['positive', 'negative', 'neutral'].map((key) => {
        const rows = relevant.filter((p) => tone(p) === key);
        const publicRows = rows.filter((p) => isPublicAccount(p) && p.post_type !== 'repost');
        return {
            key,
            count: rows.length,
            pct: pct(rows.length, relevant.length),
            engagement: rows.reduce((a, p) => a + (p.engagement_total || 0), 0),
            by_platform: countBy(rows, (p) => p.platform).map(([platform, count]) => ({ platform, count })),
            stance_toward_subject: countBy(rows, (p) => p.analysis.stance_toward_subject || 'unclear').map(([k, count]) => ({ key: k, count })),
            targets: countBy(rows, (p) => p.analysis.target_type || 'other').slice(0, 5).map(([k, count]) => ({ key: k, count })),
            narratives: countBy(rows, (p) => p.analysis.narratives || []).slice(0, 5).map(([k, count]) => ({ key: k, count })),
            hashtags: countBy(rows, (p) => p.hashtags || []).slice(0, 6).map(([tag, count]) => ({ tag, count })),
            top_public: distinctAuthors(topBy(publicRows, 40), 10).map((p) => postRef(p)),
            top_all: topBy(rows.filter((p) => p.post_type !== 'repost'), 10).map((p) => postRef(p)),
        };
    });

    return {
        key_intelligence: keyIntel,
        location_trends: locationTrends,
        footage,
        tone_sections: toneSections,
        totals,
        by_platform: byPlatform,
        lead_platform: leadPlatform ? { platform: leadPlatform.platform, share: pct(leadPlatform.relevant, relevant.length) } : null,
        tone: toneCounts,
        share_of_voice: shareOfVoice,
        timeline,
        volume_change: volume,
        activity: { posts: activityPosts.length, groups: activities },
        places: { count: places.length, rows: places.slice(0, 15).map((r) => ({ ...r, top: r.top })) },
        target_table: targetTable,
        targets,
        stance_toward_subject: stance('stance_toward_subject'),
        stance_toward_protest: stance('stance_toward_protest'),
        stance_examples: {
            supportive_of_subject: examplesFor('stance_toward_subject', 'supportive'),
            critical_of_subject: examplesFor('stance_toward_subject', 'critical'),
            neutral: examplesFor('stance_toward_subject', 'neutral'),
        },
        narratives,
        hashtags,
        entities,
        influencers,
        influencer_totals: influencerTotals,
        evidence,
        risk: { bands: bandCounts, rows: riskRows, medium_rows: mediumRows, reviewed, model_flagged: modelFlagged },
        allegations: allegations.slice(0, 50),
        calls_to_action: callsToAction.slice(0, 15),
    };
};

// ── Prose (LLM, grounded) ───────────────────────────────────────────

const PROSE_SYSTEM = `You write concise, neutral monitoring briefs for the office of a public official about public discussion of an event.
Hard rules:
- Use ONLY the facts and figures in the input. Never invent numbers, names, dates, quotes or events.
- Facts marked "verified" may be stated as fact. "single_source" must be attributed ("according to <outlet>"). "claim" must be attributed to whoever claims it.
- What posts say is what people are SAYING, not what is true. Label allegations as allegations.
- Ordinary criticism, satire and calls for resignation are lawful speech: describe them, never treat them as threats.
- No persuasion or influence tactics, no messaging aimed at voters or groups, no suggestions to target, discredit, report or track critics, journalists or private individuals.
- Do not speculate about bots, coordination, funding or intent.
- Plain English, short sentences. Return strict JSON only.`;

const buildProsePrompt = (event, s) => {
    const compact = {
        event: {
            name: event.name, description: event.description, location: event.location, start: event.start_date,
            subject: event.subject, organisers: (event.organisers || []).map((o) => o.name),
            facts: (event.facts || []).map((f) => ({ statement: f.statement, status: f.status, claimed_by: f.claimed_by })),
            watch_items: (event.watch_items || []).map((w) => ({ date: w.date, description: w.description, status: w.status })),
        },
        totals: s.totals,
        by_platform: s.by_platform.map(({ platform, relevant, engagement }) => ({ platform, relevant, engagement })),
        tone: s.tone,
        volume_change: s.volume_change,
        stance_toward_subject: s.stance_toward_subject,
        stance_toward_protest: s.stance_toward_protest,
        top_keywords: s.share_of_voice.slice(0, 8),
        activities: s.activity.groups.slice(0, 8).map((g) => ({ type: g.type, place: g.place, posts: g.posts, critical_of_subject: g.critical_of_subject, dates: g.dates })),
        places: s.places.rows.slice(0, 8).map((r) => ({ place: r.place, posts: r.posts, negative: r.negative, sample: r.top?.summary })),
        target_table: s.target_table,
        narratives: s.narratives.map((n) => ({ key: n.key, label: n.label, count: n.count, pct: n.pct, trend: n.trend, samples: n.examples.map((e) => e.summary || e.excerpt) })),
        risk_bands: s.risk.bands,
        risk_samples: s.risk.rows.slice(0, 8).map((r) => ({ band: r.risk_band, reason: r.risk_reason, summary: r.summary })),
        allegations_sample: s.allegations.slice(0, 25).map((a) => a.text),
        calls_to_action_sample: s.calls_to_action.slice(0, 10).map((a) => a.text),
    };
    return `INPUT:
${JSON.stringify(compact)}

Write JSON:
{
  "bottom_line": "3-4 sentences: what is happening, the overall tone of discussion with figures, the main drivers, and the risk picture",
  "attention": [ {"title": "short headline", "detail": "1-2 sentences citing figures from the input", "severity": "high"|"medium"|"low"} ],
  "executive_summary": {
    "what_happened": "...", "when_where": "...", "who_involved": "...",
    "why_attention": "...", "social_discussion": "2-3 sentences with figures"
  },
  "activity_notes": { "<type|place>": "one sentence on what posts report about this activity" },
  "place_context": { "<place>": "one short phrase on why this place is discussed" },
  "narrative_summaries": { "<narrative key>": "1-2 neutral sentences on what posts in this narrative say" },
  "allegation_themes": [ {"theme": "short label for a repeated allegation", "status_note": "e.g. 'Allegation by CJP; not independently verified' or 'Disputed — fact-checked'"} ],
  "recommendations": {
    "fact_check": ["specific claims to check against official records"],
    "clarifications": ["public questions an official factual clarification could answer"],
    "communication": ["neutral, factual communication considerations — no persuasion"],
    "information_gaps": ["what this data cannot tell"],
    "monitoring": ["dates, places and themes to keep watching"],
    "safety": ["only if risk bands show threats/impersonation/manipulated media: route to security staff or platform reporting channels"]
  }
}
Give 4-6 attention items, most important first.`;
};

const PLATFORM_NAME = { x: 'X', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', reddit: 'Reddit', telegram: 'Telegram' };
const NARRATIVE_LABEL = (event, key) => ((event.narratives || []).find((n) => n.key === key) || {}).label || 'Other';
const num = (n) => Number(n || 0).toLocaleString('en-IN');
const dayText = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long' }) : '');
const compact = (n) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)} crore` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} lakh` : num(n));

/**
 * Text written straight from the computed figures, so a report for any date
 * range reads correctly without an LLM call. Qualitative analyst text is
 * merged over this by the caller.
 */
const templateProse = (event, s) => {
    const t = s.totals;
    const subject = event.subject?.name || 'the subject';
    const platforms = s.by_platform.filter((p) => p.relevant).map((p) => `${PLATFORM_NAME[p.platform]} ${num(p.relevant)}`).join(', ');
    const tone = (k) => s.tone.find((x) => x.key === k) || { count: 0, pct: 0 };
    const st = (field, k) => (s[field].find((x) => x.key === k) || { count: 0, pct: 0 });
    const band = (k) => (s.risk.bands.find((x) => x.key === k) || { count: 0 }).count;
    const topNarr = s.narratives.filter((n) => n.key !== 'other').slice(0, 3);
    const negTarget = [...s.target_table].sort((a, b) => b.negative - a.negative)[0];
    const riskRows = s.risk.rows || [];
    const maxRiskReach = riskRows.reduce((m, r) => Math.max(m, r.engagement || 0), 0);
    const from = dayText(t.first_post_at);
    const to = dayText(t.last_post_at);

    const bottom = [
        `${from === to ? `On ${from}` : `Between ${from} and ${to}`}, ${num(t.relevant)} relevant public posts (${platforms}) discussed ${event.short_name || event.name}, drawing about ${compact(t.engagement)} engagements${t.views ? ` and ${compact(t.views)} views` : ''}.`,
        `Tone was ${tone('positive').pct}% positive, ${tone('neutral').pct}% neutral and ${tone('negative').pct}% negative.`,
        `Where posts take a position on ${subject}, ${num(st('stance_toward_subject', 'critical').count)} are critical and ${num(st('stance_toward_subject', 'supportive').count)} supportive; ${st('stance_toward_protest', 'supportive').pct}% support the protest and ${st('stance_toward_protest', 'critical').pct}% criticise it.`,
        topNarr.length ? `The leading narratives are ${topNarr.map((n) => `${n.label} (${n.pct}%)`).join(', ')}.` : '',
        `${band('critical')} posts are in the critical risk band and ${band('high')} in the high band${riskRows.length ? `; the most-engaged of them reached ${num(maxRiskReach)} engagements` : ''}.`,
    ].filter(Boolean).join(' ');

    const attention = [];
    const upcoming = (event.watch_items || []).filter((w) => w.date && new Date(w.date) >= new Date(t.last_post_at || Date.now()) - 86400000);
    upcoming.forEach((w) => attention.push({ title: `Upcoming: ${dayText(w.date)}`, detail: w.description, severity: 'high' }));
    if (band('critical') + band('high')) {
        attention.push({
            title: `${band('critical') + band('high')} posts in the critical or high risk band`,
            detail: `${band('critical')} critical (threats, incitement, doxxing, impersonation) and ${band('high')} high (communal or gendered abuse, misattributed media, calls to disrupt). The most-engaged reached ${num(maxRiskReach)} engagements. See section 04.`,
            severity: band('critical') ? 'high' : 'medium',
        });
    }
    if (topNarr[0]) {
        attention.push({ title: `Leading narrative: ${topNarr[0].label}`, detail: `${num(topNarr[0].count)} posts (${topNarr[0].pct}%), trend ${topNarr[0].trend}, mostly on ${topNarr[0].platforms.map((p) => PLATFORM_NAME[p.platform]).slice(0, 2).join(' and ')}.`, severity: 'medium' });
    }
    attention.push({
        title: 'Volume in the latest 24 hours',
        detail: `${num(s.volume_change.last_24h)} posts in the last 24 hours of the period against ${num(s.volume_change.previous_24h)} in the 24 hours before; the busiest day was ${dayText(s.volume_change.peak_day)} (${num(s.volume_change.peak_posts)} posts). X search favours the newest posts, so part of a late rise is a sampling effect.`,
        severity: s.volume_change.last_24h > s.volume_change.previous_24h * 1.5 ? 'medium' : 'low',
    });
    if (negTarget && negTarget.negative) {
        const TARGET_TEXT = {
            subject: subject, election_commission: 'the Election Commission', protest_organisers: 'the protest organisers', police: 'the police',
            political_leader: 'political leaders', government: 'the government', judiciary: 'the judiciary', media: 'the media', organisation: 'organisations', other: 'other subjects',
        };
        attention.push({ title: 'Where negativity is concentrated', detail: `The largest number of negative posts is about ${TARGET_TEXT[negTarget.type] || negTarget.type} (${num(negTarget.negative)} of ${num(negTarget.posts)} posts about them).`, severity: 'low' });
    }

    return {
        bottom_line: bottom,
        attention: attention.slice(0, 6),
        executive_summary: {
            what_happened: event.description,
            when_where: `${event.location}, from ${dayText(event.start_date)}.`,
            who_involved: (event.organisers || []).map((e) => e.name).join(', '),
            why_attention: '',
            social_discussion: `${num(t.relevant)} relevant posts (${platforms}) with about ${compact(t.engagement)} engagements. On ${subject}, ${num(st('stance_toward_subject', 'critical').count)} posts are critical and ${num(st('stance_toward_subject', 'supportive').count)} supportive; on the protest, ${st('stance_toward_protest', 'supportive').pct}% are supportive and ${st('stance_toward_protest', 'critical').pct}% critical.${topNarr.length ? ` Leading narratives: ${topNarr.map((n) => `${n.label} (${n.pct}%)`).join(', ')}.` : ''}`,
        },
        activity_notes: {},
        place_context: {},
        narrative_summaries: {},
        allegation_themes: [],
        recommendations: { fact_check: [], clarifications: [], communication: [], information_gaps: [], monitoring: [], safety: [] },
    };
};

const fallbackProse = templateProse;

const writeProse = async (event, s) => {
    try {
        const raw = await llm.chatJson({ systemPrompt: PROSE_SYSTEM, prompt: buildProsePrompt(event, s), maxTokens: 3500, temperature: 0.1, timeout: 300000 });
        if (!raw || !raw.executive_summary || !raw.bottom_line) throw new Error('incomplete JSON');
        const base = fallbackProse(event, s);
        return { ...base, ...raw, recommendations: { ...base.recommendations, ...(raw.recommendations || {}) }, _source: 'llm' };
    } catch (err) {
        console.warn('[tenantReport] prose generation failed, using deterministic text:', err.message);
        return { ...fallbackProse(event, s), _source: 'fallback' };
    }
};

// ── Assembly ─────────────────────────────────────────────────────────

const METHODOLOGY = [
    'Posts were collected from public sources only: X search (Top and Latest), YouTube video search and comments on the most-viewed relevant videos, Reddit search, public Telegram channels, and the recent posts of listed public Facebook pages and Instagram accounts. Provider search returns a sample, not every post, so counts describe the collected sample.',
    'Each post was labelled by a language model against this event: relevance, post type, the person or organisation it is about, stance toward the subject, stance toward the protest, tone, places, offline activity, and a risk band. Posts labelled unrelated are excluded from all figures.',
    'Tone and stance are opinions, not fact-checks. Anything a post asserts about wrongdoing is recorded as an allegation.',
    'Risk bands measure potential for harm, not disagreement. Critical: threats of violence, incitement, doxxing, impersonation. High: calls to disrupt an official\'s home or office, manipulated or misattributed media, communal abuse. Medium: serious unverified allegations stated as fact, personal abuse, mobilisation calls. Low: everything else, including criticism, satire and calls for resignation. An analyst read every post the model placed in the critical band and every high-band post with 50 or more engagements (plus, for the first collection, every medium post); the analyst\'s band overrides the model. Other high- and medium-band posts carry the model\'s label.',
    'Engagement score = likes + 2×comments + 3×shares + views/10. Reposts carry no engagement of their own, so originals are not double-counted. Only news outlets, journalists, public figures, parties and organisations (or accounts with 50,000+ followers) are named; private individuals are never listed.',
    'Times are in IST. Posts without a timestamp from the provider are counted but left out of the timeline.',
    'X "Latest" search returns the newest posts first, so the most recent day in the window is over-represented relative to earlier days; treat day-on-day changes near the end of the window with caution.',
];

// Analyst sections that hold no figures, so they apply to a report for any period.
const QUALITATIVE_KEYS = ['narrative_summaries', 'allegation_themes', 'activity_notes', 'place_context', 'recommendations'];
const QUALITATIVE_SUMMARY_KEYS = ['what_happened', 'when_where', 'who_involved', 'why_attention'];

/**
 * Build the report document for an event, optionally limited to posts
 * published in [from, to]. Figure-bearing analyst text (bottom line,
 * attention) is used only for the full-period report and only while the data
 * still matches the snapshot it was written against.
 */
const buildReportData = async (event, { from = null, to = null } = {}) => {
    const filter = { tenant_id: event.tenant_id, event_id: event.id };
    if (from || to) {
        filter.published_at = {};
        if (from) filter.published_at.$gte = new Date(from);
        if (to) filter.published_at.$lte = new Date(to);
    }
    const posts = await TenantPost.find(filter).lean();
    const stats = computeStats(event, posts);
    const review = event.analyst_review || {};
    const analyst = review.prose || {};
    const ranged = Boolean(from || to);
    const snapshotMatches = !ranged && review.basis_relevant_posts === stats.totals.relevant;

    let prose = templateProse(event, stats);
    let source = 'template';
    if (!ranged && !review.prose && process.env.TENANT_REPORT_LLM_PROSE !== 'off') {
        prose = await writeProse(event, stats);
        source = prose._source;
    }
    QUALITATIVE_KEYS.forEach((k) => { if (analyst[k]) prose[k] = analyst[k]; });
    if (analyst.executive_summary) {
        prose.executive_summary = { ...prose.executive_summary };
        QUALITATIVE_SUMMARY_KEYS.forEach((k) => { if (analyst.executive_summary[k]) prose.executive_summary[k] = analyst.executive_summary[k]; });
    }
    let bottomLine = prose.bottom_line;
    if (snapshotMatches) {
        if (analyst.attention) prose.attention = analyst.attention;
        if (analyst.executive_summary?.social_discussion) prose.executive_summary.social_discussion = analyst.executive_summary.social_discussion;
        if (review.bottom_line) bottomLine = review.bottom_line;
    }
    if (review.prose) source += '+analyst';

    return {
        stats,
        data: {
            version: 2,
            generated_at: new Date(),
            prose_source: source,
            range: { from: from ? new Date(from) : null, to: to ? new Date(to) : null },
            event: {
                name: event.name,
                short_name: event.short_name || event.name,
                description: event.description,
                start_date: event.start_date,
                location: event.location,
                subject: event.subject,
                organisers: event.organisers,
                related_figures: event.related_figures,
                keywords: event.keywords,
                hashtags: event.hashtags,
                narratives: event.narratives,
                facts: event.facts,
                sources: event.sources,
                watch_items: event.watch_items || [],
            },
            bottom_line: bottomLine,
            // Risk assessment and notes are qualitative; figures in them are only shown for the snapshot they describe.
            analyst_review: review.reviewed_at ? {
                reviewed_at: review.reviewed_at,
                reviewed_by: review.reviewed_by,
                risk_assessment: snapshotMatches ? review.risk_assessment : null,
                notes: snapshotMatches ? review.notes : [],
            } : null,
            attention: prose.attention,
            executive_summary: prose.executive_summary,
            activity_notes: prose.activity_notes || {},
            place_context: prose.place_context || {},
            narrative_summaries: prose.narrative_summaries || {},
            allegation_themes: prose.allegation_themes || [],
            recommendations: prose.recommendations,
            stats,
            methodology: METHODOLOGY,
            collection: { last_collected_at: event.last_collected_at, last_summary: event.last_collection_summary },
        },
    };
};

const reportFields = (event, stats, data, range) => ({
    title: event.short_name || event.name,
    range_from: range.from ? new Date(range.from) : null,
    range_to: range.to ? new Date(range.to) : null,
    period_start: stats.totals.first_post_at,
    period_end: stats.totals.last_post_at,
    post_count: stats.totals.relevant,
    data,
});

/** Generate and store a report in one step (pipeline / CLI). */
const generateReport = async (event, { generatedBy = null, from = null, to = null } = {}) => {
    const { stats, data } = await buildReportData(event, { from, to });
    return TenantReport.create({
        tenant_id: event.tenant_id,
        event_id: event.id,
        status: 'ready',
        generated_by: generatedBy,
        ...reportFields(event, stats, data, { from, to }),
    });
};

/** Fill in a report row created earlier with status 'generating' (API, async). */
const completeReport = async (event, reportId, { from = null, to = null } = {}) => {
    try {
        const { stats, data } = await buildReportData(event, { from, to });
        await TenantReport.updateOne(
            { tenant_id: event.tenant_id, id: reportId },
            { $set: { status: 'ready', error: null, ...reportFields(event, stats, data, { from, to }) } },
        );
    } catch (err) {
        await TenantReport.updateOne({ tenant_id: event.tenant_id, id: reportId }, { $set: { status: 'failed', error: err.message } });
        throw err;
    }
};

module.exports = { generateReport, completeReport, buildReportData, computeStats, templateProse, engagementScore, footageOf, isPublicAccount };
