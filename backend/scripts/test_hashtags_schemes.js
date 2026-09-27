/**
 * test_hashtags_schemes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers the two Stage 2 additions — compound-hashtag segmentation and
 * government-scheme entities — with the emphasis on what must NOT change.
 *
 * Both additions are meant to be purely additive: they may turn "no entity
 * found" into "entity found", and nothing else. Most of what follows checks that
 * promise rather than the new capability.
 *
 *   node scripts/test_hashtags_schemes.js
 */

const { buildPoliticalContext } = require('../src/services/politicalContextService');
const { segmentHashtags, findStanceHashtags, extractHashtags } = require('../src/config/hashtagSignals');
const { POLITICAL_ENTITIES } = require('../src/config/politicalEntities');

let pass = 0;
let fail = 0;
const ok = (name, cond, detail) => {
    if (cond) { pass += 1; console.log(`PASS  ${name}`); }
    else { fail += 1; console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};
const keys = (t, opts) => (buildPoliticalContext(t, opts || {}).mentioned_entities || []).map((e) => e.key);
const has = (t, k) => keys(t).includes(k);

console.log('\n── compound hashtags: the gap segmentation exists to close ──');
ok('#GoaRejectsBJP now resolves BJP', has('#GoaRejectsBJP', 'bjp'), `got ${keys('#GoaRejectsBJP')}`);
ok('#PramodSawant resolves the CM', has('#PramodSawant', 'pramod-sawant'), `got ${keys('#PramodSawant')}`);
ok('#CongressGoa resolves INC', has('#CongressGoa', 'inc'), `got ${keys('#CongressGoa')}`);
ok('segmentation splits case boundaries', segmentHashtags('#GoaRejectsBJP').includes('BJP'),
    `got "${segmentHashtags('#GoaRejectsBJP')}"`);
ok('segmentation preserves case (lowercasing would make it a no-op)',
    /[A-Z]/.test(segmentHashtags('#GoaRejectsBJP')));
ok('nothing to split returns empty', segmentHashtags('#bjp #aap') === '');

console.log('\n── segmentation must NOT invent entities ──');
ok('#GoaPolitics resolves nothing', keys('#GoaPolitics').length === 0, `got ${keys('#GoaPolitics')}`);
ok('#GoaBeaches resolves nothing', keys('#GoaBeaches').length === 0, `got ${keys('#GoaBeaches')}`);
ok('a non-political tag resolves nothing', keys('#GoodMorningFriends').length === 0);
ok('plain text with no hashtags is unaffected',
    keys('The weather in Margao is pleasant today').length === 0);
ok('"including" does not match the INC alias', !has('including everyone', 'inc'));
ok('#IncredibleIndia does not match INC', !has('#IncredibleIndia', 'inc'),
    `got ${keys('#IncredibleIndia')}`);
ok('"aapka" does not match AAP', !has('aapka swagat hai', 'aap'));

console.log('\n── body text still outranks hashtags ──');
{
    const t = 'Pramod Sawant inaugurated the project today #CongressGoa';
    const ks = keys(t);
    ok('both resolve, body entity first', ks[0] === 'pramod-sawant' && ks.includes('inc'), `got ${ks}`);
    const ctx = buildPoliticalContext(t, {});
    ok('primary_target comes from the body, not the hashtag',
        ctx.primary_target === 'pramod-sawant', `got ${ctx.primary_target}`);
    const bodyOnly = buildPoliticalContext('Pramod Sawant inaugurated the project today', {});
    ok('adding a hashtag does not change the body-derived primary_target',
        ctx.primary_target === bodyOnly.primary_target);
}

console.log('\n── hashtag stuffing is capped ──');
{
    const stuffed = Array.from({ length: 40 }, (_, i) => `#Tag${i}`).join(' ');
    ok('extraction stops at the cap', extractHashtags(stuffed).length <= 12,
        `got ${extractHashtags(stuffed).length}`);
    ok('duplicates counted once', extractHashtags('#BJP #bjp #Bjp').length === 1);
}

console.log('\n── curated stance hashtags ──');
{
    const s = findStanceHashtags('म्हादई वाचवा #SaveMhadei #SaveMollem');
    ok('both attack tags found', s.length === 2 && s.every((x) => x.direction === 'attack'));
    ok('targets resolve to real roster keys',
        s.every((x) => !!POLITICAL_ENTITIES[x.target]), JSON.stringify(s));
    ok('an uncurated tag yields no direction', findStanceHashtags('#RandomTag').length === 0);
    ok('lookup is case-insensitive', findStanceHashtags('#viksitgoa').length === 1);
    const all = require('../src/config/hashtagSignals').STANCE_HASHTAGS;
    const bad = Object.entries(all).filter(([, v]) => !POLITICAL_ENTITIES[v.target]);
    ok('every curated target exists in the roster', bad.length === 0,
        bad.map(([k, v]) => `${k}→${v.target}`).join(', '));
    ok('every curated direction is attack|support',
        Object.values(all).every((v) => ['attack', 'support'].includes(v.direction)));
}

console.log('\n── government schemes ──');
ok('English scheme name resolves', has('Griha Aadhar money not credited for three months', 'scheme-griha-aadhar'));
ok('pension scheme abbreviation resolves', has('DSSS pension delayed again', 'scheme-dsss'));
ok('Devanagari scheme name resolves', has('गृह आधार योजनेचे पैसे मिळाले नाहीत', 'scheme-griha-aadhar'));
ok('flagship project resolves', has('Mopa airport taxi counter chaos', 'project-mopa-airport'));
ok('scheme post is no longer "irrelevant"',
    buildPoliticalContext('Ladli Laxmi payments stuck for months', {}).mode !== 'irrelevant');

console.log('\n── a scheme must never outrank a named leader ──');
{
    const ctx = buildPoliticalContext('Pramod Sawant defended the Griha Aadhar scheme today', {});
    ok('primary_target is the person, not the scheme',
        ctx.primary_target === 'pramod-sawant', `got ${ctx.primary_target}`);
    const sch = POLITICAL_ENTITIES['scheme-griha-aadhar'];
    const cm = POLITICAL_ENTITIES['pramod-sawant'];
    ok('scheme priority sits below every person/party', sch.priority < cm.priority);
    ok('schemes are aligned to us', sch.alignment === 'ally');
    ok('schemes are typed distinctly', sch.type === 'scheme');
}

console.log('\n── no alias collisions introduced ──');
{
    const schemeKeys = Object.keys(POLITICAL_ENTITIES).filter((k) => POLITICAL_ENTITIES[k].type === 'scheme');
    ok(`${schemeKeys.length} scheme entities registered`, schemeKeys.length >= 8);
    const nonScheme = Object.entries(POLITICAL_ENTITIES).filter(([, e]) => e.type !== 'scheme');
    const clashes = [];
    for (const k of schemeKeys) {
        for (const a of POLITICAL_ENTITIES[k].aliases) {
            for (const [ok2, e] of nonScheme) {
                if ((e.aliases || []).some((x) => String(x).toLowerCase() === a)) clashes.push(`${a}: ${k} vs ${ok2}`);
            }
        }
    }
    ok('no scheme alias collides with a person or party', clashes.length === 0, clashes.join(' | '));
    ok('no scheme alias is dangerously short',
        schemeKeys.every((k) => POLITICAL_ENTITIES[k].aliases.every((a) => a.length >= 4)));
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`);
process.exit(fail ? 1 : 0);
