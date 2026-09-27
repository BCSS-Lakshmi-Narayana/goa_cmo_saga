/**
 * GOA LOCATION DATABASE — geo detection layer.
 *
 * Built from data/goa_geo.json (3 districts incl. Kushavati, created 31 Dec
 * 2025; 12 talukas; towns with Konkani/Marathi/Portuguese-era aliases; ~150
 * villages) and data/goa_mlas.json (the 40 assembly constituencies).
 */

const GEO = require('../data/goa_geo.json');
const MLAS = require('../data/goa_mlas.json');

const STATE_NAME = 'Goa';

const lower = (s) => String(s || '').toLowerCase().trim();
const stripReserved = (s) => String(s || '').replace(/\s*\((?:sc|st)\)\s*/i, '').trim();

/** Current districts, plus the retired pre-2025 names still used in posts. */
const DISTRICTS = [
    ...GEO.districts.map((d) => lower(d.name)),
    'north goa district', 'south goa district', 'kushavati district', 'uttar goa', 'dakshin goa',
];

const TALUKAS = GEO.talukas.map((t) => lower(t.name));

const CONSTITUENCIES = MLAS.map((m) => lower(stripReserved(m.constituency)));

const CITIES_AND_VILLAGES = [
    ...GEO.towns.flatMap((t) => [t.name, ...(t.aliases || [])]).map(lower),
    ...GEO.villages_and_localities.map((v) => lower(v.name)),
    // State references
    'goa', 'state of goa', 'govt of goa', 'government of goa', 'goa state', 'goem', 'goenchem',
    'गोवा', 'गोंय',
];

const ALL_LOCATIONS = new Set();

const addToSet = (arr) => {
    for (const item of arr) {
        const l = lower(item);
        if (l) ALL_LOCATIONS.add(l);
        const clean = l.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
        if (clean) ALL_LOCATIONS.add(clean);
    }
};

addToSet(DISTRICTS);
addToSet(TALUKAS);
addToSet(CONSTITUENCIES);
addToSet(CITIES_AND_VILLAGES);

/** Words that identify a Goa location even inside a longer label. Latin
 * anchors must be whole words ("goa", "goan"), so "goal" and "Goalpara" do not
 * count as Goa. */
const ANCHORS = ['goa', 'goan', 'panaji', 'panjim', 'margao', 'madgaon', 'mapusa', 'vasco', 'mormugao',
    'ponda', 'kushavati', 'salcete', 'bardez', 'tiswadi', 'गोवा', 'गोंय'];
const ANCHOR_RX = new RegExp(
    `(?<![a-z])(${ANCHORS.filter((a) => /[a-z]/.test(a)).join('|')})(?![a-z])`,
);
const DEVANAGARI_ANCHORS = ANCHORS.filter((a) => !/[a-z]/.test(a));

/** Goa village names that are also common words or places elsewhere (Bali,
 * Indonesia; "pale"). They count only when the label also names Goa. */
const AMBIGUOUS_NAMES = new Set(['bali', 'pale']);

/**
 * True when a location name belongs to Goa. Used to keep dashboards and
 * filters to in-state places when geo-tagging also picks up other states.
 */
const isStateLocation = (name) => {
    if (!name || typeof name !== 'string') return false;
    const l = lower(name);
    const clean = l.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!AMBIGUOUS_NAMES.has(clean) && (ALL_LOCATIONS.has(l) || ALL_LOCATIONS.has(clean))) return true;
    return ANCHOR_RX.test(l) || DEVANAGARI_ANCHORS.some((a) => l.includes(a));
};

const STATE_CENTROID = { lat: GEO.centroid.lat, lng: GEO.centroid.lng };
const STATE_BBOX = GEO.bbox;

module.exports = {
    STATE_NAME,
    DISTRICTS,
    TALUKAS,
    CONSTITUENCIES,
    CITIES_AND_VILLAGES,
    ALL_LOCATIONS,
    STATE_CENTROID,
    STATE_BBOX,
    isStateLocation,
};
