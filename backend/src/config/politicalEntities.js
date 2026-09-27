/**
 * politicalEntities.js
 * ─────────────────────────────────────────────────────────────────────
 * Goa political entity graph — a DERIVED VIEW over `politicalData.js`, which
 * remains the single source of truth for who exists in the political universe.
 *
 * What this layer adds:
 *   • alignment        — 'ally' | 'opposition' | 'neutral'
 *   • scope            — 'state' | 'national'
 *   • priority         — ranking hint only; NEVER a stance decision
 *   • aliases          — transliterations, nicknames, handles, symbol names,
 *                        and hand-curated NATIVE-SCRIPT spellings
 *   • ALIAS_INDEX      — alias → primary entity (longest alias first)
 *   • ALIAS_CANDIDATES — alias → ALL entities claiming it (ambiguity-aware)
 *
 * IMPORTANT:
 *   This module resolves ENTITY IDENTITY. It does NOT decide political stance.
 *   Stance is decided downstream by services/stanceEngine.js from
 *   (target, target_tone, author) — never from priority or mention order.
 *
 * ⚠ ALIGNMENT IS GOA-SPECIFIC: BJP is the client and INC/AAP/GFP/RGP are the
 *   opposition. Other deployments of this codebase have had it the other way round.
 */

const {
    OUR_PARTY,
    ALLY_PARTIES,
    OPPOSITION_PARTIES,
    CABINET_MINISTERS,
    PRESIDING_OFFICERS,
    PARTY_ORG_LEADERS,
    NATIONAL_ALLY_LEADERS,
    NATIONAL_OPPOSITION_LEADERS,
    ALLY_MLAS,
    ALLY_MPS,
    OPPOSITION_LEADERS,
} = require('./politicalData');
const { STATE_NAME } = require('./deployment');

/* ─── priority ──────────────────────────────────────────────────────── */

/**
 * Priority is ONLY an entity-ranking hint, used to pick a `primary_target`
 * for display when several entities are mentioned.
 *
 * It must NEVER be used as:
 *   priority → target        (that is `sentiment_target`, extracted per-post)
 *   priority → stance        (that is stanceEngine)
 *   priority → client relevance
 */
const PRIORITY = {
    CHIEF_MINISTER: 100,
    DEPUTY_CM: 95,
    PARTY_CHIEF: 94,
    RULING_PARTY: 90,
    OPPOSITION_CHIEF: 88,
    OPPOSITION_PARTY: 86,
    CABINET_MINISTER: 80,
    ALLY_PARTY: 75,
    PRESIDING_OFFICER: 70,
    MP: 60,
    OPPOSITION_SENIOR: 58,
    MLA: 55,
    NATIONAL_LEADER: 50,
    NEUTRAL_INSTITUTION: 30,
};

/* ─── curated aliases ───────────────────────────────────────────────── */

/**
 * Hand-curated aliases keyed by the `id` used in politicalData.js.
 *
 * WHY THIS MATTERS MORE THAN ANYTHING ELSE IN THIS FILE:
 * The Stage 2 deterministic pre-scan reads the ORIGINAL post text. Goan posts
 * often name a leader only in Devanagari (Marathi or Konkani press) or by a
 * nickname ("Babush"). Without that alias here, Stage 2 cannot see the leader,
 * and Stage 4 has no camp to attach a stance to — the post silently drops to
 * `general_politics`.
 *
 * Devanagari spellings come from Marathi media (Pudhari, Dainik Gomantak,
 * Lokmat); Konkani spellings may differ slightly. Also included:
 *   • MACHINE-TRANSLATION spellings — the pipeline pre-translates to English
 *     before the LLM extracts actors, and translators vary the spelling.
 *   • Legacy pipeline keys ('bsk', 'bsk_son') so stored `target_entity` values
 *     keep resolving to the primary/secondary client leaders.
 *
 * Very common surnames ("naik", "kamat", "rane") are deliberately NOT aliases
 * on their own: dozens of Goans share them and every one would match.
 */
const CURATED_ALIASES = {
    'pramod-sawant': [
        'pramod sawant', 'dr pramod sawant', 'dr. pramod sawant', 'cm sawant', 'goa cm',
        'chief minister sawant', 'cm pramod sawant', 'sawant government', 'sawant sarkar',
        '@drpramodpsawant', '@goacm', '#pramodsawant', '#cmsawant',
        'bsk', // legacy pipeline key for the primary target
        'प्रमोद सावंत', 'डॉ. प्रमोद सावंत', 'डॉ प्रमोद सावंत', 'मुख्यमंत्री सावंत', 'मुख्यमंत्री प्रमोद सावंत',
    ],
    'damu-naik': [
        'damu naik', 'damodar naik', 'bjp goa president', 'goa bjp president', 'bjp goa state president',
        '@damunaik',
        'bsk_son', // legacy pipeline key for the secondary target
        'दामू नाईक', 'दामोदर नाईक',
    ],
    'vishwajit-rane': ['vishwajit rane', 'vishwajeet rane', 'health minister rane', 'विश्वजीत राणे'],
    'subhash-shirodkar': ['subhash shirodkar', 'सुभाष शिरोडकर'],
    'mauvin-godinho': ['mauvin godinho', 'mauvin', 'माविन गुदिन्हो', 'मॉविन गुदिन्हो'],
    'rohan-khaunte': ['rohan khaunte', 'khaunte', 'रोहन खंवटे'],
    'babush-monserrate': ['babush', 'babush monserrate', 'atanasio monserrate', 'बाबूश मोन्सेरात', 'बाबूश', 'आतानासिओ मोन्सेरात'],
    'subhash-phal-dessai': ['subhash phal dessai', 'subhash phal desai', 'phal dessai', 'subhash faldesai', 'सुभाष फळदेसाई'],
    // Bare "Dhavalikar" is left out: MGP president Deepak Dhavalikar shares it.
    'sudin-dhavalikar': ['sudin dhavalikar', 'sudin', 'सुदिन ढवळीकर'],
    'nilkanth-halarnkar': ['nilkanth halarnkar', 'nilkant halarnkar', 'halarnkar', 'नीळकंठ हळर्णकर'],
    'digambar-kamat': ['digambar kamat', 'digambar babu', 'दिगंबर कामत'],
    'ramesh-tawadkar': ['ramesh tawadkar', 'tawadkar', 'रमेश तवडकर', 'तवडकर'],
    'ganesh-gaonkar': ['speaker gaonkar', 'ganesh gaonkar', 'गणेश गावकर'],

    'yuri-alemao': ['yuri alemao', 'yuri', 'lop yuri', 'lop alemao', 'युरी आलेमाव', 'युरी आलेमांव'],
    'girish-chodankar': ['girish chodankar', 'chodankar', 'गिरीश चोडणकर'],
    'amit-patkar': ['amit patkar', 'अमित पाटकर'],
    'viriato-fernandes': ['viriato fernandes', 'viriato', 'capt viriato'],
    'valmiki-naik': ['valmiki naik', 'वाल्मिकी नाईक'],
    'venzy-viegas': ['venzy viegas', 'venzy'],
    'cruz-silva': ['cruz silva'],
    'vijai-sardesai': ['vijai sardesai', 'vijay sardesai', 'sardesai', 'विजय सरदेसाई', 'सरदेसाई'],
    'viresh-borkar': ['viresh borkar'],
    'manoj-parab': ['manoj parab'],

    'narendra-modi': ['modi', 'modi ji', 'narendra modi', 'pm modi', '@narendramodi', '#modi', 'नरेंद्र मोदी', 'मोदी', 'पंतप्रधान मोदी'],
    'amit-shah': ['amit shah', '@amitshah', 'अमित शहा', 'अमित शाह'],
    'mp-north-goa': ['shripad naik', 'shripad bhau', 'श्रीपाद नाईक'],
    'rahul-gandhi': ['rahul gandhi', '@rahulgandhi', 'राहुल गांधी'],
    'mallikarjun-kharge': ['kharge', 'mallikarjun kharge', '@kharge', 'मल्लिकार्जुन खरगे'],
    'arvind-kejriwal': ['kejriwal', 'arvind kejriwal', '@arvindkejriwal', 'अरविंद केजरीवाल', 'केजरीवाल'],
};

/**
 * Party-level aliases, keyed by the party id in politicalData.js.
 * Symbol names ("lotus party", "broom") are how ordinary posts often refer to a
 * party without naming it.
 */
const PARTY_ALIASES = {
    bjp: [
        'bjp', 'bjp goa', 'goa bjp', 'bharatiya janata party', 'bharatiya janta party',
        'lotus party', 'saffron party', 'bjp government', 'bjp sarkar',
        '@bjp4goa', '@bjp4india', '#bjp', '#bjpgoa',
        'भाजप', 'भाजपा', 'भारतीय जनता पक्ष', 'भारतीय जनता पार्टी',
    ],
    mgp: [
        'mgp', 'maharashtrawadi gomantak', 'maharashtrawadi gomantak party', 'magopa',
        'मगो', 'मगोप', 'महाराष्ट्रवादी गोमंतक पक्ष',
    ],
    inc: [
        // The party code "inc" is added automatically; ALIAS_BLOCKED_CONTEXTS
        // keeps the company suffix ("Apple Inc.") from matching it.
        'congress', 'indian national congress', 'goa congress', 'inc goa', 'goa inc', 'inc party', 'gpcc',
        'hand symbol party', '@incgoa', '@incindia', '#congress',
        'काँग्रेस', 'कॉंग्रेस', 'काँग्रेस पक्ष',
    ],
    aap: [
        'aap', 'aap goa', 'aam aadmi party', 'broom party', '@aapgoa', '@aamaadmiparty', '#aap',
        'आम आदमी पक्ष', 'आम आदमी पार्टी',
    ],
    gfp: [
        'gfp', 'goa forward', 'goa forward party', '@goaforwardparty',
        'गोवा फॉरवर्ड', 'गोंय फॉरवर्ड',
    ],
    rgp: [
        'rgp', 'revolutionary goans', 'revolutionary goans party', 'rg party',
        'आरजी',
    ],
};

/**
 * Institutions that must resolve to a NAME but must never be scored as a
 * political camp. Complaints about the police are civic grievances, not
 * attacks on the opposition.
 */
const NEUTRAL_ENTITIES = {
    goa_police: {
        canonical: 'Goa Police',
        type: 'institution',
        alignment: 'neutral',
        scope: 'state',
        priority: PRIORITY.NEUTRAL_INSTITUTION,
        aliases: ['goa police', '@goa_police', 'गोवा पोलीस', 'गोंय पुलीस'],
    },
    election_commission: {
        canonical: 'Election Commission',
        type: 'institution',
        alignment: 'neutral',
        scope: 'national',
        priority: PRIORITY.NEUTRAL_INSTITUTION,
        aliases: [
            'election commission', 'eci', 'ceo goa', 'chief electoral officer goa',
            'state election commission', 'निवडणूक आयोग',
        ],
    },
    bombay_high_court_goa: {
        canonical: 'Bombay High Court (Goa Bench)',
        type: 'institution',
        alignment: 'neutral',
        scope: 'state',
        priority: PRIORITY.NEUTRAL_INSTITUTION,
        aliases: [
            'bombay high court', 'high court of bombay at goa', 'goa bench', 'hc goa bench',
            'उच्च न्यायालय',
        ],
    },
    goa_governor: {
        canonical: 'Governor of Goa',
        type: 'institution',
        alignment: 'neutral',
        scope: 'state',
        priority: PRIORITY.NEUTRAL_INSTITUTION,
        aliases: ['governor of goa', 'goa governor', 'lok bhavan', 'raj bhavan goa', 'ashok gajapathi raju', 'राज्यपाल'],
    },
};

/* ─── helpers ───────────────────────────────────────────────────────── */

const clean = (v) => String(v || '').trim();

/** Aliases contributed automatically by a politicalData.js roster entry. */
const deriveRosterAliases = (leader) => {
    const out = [
        clean(leader.name),
        clean(leader.shortName),
        ...(leader.aliases || []).map(clean),
    ];

    for (const handle of leader.handles || []) {
        const bare = clean(handle).replace(/^@/, '');
        if (!bare) continue;
        out.push(`@${bare}`);
        out.push(bare.toLowerCase());
    }

    return out.filter(Boolean);
};

const buildLeaderEntity = (leader, { alignment, priority, scope = leader.scope || 'state' }) => ({
    canonical: leader.name,
    type: 'person',
    party: (leader.party || '').toLowerCase() || null,
    role: leader.role || null,
    constituency: leader.constituency || null,
    district: leader.district || null,
    scope,
    alignment,
    priority,
    derived: !!leader.derived,
    aliases: [
        ...new Set([
            ...deriveRosterAliases(leader),
            ...(CURATED_ALIASES[leader.id] || []),
        ]),
    ],
});

const ministerPriority = (leader) => {
    const role = (leader.role || '').toLowerCase();
    if (role.includes('chief minister') && !role.includes('deputy')) return PRIORITY.CHIEF_MINISTER;
    if (role.includes('deputy chief minister')) return PRIORITY.DEPUTY_CM;
    return PRIORITY.CABINET_MINISTER;
};

const oppositionPriority = (leader) => {
    const role = (leader.role || '').toLowerCase();
    if (role.includes('leader of opposition') || (role.includes('president') && !role.includes('working'))) {
        return PRIORITY.OPPOSITION_CHIEF;
    }
    if (role === 'mp' || role.startsWith('mp,')) return PRIORITY.MP;
    if (role === 'mla') return PRIORITY.MLA;
    return PRIORITY.OPPOSITION_SENIOR;
};

/* ─── build the entity graph ────────────────────────────────────────── */

const POLITICAL_ENTITIES = {};

const addLeaders = (leaders, opts) => {
    for (const leader of leaders) {
        if (POLITICAL_ENTITIES[leader.id]) continue;
        POLITICAL_ENTITIES[leader.id] = buildLeaderEntity(leader, {
            alignment: opts.alignment,
            priority: typeof opts.priority === 'function' ? opts.priority(leader) : opts.priority,
            ...(opts.scope ? { scope: opts.scope } : {}),
        });
    }
};

addLeaders(CABINET_MINISTERS, { alignment: 'ally', priority: ministerPriority });
addLeaders(PARTY_ORG_LEADERS, {
    alignment: 'ally',
    priority: (l) => (/state president, bjp/i.test(l.role || '') ? PRIORITY.PARTY_CHIEF : PRIORITY.OPPOSITION_SENIOR),
});
addLeaders(PRESIDING_OFFICERS, { alignment: 'ally', priority: PRIORITY.PRESIDING_OFFICER });
addLeaders(NATIONAL_ALLY_LEADERS, { alignment: 'ally', priority: PRIORITY.NATIONAL_LEADER, scope: 'national' });
addLeaders([...ALLY_MLAS, ...ALLY_MPS], {
    alignment: 'ally',
    priority: (l) => (/^mp/i.test(l.role || '') ? PRIORITY.MP : PRIORITY.MLA),
});
addLeaders(OPPOSITION_LEADERS.filter((l) => l.scope !== 'national'), { alignment: 'opposition', priority: oppositionPriority });
addLeaders(NATIONAL_OPPOSITION_LEADERS, { alignment: 'opposition', priority: PRIORITY.NATIONAL_LEADER, scope: 'national' });

/* ── parties ── */

const buildPartyEntity = (party, alignment, priority) => ({
    canonical: party.full_name || party.name,
    type: 'party',
    party: party.id,
    role: null,
    constituency: null,
    district: null,
    scope: 'state',
    alignment,
    priority,
    derived: false,
    aliases: [
        ...new Set([
            clean(party.name),
            clean(party.full_name),
            ...(party.aliases || []).map(clean),
            ...(PARTY_ALIASES[party.id] || []),
            // The party's own accounts (politicalData merges the verified registry).
            ...(party.handles || []).flatMap((h) => {
                const bare = clean(h).replace(/^@/, '');
                return bare ? [`@${bare}`, bare] : [];
            }),
        ].filter(Boolean)),
    ],
});

POLITICAL_ENTITIES[OUR_PARTY.id] = buildPartyEntity(OUR_PARTY, 'ally', PRIORITY.RULING_PARTY);

for (const party of ALLY_PARTIES) {
    POLITICAL_ENTITIES[party.id] = buildPartyEntity(party, 'ally', PRIORITY.ALLY_PARTY);
}

for (const party of OPPOSITION_PARTIES) {
    POLITICAL_ENTITIES[party.id] = buildPartyEntity(
        party,
        'opposition',
        party.id === 'inc' ? PRIORITY.OPPOSITION_PARTY : PRIORITY.OPPOSITION_SENIOR,
    );
}

/* ── neutral institutions ── */

for (const [key, ent] of Object.entries(NEUTRAL_ENTITIES)) {
    POLITICAL_ENTITIES[key] = { ...ent, derived: false };
}

/* ── the state government ──
 * The client's government as an entity, so "the government", the state's
 * information department and "Goa government" resolve to the ruling camp.
 */
POLITICAL_ENTITIES.state_government = {
    canonical: `Government of ${STATE_NAME}`,
    type: 'government',
    party: 'bjp',
    role: null,
    constituency: null,
    district: null,
    alignment: 'ally',
    scope: 'state',
    priority: PRIORITY.RULING_PARTY,
    derived: false,
    aliases: [
        'government of goa', 'goa government', 'goa govt', 'govt of goa', 'goa sarkar',
        '@dip_goa', 'dip goa', 'directorate of information and publicity goa',
        'गोवा सरकार', 'गोंय सरकार', 'राज्य सरकार',
    ],
};

/* ── government schemes and flagship projects ───────────────────────
 *
 * WHY THESE ARE ENTITIES
 * A post can be squarely about this government without naming a single person
 * ("Griha Aadhar money still not credited for three months"). Without these
 * entries Stage 2 finds ZERO entities, the stance engine has no camp to attach
 * anything to, and the post scores `unrelated` — invisible to every dashboard.
 *
 * ALIGNMENT IS `ally` BUT PRIORITY IS DELIBERATELY LOW (55).
 * A scheme belongs to the government that runs it, so criticism of the scheme
 * is criticism of the client. But a scheme must never outrank a named leader
 * when deciding `primary_target`.
 *
 * ONLY SCHEMES THIS GOVERNMENT OWNS belong here. Contested ISSUES (Mhadei,
 * coal, land conversion, the Arpora fire) are not schemes: filing them under
 * `ally` would score every protest about them as an attack on the protesters'
 * own side. They are handled by the civic/topic lexicons instead.
 */
const GOVERNMENT_SCHEMES = {
    'scheme-griha-aadhar': {
        canonical: 'Griha Aadhar',
        aliases: ['griha aadhar', 'griha adhar', 'graha aadhar', '#grihaaadhar', 'गृह आधार'],
    },
    'scheme-dsss': {
        canonical: 'Dayanand Social Security Scheme',
        aliases: ['dayanand social security', 'dsss', 'dsss pension', 'दयानंद सामाजिक सुरक्षा'],
    },
    'scheme-ladli-laxmi': {
        canonical: 'Ladli Laxmi',
        aliases: ['ladli laxmi', 'ladli lakshmi', 'लाडली लक्ष्मी'],
    },
    'scheme-ddssy': {
        canonical: 'Deen Dayal Swasthya Seva Yojana',
        aliases: ['deen dayal swasthya seva', 'ddssy', 'ddssy card', 'दीनदयाळ स्वास्थ्य सेवा'],
    },
    'scheme-swayampurna-goa': {
        canonical: 'Swayampurna Goa',
        aliases: ['swayampurna goa', 'swayampurna mitra', '#swayampurnagoa', 'स्वयंपूर्ण गोवा'],
    },
    'scheme-viksit-goa': {
        canonical: 'Viksit Goa 2037',
        aliases: ['viksit goa', 'viksit goa 2037', '#viksitgoa', 'विकसित गोवा'],
    },
    'scheme-goa-ai-mission': {
        canonical: 'Goa AI Mission 2027',
        aliases: ['goa ai mission', 'ai mission 2027'],
    },
    'project-mopa-airport': {
        canonical: 'Manohar International Airport, Mopa',
        aliases: ['mopa airport', 'manohar international airport', 'gmr mopa', 'मोपा विमानतळ'],
    },
    'project-kushavati-district': {
        canonical: 'Kushavati District',
        aliases: ['kushavati district', 'third district', 'कुशावती जिल्हा'],
    },
};

for (const [key, scheme] of Object.entries(GOVERNMENT_SCHEMES)) {
    POLITICAL_ENTITIES[key] = {
        canonical: scheme.canonical,
        type: 'scheme',
        party: OUR_PARTY.id,
        role: null,
        constituency: null,
        district: null,
        scope: 'state',
        alignment: 'ally',
        priority: 55,
        derived: false,
        aliases: [...new Set(scheme.aliases.map((a) => String(a).toLowerCase().trim()).filter(Boolean))],
    };
}

/* ─── alias indexes ─────────────────────────────────────────────────── */

/**
 * Minimum alias length. Anything shorter is dropped entirely — a 1-2 character
 * alias matches inside half the words in the language and would poison every
 * downstream resolution.
 */
const MIN_ALIAS_LEN = 3;

/**
 * Build alias → [entityKey, ...]. Unlike a first-writer-wins map this keeps
 * EVERY entity claiming an alias, so the resolver can tell a unique match from
 * an ambiguous one (surnames like "naik" are shared by many entities) and lower
 * its confidence accordingly.
 */
const buildAliasCandidates = () => {
    const candidates = {};

    for (const [key, ent] of Object.entries(POLITICAL_ENTITIES)) {
        for (const alias of ent.aliases || []) {
            const normalized = String(alias).toLowerCase().trim();
            if (normalized.length < MIN_ALIAS_LEN) continue;
            if (!candidates[normalized]) candidates[normalized] = [];
            if (!candidates[normalized].includes(key)) candidates[normalized].push(key);
        }
    }

    // Higher-priority entities first, so ALIAS_INDEX's "primary" answer for an
    // ambiguous alias is the most salient claimant.
    for (const keys of Object.values(candidates)) {
        keys.sort((a, b) => (POLITICAL_ENTITIES[b]?.priority || 0) - (POLITICAL_ENTITIES[a]?.priority || 0));
    }

    return candidates;
};

const ALIAS_CANDIDATES = buildAliasCandidates();

/**
 * Backward-compatible primary alias index: `[{ alias, entityKey, candidates,
 * ambiguous }]`, sorted longest-alias-first so multi-word matches win over
 * shorter substrings.
 */
const buildAliasIndex = () => {
    const entries = [];

    for (const [alias, entityKeys] of Object.entries(ALIAS_CANDIDATES)) {
        const primaryEntity = entityKeys[0];
        if (!primaryEntity) continue;
        entries.push({
            alias,
            entityKey: primaryEntity,
            candidates: [...entityKeys],
            ambiguous: entityKeys.length > 1,
        });
    }

    entries.sort((a, b) => b.alias.length - a.alias.length);
    return entries;
};

const ALIAS_INDEX = buildAliasIndex();

const resolveAliasCandidates = (alias) => {
    const normalized = String(alias || '').toLowerCase().trim();
    if (!normalized) return [];
    return (ALIAS_CANDIDATES[normalized] || []).map((key) => ({
        entityKey: key,
        entity: POLITICAL_ENTITIES[key] || null,
    }));
};

/**
 * Short ASCII aliases need a word boundary, otherwise 'bjp' matches inside
 * 'bjpsupporter' and — worse — 'inc' matches inside 'incident', 'increase',
 * 'including', and 'aap' inside 'aapka'. Non-ASCII aliases (Devanagari) are
 * exempt: those scripts do not use ASCII word characters.
 */
const SHORT_ALIAS_MAX_LEN = 4;
const isShortAsciiAlias = (alias) => alias.length <= SHORT_ALIAS_MAX_LEN && /^[a-z0-9]+$/.test(alias);

/**
 * Phrases in which an alias is NOT the politician/party. They are blanked out
 * before the alias is looked for, so the alias can still match elsewhere in
 * the same text.
 *   inc   — the company suffix ("Apple Inc.")
 *   aap   — Hindi/Konkani "aap" = "you" (aap ka, aap log …)
 *   modi  — other well-known Modis
 *   sardesai — journalist Rajdeep Sardesai, Dilip Sardesai
 */
const ALIAS_BLOCKED_CONTEXTS = {
    // "Apple Inc.", "Acme, Inc", "Foo Inc Ltd": the company suffix, not the party.
    inc: /\binc\.|, ?inc\b|\binc\.? ?(ltd|limited|corp|corporation)\b/g,
    aap: /\baap (ka|ki|ke|kaise|kaisa|log|logon|bhi|se|ko|hi|sab|sabhi|kya|jaise|jaisa|apne|par|toh|to|bolo|batao|dekho|suno|sahi)\b/g,
    modi: /\b(lalit|nirav|mehul|sushil|sameer|nilesh) modi\b/g,
    sardesai: /\b(rajdeep|dilip) sardesai\b/g,
    'सरदेसाई': /(राजदीप|दिलीप) सरदेसाई/g,
    'मोदी': /(ललित|नीरव|मेहुल) मोदी/g,
};

/**
 * Aliases that are also everyday words and only mean the party when written
 * in capitals: "aap" is Hindi/Hinglish for "you" ("aap doobe rahiye"), while
 * the party is written "AAP". Checked against the ORIGINAL-case text.
 */
const CASE_SENSITIVE_ALIASES = {
    aap: /(^|[^A-Za-z0-9_])AAP([^A-Za-z0-9_]|$)/,
};

const aliasOccursIn = (haystackLower, alias, rawText = null) => {
    if (!haystackLower.includes(alias)) return false;
    if (CASE_SENSITIVE_ALIASES[alias] && rawText != null) return CASE_SENSITIVE_ALIASES[alias].test(rawText);
    const blocker = ALIAS_BLOCKED_CONTEXTS[alias];
    if (blocker) {
        haystackLower = haystackLower.replace(blocker, ' ');
        if (!haystackLower.includes(alias)) return false;
    }
    if (!isShortAsciiAlias(alias)) return true;
    return new RegExp(`(?:^|[^a-z0-9_])${alias}(?:[^a-z0-9_]|$)`, 'i').test(haystackLower);
};

/**
 * Find every roster alias occurring in `text`, longest first.
 *
 * Used as a candidate generator by entityResolver — notably to resolve the
 * LLM's own (already translated) actor/target text against the FULL roster.
 *
 * This function does NOT decide the final actor or stance.
 */
const findAliasMatches = (text) => {
    const source = String(text || '').toLowerCase();
    if (!source) return [];

    const matches = [];
    for (const [alias, entityKeys] of Object.entries(ALIAS_CANDIDATES)) {
        if (!aliasOccursIn(source, alias, String(text || ''))) continue;
        matches.push({
            alias,
            entityKeys: [...entityKeys],
            ambiguous: entityKeys.length > 1,
            length: alias.length,
        });
    }

    matches.sort((a, b) => b.length - a.length);
    return matches;
};

/* ─── target universe ───────────────────────────────────────────────── */

/**
 * The "target" is the client leadership the whole sentiment pipeline is
 * measured against: the Chief Minister, and the BJP Goa state president who
 * leads the party organisation. Every ally is still scored on the same side of
 * the matrix; these are the primary client entities for relevance and display.
 */
const PRIMARY_TARGET_KEY = 'pramod-sawant';
const SECONDARY_TARGET_KEY = 'damu-naik';

const TARGET_KEYS = new Set([
    PRIMARY_TARGET_KEY,
    SECONDARY_TARGET_KEY,
]);

const isAlly = (key) => POLITICAL_ENTITIES[key]?.alignment === 'ally';
const isOpposition = (key) => POLITICAL_ENTITIES[key]?.alignment === 'opposition';
const isNeutral = (key) => POLITICAL_ENTITIES[key]?.alignment === 'neutral';
const isPrimaryTarget = (key) => TARGET_KEYS.has(key);

const TARGET_ALIASES = [...TARGET_KEYS]
    .flatMap((key) => POLITICAL_ENTITIES[key]?.aliases || [])
    .map((alias) => alias.toLowerCase());

const isNational = (key) => POLITICAL_ENTITIES[key]?.scope === 'national';
const isState = (key) => POLITICAL_ENTITIES[key]?.scope === 'state';
const getEntity = (key) => (key ? POLITICAL_ENTITIES[key] || null : null);

/**
 * Legacy entity keys used by records and UI filters written before the roster
 * used entity ids. Map them forward instead of losing the row.
 */
const LEGACY_ENTITY_KEYS = {
    bsk: PRIMARY_TARGET_KEY,
    bsk_son: SECONDARY_TARGET_KEY,
    bjp_telangana: OUR_PARTY.id, // "the client party's machinery"
    modi: 'narendra-modi',
    bjp_national: 'bjp',
};

/** Map a possibly-legacy entity key onto its current key. */
const resolveEntityKey = (key) => {
    const k = String(key || '').trim();
    if (!k) return null;
    if (POLITICAL_ENTITIES[k]) return k;
    return LEGACY_ENTITY_KEYS[k] || null;
};

module.exports = {
    POLITICAL_ENTITIES,

    // Alias lookup
    ALIAS_INDEX,
    ALIAS_CANDIDATES,
    resolveAliasCandidates,
    findAliasMatches,
    aliasOccursIn,

    PRIORITY,

    PRIMARY_TARGET_KEY,
    SECONDARY_TARGET_KEY,
    TARGET_KEYS,
    TARGET_ALIASES,

    isAlly,
    isOpposition,
    isNeutral,
    isPrimaryTarget,

    isNational,
    isState,
    getEntity,

    LEGACY_ENTITY_KEYS,
    resolveEntityKey,

    /** Legacy name for the same test, kept so older imports keep working. */
    isBskTarget: isPrimaryTarget,
};
