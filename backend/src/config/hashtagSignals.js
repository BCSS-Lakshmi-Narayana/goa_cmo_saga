/**
 * hashtagSignals
 * ─────────────────────────────────────────────────────────────────────────────
 * Two small jobs, both about hashtags, both deliberately conservative.
 *
 *   1. segmentHashtags()  — split compound hashtags so the existing alias scan
 *                           can see the entity glued inside them.
 *   2. STANCE_HASHTAGS    — the curated few that carry a DIRECTION, not just a
 *                           name.
 *
 * ── 1. WHY SEGMENTATION, AND WHY SO LITTLE OF IT ──
 * The alias scan already catches many hashtags, because it is a substring match:
 * `#Babush` and `#CongressGoa` already contain the aliases "babush" and
 * "congress". Multi-word aliases ("pramod sawant") need the space that
 * segmentation below restores.
 *
 * What fails is a SHORT alias glued to a preceding word. Aliases of 4 characters
 * or fewer require a non-word boundary (so "inc" does not match "including"), and
 * in `#GoaRejectsBJP` the "bjp" is preceded by "s" — no boundary, no match.
 * Splitting on case transitions turns it into "Goa Rejects BJP" and the existing
 * rule works.
 *
 * So this adds ONE narrow capability. It does not attempt general word
 * segmentation of `#savemhadeiriver` — that needs a dictionary, and guessing
 * word boundaries invents entities that were never mentioned.
 *
 * ── 2. WHY A CURATED LIST FOR STANCE ──
 * `#SaveMhadei` names no leader at all, yet it is an attack on the government's
 * handling of the Mhadei dispute. The direction lives in the campaign phrase,
 * which cannot be derived from a roster of names.
 *
 * These cannot be generated, only listed, so the list is short and explicit.
 * Anything not on it contributes an entity mention and nothing more.
 *
 * ── THE GUARDS ──
 * • Capped. A stuffed post (one real example carried 12 hashtags) would otherwise
 *   look like it is about everyone.
 * • Advisory only. These signals are exposed on the context for the prompt and
 *   for review; they never overrule what the sentence itself says. A hashtag can
 *   ADD an entity, never outrank the body text.
 */

/**
 * Hashtags carrying a direction, not just a name. `target` is a roster key.
 * Only tags with evidence of real use in Goa political posts (Sep 2026) are
 * listed; extend as new campaign tags appear.
 */
const STANCE_HASHTAGS = {
    // ── attacks on the client / government ──
    savemhadei: { target: 'pramod-sawant', direction: 'attack' },
    savemollem: { target: 'bjp', direction: 'attack' },

    // ── support for the client / government ──
    viksitgoa: { target: 'pramod-sawant', direction: 'support' },
    viksitbharat: { target: 'bjp', direction: 'support' },

    // ── support for the opposition ──
    kejriwalkasatyagraha: { target: 'arvind-kejriwal', direction: 'support' },
};

/** Hard ceiling on hashtags considered, defeating hashtag-stuffing. */
const MAX_HASHTAGS = parseInt(process.env.MAX_HASHTAGS_CONSIDERED || '12', 10);

/**
 * Every hashtag in the post, `#` stripped, in order, capped.
 *
 * CASE IS PRESERVED. Segmentation splits on case transitions, so lowercasing
 * here would destroy the only boundary "#GoaRejectsBJP" has and silently reduce this
 * module to a no-op. Callers that need a lookup key lowercase at the point of
 * use; de-duplication is case-insensitive so "#BJP" and "#bjp" count once.
 */
const extractHashtags = (text) => {
    const out = [];
    const seen = new Set();
    // \p{L}\p{M}\p{N} keeps Devanagari tags whole — Indic vowel signs are
    // separate combining marks and \w alone would cut a tag in half.
    const rx = /#([\p{L}\p{M}\p{N}_]{2,60})/gu;
    let m;
    while ((m = rx.exec(String(text || ''))) !== null) {
        const tag = m[1];
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
        if (out.length >= MAX_HASHTAGS) break;
    }
    return out;
};

/**
 * Split compound hashtags on case transitions and separators, and return the
 * pieces as spaced text for the alias scan to read.
 *
 * `#GoaRejectsBJP` → "Goa Rejects BJP" → the short alias "bjp" now has a word boundary.
 *
 * Returns '' when nothing splits, so callers can skip a second scan entirely.
 */
const segmentHashtags = (text) => {
    const pieces = [];
    for (const tag of extractHashtags(text)) {
        const split = String(tag)
            // camelCase / PascalCase boundaries, both directions, so "GoaRejectsBJP"
            // and "BJPGoa" both break correctly.
            .replace(/([a-z\d])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .replace(/[_\-.]+/g, ' ')
            .trim();
        // Only worth adding when it actually changed — otherwise the plain scan
        // has already seen this exact string.
        if (split && split !== tag) pieces.push(split);
    }
    return pieces.join(' ');
};

/**
 * Curated stance hashtags present in the text.
 * @returns {Array<{tag, target, direction}>}
 */
const findStanceHashtags = (text) => {
    const out = [];
    for (const tag of extractHashtags(text)) {
        const hit = STANCE_HASHTAGS[tag.toLowerCase()];
        if (hit) out.push({ tag, target: hit.target, direction: hit.direction });
    }
    return out;
};

module.exports = {
    STANCE_HASHTAGS,
    MAX_HASHTAGS,
    extractHashtags,
    segmentHashtags,
    findStanceHashtags,
};
