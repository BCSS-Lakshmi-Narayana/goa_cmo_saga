/**
 * Goa Political Watch — branding and media catalogue for the client: the BJP
 * government of Goa (CM Dr. Pramod Sawant; BJP Goa president Damu Naik).
 *
 * Remote images use Wikipedia's stable Special:FilePath redirect (always the
 * current version of a Commons file; every file name below was checked to
 * resolve). If one fails to load, the image helper falls back to a copy shipped
 * in /public, so the UI never breaks.
 *
 * Re-branding for another client means editing this file, public/index.html,
 * and the data files in src/data — no page code needs to change.
 */

const wiki = (filename) =>
  `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;

/* ─── App / client identity ─────────────────────────────────────── */
export const BRAND = {
  appName: 'Goa Political Watch',
  appShortName: 'GOA WATCH',
  tagline: 'Social Media Intelligence for BJP Goa',
  partyName: 'Bharatiya Janata Party',
  partyShort: 'BJP',
  partyUnit: 'BJP Goa',
  stateName: 'Goa',
  leaderName: 'Dr. Pramod Sawant',
  leaderTitle: 'Chief Minister of Goa',
  constituencyCount: 40,
  lokSabhaCount: 2,
};

/* ─── Portraits of the client leadership ─────────────────────────── */
export const PARTY_PORTRAITS = [
  {
    id: 'portrait-primary',
    src: wiki('Pramod_Sawant_at_the_inauguration_of_the_Chhatrapati_Shivaji_Maharaj_Chair_in_Goa_University_(cropped).jpg'),
    alt: 'Dr. Pramod Sawant — Chief Minister of Goa',
    caption: 'Chief Minister · Goa',
  },
  {
    id: 'portrait-party-president',
    src: wiki('Damodar_Gajanan_Naik_(Damu_G._Naik).png'),
    alt: 'Damu Naik — State President, BJP Goa',
    caption: 'State President · BJP Goa',
  },
];

/* The "hero" image used across the app (login, header, dashboard avatar). */
export const PARTY_HERO = PARTY_PORTRAITS[0];

/* ─── Goa imagery ───────────────────────────────────────────────── */
export const STATE_GALLERY = [
  {
    id: 'goa-bom-jesus',
    src: wiki('Old_Goa_Church_01.jpg'),
    alt: 'Basilica of Bom Jesus, Old Goa',
    caption: 'Basilica of Bom Jesus · Old Goa',
  },
  {
    id: 'goa-panaji-church',
    src: wiki('Closeup_shot_of_Immaculate_Conception_Church,_Panaji.jpg'),
    alt: 'Church of Our Lady of the Immaculate Conception, Panaji',
    caption: 'Immaculate Conception Church · Panaji',
  },
  {
    id: 'goa-dudhsagar',
    src: wiki('Dudhsagar_Falls_Triplet.jpg'),
    alt: 'Dudhsagar Falls',
    caption: 'Dudhsagar Falls · Sanguem',
  },
  {
    id: 'goa-reis-magos',
    src: wiki('Reis_Magos_Fort_-_View_from_Mandovi_River.JPG'),
    alt: 'Reis Magos Fort from the Mandovi river',
    caption: 'Reis Magos Fort · Bardez',
  },
];

/* ─── Party visual marks ─────────────────────────────────────────── */
export const PARTY_MARK = {
  flag: wiki('Bharatiya_Janata_Party_Flag.jpg'),
  logo: wiki('Logo_of_the_Bharatiya_Janata_Party.svg'),
};

/* ─── Local fallback served from /public ─────────────────────────── */
export const LOCAL_FALLBACK = '/cm-portrait.jpg';
export const LOCAL_LOGO = '/party-logo.png';

/* ─── Key constituencies for the client ──────────────────────────── */
export const KEY_CONSTITUENCIES = [
  { name: 'Sanquelim', district: 'North Goa' },   // CM Pramod Sawant
  { name: 'Panaji',    district: 'North Goa' },   // state capital
  { name: 'Valpoi',    district: 'North Goa' },
  { name: 'Porvorim',  district: 'North Goa' },
  { name: 'Margao',    district: 'South Goa' },
  { name: 'Ponda',     district: 'South Goa' },   // vacant since Oct 2025
  { name: 'Canacona',  district: 'Kushavati' },
];

/* ─── Talking points the government champions (AI summary / dashboard) */
export const FOCUS_TOPICS = [
  'Viksit Goa 2037',
  'Welfare schemes (Griha Aadhar, DSSS, Ladli Laxmi)',
  'Mopa airport & infrastructure',
  'Swayampurna Goa',
  'Goa AI Mission 2027',
  'Mining restart & livelihoods',
  'Tourism',
  'Mhadei water dispute',
  'Jobs for Goans',
  'Kushavati district development',
];
