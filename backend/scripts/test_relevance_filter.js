#!/usr/bin/env node
/**
 * Deterministic regression suite for the YouTube Live chat relevance gate
 * (youtubeLiveService.js's isChatRelevant/analyzeFast, with the Goa
 * English / Konkani (Devanagari + Romi) / Marathi vocabulary — see the
 * "chat relevance gate" comment block in that file).
 *
 * No LLM, no DB, no network — runs in milliseconds and exits non-zero on any
 * failure.
 *
 *   node scripts/test_relevance_filter.js
 *
 * RUN THIS after ANY change to:
 *   src/services/youtubeLiveService.js (the relevance-gate term lists or isChatRelevant)
 *   src/services/politicalContextService.js
 *   src/config/politicalEntities.js
 *
 * Sections:
 *   A — clearly relevant: criticism, government complaint, praise/slogan,
 *       institution mentions, civic issues, questions, demands, comparison
 *   A2 — political but outside the roster (neighbouring states, national)
 *   B — clearly irrelevant: entertainment, sports, chat, fan noise
 *   C — hard negatives: the traps this gate must not fall into
 *   D — regression: sentiment/tone still compute correctly
 */

const { analyzeFast, isChatRelevant } = require('../src/services/youtubeLiveService');

let pass = 0;
let fail = 0;

const relevant = (name, text) => {
    const { fields } = analyzeFast(text);
    const ok = fields.is_political === true;
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? 'PASS' : '*** FAIL'}  [relevant]  ${name}: ${JSON.stringify(text)}`);
};

const irrelevant = (name, text) => {
    const { fields } = analyzeFast(text);
    const ok = fields.is_political === false;
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? 'PASS' : '*** FAIL'}  [irrelevant]  ${name}: ${JSON.stringify(text)}`);
};

/* ─── A. clearly relevant ──────────────────────────────────────────── */

relevant('entity + English criticism', 'Yuri Alemao is a liar and a fraud');
relevant('entity + Romi Konkani criticism', 'Sardesai fottkiro');
relevant('government complaint, Romi Konkani (institution term, no entity)', 'sorkar kiteak udok dina amkam');
relevant('government complaint, Marathi (institution term)', 'सरकार काहीच करत नाही');
relevant('praise/slogan (entity + viva)', 'viva babush');
relevant('praise/slogan (entity + jai)', 'jai Pramod Sawant');
relevant('institution term alone (election)', 'next election everyone will see');
relevant('Konkani Devanagari election word', 'वेंचणुकेंत सगळे दिसतले');
relevant('civic + criticism', 'no water for a week in our ward, worst');
relevant('civic + question', "Why hasn't anyone fixed the pothole on our street");
relevant('civic + Konkani non-delivery marker', 'आमकां उदक मेळूंक ना');
relevant('topic + question', 'why is the casino still running');
relevant('topic + demand', 'we want jobs for Goans');
relevant('party comparison (both camps named)', 'BJP and Congress are the same');
relevant('near-unconditional Goa issue (Mhadei)', 'Mhadei water is being diverted');
relevant('land conversion issue', 'stop this land conversion racket');
relevant('"our cm" is relevant (non-numeric cm)', 'our cm did nothing for us');
relevant('qualified "government scheme" phrase', 'we need a proper government scheme for fishermen');
relevant('entity-qualified topic (budget + entity)', 'Pramod Sawant presented the budget');
irrelevant('bare surname is not an entity (thousands of Goans share it)', 'Sawant budget');
relevant('"opposition leader" phrase, no roster entity', 'the opposition leader demanded an inquiry into the land scam');
relevant('price statement with institution term', 'the government increased fuel prices again');
relevant('entity + topic combination', 'Congress promised jobs and did nothing');

/* ─── A2. political but outside the roster ─────────────────────────── */

relevant('neighbouring-state leader + institution term', 'Siddaramaiah government diverted Mhadei');
relevant('Maharashtra politics + institution term', 'Shiv Sena government in Maharashtra');
relevant('national ally entity (Modi) + institution term', 'Modi cabinet reshuffle happened today');
relevant('national opposition entity + institution phrase', 'rahul gandhi criticized the central government policy');
relevant('no entity: generic institution phrase', 'the opposition party has no real agenda for elections');
relevant('no entity: "lok sabha elections"', 'lok sabha elections next year, all parties preparing');
irrelevant('out-of-roster entity + generic praise only', 'Fadnavis is doing well');

/* ─── B. clearly irrelevant ─────────────────────────────────────────── */

irrelevant('entertainment', 'watch the new movie tonight, great songs');
irrelevant('sports', 'FC Goa played a super game today');
irrelevant('ordinary conversation', 'hi how are you doing today');
irrelevant('fan message (bare party token)', 'BJP');
irrelevant('fan message (bare entity + filler)', 'hi Yuri');
irrelevant('emoji-only message', '😂😂😂');
irrelevant('punctuation-only message', '...!!!');
irrelevant('personal chat mentioning a civic word, no complaint', 'my mother came home from the hospital today');

/* ─── C. hard negatives ─────────────────────────────────────────────── */

irrelevant('"5 cm long" (measurement, digit-guarded)', '5 cm long');
irrelevant('party name + heart emoji', 'BJP ❤️');
irrelevant('"incident" must not match INC', 'there was an incident near the beach');
irrelevant('generic topic word alone, no second signal', 'prices are high today');
irrelevant('shop price talk ("increased" + "price")', 'this shop increased the price of the item again');
irrelevant('"reduced" + "price"', 'the hotel reduced the price this week for the offer');
irrelevant('generic "correct" with no entity', 'yes that is correct');
irrelevant('ambiguous short fragment', 'kk');
irrelevant('ambiguous short fragment', 'hi');
irrelevant('"budget" without an entity', 'what is the budget for our trip');

/* ─── D. regression: sentiment/tone unaffected by the relevance gate ── */

(() => {
    const { fields } = analyzeFast('jai Pramod Sawant');
    const ok = fields.sentiment === 'positive' && fields.tone === 'positive';
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? 'PASS' : '*** FAIL'}  [regression]  praise of the CM is client-positive (got sentiment=${fields.sentiment}, tone=${fields.tone})`);
})();

(() => {
    const { fields } = analyzeFast('Yuri Alemao is a liar');
    const ok = fields.sentiment === 'positive' && fields.tone === 'negative';
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? 'PASS' : '*** FAIL'}  [regression]  attack on the opposition flips to client-positive (got sentiment=${fields.sentiment}, tone=${fields.tone})`);
})();

(() => {
    const { fields } = analyzeFast('worst waste useless government');
    const ok = fields.is_political === true && fields.tone === 'negative';
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? 'PASS' : '*** FAIL'}  [regression]  tone negative + is_political both fire (got is_political=${fields.is_political}, tone=${fields.tone})`);
})();

(() => {
    const { fields } = analyzeFast('आमकां उदक जाय, सरकार कित्याक कांयच करिना? हांव गोंयकार आसा');
    const ok = fields.language === 'konkani';
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? 'PASS' : '*** FAIL'}  [regression]  Konkani Devanagari detected as konkani (got ${fields.language})`);
})();

(() => {
    const { fields } = analyzeFast('मुख्यमंत्री आज पणजीत आहेत आणि बैठक झाली');
    const ok = fields.language === 'marathi';
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? 'PASS' : '*** FAIL'}  [regression]  Marathi detected as marathi (got ${fields.language})`);
})();

(() => {
    let threw = false;
    try {
        isChatRelevant('', [], { mentioned_entities: [] });
    } catch (e) {
        threw = true;
    }
    const ok = !threw;
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? 'PASS' : '*** FAIL'}  [regression]  isChatRelevant handles empty text without throwing`);
})();

/* ─── report ────────────────────────────────────────────────────────── */
console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`);
process.exit(fail ? 1 : 0);
