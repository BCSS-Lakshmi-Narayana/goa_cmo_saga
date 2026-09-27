/**
 * Party palette for Goa — the single source for every party colour in the UI
 * (maps, badges, dots, comparison cards). Keys are the party codes used in
 * src/data/goaMLAs.js and the backend roster.
 *
 * BJP is saffron and INC sky blue, as on their flags. AAP (blue) is shown in
 * indigo so it stays distinct from INC on the map. MGP, GFP and RGP get
 * distinct hues for readability; they are UI choices, not official
 * party colours.
 */
export const PARTY_PALETTE = {
  BJP:    { hex: '#F97316', soft: '#FFEDD5', text: '#9A3412', ring: '#FB923C', grad: 'from-orange-400 to-orange-600', badge: 'bg-orange-100 text-orange-700 border-orange-300', dot: 'bg-orange-500' },
  MGP:    { hex: '#DC2626', soft: '#FEE2E2', text: '#991B1B', ring: '#EF4444', grad: 'from-red-500 to-rose-600', badge: 'bg-red-100 text-red-700 border-red-300', dot: 'bg-red-600' },
  INC:    { hex: '#0EA5E9', soft: '#E0F2FE', text: '#075985', ring: '#38BDF8', grad: 'from-sky-400 to-sky-600', badge: 'bg-sky-100 text-sky-700 border-sky-300', dot: 'bg-sky-500' },
  AAP:    { hex: '#4F46E5', soft: '#E0E7FF', text: '#3730A3', ring: '#6366F1', grad: 'from-indigo-500 to-indigo-700', badge: 'bg-indigo-100 text-indigo-700 border-indigo-300', dot: 'bg-indigo-600' },
  GFP:    { hex: '#16A34A', soft: '#DCFCE7', text: '#166534', ring: '#22C55E', grad: 'from-green-500 to-green-700', badge: 'bg-green-100 text-green-700 border-green-300', dot: 'bg-green-600' },
  RGP:    { hex: '#CA8A04', soft: '#FEF9C3', text: '#854D0E', ring: '#EAB308', grad: 'from-yellow-500 to-amber-600', badge: 'bg-yellow-100 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500' },
  IND:    { hex: '#64748B', soft: '#F1F5F9', text: '#334155', ring: '#94A3B8', grad: 'from-slate-400 to-slate-600', badge: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-500' },
  VACANT: { hex: '#D4D4D8', soft: '#F4F4F5', text: '#52525B', ring: '#A1A1AA', grad: 'from-zinc-300 to-zinc-400', badge: 'bg-zinc-100 text-zinc-500 border-zinc-300 border-dashed', dot: 'bg-zinc-300' },
};

export const DEFAULT_PARTY_STYLE = PARTY_PALETTE.IND;

/* Legend / tab order: ruling alliance first, then opposition, then others. */
export const PARTY_ORDER = ['BJP', 'MGP', 'INC', 'AAP', 'GFP', 'RGP', 'IND', 'VACANT'];

export const PARTY_FULL_NAMES = {
  BJP: 'Bharatiya Janata Party',
  MGP: 'Maharashtrawadi Gomantak Party',
  INC: 'Indian National Congress',
  AAP: 'Aam Aadmi Party',
  GFP: 'Goa Forward Party',
  RGP: 'Revolutionary Goans Party',
  IND: 'Independent',
  VACANT: 'Vacant seat',
};

export const partyStyle = (party) =>
  PARTY_PALETTE[String(party || '').trim().toUpperCase()] || DEFAULT_PARTY_STYLE;
