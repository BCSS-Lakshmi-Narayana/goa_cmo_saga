/**
 * Spells out abbreviations in report text so the brief reads cleanly for a
 * general reader ("AISA" → "All India Students' Association"). Applied to the
 * report's own prose and to post summaries — never to quoted post text, URLs,
 * handles or hashtags.
 */

const ABBREVIATIONS = [
    ['CJP', 'Cockroach Janta Party'],
    ['CEC', 'Chief Election Commissioner'],
    ['ECI', 'Election Commission of India'],
    ['SIR', 'Special Intensive Revision'],
    ['EVM', 'electronic voting machine'],
    ['EVMs', 'electronic voting machines'],
    ['FIR', 'First Information Report'],
    ['FIRs', 'First Information Reports'],
    ['NHRC', 'National Human Rights Commission'],
    ['AISA', "All India Students' Association"],
    ['AISF', "All India Students' Federation"],
    ['SFI', "Students' Federation of India"],
    ['DYFI', 'Democratic Youth Federation of India'],
    ['NSUI', "National Students' Union of India"],
    ['IYC', 'Indian Youth Congress'],
    ['BJP', 'Bharatiya Janata Party'],
    ['AAP', 'Aam Aadmi Party'],
    ['TMC', 'Trinamool Congress'],
    ['INC', 'Indian National Congress'],
    ['RJD', 'Rashtriya Janata Dal'],
    ['MNS', 'Maharashtra Navnirman Sena'],
    ['SDPI', 'Social Democratic Party of India'],
    ['VHP', 'Vishva Hindu Parishad'],
    ['RSS', 'Rashtriya Swayamsevak Sangh'],
    ['UAPA', 'Unlawful Activities (Prevention) Act'],
    ['NSA', 'National Security Act'],
    ['BNSS', 'Bharatiya Nagarik Suraksha Sanhita'],
    ['BNS', 'Bharatiya Nyaya Sanhita'],
    ['FCRA', 'Foreign Contribution (Regulation) Act'],
    ['NIA', 'National Investigation Agency'],
    ['ACP', 'Assistant Commissioner of Police'],
    ['DCP', 'Deputy Commissioner of Police'],
    ['DGP', 'Director General of Police'],
    ['RPF', 'Railway Protection Force'],
    ['GRP', 'Government Railway Police'],
    ['RAF', 'Rapid Action Force'],
    ['NEET', 'National Eligibility cum Entrance Test'],
    ['MPSC', 'Maharashtra Public Service Commission'],
    ['PIL', 'public interest litigation'],
    ['IANS', 'Indo-Asian News Service'],
    ['ANI', 'Asian News International'],
    ['UBT', 'Uddhav Balasaheb Thackeray'],
    ['CM', 'Chief Minister'],
    ['PM', 'Prime Minister'],
    ['MPs', 'Members of Parliament'],
    ['MP', 'Member of Parliament'],
    ['MLAs', 'Members of the Legislative Assembly'],
    ['MLA', 'Member of the Legislative Assembly'],
    ['MLC', 'Member of the Legislative Council'],
    ['EC', 'Election Commission'],
    ['ECs', 'Election Commissioners'],
    ['IST', 'Indian Standard Time'],
];

const ALT = ABBREVIATIONS.map(([a]) => a).sort((a, b) => b.length - a.length).join('|');
// Drop "(CJP)"-style parentheticals that follow the full name, so expansion doesn't repeat it.
const PAREN_RX = new RegExp(`\\s*\\((?:${ALT})\\)`, 'g');
// Whole-word, upper-case only; not inside hashtags, mentions or URLs.
const WORD_RX = new RegExp(`(?<![#@/\\w.])(${ALT})(?=[^\\w]|$)`, 'g');
const MAP = Object.fromEntries(ABBREVIATIONS);

// "an FIR" → "a First Information Report", "a AISA" → "an All India …": fix the article before an expansion.
const ARTICLE_RX = new RegExp(`\\b(a|an|A|An) (?=(?:${ALT})(?:[^\\w]|$))`, 'g');
const startsWithVowel = (s) => /^[aeiouAEIOU]/.test(s);

const expand = (text) => {
    if (typeof text !== 'string' || !text) return text;
    return text
        .replace(/\bINDIA bloc\b/g, 'INDIA opposition alliance')
        .replace(PAREN_RX, '')
        .replace(ARTICLE_RX, (art, a, offset, whole) => {
            const next = whole.slice(offset + art.length).match(new RegExp(`^(${ALT})`))[1];
            const vowel = startsWithVowel(MAP[next] || next);
            const cap = a[0] === 'A';
            return `${vowel ? (cap ? 'An' : 'an') : (cap ? 'A' : 'a')} `;
        })
        .replace(WORD_RX, (m, _g, offset, whole) => {
            // "4 PM" is a time, not "Prime Minister".
            if (m === 'PM' && /\d\s?$/.test(whole.slice(Math.max(0, offset - 3), offset))) return m;
            return MAP[m] || m;
        });
};

// Report fields that hold prose. Everything nested under these keys is expanded.
const TEXT_KEYS = new Set([
    'title', 'detail', 'caveat', 'summary', 'excerpt', 'risk_reason', 'statement', 'claimed_by', 'description',
    'label', 'bottom_line', 'what_happened', 'when_where', 'who_involved', 'why_attention', 'social_discussion',
    'theme', 'status_note', 'notes', 'recommendations', 'narrative_summaries', 'activity_notes', 'place_context',
    'risk_assessment', 'role',
]);

/** Expand abbreviations in prose fields of a report document (returns a new object). */
const expandReport = (value, inText = false) => {
    if (typeof value === 'string') return inText ? expand(value) : value;
    if (Array.isArray(value)) return value.map((v) => expandReport(v, inText));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = expandReport(v, inText || TEXT_KEYS.has(k));
        }
        return out;
    }
    return value;
};

module.exports = { expand, expandReport };
