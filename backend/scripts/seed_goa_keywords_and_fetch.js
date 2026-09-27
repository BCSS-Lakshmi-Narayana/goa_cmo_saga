/**
 * seed_goa_keywords_and_fetch.js
 * ─────────────────────────────────────────────────────────────────────
 * One-shot bootstrap of the Keyword collection for the Goa deployment:
 * leaders, parties, verified handles, campaign hashtags and the issues
 * Goan political posts revolve around — for both camps, so attacks on the
 * government are caught too. Idempotent — re-running is safe.
 *
 * Monitored ACCOUNTS are seeded separately: `npm run seed:sources`.
 *
 * With --fetch, runs grievanceService.fetchKeywordGrievances for an
 * immediate pull instead of waiting for the scheduler.
 *
 *   node backend/scripts/seed_goa_keywords_and_fetch.js
 *   node backend/scripts/seed_goa_keywords_and_fetch.js --fetch
 *   node backend/scripts/seed_goa_keywords_and_fetch.js --fetch --platform x
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const Keyword = require('../src/models/Keyword');

const RUN_FETCH = process.argv.includes('--fetch');
const platformArgIdx = process.argv.indexOf('--platform');
const PLATFORM = platformArgIdx >= 0 ? process.argv[platformArgIdx + 1] : null;

const KEYWORDS = [
    // Client leadership and cabinet (full names only — bare surnames such as
    // "Sawant" or "Naik" are shared by thousands of Goans)
    'Pramod Sawant', 'CM Sawant', 'Goa CM', 'Damu Naik',
    'Vishwajit Rane', 'Mauvin Godinho', 'Rohan Khaunte', 'Babush Monserrate',
    'Subhash Shirodkar', 'Subhash Phal Dessai', 'Sudin Dhavalikar', 'Nilkanth Halarnkar',
    'Digambar Kamat', 'Ramesh Tawadkar', 'Michael Lobo', 'Shripad Naik',

    // Parties
    'BJP Goa', 'Goa BJP', 'MGP', 'Goa Congress', 'AAP Goa', 'Goa Forward', 'Revolutionary Goans',

    // Opposition leaders (so attacks on the government are caught)
    'Yuri Alemao', 'Girish Chodankar', 'Viriato Fernandes', 'Vijai Sardesai',
    'Valmiki Naik', 'Venzy Viegas', 'Viresh Borkar',

    // Verified handles
    '@DrPramodPSawant', '@goacm', '@BJP4Goa', '@DamuNaik', '@INCGoa', '@AAPGoa',
    '@Goaforwardparty', '@Yurialemao9', '@VijaiSardesai',

    // Campaign hashtags with evidence of real use
    '#ViksitGoa', '#SaveMhadei', '#SaveMollem',

    // Issues and schemes
    'Mhadei', 'Mopa airport', 'Goa mining', 'land conversion', 'cash for jobs',
    'Griha Aadhar', 'Ladli Laxmi', 'Dayanand Social Security', 'Kushavati',
    'Goa assembly', 'Goa government',

    // Devanagari (Marathi / Konkani press)
    'प्रमोद सावंत', 'मुख्यमंत्री सावंत', 'भाजप', 'काँग्रेस', 'म्हादई', 'गोवा सरकार',
];

async function upsertKeywords() {
    let added = 0, reactivated = 0, kept = 0;
    for (const raw of KEYWORDS) {
        const kw = String(raw).trim();
        if (!kw) continue;
        let kind = 'keyword';
        if (kw.startsWith('@')) kind = 'handle';
        else if (kw.startsWith('#')) kind = 'hashtag';

        const existing = await Keyword.findOne({ keyword: kw, kind });
        if (existing) {
            if (!existing.is_active) {
                existing.is_active = true;
                await existing.save();
                reactivated += 1;
            } else {
                kept += 1;
            }
            continue;
        }
        await Keyword.create({
            keyword: kw,
            kind,
            category: 'other',
            language: 'all',
            is_party_wide: true,
            is_active: true,
            owner_user_id: 'system_seed',
            weight: 5,
        });
        added += 1;
    }
    return { added, reactivated, kept };
}

async function main() {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing');
    const dbName = process.env.DB_NAME ? String(process.env.DB_NAME).trim() : undefined;
    await mongoose.connect(process.env.MONGODB_URI, dbName ? { dbName } : undefined);
    console.log(`[seed-goa] connected (db=${dbName || 'default'})`);

    const summary = await upsertKeywords();
    console.log('[seed-goa] keywords:', summary);

    if (RUN_FETCH) {
        const grievanceService = require('../src/services/grievanceService');
        console.log(`[seed-goa] running fetchKeywordGrievances(${PLATFORM ? `'${PLATFORM}'` : 'null /* ALL platforms */'})`);
        const t0 = Date.now();
        try {
            const result = await grievanceService.fetchKeywordGrievances(PLATFORM);
            console.log('[seed-goa] fetch result:', result, 'ms:', Date.now() - t0);
        } catch (err) {
            console.error('[seed-goa] fetch failed:', err.message);
        }
    } else {
        console.log('[seed-goa] (skip fetch — re-run with --fetch to pull content immediately)');
    }

    await mongoose.disconnect();
    console.log('[seed-goa] done');
}

main().catch((err) => { console.error('[seed-goa] failed:', err); process.exit(1); });
