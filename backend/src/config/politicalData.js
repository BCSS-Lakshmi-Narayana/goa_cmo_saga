/**
 * Political Data — single source of truth for the Goa political universe.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Client: the BJP government of Goa (CM Dr. Pramod Sawant). Roster verified as
 * of 25 Sep 2026 — see data/goa_voter_profiles.json `data_sources` and the
 * research notes in the repo docs.
 *
 *   ALLY / "ours"  : BJP, MGP (NDA partner, 2 seats) and the three Independents
 *                    who support the government (Bicholim, Cortalim, Curtorim).
 *   OPPOSITION     : INC (Leader of Opposition Yuri Alemao), AAP, Goa Forward
 *                    Party (GFP) and Revolutionary Goans Party (RGP). AAP and
 *                    GFP announced a "Goa First" alliance on 13 Sep 2026.
 *
 * ⚠ ALIGNMENT IS STATE-SPECIFIC. The same codebase has served deployments where
 *   BJP was the opposition, or a junior ally. Never copy an alignment table
 *   between deployments — re-derive it per state.
 *
 * Used by:
 *   - config/politicalEntities.js   (derives the alias/alignment entity graph)
 *   - config/deployment.js          (prompt phrasing of the two camps)
 *   - services/politicalContextService.js (Stage 2 deterministic entity scan)
 *   - services/politicalSentimentService.js (Stage 3 prompt context)
 *   - services/stanceEngine.js      (Stage 4 ally/opposition decision matrix)
 *
 * Adding or removing a leader here automatically flows through detection,
 * prompting, stance resolution and storage — no other file needs editing.
 * (Native-script aliases are the one exception: add those in
 * politicalEntities.js `CURATED_ALIASES`, keyed by the `id` used here.)
 */

const VOTER_PROFILES = require('../data/goa_voter_profiles.json');

const normalizeHandle = (h) => String(h || '').trim().replace(/^@/, '').toLowerCase();

/**
 * Verified X / Instagram / Facebook accounts (data/goa_leader_handles.json,
 * with status and evidence per handle). Merged into every leader and party
 * below, so a leader is recognised when a post tags them AND when they are the
 * post's author — which is what the stance engine's author-is-target
 * correction and cross-camp prior depend on.
 */
const HANDLE_REGISTRY = require('../data/goa_leader_handles.json');
const registryHandles = (entries) => (entries || []).map((e) => `@${e.handle}`);
const mergeHandles = (...lists) => {
    const seen = new Set();
    const out = [];
    for (const h of lists.flat()) {
        const k = normalizeHandle(h);
        if (k && !seen.has(k)) { seen.add(k); out.push(h.startsWith('@') ? h : `@${h}`); }
    }
    return out;
};

/** Assembly-constituency key: strips any "(SC)"/"(ST)" reservation suffix and
 *  punctuation, so "PERNEM (SC)" === "Pernem" and "St. Andre" === "ST ANDRE". */
const acKey = (s) => String(s || '')
    .toLowerCase()
    .replace(/\((?:sc|st)\)/g, '')
    .replace(/[^a-z0-9]/g, '');

const nameKey = (s) => String(s || '')
    .toLowerCase()
    .replace(/\b(?:dr|doctor|sri|smt|shri|capt|captain|adv|engr)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Results data spells parties out in full; the roster uses short codes. */
const normalizeParty = (p) => {
    const v = String(p || '').trim();
    if (/^bharatiya\s*janata/i.test(v)) return 'BJP';
    if (/^maharashtrawadi\s*gomantak/i.test(v)) return 'MGP';
    if (/^indian\s*national\s*congress/i.test(v)) return 'INC';
    if (/^aam\s*aadmi/i.test(v)) return 'AAP';
    if (/^goa\s*forward/i.test(v)) return 'GFP';
    if (/^revolutionary\s*goans/i.test(v)) return 'RGP';
    if (/^independent$/i.test(v)) return 'IND';
    return v.toUpperCase();
};

const ALLY_PARTY_CODES = ['BJP', 'MGP'];

/**
 * Independents have no party alignment of their own, so their side comes from
 * the roster's `alliance` field (NDA = supports the government).
 */
const sideForParty = (party, alliance) => {
    const code = normalizeParty(party);
    if (ALLY_PARTY_CODES.includes(code)) return 'ours';
    if (code === 'IND') return String(alliance || '').toUpperCase() === 'NDA' ? 'ours' : 'opposition';
    return 'opposition';
};

/** Current district of an AC, from the roster (Goa gained Kushavati in Dec 2025). */
const DISTRICT_BY_AC = new Map(
    VOTER_PROFILES.map((row) => [acKey(row.constituency), row.district || '']),
);
const districtFor = (constituency, fallback = '') =>
    DISTRICT_BY_AC.get(acKey(constituency)) || fallback;

const tagLeaders = (leaders, party, side) =>
    leaders.map((l) => {
        const handles = mergeHandles(l.handles || [], registryHandles(HANDLE_REGISTRY.people[l.id]));
        const primary_handle = handles[0] || '';
        return {
            ...l,
            district: l.constituency ? districtFor(l.constituency, l.district || '') : (l.district || ''),
            party: l.party || party,
            side: l.side || side,
            handles,
            primary_handle,
            primary_handle_normalized: normalizeHandle(primary_handle),
            handles_normalized: handles.map(normalizeHandle).filter(Boolean),
        };
    });

// ─────────────────────────────────────────────────────────
// PARTIES
// ─────────────────────────────────────────────────────────

const OUR_PARTY = {
    id: 'bjp',
    name: 'BJP',
    full_name: 'Bharatiya Janata Party',
    aliases: ['BJP', 'BJP Goa', 'Goa BJP', 'Bharatiya Janata Party', 'Bharatiya Janta Party', 'Lotus party', 'Saffron party'],
    alliance: 'NDA',
    role: 'ruling',
    state: 'Goa',
    chief: 'Dr. Pramod Sawant',
    state_president: 'Damu Naik',
    symbol: 'Lotus',
    handles: ['@BJP4Goa'],
};

/**
 * Coalition partners. Attacking or praising them lands on the SAME side of the
 * matrix as the client's own party — the NDA governs Goa jointly.
 */
const ALLY_PARTIES = [
    {
        id: 'mgp',
        name: 'MGP',
        full_name: 'Maharashtrawadi Gomantak Party',
        aliases: ['MGP', 'Maharashtrawadi Gomantak', 'Maharashtrawadi Gomantak Party', 'Magopa', 'Lion symbol party'],
        alliance: 'NDA',
        president: 'Deepak Dhavalikar',
        symbol: 'Lion',
    },
];

// ─────────────────────────────────────────────────────────
// CABINET — Second Pramod Sawant ministry (CM + 10 ministers; one berth vacant
// since Ravi Naik's death on 14 Oct 2025). Last reshuffle 21 Aug 2025
// (Digambar Kamat and Ramesh Tawadkar inducted).
//
// Handles: only those independently verified (profile bio names the office, or
// an official account such as @goacm tags it). The rest are left EMPTY rather
// than guessed — a wrong handle silently mis-attributes every post from it.
// ─────────────────────────────────────────────────────────
const _CABINET_RAW = [
    { id: 'pramod-sawant', name: 'Dr. Pramod Sawant', shortName: 'Pramod Sawant', aliases: ['Pramod Sawant', 'Dr Pramod Sawant', 'CM Sawant', 'Goa CM', 'Chief Minister Sawant', 'Pramod Pandurang Sawant'], role: 'Chief Minister', portfolios: ['Home', 'Finance', 'Personnel', 'Vigilance', 'Official Language', 'Education', 'Law & Judiciary', 'Environment', 'All unallocated departments'], constituency: 'Sanquelim', party: 'BJP', handles: ['@DrPramodPSawant', '@goacm'] },
    { id: 'vishwajit-rane', name: 'Vishwajit Pratapsingh Rane', shortName: 'Vishwajit Rane', aliases: ['Vishwajit Rane', 'Vishwajeet Rane', 'Health Minister Rane'], role: 'Minister for Health, Urban Development, Town & Country Planning, Women & Child Development, Forests', constituency: 'Valpoi', party: 'BJP', handles: ['@visrane'] },
    { id: 'subhash-shirodkar', name: 'Subhash Shirodkar', shortName: 'Subhash Shirodkar', aliases: ['Subhash Shirodkar'], role: 'Minister for Water Resources, Co-operation, Provedoria', constituency: 'Siroda', party: 'BJP', handles: ['@subhashshirodkr'] },
    { id: 'mauvin-godinho', name: 'Mauvin Godinho', shortName: 'Mauvin Godinho', aliases: ['Mauvin Godinho', 'Godinho'], role: 'Minister for Transport, Industries, Panchayati Raj, Protocol', constituency: 'Dabolim', party: 'BJP', handles: ['@MauvinGodinho'] },
    { id: 'rohan-khaunte', name: 'Rohan Khaunte', shortName: 'Rohan Khaunte', aliases: ['Rohan Khaunte', 'Khaunte', 'Tourism Minister Khaunte'], role: 'Minister for Tourism, Information Technology, Printing & Stationery', constituency: 'Porvorim', party: 'BJP', handles: ['@RohanKhaunte'] },
    { id: 'babush-monserrate', name: 'Atanasio Monserrate', shortName: 'Babush Monserrate', aliases: ['Babush', 'Babush Monserrate', 'Atanasio Monserrate', 'Atanasio Babush Monserrate'], role: 'Minister for Revenue, Labour & Employment, Waste Management', constituency: 'Panaji', party: 'BJP', handles: ['@babushofficial'] },
    { id: 'subhash-phal-dessai', name: 'Subhash Phal Dessai', shortName: 'Subhash Phal Dessai', aliases: ['Subhash Phal Dessai', 'Subhash Phal Desai', 'Phal Dessai', 'Subhash Faldesai'], role: 'Minister for Social Welfare, Drinking Water, River Navigation, Empowerment of Persons with Disabilities', constituency: 'Sanguem', party: 'BJP', handles: ['@SubhashGoa', '@S_Phal_Dessai'] },
    { id: 'sudin-dhavalikar', name: 'Sudin Dhavalikar', shortName: 'Sudin Dhavalikar', aliases: ['Sudin Dhavalikar', 'Ramkrishna Sudin Dhavalikar', 'Power Minister Dhavalikar'], role: 'Minister for Power, New & Renewable Energy, Museums', constituency: 'Marcaim', party: 'MGP', handles: ['@SudinDhavalikar'] },
    { id: 'nilkanth-halarnkar', name: 'Nilkanth Halarnkar', shortName: 'Nilkanth Halarnkar', aliases: ['Nilkanth Halarnkar', 'Nilkant Halarnkar', 'Halarnkar'], role: 'Minister for Fisheries, Animal Husbandry & Veterinary Services, Factories & Boilers', constituency: 'Tivim', party: 'BJP', handles: ['@NilkantHalarnk1'] },
    { id: 'digambar-kamat', name: 'Digambar Kamat', shortName: 'Digambar Kamat', aliases: ['Digambar Kamat', 'Digu Kamat', 'Former CM Kamat'], role: 'Minister for Public Works, Captain of Ports, Legal Metrology', constituency: 'Margao', party: 'BJP', handles: ['@digambarkamat'] },
    { id: 'ramesh-tawadkar', name: 'Dr. Ramesh Tawadkar', shortName: 'Ramesh Tawadkar', aliases: ['Ramesh Tawadkar', 'Tawadkar'], role: 'Minister for Sports & Youth Affairs, Art & Culture, Tribal Welfare', constituency: 'Canacona', party: 'BJP', handles: ['@ramesh_tawadkar'] },
];

/** Presiding officers — BJP members, so they sit on our side of the matrix. */
const _PRESIDING_OFFICERS_RAW = [
    { id: 'ganesh-gaonkar', name: 'Ganesh Gaonkar', shortName: 'Ganesh Gaonkar', aliases: ['Ganesh Gaunker', 'Speaker Gaonkar'], role: 'Speaker, Goa Legislative Assembly', constituency: 'Sanvordem', party: 'BJP', handles: [] },
    { id: 'joshua-de-souza', name: 'Joshua de Souza', shortName: 'Joshua de Souza', aliases: ["Joshua D'Souza", 'Joshua De Souza', 'Joshua Peter de Souza'], role: 'Deputy Speaker, Goa Legislative Assembly', constituency: 'Mapusa', party: 'BJP', handles: [] },
];

/** BJP Goa organisation — not MLAs, so the roster JSON cannot supply them. */
const _PARTY_ORG_RAW = [
    { id: 'damu-naik', name: 'Damu Naik', shortName: 'Damu Naik', aliases: ['Damodar Naik', 'Damodar G Naik', 'BJP Goa president'], role: 'State President, BJP Goa', constituency: '', party: 'BJP', handles: ['@DamuNaik'] },
    { id: 'sidharth-kuncalienker', name: 'Sidharth Kuncalienker', shortName: 'Sidharth Kuncalienker', aliases: ['Siddharth Kuncolienkar'], role: 'State General Secretary, BJP Goa', constituency: '', party: 'BJP', handles: [] },
    { id: 'sarvanand-bhagat', name: 'Sarvanand Bhagat', shortName: 'Sarvanand Bhagat', role: 'State General Secretary, BJP Goa', constituency: '', party: 'BJP', handles: [] },
    { id: 'deepak-dhavalikar', name: 'Deepak Dhavalikar', shortName: 'Deepak Dhavalikar', role: 'MGP President', constituency: '', party: 'MGP', handles: [] },
];

// ─────────────────────────────────────────────────────────
// OPPOSITION — hand-curated leaders (MLAs among them are skipped by the
// derived roster below, so nobody becomes two entities).
// ─────────────────────────────────────────────────────────
const _INC_LEADERS_RAW = [
    { id: 'yuri-alemao', name: 'Yuri Alemao', shortName: 'Yuri Alemao', aliases: ['LoP Yuri', 'LoP Alemao', 'Leader of Opposition Alemao'], role: 'Leader of Opposition; Congress Legislature Party leader', constituency: 'Cuncolim', party: 'INC', handles: ['@Yurialemao9'] },
    { id: 'girish-chodankar', name: 'Girish Chodankar', shortName: 'Girish Chodankar', aliases: ['Chodankar', 'GPCC president'], role: 'President, Goa Pradesh Congress Committee', constituency: '', party: 'INC', handles: ['@girishgoaINC'] },
    { id: 'amit-patkar', name: 'Amit Patkar', shortName: 'Amit Patkar', role: 'Senior Congress leader; former GPCC President', constituency: '', party: 'INC', handles: ['@amitspatkar'] },
    { id: 'mk-shaikh', name: 'M. K. Shaikh', shortName: 'M K Shaikh', aliases: ['MK Shaikh'], role: 'GPCC Working President', constituency: '', party: 'INC', handles: ['@MKShaikGoa'] },
    { id: 'carlos-alvares-ferreira', name: 'Carlos Alvares Ferreira', shortName: 'Carlos Ferreira', aliases: ['Carlos Ferreira', 'Adv Carlos Ferreira'], role: 'MLA; GPCC Working President', constituency: 'Aldona', party: 'INC', handles: ['@carlosgoa25'] },
    { id: 'altone-dcosta', name: "Altone D'Costa", shortName: "Altone D'Costa", aliases: ['Altone DCosta'], role: 'MLA; GPCC Working President', constituency: 'Quepem', party: 'INC', handles: ['@altone_d'] },
    { id: 'viriato-fernandes', name: 'Capt. Viriato Fernandes', shortName: 'Viriato Fernandes', aliases: ['Viriato Fernandes', 'Capt Viriato', 'Captain Viriato Fernandes'], role: 'MP, South Goa (Lok Sabha)', constituency: 'South Goa', party: 'INC', handles: ['@ViriatoFern'] },
    { id: 'ramakant-khalap', name: 'Ramakant Khalap', shortName: 'Ramakant Khalap', role: 'Senior Congress leader; former Union Minister', constituency: '', party: 'INC', handles: [] },
    { id: 'francisco-sardinha', name: 'Francisco Sardinha', shortName: 'Francisco Sardinha', role: 'Senior Congress leader; former Chief Minister', constituency: '', party: 'INC', handles: [] },
];

const _AAP_LEADERS_RAW = [
    { id: 'valmiki-naik', name: 'Valmiki Naik', shortName: 'Valmiki Naik', aliases: ['AAP Goa president'], role: 'State President, AAP Goa', constituency: '', party: 'AAP', handles: ['@ValmikiNaik'] },
    { id: 'venzy-viegas', name: 'Capt. Venzy Viegas', shortName: 'Venzy Viegas', aliases: ['Venzy Viegas', 'Capt Venzy'], role: 'MLA; AAP legislature party leader', constituency: 'Benaulim', party: 'AAP', handles: ['@VenzyViegas'] },
    { id: 'cruz-silva', name: 'Cruz Silva', shortName: 'Cruz Silva', aliases: ['Engr Cruz Silva'], role: 'MLA', constituency: 'Velim', party: 'AAP', handles: ['@CruzSilvaVelim'] },
];

const _GFP_LEADERS_RAW = [
    { id: 'vijai-sardesai', name: 'Vijai Sardesai', shortName: 'Vijai Sardesai', aliases: ['Vijay Sardesai', 'GFP chief'], role: 'President, Goa Forward Party; MLA', constituency: 'Fatorda', party: 'GFP', handles: ['@VijaiSardesai'] },
];

const _RGP_LEADERS_RAW = [
    { id: 'viresh-borkar', name: 'Viresh Borkar', shortName: 'Viresh Borkar', role: 'National President, RGP; MLA', constituency: 'St. Andre', party: 'RGP', handles: ['@Viresh_Borkar'] },
    { id: 'manoj-parab', name: 'Manoj Parab', shortName: 'Manoj Parab', aliases: ['RGP founder'], role: 'RGP founder; former president (resigned May 2026)', constituency: '', party: 'RGP', handles: [] },
    { id: 'shavina-shirodkar', name: 'Shavina Shirodkar', shortName: 'Shavina Shirodkar', role: 'State President, RGP', constituency: '', party: 'RGP', handles: [] },
];

// ─────────────────────────────────────────────────────────
// NATIONAL figures frequently named in Goa political chat.
// ─────────────────────────────────────────────────────────
const _NATIONAL_ALLY_RAW = [
    { id: 'narendra-modi', name: 'Narendra Modi', shortName: 'Modi', aliases: ['Modi', 'Modi ji', 'PM Modi', 'Prime Minister Modi'], role: 'Prime Minister of India', constituency: 'Varanasi', party: 'BJP', scope: 'national', handles: ['@narendramodi', '@PMOIndia'] },
    { id: 'amit-shah', name: 'Amit Shah', shortName: 'Amit Shah', aliases: ['HM Shah'], role: 'Union Home Minister', constituency: 'Gandhinagar', party: 'BJP', scope: 'national', handles: ['@AmitShah'] },
    { id: 'nitin-nabin', name: 'Nitin Nabin', shortName: 'Nitin Nabin', role: 'BJP National President', constituency: '', party: 'BJP', scope: 'national', handles: ['@NitinNabin'] },
];

const _NATIONAL_OPPOSITION_RAW = [
    { id: 'rahul-gandhi', name: 'Rahul Gandhi', shortName: 'Rahul Gandhi', aliases: [], role: 'Leader of Opposition, Lok Sabha', constituency: 'Rae Bareli', party: 'INC', scope: 'national', handles: ['@RahulGandhi'] },
    { id: 'mallikarjun-kharge', name: 'Mallikarjun Kharge', shortName: 'Kharge', role: 'AICC President', constituency: '', party: 'INC', scope: 'national', handles: ['@kharge'] },
    { id: 'arvind-kejriwal', name: 'Arvind Kejriwal', shortName: 'Kejriwal', role: 'AAP National Convenor', constituency: '', party: 'AAP', scope: 'national', handles: ['@ArvindKejriwal'] },
    { id: 'atishi', name: 'Atishi', shortName: 'Atishi', aliases: ['Atishi Marlena'], role: 'AAP Goa in-charge', constituency: '', party: 'AAP', scope: 'national', handles: ['@AtishiAAP'] },
];

// ─────────────────────────────────────────────────────────
// MEMBERS OF PARLIAMENT — mirrored in frontend/src/data/goaMPs.js (ESM, not
// requirable here). Keep the two in sync.
// ─────────────────────────────────────────────────────────
const _MPS_RAW = [
    { id: 'mp-north-goa', name: 'Shripad Yesso Naik', shortName: 'Shripad Naik', aliases: ['Shripad Naik', 'Union Minister Shripad Naik'], constituency: 'North Goa', role: 'MP, North Goa (Lok Sabha); Union Minister of State', party: 'BJP', handles: ['@shripadynaik'] },
    { id: 'mp-rajya-sabha-goa', name: 'Sadanand Shet Tanavade', shortName: 'Sadanand Tanavade', aliases: ['Sadanand Tanawade', 'Sadanand Shet Tanawde'], constituency: 'Goa', role: 'MP, Rajya Sabha', party: 'BJP', handles: ['@ShetSadanand'] },
    // South Goa's MP, Capt. Viriato Fernandes (INC), is curated under _INC_LEADERS_RAW.
];

// ─────────────────────────────────────────────────────────
// AUTO-DERIVED MLA ROSTER — every sitting MLA not curated above.
//
// Source: data/goa_voter_profiles.json. Vacant seats (mla null) are skipped.
// Party is the CURRENT one — the eight 2022 Congress MLAs who joined BJP in
// Sep 2022 are BJP here — and Independents take their side from `alliance`.
//
// LIMITATION: derived entries get English-script aliases only. Native-script
// aliases exist only for the entities in politicalEntities.js CURATED_ALIASES.
// ─────────────────────────────────────────────────────────

const ALL_CURATED_RAW = [
    ..._CABINET_RAW, ..._PRESIDING_OFFICERS_RAW, ..._PARTY_ORG_RAW,
    ..._INC_LEADERS_RAW, ..._AAP_LEADERS_RAW, ..._GFP_LEADERS_RAW, ..._RGP_LEADERS_RAW,
];

const CURATED_AC_KEYS = new Set(ALL_CURATED_RAW.map((l) => acKey(l.constituency)).filter(Boolean));
const CURATED_NAME_KEYS = new Set(
    ALL_CURATED_RAW
        .flatMap((l) => [l.name, l.shortName, ...(l.aliases || [])])
        .map(nameKey)
        .filter(Boolean),
);

/** "Jit Arolkar" → "Arolkar Jit". Only for two-token names. */
const reversedName = (name) => {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length !== 2) return null;
    return `${parts[1]} ${parts[0]}`;
};

/** Title-case names that arrive in ALL CAPS; leave mixed-case names untouched. */
const tidyName = (raw) => {
    const s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s || /[a-z]/.test(s)) return s;
    return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
};

const buildDerivedMlas = () => {
    const out = [];
    const seenNameKeys = new Set();

    for (const row of VOTER_PROFILES) {
        const mla = row && row.mla;
        if (!mla || !mla.name) continue;

        const ac = acKey(row.constituency);
        const nk = nameKey(mla.name);

        if (CURATED_AC_KEYS.has(ac) || CURATED_NAME_KEYS.has(nk)) continue;
        if (seenNameKeys.has(nk)) continue;
        seenNameKeys.add(nk);

        const party = normalizeParty(mla.party);
        const cleanName = tidyName(String(mla.name).replace(/^(?:Dr\.?|Doctor|Adv\.?|Capt\.?)\s*/i, '').trim());
        const rev = reversedName(cleanName);

        out.push({
            id: `mla-${row.ac_number || 'x'}-${ac}`,
            name: cleanName,
            shortName: cleanName,
            aliases: rev ? [rev] : [],
            role: 'MLA',
            constituency: String(row.constituency || '').replace(/\s*\((?:SC|ST)\)\s*/i, '').trim(),
            district: row.district || '',
            ac_number: row.ac_number || null,
            party,
            side: sideForParty(party, mla.alliance),
            derived: true,
            handles: registryHandles(HANDLE_REGISTRY.people[`ac:${ac}`]),
        });
    }

    return out;
};

const DERIVED_MLAS = buildDerivedMlas();

// ─────────────────────────────────────────────────────────
// TAGGED COLLECTIONS
// ─────────────────────────────────────────────────────────

const CABINET_MINISTERS = tagLeaders(_CABINET_RAW, 'BJP', 'ours');
const PRESIDING_OFFICERS = tagLeaders(_PRESIDING_OFFICERS_RAW, 'BJP', 'ours');
const PARTY_ORG_LEADERS = tagLeaders(_PARTY_ORG_RAW, 'BJP', 'ours');
const NATIONAL_ALLY_LEADERS = tagLeaders(_NATIONAL_ALLY_RAW, 'BJP', 'ours');
const NATIONAL_OPPOSITION_LEADERS = tagLeaders(_NATIONAL_OPPOSITION_RAW, 'INC', 'opposition');

const ALLY_MLAS = tagLeaders(DERIVED_MLAS.filter((m) => m.side === 'ours'), 'BJP', 'ours');
const OPPOSITION_MLAS = tagLeaders(DERIVED_MLAS.filter((m) => m.side === 'opposition'), 'IND', 'opposition');

const MPS = tagLeaders(
    _MPS_RAW.map((m) => ({ ...m, district: '', side: sideForParty(m.party) })),
    'BJP',
    'ours',
);
const ALLY_MPS = MPS.filter((m) => m.side === 'ours');
const OPPOSITION_MPS = MPS.filter((m) => m.side === 'opposition');

const INC_LEADERS = tagLeaders(_INC_LEADERS_RAW, 'INC', 'opposition');
const AAP_LEADERS = tagLeaders(_AAP_LEADERS_RAW, 'AAP', 'opposition');
const GFP_LEADERS = tagLeaders(_GFP_LEADERS_RAW, 'GFP', 'opposition');
const RGP_LEADERS = tagLeaders(_RGP_LEADERS_RAW, 'RGP', 'opposition');

const OUR_LEADERS = [
    ...CABINET_MINISTERS,
    ...PRESIDING_OFFICERS,
    ...PARTY_ORG_LEADERS,
    ...NATIONAL_ALLY_LEADERS,
    ...ALLY_MLAS,
    ...ALLY_MPS,
];

const byParty = (code) => (l) => normalizeParty(l.party) === code;

const OPPOSITION_PARTIES = [
    {
        id: 'inc',
        name: 'INC',
        full_name: 'Indian National Congress',
        aliases: ['Congress', 'INC', 'Goa Congress', 'INC Goa', 'GPCC', 'Indian National Congress', 'Hand symbol party'],
        alliance: 'INDIA',
        handles: ['@INCGoa'],
        leaders: [...INC_LEADERS, ...OPPOSITION_MLAS.filter(byParty('INC')), ...OPPOSITION_MPS.filter(byParty('INC')),
            ...NATIONAL_OPPOSITION_LEADERS.filter(byParty('INC'))],
    },
    {
        id: 'aap',
        name: 'AAP',
        full_name: 'Aam Aadmi Party',
        aliases: ['AAP', 'AAP Goa', 'Aam Aadmi Party', 'Broom party'],
        alliance: 'Goa First (with GFP)',
        handles: ['@AAPGoa'],
        leaders: [...AAP_LEADERS, ...OPPOSITION_MLAS.filter(byParty('AAP')),
            ...NATIONAL_OPPOSITION_LEADERS.filter(byParty('AAP'))],
    },
    {
        id: 'gfp',
        name: 'GFP',
        full_name: 'Goa Forward Party',
        aliases: ['GFP', 'Goa Forward', 'Goa Forward Party'],
        alliance: 'Goa First (with AAP)',
        handles: ['@Goaforwardparty'],
        leaders: [...GFP_LEADERS, ...OPPOSITION_MLAS.filter(byParty('GFP'))],
    },
    {
        id: 'rgp',
        name: 'RGP',
        full_name: 'Revolutionary Goans Party',
        aliases: ['RGP', 'Revolutionary Goans', 'Revolutionary Goans Party'],
        alliance: 'None',
        handles: [],
        leaders: [...RGP_LEADERS, ...OPPOSITION_MLAS.filter(byParty('RGP'))],
    },
];

/** Opposition-leaning Independents have no party entity; they still need a camp. */
const OTHER_OPPOSITION_LEADERS = OPPOSITION_MLAS.filter(byParty('IND'));

const OPPOSITION_LEADERS = [
    ...OPPOSITION_PARTIES.flatMap((p) => p.leaders),
    ...OTHER_OPPOSITION_LEADERS,
];

const ALL_LEADERS = [...OUR_LEADERS, ...OPPOSITION_LEADERS];

// Party accounts from the verified registry (parties without an entry keep theirs).
for (const party of [OUR_PARTY, ...ALLY_PARTIES, ...OPPOSITION_PARTIES]) {
    party.handles = mergeHandles(party.handles || [], registryHandles(HANDLE_REGISTRY.parties[party.id]));
}

module.exports = {
    // Meta
    OUR_PARTY,
    ALLY_PARTIES,
    OPPOSITION_PARTIES,
    // Tagged collections
    CABINET_MINISTERS,
    PRESIDING_OFFICERS,
    PARTY_ORG_LEADERS,
    NATIONAL_ALLY_LEADERS,
    NATIONAL_OPPOSITION_LEADERS,
    ALLY_MLAS,
    OPPOSITION_MLAS,
    ALLY_MPS,
    OPPOSITION_MPS,
    INC_LEADERS,
    AAP_LEADERS,
    GFP_LEADERS,
    RGP_LEADERS,
    OUR_LEADERS,
    OPPOSITION_LEADERS,
    ALL_LEADERS,
    // Helpers
    normalizeHandle,
    normalizeParty,
    sideForParty,
    acKey,
    nameKey,
};
