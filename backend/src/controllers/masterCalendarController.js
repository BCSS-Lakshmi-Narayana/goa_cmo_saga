const MasterCalendarEvent = require('../models/MasterCalendarEvent');

// ── Seed data: recurring Goa monitoring calendar ──────────
// Fixed-date state observances are exact; lunar/church-calendar festivals carry
// "Date varies each year" and should be re-dated annually by an operator.
const RECURRING_SEED = [
  { slNo: 1,  occasion: 'New Year celebrations (beach & club crowds)',            date: '1 January',    monitoringRange: '30 Dec – 2 Jan',   keywords: 'New Year, Baga, Calangute, Anjuna, crowd, drugs, traffic', remarks: 'Tourism peak — law & order' },
  { slNo: 2,  occasion: 'Makar Sankranti',                                        date: '14 January',   monitoringRange: '13 Jan – 15 Jan',  keywords: 'Sankranti, Makar Sankranti, haldi kumkum',              remarks: '' },
  { slNo: 3,  occasion: 'Asmitai Dis — Opinion Poll Day',                          date: '16 January',   monitoringRange: '15 Jan – 17 Jan',  keywords: 'Opinion Poll, Asmitai Dis, Goan identity, Jack Sequeira', remarks: 'Goan identity politics' },
  { slNo: 4,  occasion: 'Republic Day',                                           date: '26 January',   monitoringRange: '24 Jan – 28 Jan',  keywords: 'Republic Day, 26 January, parade, national flag',        remarks: 'High priority' },
  { slNo: 5,  occasion: 'Mahatma Gandhi Punyatithi',                              date: '30 January',   monitoringRange: '29 Jan – 31 Jan',  keywords: 'Mahatma Gandhi, martyrdom',                               remarks: '' },
  { slNo: 6,  occasion: 'Goa Carnival (Intruz)',                                  date: 'February',     monitoringRange: '4 days before Ash Wednesday', keywords: 'Carnival, Intruz, King Momo, float parade, Panaji, Margao', remarks: 'Date varies each year' },
  { slNo: 7,  occasion: 'Chhatrapati Shivaji Maharaj Jayanti',                    date: '19 February',  monitoringRange: '18 Feb – 20 Feb',  keywords: 'Shivaji Jayanti, procession',                             remarks: '' },
  { slNo: 8,  occasion: 'Marathi Rajbhasha Din',                                  date: '27 February',  monitoringRange: '26 Feb – 28 Feb',  keywords: 'Marathi Rajbhasha Din, Marathi, official language',      remarks: 'Language politics (Konkani vs Marathi)' },
  { slNo: 9,  occasion: 'Maha Shivaratri',                                        date: 'February/March', monitoringRange: '± 1 day',        keywords: 'Maha Shivaratri, Shiva, temple',                          remarks: 'Date varies each year' },
  { slNo: 10, occasion: 'Goa Legislative Assembly — Budget Session',             date: 'March',        monitoringRange: 'Session duration', keywords: 'Goa Assembly, budget, Porvorim, Sawant budget, walkout',   remarks: 'Date varies each year' },
  { slNo: 11, occasion: 'Shigmo (Shigmotsav) — Holi & float parades',             date: 'March',        monitoringRange: '14 days',          keywords: 'Shigmo, Shigmotsav, Holi, Naman, Romta Mell, parade',     remarks: 'Date varies each year' },
  { slNo: 12, occasion: 'Ramzan / Eid-ul-Fitr',                                   date: 'March/April',  monitoringRange: '± 2 days',         keywords: 'Ramzan, Eid-ul-Fitr, Eid',                                remarks: 'Date varies each year' },
  { slNo: 13, occasion: 'Gudi Padwa (Sausar Padvo)',                              date: 'March/April',  monitoringRange: '± 1 day',          keywords: 'Gudi Padwa, Padvo, New Year',                             remarks: 'Date varies each year' },
  { slNo: 14, occasion: 'Ram Navami',                                             date: 'March/April',  monitoringRange: '± 2 days',         keywords: 'Ram Navami, procession',                                  remarks: 'Date varies each year' },
  { slNo: 15, occasion: 'Good Friday & Easter',                                   date: 'March/April',  monitoringRange: 'Holy Week',        keywords: 'Good Friday, Easter, church, Holy Week',                  remarks: 'Date varies each year' },
  { slNo: 16, occasion: 'Dr. B.R. Ambedkar Jayanti',                              date: '14 April',     monitoringRange: '13 Apr – 15 Apr',  keywords: 'Ambedkar Jayanti, reservation',                           remarks: '' },
  { slNo: 17, occasion: 'Shree Lairai Zatra, Shirgao',                            date: 'April/May',    monitoringRange: '± 2 days',         keywords: 'Lairai, Shirgao, zatra, dhonds, crowd, stampede',         remarks: 'Crowd-safety sensitive (2025 stampede) — date varies' },
  { slNo: 18, occasion: 'Goa Statehood Day',                                      date: '30 May',       monitoringRange: '29 May – 31 May',  keywords: 'Goa Statehood Day, 30 May, Goa Daman Diu',               remarks: 'State event' },
  { slNo: 19, occasion: 'Monsoon fishing ban begins',                             date: '1 June',       monitoringRange: '1 Jun – 31 Jul',   keywords: 'fishing ban, trawlers, fishermen, monsoon',               remarks: 'Livelihood grievances' },
  { slNo: 20, occasion: 'Goa Revolution Day (Kranti Din)',                        date: '18 June',      monitoringRange: '17 Jun – 19 Jun',  keywords: 'Goa Revolution Day, Kranti Din, Ram Manohar Lohia, Margao', remarks: 'State event' },
  { slNo: 21, occasion: 'Sao Joao (Feast of St. John the Baptist)',               date: '24 June',      monitoringRange: '23 Jun – 25 Jun',  keywords: 'Sao Joao, Siolim, wells, kopel, feni',                    remarks: 'Drowning / crowd risk' },
  { slNo: 22, occasion: 'Sangodd (Feast of Sts. Peter & Paul)',                   date: '29 June',      monitoringRange: '28 Jun – 30 Jun',  keywords: 'Sangodd, Candolim, fishermen, rafts',                     remarks: '' },
  { slNo: 23, occasion: 'Bakri Eid (Eid-ul-Adha)',                                date: 'June',         monitoringRange: '± 2 days',         keywords: 'Eid-ul-Adha, Bakrid, sacrifice',                          remarks: 'Date varies each year' },
  { slNo: 24, occasion: 'Muharram',                                               date: 'June/July',    monitoringRange: '± 2 days',         keywords: 'Muharram, Ashura',                                        remarks: 'Date varies each year' },
  { slNo: 25, occasion: 'Goa Legislative Assembly — Monsoon Session',            date: 'July',         monitoringRange: 'Session duration', keywords: 'Goa Assembly, monsoon session, Porvorim, question hour',  remarks: 'Date varies each year' },
  { slNo: 26, occasion: 'Monsoon — floods, landslides, road caving',              date: 'June – September', monitoringRange: 'Whole season', keywords: 'flood, landslide, potholes, NH66, power outage, Mhadei',  remarks: 'Civic-grievance peak' },
  { slNo: 27, occasion: 'Independence Day',                                       date: '15 August',    monitoringRange: '13 Aug – 17 Aug',  keywords: 'Independence Day, 15 August, tricolour',                 remarks: 'High priority' },
  { slNo: 28, occasion: 'Konkani Bhasha Manyata Dis',                             date: '20 August',    monitoringRange: '19 Aug – 21 Aug',  keywords: 'Konkani, Eighth Schedule, Konkani recognition',          remarks: 'Language politics' },
  { slNo: 29, occasion: 'Bonderam, Divar',                                        date: 'Fourth Saturday of August', monitoringRange: '± 1 day', keywords: 'Bonderam, Divar, flags, float parade',             remarks: 'Date varies each year' },
  { slNo: 30, occasion: 'Ganesh Chaturthi (Chovoth)',                             date: 'August/September', monitoringRange: '1½ – 11 days', keywords: 'Ganesh Chaturthi, Chovoth, visarjan, immersion, matoli', remarks: 'Biggest Hindu festival in Goa — date varies' },
  { slNo: 31, occasion: 'Milad-un-Nabi',                                          date: 'September',    monitoringRange: '± 1 day',          keywords: 'Milad-un-Nabi, Eid Milad',                                remarks: 'Date varies each year' },
  { slNo: 32, occasion: 'Gandhi Jayanti',                                         date: '2 October',    monitoringRange: '1 Oct – 3 Oct',    keywords: 'Gandhi Jayanti, Mahatma Gandhi',                          remarks: '' },
  { slNo: 33, occasion: 'Mining season reopens',                                  date: 'October',      monitoringRange: 'October – May',    keywords: 'mining, ore transport, trucks, dust, Sanguem, Sattari, Bicholim', remarks: 'Environment & livelihood grievances' },
  { slNo: 34, occasion: 'Dussehra',                                               date: 'October',      monitoringRange: '± 2 days',         keywords: 'Dussehra, Vijayadashami',                                 remarks: 'Date varies each year' },
  { slNo: 35, occasion: 'Narakasur effigy night & Diwali',                        date: 'October/November', monitoringRange: '± 2 days',     keywords: 'Narakasur, Narak Chaturdashi, Diwali, effigy, noise, firecrackers', remarks: 'Noise / crowd complaints — date varies' },
  { slNo: 36, occasion: 'International Film Festival of India (IFFI), Panaji',    date: '20 November',  monitoringRange: '20 Nov – 28 Nov',  keywords: 'IFFI, film festival, Panaji, ESG, Inox',                  remarks: 'VVIP & traffic' },
  { slNo: 37, occasion: 'Feast of St. Francis Xavier, Old Goa',                   date: '3 December',   monitoringRange: '24 Nov – 4 Dec',   keywords: 'St Francis Xavier, Old Goa, novena, Bom Jesus, pilgrims', remarks: 'Large crowds' },
  { slNo: 38, occasion: 'Babri demolition anniversary',                           date: '6 December',   monitoringRange: '5 Dec – 7 Dec',    keywords: 'Babri Masjid, anniversary',                               remarks: 'Sensitive date' },
  { slNo: 39, occasion: 'EDM festival season (Sunburn / others)',                 date: 'December',     monitoringRange: 'Event duration',   keywords: 'Sunburn, EDM, drugs, noise, permission, Vagator',         remarks: 'Contentious permissions — date varies' },
  { slNo: 40, occasion: 'Goa Liberation Day',                                     date: '19 December',  monitoringRange: '18 Dec – 20 Dec',  keywords: 'Goa Liberation Day, 19 December, Operation Vijay, freedom fighters', remarks: 'High priority — state event' },
  { slNo: 41, occasion: 'Christmas',                                              date: '25 December',  monitoringRange: '24 Dec – 26 Dec',  keywords: 'Christmas, midnight mass, church, crib, carols',          remarks: 'Tourism peak' },
];

// Ensure recurring seed events exist in the DB (replaces old data with updated list)
const seedRecurringEvents = async () => {
  try {
    // Remove old seed data and re-insert the current seed list
    const existing = await MasterCalendarEvent.find({ isRecurring: true, createdBy: 'system' });
    const existingSlNos = new Set(existing.map(e => e.slNo));
    const seedSlNos = new Set(RECURRING_SEED.map(e => e.slNo));

    // Delete old system events whose slNo no longer exists in seed
    for (const evt of existing) {
      if (!seedSlNos.has(evt.slNo)) {
        await MasterCalendarEvent.deleteOne({ _id: evt._id });
      }
    }

    // Upsert all seed events
    for (const evt of RECURRING_SEED) {
      await MasterCalendarEvent.findOneAndUpdate(
        { isRecurring: true, slNo: evt.slNo },
        { $set: { ...evt, isRecurring: true, createdBy: 'system' } },
        { upsert: true, new: true }
      );
    }
    console.log(`[MasterCalendar] ${RECURRING_SEED.length} Goa recurring events seeded`);
  } catch (err) {
    console.error('[MasterCalendar] Seed error:', err.message);
  }
};

// ── CRUD controllers ──────────────────────────────────────

const listEvents = async (req, res) => {
  try {
    const { recurring } = req.query;
    const query = {};
    if (recurring === 'true') query.isRecurring = true;
    else if (recurring === 'false') query.isRecurring = false;

    const events = await MasterCalendarEvent.find(query).sort({ slNo: 1, createdAt: -1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createEvent = async (req, res) => {
  try {
    const { occasion, date, monitoringRange, keywords, remarks, isRecurring } = req.body;
    if (!occasion || !date) {
      return res.status(400).json({ message: 'Occasion and date are required' });
    }

    // Auto-assign slNo
    const maxDoc = await MasterCalendarEvent.findOne({ isRecurring: !!isRecurring })
      .sort({ slNo: -1 }).select('slNo').lean();
    const slNo = (maxDoc?.slNo || 0) + 1;

    const event = await MasterCalendarEvent.create({
      slNo,
      occasion,
      date,
      monitoringRange: monitoringRange || '',
      keywords: keywords || '',
      remarks: remarks || '',
      isRecurring: !!isRecurring,
      createdBy: req.user?.email || 'unknown'
    });

    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const event = await MasterCalendarEvent.findOne({ id });
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const allowedFields = ['occasion', 'date', 'monitoringRange', 'keywords', 'remarks'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) event[field] = updates[field];
    }
    await event.save();
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await MasterCalendarEvent.findOne({ id });
    if (!event) return res.status(404).json({ message: 'Event not found' });

    await MasterCalendarEvent.deleteOne({ id });
    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  seedRecurringEvents,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent
};
