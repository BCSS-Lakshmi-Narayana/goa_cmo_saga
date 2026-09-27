/**
 * mlaReferenceService
 * ─────────────────────────────────────────────────────────────────────
 * Read-only reference layer over the Goa MLA dataset (40 assembly
 * constituencies; 2022 affidavits via ADR, current party as of Sep 2026;
 * vacant seats carry `mla: null` and `vacant: true`).
 *
 * This is the backend source of truth for MLA ↔ constituency mapping,
 * mirroring frontend/src/data/goaMLAs.js. It powers the Constituency
 * War Room intelligence endpoints (party-strategist view).
 *
 * Also exposes a lightweight, multilingual civic-issue classifier so we
 * can bucket grievance text into actionable categories (roads, water,
 * power, …) without an LLM call.
 */

const MLA_ROSTER = require('../data/goa_mlas.json');
const { tokenOccurs } = require('../utils/lexiconMatch');

/* ─── constituency key normalisation (matches frontend) ───────────── */
const normalizeConstituencyKey = (name) =>
  String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // "Taleigão" → "taleigao", not "taleigo"
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();

// Alternate spellings of AC names seen in GeoJSON, news and posts —
// Konkani/Marathi and Portuguese-era forms mapped to the ECI spelling. One
// shared table: frontend/scripts/gen_goa_data.js emits the same file.
const CONSTITUENCY_ALIASES = require('../data/goa_constituency_aliases.json').aliases;

const MLA_BY_KEY = MLA_ROSTER.reduce((acc, m) => {
  acc[m.key || normalizeConstituencyKey(m.constituency)] = m;
  return acc;
}, {});

const getMlaByConstituency = (name) => {
  const k = normalizeConstituencyKey(name);
  return MLA_BY_KEY[k] || MLA_BY_KEY[CONSTITUENCY_ALIASES[k]] || null;
};

const getAllMlas = () => MLA_ROSTER;

/* ─── parse "Rs 14,27,05,249 ~ 14 Crore+" → numeric rupees ────────── */
const parseRupees = (raw) => {
  if (!raw) return 0;
  const m = String(raw).match(/Rs\s*([0-9,]+)/i);
  if (!m) return 0;
  return Number(m[1].replace(/,/g, '')) || 0;
};

/* ─── multilingual civic-issue lexicon ────────────────────────────── */
/* Tokens in English, Konkani (Devanagari + Romi), Marathi and Hindi, matched
 * by utils/lexiconMatch (whole words for Latin script, substrings for
 * Devanagari). Tokens must be specific enough not to hide inside unrelated words
 * (bare "ration" would match "administration"). */
const ISSUE_LEXICON = {
  roads: [
    'road', 'pothole', 'highway', 'flyover', 'bridge', 'nh66', 'nh 66',
    'रस्तो', 'rosto', 'रस्ता', 'रस्ते', 'खड्ड',
    'सड़क', 'गड्ढा', 'पूल',
  ],
  water: [
    'water', 'drinking water', 'tap water', 'borewell', 'pipeline', 'tanker',
    'उदक', 'udok', 'पाणी',
    'पानी', 'पेयजल',
  ],
  electricity: [
    'electricity', 'power supply', 'power cut', 'power outage', 'no current', 'transformer', 'voltage',
    'वीज',
    'बिजली', 'करंट', 'ट्रांसफार्मर',
  ],
  drainage: [
    'drainage', 'sewage', 'sewer', 'gutter', 'manhole', 'flooding',
    'सांडपाणी', 'गटार',
    'नाली', 'सीवर', 'जल निकासी',
  ],
  sanitation: [
    'garbage', 'sanitation', 'toilet', 'solid waste', 'waste management', 'garbage dump', 'sonsoddo',
    'कचरो', 'कचरा', 'स्वच्छता',
    'सफाई', 'शौचालय',
  ],
  health: [
    'hospital', 'phc', 'ambulance', 'doctor', 'medicine', 'clinic', 'health', 'gmc',
    'इस्पितळ', 'रुग्णालय', 'दवाखान',
    'अस्पताल', 'डॉक्टर', 'दवा', 'स्वास्थ्य',
  ],
  education: [
    'school', 'college', 'teacher', 'education', 'student', 'scholarship', 'fees',
    'शाळा', 'शिक्षण', 'विद्यालय',
    'स्कूल', 'कॉलेज', 'शिक्षा', 'फीस',
  ],
  employment: [
    'job', 'jobs', 'employment', 'unemployment', 'salary', 'wages', 'cash for job',
    'नोकरी', 'nokri', 'बेकारी', 'बेरोजगारी',
    'नौकरी', 'रोजगार', 'वेतन',
  ],
  agriculture: [
    'farmer', 'crop', 'fertilizer', 'irrigation', 'paddy', 'khazan', 'cashew', 'msp',
    'शेतकार', 'शेतकरी', 'शेती', 'xetkar',
    'किसान', 'फसल', 'खाद', 'सिंचाई',
  ],
  welfare: [
    'pension', 'ration card', 'ration shop', 'subsidy', 'scheme', 'beneficiary',
    'griha aadhar', 'dsss', 'ladli laxmi', 'ddssy',
    'पेन्शन', 'रेशन', 'योजना',
    'पेंशन', 'राशन', 'सब्सिडी',
  ],
  law_and_order: [
    'police', 'crime', 'theft', 'assault', 'safety', 'illegal', 'goonda', 'drugs', 'narcotic',
    'पोलीस', 'पुलीस', 'चोरी', 'गुन्हा', 'ड्रग्स',
    'पुलिस', 'अपराध', 'सुरक्षा',
  ],
};

const ISSUE_CATEGORIES = Object.keys(ISSUE_LEXICON);

/**
 * Classify a piece of grievance text into civic-issue categories.
 * Returns an array of matched category keys (may be empty).
 */
const classifyIssues = (text) => {
  const lower = String(text || '').toLowerCase();
  if (!lower) return [];
  const hits = [];
  for (const [category, tokens] of Object.entries(ISSUE_LEXICON)) {
    if (tokens.some((t) => tokenOccurs(lower, t))) hits.push(category);
  }
  return hits;
};

/** Roster key for any spelling of an AC name (alias-aware), or null. */
const resolveConstituencyKey = (name) => {
  const m = getMlaByConstituency(name);
  return m ? (m.key || normalizeConstituencyKey(m.constituency)) : null;
};

module.exports = {
  MLA_ROSTER,
  resolveConstituencyKey,
  ISSUE_CATEGORIES,
  normalizeConstituencyKey,
  getMlaByConstituency,
  getAllMlas,
  parseRupees,
  classifyIssues,
  ISSUE_LEXICON,
};
