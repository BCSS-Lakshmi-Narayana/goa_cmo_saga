/**
 * test_leader_popularity.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure-function tests for leaderPopularityController's entity resolution and
 * alignment flip — no DB connection needed. The failure modes these pin were
 * found by running the aggregation against a live database: one leader's
 * numbers split across two rows over an unindexed alias or a punctuation
 * variant, and placeholder strings ranking as "leaders".
 *
 *   node scripts/test_leader_popularity.js
 */

const {
    resolveEntity,
    alignToPerson,
    rawAliasesForKey,
} = require('../src/controllers/leaderPopularityController');
const { POLITICAL_ENTITIES } = require('../src/config/politicalEntities');

let pass = 0;
let fail = 0;
const ok = (name, cond, detail) => {
    if (cond) { pass += 1; console.log(`PASS  ${name}`); }
    else { fail += 1; console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};

console.log('\n── THE CRITICAL STEP: align client-relative sentiment to the person ──');
ok('opposition + client-positive → negative for them',
    alignToPerson('positive', 'opposition') === 'negative');
ok('opposition + client-negative → positive for them',
    alignToPerson('negative', 'opposition') === 'positive');
ok('ally + client-positive stays positive',
    alignToPerson('positive', 'ally') === 'positive');
ok('ally + client-negative stays negative',
    alignToPerson('negative', 'ally') === 'negative');
ok('neutral entity is never flipped',
    alignToPerson('positive', 'neutral') === 'positive');
ok('unknown (off-roster) entity is never flipped',
    alignToPerson('negative', 'unknown') === 'negative');
ok('neutral passes through regardless of alignment',
    alignToPerson('neutral', 'opposition') === 'neutral');
ok('empty sentiment passes through unchanged',
    alignToPerson('', 'opposition') === '');

console.log('\n── placeholder / junk guard ──');
for (const v of ['none', 'None', 'N/A', 'n/a', 'unknown', 'null', '', '   ', '123', '---']) {
    ok(`${JSON.stringify(v)} resolves to null`, resolveEntity(v) === null, `got ${JSON.stringify(resolveEntity(v))}`);
}
ok('a Devanagari-only name is NOT rejected as "no letters"',
    resolveEntity('प्रमोद सावंत') !== null, 'Devanagari must not trip the digit/symbol-only guard');
ok('the Devanagari name resolves to the CM',
    resolveEntity('प्रमोद सावंत')?.key === 'pramod-sawant');

console.log('\n── legacy roster keys resolve to their current entity ──');
ok('"bsk" → pramod-sawant, ally', (() => {
    const r = resolveEntity('bsk');
    return r && r.key === 'pramod-sawant' && r.alignment === 'ally';
})());
ok('"bsk_son" → damu-naik, ally', (() => {
    const r = resolveEntity('bsk_son');
    return r && r.key === 'damu-naik' && r.alignment === 'ally';
})());
ok('"bjp_telangana" → bjp (legacy "party machinery" key)', resolveEntity('bjp_telangana')?.key === 'bjp');

console.log('\n── alias / punctuation variants merge onto ONE roster key ──');
const sameKey = (a, b) => {
    const ra = resolveEntity(a), rb = resolveEntity(b);
    return ra && rb && ra.key === rb.key;
};
ok('"Dr. Pramod Sawant" and "Dr Pramod Sawant" are the same leader',
    sameKey('Dr. Pramod Sawant', 'Dr Pramod Sawant'));
ok('"CM Sawant" and "Pramod Sawant" are the same leader', sameKey('CM Sawant', 'Pramod Sawant'));
ok('"Babush" and "Atanasio Monserrate" are the same leader', sameKey('Babush', 'Atanasio Monserrate'));
ok('the Leader of Opposition is opposition-aligned', resolveEntity('Yuri Alemao')?.alignment === 'opposition');
ok('canonical party name resolves to itself', resolveEntity('Indian National Congress')?.key === 'inc');

console.log('\n── off-roster free text is KEPT (shown), never merged into an unrelated entity ──');
const randoA = resolveEntity('Some Local Sarpanch');
const randoB = resolveEntity('A Totally Different Person');
ok('unresolved text still returns a display entry', randoA !== null && randoA.key === null && randoA.alignment === 'unknown');
ok('two different unresolved names do not collide', randoA.name !== randoB.name);
ok('unresolved priority is 0 — can never outrank a recognised leader', randoA.priority === 0);

console.log('\n── rawAliasesForKey drives the drill-down query ──');
const cmAliases = rawAliasesForKey('pramod-sawant');
ok('includes the roster key itself', cmAliases.includes('pramod-sawant'));
ok('includes the canonical name', cmAliases.includes(POLITICAL_ENTITIES['pramod-sawant'].canonical));
ok('includes the legacy key that maps here ("bsk")', cmAliases.includes('bsk'));
ok('includes a free-text alias variant ("CM Sawant")', cmAliases.includes('CM Sawant'));

console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`);
process.exit(fail ? 1 : 0);
