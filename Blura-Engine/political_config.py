"""
Political Saga configuration for Goa — Blura Engine.
RSS feeds, keywords, category rules — covering Indian national politics,
Goa state politics (BJP / MGP government; INC, AAP, GFP, RGP opposition),
and district/town-level news.

Goa's press is trilingual (English, Marathi, Konkani). Every feed below was
verified live on 25 Sep 2026. No Konkani RSS feed exists, and Google News has
no Konkani edition (hl=kok redirects to Hindi), so Devanagari coverage comes
from the Marathi press and Marathi-edition Google News queries; Konkani
mostly reaches the app through YouTube/TV sources instead.
"""

from urllib.parse import quote_plus

_GN_EN = "https://news.google.com/rss/search?q={q}&hl=en-IN&gl=IN&ceid=IN:en"
_GN_MR = "https://news.google.com/rss/search?q={q}&hl=mr&gl=IN&ceid=IN:mr"
_GN_HI = "https://news.google.com/rss/search?q={q}&hl=hi&gl=IN&ceid=IN:hi"


def _gn(template, query, source_name, language):
    return {
        "url": template.format(q=quote_plus(query)),
        "source_name": source_name,
        "language": language,
        "follow_redirect": True,
    }


# ── RSS Feeds ──────────────────────────────────────────────────────────────────
# "goa_only": True marks outlets whose feed carries only Goa news. Their items
# skip the keyword relevance gate (a Goa paper's local story rarely names a
# party or leader). Goa Chronicle (national opinion, not Goa news) and Indian
# Express (in SKIP_DOMAINS, so never stored) were dropped after the Sep 2026 audit.
RSS_FEEDS = [
    # ── Goa English press ──────────────────────────────────────────
    {"url": "https://navhindtimes.in/feed/",                                  "source_name": "The Navhind Times",        "language": "en", "goa_only": True},
    {"url": "https://www.heraldgoa.in/goa/feed/",                             "source_name": "O Heraldo – Goa",          "language": "en", "goa_only": True},
    {"url": "https://www.heraldgoa.in/feed/",                                 "source_name": "O Heraldo",                "language": "en"},
    {"url": "https://goemkarponn.com/feed/",                                  "source_name": "Goemkarponn",              "language": "en", "goa_only": True},
    {"url": "https://rdxgoa.com/feed/",                                       "source_name": "RDX Goa",                  "language": "en", "goa_only": True},
    {"url": "https://digitalgoa.com/feed/",                                   "source_name": "Digital Goa",              "language": "en", "goa_only": True},
    {"url": "https://goanewshub.com/feed/",                                   "source_name": "Goa News Hub",             "language": "en", "goa_only": True},
    {"url": "https://timesofindia.indiatimes.com/rssfeeds/3012535.cms",       "source_name": "Times of India – Goa",     "language": "en", "goa_only": True},
    {"url": "https://www.thehindu.com/news/national/goa/feeder/default.rss",  "source_name": "The Hindu – Goa",          "language": "en", "goa_only": True},

    # ── Goa Marathi press ──────────────────────────────────────────
    {"url": "https://www.tarunbharat.com/category/goa/feed/",                 "source_name": "Tarun Bharat – Goa",       "language": "mr", "goa_only": True},
    {"url": "https://dainikgomantak.esakal.com/stories.rss",                  "source_name": "Dainik Gomantak",          "language": "mr"},
    {"url": "https://navprabha.com/feed/",                                    "source_name": "Navprabha",                "language": "mr", "goa_only": True},
    # Site-wide Maharashtra + Goa feed; the relevance filter keeps the Goa items.
    {"url": "https://pudhari.news/stories.rss",                               "source_name": "Pudhari",                  "language": "mr"},

    # ── National English (Goa stories are kept by the relevance filter) ──
    {"url": "https://feeds.feedburner.com/ndtvnews-india-news",               "source_name": "NDTV India",               "language": "en"},
    {"url": "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",     "source_name": "Times of India Top Stories", "language": "en"},
    {"url": "https://www.thehindu.com/news/national/feeder/default.rss",      "source_name": "The Hindu National",       "language": "en"},
    {"url": "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", "source_name": "Hindustan Times India",   "language": "en"},

    # ── Google News — English ──────────────────────────────────────
    _gn(_GN_EN, 'Goa politics',                "Google News – Goa Politics",      "en"),
    _gn(_GN_EN, 'Pramod Sawant',               "Google News – Pramod Sawant",     "en"),
    _gn(_GN_EN, 'BJP Goa',                     "Google News – BJP Goa",           "en"),
    _gn(_GN_EN, 'Goa Congress',                "Google News – Goa Congress",      "en"),
    _gn(_GN_EN, 'Yuri Alemao',                 "Google News – Yuri Alemao",       "en"),
    _gn(_GN_EN, 'AAP Goa',                     "Google News – AAP Goa",           "en"),
    _gn(_GN_EN, 'Vijai Sardesai Goa Forward',  "Google News – Goa Forward",       "en"),
    _gn(_GN_EN, 'RGP Viresh Borkar',           "Google News – RGP",               "en"),
    _gn(_GN_EN, 'Goa assembly',                "Google News – Goa Assembly",      "en"),
    _gn(_GN_EN, 'Mhadei',                      "Google News – Mhadei",            "en"),
    _gn(_GN_EN, 'Goa mining',                  "Google News – Goa Mining",        "en"),
    _gn(_GN_EN, 'Panaji',                      "Google News – Panaji",            "en"),
    _gn(_GN_EN, 'Margao',                      "Google News – Margao",            "en"),
    _gn(_GN_EN, 'Mapusa',                      "Google News – Mapusa",            "en"),
    _gn(_GN_EN, 'Vasco Goa',                   "Google News – Vasco",             "en"),
    _gn(_GN_EN, 'Ponda Goa',                   "Google News – Ponda",             "en"),

    # ── Google News — Marathi edition (stands in for Konkani) ─────
    _gn(_GN_MR, 'गोवा राजकारण',                "Google News (mr) – Goa Politics",   "mr"),
    _gn(_GN_MR, 'प्रमोद सावंत',                 "Google News (mr) – Pramod Sawant",  "mr"),
    _gn(_GN_MR, 'गोवा भाजप',                    "Google News (mr) – BJP Goa",        "mr"),
    _gn(_GN_MR, 'गोवा काँग्रेस',                 "Google News (mr) – Goa Congress",   "mr"),
    _gn(_GN_MR, 'गोवा विधानसभा',                "Google News (mr) – Goa Assembly",   "mr"),
    _gn(_GN_MR, 'म्हादई गोवा',                   "Google News (mr) – Mhadei",         "mr"),
    _gn(_GN_MR, 'गोवा खाण',                     "Google News (mr) – Goa Mining",     "mr"),
    _gn(_GN_MR, 'मडगाव',                        "Google News (mr) – Margao",         "mr"),
    _gn(_GN_MR, 'म्हापसा',                       "Google News (mr) – Mapusa",         "mr"),
    # Bare फोंडा also matches Phonda in Sindhudurg (Maharashtra).
    _gn(_GN_MR, 'फोंडा गोवा',                   "Google News (mr) – Ponda",          "mr"),

    # ── Google News — Hindi ────────────────────────────────────────
    _gn(_GN_HI, 'गोवा प्रमोद सावंत',            "Google News (hi) – Pramod Sawant",  "hi"),
]

# ── Per-district coverage (Goa's three districts) ────────────────────────────
# One English and one Marathi Google News query per district. The canonical
# district MUST match constituencymasters.district exactly, so the backend can
# map it to constituencies. Kushavati (Quepem, Sanguem, Dharbandora, Canacona)
# was carved out of South Goa on 31 Dec 2025; Ponda taluka is in South Goa.
# (canonical district, English query, Marathi query)
DISTRICTS = [
    ('North Goa', 'North Goa',                                       'उत्तर गोवा'),
    ('South Goa', 'South Goa',                                       'दक्षिण गोवा'),
    ('Kushavati', 'Kushavati OR Quepem OR Canacona OR Sanguem OR Curchorem -price -"on road"',
                  'कुशावती OR केपे OR काणकोण OR सांगे OR कुडचडे'),
]


def _district_feeds(canonical, query_en, query_mr):
    return [
        {**_gn(_GN_EN, query_en, f"Goa District – {canonical}", "en"), "district": canonical},
        {**_gn(_GN_MR, query_mr, f"Goa District (mr) – {canonical}", "mr"), "district": canonical},
    ]


for _canonical, _en, _mr in DISTRICTS:
    RSS_FEEDS += _district_feeds(_canonical, _en, _mr)

# Fetch regional-language (Marathi) and district feeds FIRST each cycle. A
# single run can be slow, so front-loading them guarantees that coverage is
# collected even if a run doesn't get through every English national feed.
# Python's sort is stable, so order within each group is preserved.
PRIORITY_LANGUAGES = ('mr', 'kok')
RSS_FEEDS.sort(key=lambda f: 0 if (f.get('language') in PRIORITY_LANGUAGES or f.get('district')) else 1)

# ── Relevance filter keywords (any 1 match = relevant) ───────────────────────
# Used only when the rsskeywords collection in MongoDB is empty — the backend
# seeds and manages that collection. Full names only: bare surnames such as
# "Sawant" or "Naik" are shared by thousands of Goans.
POLITICAL_RELEVANCE_KEYWORDS = [
    # ── Leaders ──
    'pramod sawant', 'cm sawant', 'goa cm', 'damu naik', 'vishwajit rane', 'mauvin godinho',
    'rohan khaunte', 'babush monserrate', 'digambar kamat', 'sudin dhavalikar', 'michael lobo',
    'shripad naik', 'yuri alemao', 'girish chodankar', 'viriato fernandes', 'vijai sardesai',
    'valmiki naik', 'venzy viegas', 'viresh borkar',
    'प्रमोद सावंत', 'मुख्यमंत्री सावंत',

    # ── Parties & state ──
    'bjp goa', 'goa bjp', 'goa congress', 'aap goa', 'goa forward', 'revolutionary goans', 'mgp',
    'goa politics', 'goa government', 'goa assembly', 'goa cabinet', 'goa elections',
    'गोवा सरकार', 'गोवा विधानसभा', 'गोंय',

    # ── Goa issues & places ──
    'mhadei', 'mopa', 'goa mining', 'land conversion', 'kushavati', 'cash for jobs',
    'panaji', 'margao', 'mapusa', 'vasco', 'ponda', 'north goa', 'south goa',
    'म्हादई', 'मडगाव', 'म्हापसा', 'पणजी',
    'goa', 'goan', 'गोवा', 'गोव्या', 'गोंयांत',
]

# ── Category classification keywords ─────────────────────────────────────────
CATEGORY_KEYWORDS = {
    'crime': [
        # English
        'crime', 'murder', 'theft', 'robbery', 'rape', 'assault', 'arrested', 'gangster',
        'drug', 'drugs', 'narcotics', 'smuggling', 'fraud', 'scam', 'kidnap', 'extortion',
        'police', 'fir', 'case registered', 'nabbed', 'caught', 'crime branch',
        'corruption', 'bribery', 'embezzlement', 'money laundering', 'disproportionate assets',
        # Marathi / Konkani
        'गुन्हा', 'खून', 'चोरी', 'अटक', 'भ्रष्टाचार', 'भ्रश्टाचार', 'घोटाळ', 'ड्रग्स', 'पोलीस',
    ],
    'politics': [
        # English
        'politics', 'political', 'election', 'vote', 'bjp', 'congress', 'aap', 'mgp', 'mla', 'mp',
        'minister', 'cabinet', 'assembly', 'parliament', 'rally', 'campaign', 'government', 'govt',
        'sawant', 'goa forward',
        'lok sabha', 'vidhan sabha', 'constituency', 'party', 'governance',
        'opposition', 'ruling', 'coalition', 'alliance', 'seat', 'candidate',
        # Marathi / Konkani
        'राजकारण', 'निवडणूक', 'वेंचणूक', 'मतदान', 'विधानसभा', 'मुख्यमंत्री', 'आमदार', 'सरकार',
    ],
    'development': [
        # English
        'development', 'infrastructure', 'project', 'scheme', 'highway', 'bridge',
        'flyover', 'smart city', 'industrial', 'investment', 'tender',
        'construction', 'inaugurate', 'launch', 'upgrade', 'fund released',
        'mission', 'welfare', 'yojana', 'mopa airport', 'viksit goa',
        'sewage', 'drain', 'drainage', 'road repair', 'streetlight', 'water supply',
        # Marathi / Konkani
        'विकास', 'प्रकल्प', 'योजना', 'बांधकाम', 'उद्घाटन',
    ],
    'communal': [
        # English
        'communal', 'riot', 'religious tension', 'communal tension', 'hate speech',
        'forced conversion', 'religious conversion', 'desecration', 'vandalised idol', 'vandalized idol',
        # Marathi / Konkani
        'जातीय', 'धार्मिक तणाव', 'धर्मांतर', 'विटंबना',
    ],
    'law_order': [
        # English
        'law and order', 'law & order', 'curfew', 'protest', 'agitation', 'strike', 'bandh',
        'section 144', 'section 163', 'lathi charge', 'riot', 'unrest', 'demonstration',
        'crackdown', 'nia', 'cbi', 'police clash',
        # Marathi / Konkani
        'कायदा व सुव्यवस्था', 'आंदोलन', 'निषेध', 'लाठीमार', 'बंदची हाक', 'गोवा बंद',
    ],
}

# ── Goa location mapping (towns and their Konkani / Marathi / Portuguese-era
# spellings; generated from backend/src/data/goa_geo.json) ───────────────────
LOCATION_KEYWORDS = {
    "Panaji": ["panaji", "panjim", "ponnje", "pangim", "पणजी"],
    "Margao": ["margao", "madgaon", "madgao", "moddganv", "मडगांव", "मडगाव"],
    "Mapusa": ["mapusa", "mhapsa", "mapuca", "म्हापसा"],
    "Vasco da Gama": ["vasco da gama", "vasco", "vasco-da-gama", "वास्को"],
    "Mormugao": ["mormugao", "murgaon", "marmagao", "marmugao", "mormugao port", "मुरगांव", "मुरगाव", "मार्मागोवा"],
    "Ponda": ["ponda", "fonda", "फोंडा"],
    "Bicholim": ["bicholim", "dicholi", "divchal", "डिचोली", "दिवचल"],
    "Sanquelim": ["sanquelim", "sankhali", "sakhali", "सांखळी", "साखळी"],
    "Valpoi": ["valpoi", "valpoy"],
    "Pernem": ["pernem", "pedne", "पेडणे"],
    "Curchorem-Cacora": ["curchorem-cacora", "curchorem", "cacora", "kudchade", "कुडचडें"],
    "Quepem": ["quepem", "kepe", "केपें"],
    "Sanguem": ["sanguem", "sange", "सांगे"],
    "Canacona": ["canacona", "chaudi", "chauri", "kannkonn", "काणकोण"],
    "Cuncolim": ["cuncolim", "कंकोळी"],
    "Calangute": ["calangute", "kalangut", "कळंगुट"],
    "Candolim": ["candolim"],
    "Anjuna": ["anjuna"],
    "Baga": ["baga"],
    "Porvorim": ["porvorim", "parvari", "पर्वरी"],
    "Siolim": ["siolim", "xivoli"],
    "Saligao": ["saligao", "sallganv"],
    "Aldona": ["aldona"],
    "Tivim": ["tivim", "thivim", "थिवी"],
    "Arambol": ["arambol", "harmal"],
    "Mandrem": ["mandrem", "मांद्रे"],
    "Morjim": ["morjim", "morji", "morgim"],
    "Mopa": ["mopa", "मोपा"],
    "Old Goa": ["old goa", "ओल्ड गोंय"],
    "Taleigao": ["taleigao", "taleigão"],
    "Dona Paula": ["dona paula", "दोना पोल"],
    "Caranzalem": ["caranzalem"],
    "Merces": ["merces", "morambi-o-grande", "morambi-o-pequeno"],
    "St. Cruz": ["st. cruz", "santa cruz", "kalapur", "calapor"],
    "Chimbel": ["chimbel"],
    "Bambolim": ["bambolim"],
    "Ribandar": ["ribandar"],
    "Usgao": ["usgao"],
    "Dabolim": ["dabolim", "दाबोळी"],
    "Cortalim": ["cortalim", "kuttal", "कुट्टाळी"],
    "Chicalim": ["chicalim", "चिकालिम"],
    "Sancoale": ["sancoale", "सांकवाळ"],
    "Verna": ["verna", "वेर्णे"],
    "Navelim": ["navelim"],
    "Colva": ["colva"],
    "Benaulim": ["benaulim", "banavali", "बाणावली"],
    "Chinchinim": ["chinchinim"],
    "Loutolim": ["loutolim", "loutulim", "lotli", "lotle"],
    "Curtorim": ["curtorim"],
    "Nuvem": ["nuvem", "नुवें"],
    "Fatorda": ["fatorda"],
    "Majorda": ["majorda"],
    "Varca": ["varca"],
    "Cavelossim": ["cavelossim"],
    "Mollem": ["mollem", "molem"],
    "Dharbandora": ["dharbandora", "darbandora", "धारबांदोडा"],
    "Palolem": ["palolem", "पालोळे", "nagorcem-palolem"],
    "Agonda": ["agonda", "आगोंदा"],
    # Talukas, for stories that name only the taluka.
    "Tiswadi": ["tiswadi", "tiswaddi", "ilhas", "तिसवाडी"],
    "Bardez": ["bardez", "bardes", "बार्देश", "बार्देज"],
    "Sattari": ["sattari", "satari", "सत्तरी"],
    "Salcete": ["salcete", "salcette", "sashti", "सासष्टी"],
}

# Town -> (district, lat, lng). Coordinates are None where the geography
# research could not verify them; the state centroid is used instead.
LOCATION_META = {
    "Panaji": ("North Goa", 15.49889, 73.82778),
    "Margao": ("South Goa", 15.27361, 73.95806),
    "Mapusa": ("North Goa", 15.6, 73.82),
    "Vasco da Gama": ("South Goa", 15.39806, 73.81111),
    "Mormugao": ("South Goa", 15.4, 73.8),
    "Ponda": ("South Goa", 15.40278, 74.00778),
    "Bicholim": ("North Goa", 15.6, 73.95),
    "Sanquelim": ("North Goa", 15.5625, 74.01111),
    "Valpoi": ("North Goa", 15.53, 74.13),
    "Pernem": ("North Goa", 15.71674, 73.797),
    "Curchorem-Cacora": ("Kushavati", 15.26028, 74.10833),
    "Quepem": ("Kushavati", 15.22, 74.07),
    "Sanguem": ("Kushavati", 15.23, 74.17),
    "Canacona": ("Kushavati", 15.02, 74.02),
    "Cuncolim": ("South Goa", 15.18689, 74.01407),
    "Calangute": ("North Goa", 15.54167, 73.76194),
    "Candolim": ("North Goa", 15.52, 73.75),
    "Anjuna": ("North Goa", 15.5833, 73.7333),
    "Baga": ("North Goa", 15.55889, 73.75333),
    "Porvorim": ("North Goa", 15.538, 73.831),
    "Siolim": ("North Goa", 15.61454, 73.77045),
    "Saligao": ("North Goa", 15.55, 73.77),
    "Aldona": ("North Goa", 15.58972, 73.87333),
    "Tivim": ("North Goa", 15.62464, 73.85639),
    "Arambol": ("North Goa", 15.68771, 73.72028),
    "Mandrem": ("North Goa", 15.65812, 73.71306),
    "Morjim": ("North Goa", 15.62944, 73.73583),
    "Mopa": ("North Goa", 15.75333, 73.85694),
    "Old Goa": ("North Goa", 15.503, 73.912),
    "Taleigao": ("North Goa", 15.4675, 73.82139),
    "Dona Paula": ("North Goa", None, None),
    "Caranzalem": ("North Goa", 15.45, 73.8),
    "Merces": ("North Goa", 15.48603, 73.85517),
    "St. Cruz": ("North Goa", 15.47083, 73.84306),
    "Chimbel": ("North Goa", 15.49528, 73.87695),
    "Bambolim": ("North Goa", 15.45124, 73.85278),
    "Ribandar": ("North Goa", 15.50278, 73.86528),
    "Usgao": ("South Goa", 15.44861, 74.06667),
    "Dabolim": ("South Goa", 15.37951, 73.84449),
    "Cortalim": ("South Goa", 15.39778, 73.91056),
    "Chicalim": ("South Goa", 15.39944, 73.84083),
    "Sancoale": ("South Goa", 15.37, 73.9),
    "Verna": ("South Goa", 15.34917, 73.93139),
    "Navelim": ("South Goa", 15.25639, 73.96861),
    "Colva": ("South Goa", 15.27611, 73.91722),
    "Benaulim": ("South Goa", 15.25, 73.92),
    "Chinchinim": ("South Goa", 15.2125, 73.97722),
    "Loutolim": ("South Goa", 15.33, 73.98),
    "Curtorim": ("South Goa", 15.28, 74.03),
    "Nuvem": ("South Goa", 15.30889, 73.94611),
    "Fatorda": ("South Goa", 15.29111, 73.9625),
    "Majorda": ("South Goa", 15.31611, 73.91972),
    "Varca": ("South Goa", 15.22, 73.92),
    "Cavelossim": ("South Goa", 15.174, 73.945),
    "Mollem": ("Kushavati", 15.38815, 74.24138),
    "Dharbandora": ("Kushavati", 15.39152, 74.12995),
    "Palolem": ("Kushavati", None, None),
    "Agonda": ("Kushavati", 15.04164, 74.00161),
    "Tiswadi": ("North Goa", None, None),
    "Bardez": ("North Goa", None, None),
    "Sattari": ("North Goa", None, None),
    "Salcete": ("South Goa", None, None),
}

# Devanagari aliases match as substrings (case suffixes attach directly), so a
# few need their false continuations blocked: फोंडाघाट is in Sindhudurg, and
# सांगेल / सांगितले are forms of the verb "to say", not Sanguem.
ALIAS_BLOCKED_CONTINUATIONS = {
    'फोंडा': ('घाट', ' घाट'),
    'सांगे': ('ल', 'न', 'ं'),
}

STATE_NAME = 'Goa'

# ── Goa centroid (fallback coordinates for towns without their own) ──────────
STATE_LAT = 15.36125
STATE_LNG = 74.05472
