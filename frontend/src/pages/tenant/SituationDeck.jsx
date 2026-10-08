import React from 'react';
import { PLATFORM_LABEL, fmt, fmtDay } from './ReportBrief';
import { lcFirst, listJoin } from './reportRecommendations';

/**
 * Presentation-format report ("Situation assessment and way forward"): 16:9 slides.
 * Every figure, chart and data-driven headline is computed from the report's stats;
 * the written guidance (priorities, principles, moves, draft statement, plan) comes
 * from the event's briefing, and the preparer's name and details from the
 * workspace's branding. A slide whose data is missing is left out.
 */

const C = {
  navy: '#14275e', ink: '#1b2440', muted: '#5b6478', panel: '#edf1f9',
  orange: '#f08a24', blue: '#2f6fdf', red: '#c0392b', green: '#1f8f5a', purple: '#7b4fc4', teal: '#0f9aa8', grey: '#9aa6b8',
};
const SERIF = "'Lora', 'Noto Serif', Georgia, serif";
const SANS = "'Lato', 'Inter', 'Segoe UI', sans-serif";
const W = 1280;
const H = 720;

const pct1 = (n) => `${Number(n || 0).toFixed(1)}%`;
const pct0 = (n) => `${Math.round(Number(n || 0))}%`;
const share = (n, t) => (t ? (100 * n) / t : 0);
const lakh = (n) => (n / 1e5 >= 100 ? (n / 1e5).toFixed(0) : (n / 1e5).toFixed(n / 1e5 >= 10 ? 1 : 2));
const crore = (n) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)} crore` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} lakh` : fmt(n));
const shortDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }) : '');
const dayOf = (iso) => (iso ? new Date(new Date(iso).getTime() + 5.5 * 3600000).toISOString().slice(0, 10) : null);

// ── Slide furniture ─────────────────────────────────────────────────

const Slide = ({ n, footer, dark = false, children }) => (
  <section className="deck-slide" style={{ width: W, height: H, position: 'relative', overflow: 'hidden', background: dark ? C.navy : '#fff', color: dark ? '#fff' : C.ink, fontFamily: SANS, breakAfter: 'page', pageBreakAfter: 'always' }}>
    <div style={{ position: 'absolute', inset: '56px 64px 64px 64px' }}>{children}</div>
    <div style={{ position: 'absolute', left: 64, right: 64, bottom: 26, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: dark ? '#cfd6e6' : C.muted }}>
      <span>{footer}</span>{n ? <span>{n}</span> : null}
    </div>
  </section>
);
const Title = ({ children, color = C.navy }) => (
  <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 46, lineHeight: 1.1, margin: '0 0 28px', color }}>{children}</h2>
);
const Tile = ({ value, label, color, big = 44 }) => (
  <div style={{ background: color, color: '#fff', borderRadius: 14, padding: '22px 18px', textAlign: 'center', boxShadow: '0 4px 14px rgba(20,39,94,.12)' }}>
    <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: big, lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 17, marginTop: 6, opacity: 0.95 }}>{label}</div>
  </div>
);
const Card = ({ title, children, color, dark = false, style }) => (
  <div style={{ background: color || C.panel, color: dark ? '#fff' : C.ink, borderRadius: 14, padding: '18px 22px', boxShadow: '0 4px 14px rgba(20,39,94,.10)', ...style }}>
    {title && <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6, color: dark ? '#fff' : C.navy }}>{title}</div>}
    <div style={{ fontSize: 17, lineHeight: 1.4 }}>{children}</div>
  </div>
);
const Dot = ({ color, children, size = 64 }) => (
  <div style={{ width: size, height: size, minWidth: size, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontWeight: 700, fontSize: size * 0.42 }}>{children}</div>
);
const Callout = ({ children }) => (
  <div style={{ background: C.panel, borderRadius: 14, padding: '20px 24px', fontWeight: 700, fontSize: 21, lineHeight: 1.35, color: C.navy }}>{children}</div>
);

/** Horizontal bars with labels on the left and values on the right. */
const HBars = ({ rows, max, valueFmt = fmt, labelWidth = 230, barH = 34, gap = 14, caption }) => {
  const top = max || Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      {caption && <div style={{ fontWeight: 700, fontSize: 17, color: C.navy, marginBottom: 14 }}>{caption}</div>}
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', marginBottom: gap }}>
          <div style={{ width: labelWidth, minWidth: labelWidth, textAlign: 'right', paddingRight: 12, fontSize: 16, color: C.ink, lineHeight: 1.15 }}>{r.label}</div>
          <div style={{ height: barH, width: `${Math.max(1.5, (r.value / top) * 100) * 0.78}%`, background: r.color || C.blue, borderRadius: 2 }} />
          <div style={{ paddingLeft: 8, fontSize: 16 }}>{valueFmt(r.value)}</div>
        </div>
      ))}
    </div>
  );
};

/** Two stacked 100% bars (share of posts vs share of engagement). */
const StackBars = ({ rows, keys }) => (
  <div>
    {rows.map((r) => (
      <div key={r.label} style={{ display: 'flex', alignItems: 'center', marginBottom: 46 }}>
        <div style={{ width: 200, textAlign: 'right', paddingRight: 14, fontSize: 18 }}>{r.label}</div>
        <div style={{ flex: 1, display: 'flex', height: 120 }}>
          {keys.map(([k, color]) => (
            <div key={k} style={{ width: `${r.values[k]}%`, background: color, color: '#fff', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {r.values[k] >= 6 ? pct1(r.values[k]) : ''}
            </div>
          ))}
        </div>
      </div>
    ))}
    <div style={{ display: 'flex', gap: 18, justifyContent: 'center', fontSize: 16, paddingLeft: 200 }}>
      {keys.map(([k, color]) => <span key={k}><span style={{ display: 'inline-block', width: 12, height: 12, background: color, marginRight: 6 }} />{k[0].toUpperCase() + k.slice(1)}</span>)}
    </div>
  </div>
);

/** Donut chart with labelled segments. */
const Donut = ({ parts, label }) => {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const R = 150; const r = 85; const cx = 180; const cy = 180;
  let a0 = -Math.PI / 2;
  const arc = (p) => {
    const a1 = a0 + (2 * Math.PI * p.value) / total;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const [x0, y0] = pt(R, a0); const [x1, y1] = pt(R, a1); const [x2, y2] = pt(r, a1); const [x3, y3] = pt(r, a0);
    const mid = (a0 + a1) / 2; const [lx, ly] = pt((R + r) / 2, mid);
    const d = `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z`;
    a0 = a1;
    return { d, lx, ly };
  };
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, color: C.navy, marginBottom: 6 }}>{label}</div>
      <svg width="360" height="360" viewBox="0 0 360 360">
        {(shown.length === 1 ? [{ ...shown[0], value: shown[0].value - 0.001 }, { value: 0.001, color: shown[0].color }] : shown).map((p, i) => {
          const g = arc(p);
          return <g key={i}><path d={g.d} fill={p.color} />{p.value >= total * 0.04 && <text x={g.lx} y={g.ly + 7} textAnchor="middle" fontSize="20" fill="#fff">{Math.round(p.value)}</text>}</g>;
        })}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', justifyContent: 'center', fontSize: 16 }}>
        {parts.map((p) => <span key={p.label}><span style={{ display: 'inline-block', width: 12, height: 12, background: p.color, marginRight: 6 }} />{p.label}</span>)}
      </div>
    </div>
  );
};

// ── The deck ─────────────────────────────────────────────────────────

const SituationDeck = ({ report, workspace }) => {
  const d = report.data;
  const s = d.stats;
  const ev = d.event;
  const ex = s.executive_metrics || {};
  const b = ev.briefing || {};
  const brand = workspace?.branding || {};
  const name = ev.subject?.name || ev.short_name || 'the subject';
  const who = b.subject_label || name;
  const total = s.totals.relevant || 0;
  const footer = [brand.name, brand.classification && `${brand.classification}${b.prepared_for ? `: ${b.prepared_for.replace(/^For the /i, '')}` : ''}`].filter(Boolean).join('  |  ');

  const tone = (k) => s.tone.find((x) => x.key === k) || { count: 0, pct: 0 };
  const stanceS = (k) => (s.stance_toward_subject || []).find((x) => x.key === k) || { count: 0, pct: 0 };
  const stanceP = (k) => (s.stance_toward_protest || []).find((x) => x.key === k) || { count: 0, pct: 0 };
  const band = (k) => s.risk.bands.find((x) => x.key === k) || { count: 0, pct: 0 };
  const from = d.range?.from || report.range_from || report.period_start;
  const to = d.range?.to || report.range_to || report.period_end;
  // The day the report was generated is still in progress; leave it out of the daily charts.
  const genDay = dayOf(d.generated_at || report.created_at);
  const days = [...(s.timeline || [])].sort((a, c) => a.day.localeCompare(c.day)).filter((x, i, all) => !(i === all.length - 1 && x.day === genDay));
  const next = ex.next_point;

  // Narratives: drivers of criticism of the subject, and the counter-narrative.
  const narratives = (s.narratives || []).filter((n) => n.key !== 'other' && n.count > 0);
  const counter = narratives.find((n) => (ev.narratives || []).find((e) => e.key === n.key)?.example_protest_stance === 'critical');
  const drivers = (ex.criticism?.top_narratives || []).slice(0, 2);
  const shortLabel = (label) => label.replace(/^Demand for the Chief Election Commissioner's resignation$/, 'Resignation demand')
    .replace(/ and voter-roll deletion allegations$/, ' deletion allegations').replace(/^Criticism of the (.*) and its motives$/, 'Criticism of the $1')
    .replace(/^Permission refusals, policing and legal action$/, 'Permissions, policing').replace(/^Celebrity and opposition support$/, 'Celebrity, opposition')
    .replace(/^Satire, memes and slogans$/, 'Satire, memes').replace(/^Mobilisation for the (.*) protest in .*$/, 'Mobilisation for $1');

  // Tone against engagement.
  const toneEng = Object.fromEntries((s.tone_sections || []).map((t) => [t.key, t.engagement || 0]));
  const engTotal = Object.values(toneEng).reduce((a, v) => a + v, 0);
  const perPost = (k) => (tone(k).count ? toneEng[k] / tone(k).count : 0);
  const travel = perPost('neutral') ? perPost('negative') / perPost('neutral') : null;

  // Phases of the conversation, from the daily volume.
  const sortedTotals = days.map((x) => x.total).sort((a, c) => a - c);
  const median = sortedTotals.length ? sortedTotals[Math.floor(sortedTotals.length / 2)] : 0;
  const peak = days.reduce((m, x) => (!m || x.total > m.total ? x : m), null);
  const firstSurge = days.findIndex((x) => x.total >= Math.max(3, 2 * median));
  const peakIdx = days.indexOf(peak);
  const phase = (rows) => (rows.length ? {
    from: rows[0].day, to: rows[rows.length - 1].day,
    min: Math.min(...rows.map((x) => x.total)), max: Math.max(...rows.map((x) => x.total)),
    negMin: Math.min(...rows.map((x) => x.negative_pct)), negMax: Math.max(...rows.map((x) => x.negative_pct)),
    place: rows.reduce((m, x) => (x.total > (m?.total || 0) ? x : m), null)?.top_place,
  } : null);
  const phases = [
    firstSurge > 0 && { title: 'Early phase', color: C.teal, p: phase(days.slice(0, firstSurge)) },
    firstSurge >= 0 && peakIdx > firstSurge && { title: 'Escalation', color: C.orange, p: phase(days.slice(firstSurge, peakIdx)) },
    peak && { title: 'Peak and after', color: C.red, p: phase(days.slice(peakIdx)) },
  ].filter((x) => x && x.p);
  const chartDays = days.slice(-Math.min(days.length, 8));

  // Targets, places, platforms.
  const TL = { subject: name, election_commission: 'Election Commission', protest_organisers: 'Protest organisers', police: 'Police', political_leader: 'Political leaders', government: 'Government', judiciary: 'Judiciary', media: 'Media', organisation: 'Organisations' };
  const targets = (s.target_table || []).filter((t) => TL[t.type] && t.posts >= 50)
    .map((t) => ({ label: TL[t.type], value: share(t.negative, t.posts), type: t.type }))
    .sort((a, c) => c.value - a.value).slice(0, 6);
  const subjectTarget = (s.target_table || []).find((t) => t.type === 'subject');
  const aliases = (ev.subject?.aliases || []).filter((a) => /^[A-Z][a-z]+$/.test(a) && !name.includes(a));
  const nickname = (s.share_of_voice || []).filter((t) => aliases.includes(t.term)).sort((a, c) => c.count - a.count)[0];
  const placeKey = (x) => x.toLowerCase().replace(/,.*$/, '').replace(/bhawan/g, 'bhavan').trim();
  const places = [];
  (s.places?.rows || []).forEach((r) => { if (!places.some((x) => placeKey(x.place) === placeKey(r.place))) places.push(r); });
  const placeBars = places.slice(0, 6).map((r) => ({ label: r.place, value: share(r.negative, r.posts) })).sort((a, c) => c.value - a.value);
  const negOverall = tone('negative').pct;
  const placeTrend = (s.location_trends?.places || []).map((p) => {
    const i = p.by_day.indexOf(Math.max(...p.by_day));
    return { place: p.place, day: s.location_trends.days[i], posts: p.by_day[i] };
  }).filter((x) => x.posts > 0);
  const trendCards = [];
  placeTrend.forEach((t) => { if (trendCards.length < 2 && !trendCards.some((c) => c.day === t.day)) trendCards.push(t); });
  const nextFront = next && placeBars.find((p) => next.description.includes(p.label));
  const platforms = [...(s.by_platform || [])].filter((p) => p.relevant);
  const topByPosts = [...platforms].sort((a, c) => c.relevant - a.relevant)[0];
  const topByReach = [...platforms].sort((a, c) => (c.engagement / c.relevant) - (a.engagement / a.relevant))[0];
  const negByPlatform = platforms.map((p) => {
    const neg = ((s.tone_sections || []).find((t) => t.key === 'negative')?.by_platform || []).find((x) => x.platform === p.platform)?.count || 0;
    return { platform: p.platform, pct: share(neg, p.relevant) };
  }).sort((a, c) => c.pct - a.pct)[0];
  const accounts = (s.influencers || []).slice(0, 7).map((i) => ({
    label: `${i.name || i.handle || ''}, ${PLATFORM_LABEL[i.platform] || i.platform}`,
    value: i.score,
    color: ['news_media', 'journalist'].includes(i.account_type) ? C.grey : C.blue,
  }));

  // Claims and threats.
  const claims = Object.values((s.allegations || []).reduce((acc, a) => {
    const k = `${a.platform}:${a.engagement}`;
    (acc[k] = acc[k] || { ...a, texts: [] }).texts.push(a.text);
    return acc;
  }, {})).slice(0, 7).map((a) => ({ label: a.texts.join(' / ').replace(/^(.{0,60}).*$/, (m, g) => (m.length > 62 ? `${g.trim()}…` : m)), value: a.engagement, color: C.red }));
  const threats = ex.threats;
  const otherThreats = threats ? Math.max(0, threats.critical - threats.at_subject - threats.at_organisers) : 0;
  const singleSource = (ev.facts || []).filter((f) => f.status === 'single_source');

  const n = { i: 0 };
  const num = () => { n.i += 1; return n.i; };
  const slides = [];

  // 1. Cover
  slides.push(
    <Slide key="cover" dark footer={[brand.name, brand.classification].filter(Boolean).join('  |  ')}>
      <div style={{ display: 'flex', gap: 60, height: '100%' }}>
        <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 64, lineHeight: 1.08, margin: 0 }}>{b.title || 'Situation assessment and way forward'}</h1>
          <p style={{ fontSize: 24, lineHeight: 1.4, margin: '40px 0 0', opacity: 0.95 }}>{b.description || `Online public discussion on ${name}`}</p>
          <div style={{ fontSize: 19, lineHeight: 1.5, marginTop: 50, opacity: 0.9 }}>
            {b.prepared_for && <div>{b.prepared_for}</div>}
            <div>Monitoring period {fmtDay(from)} to {fmtDay(to)}</div>
            <div>Prepared {fmtDay(report.created_at || d.generated_at)}{brand.name ? ` by ${brand.name}` : ''}</div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Tile value={fmt(total)} label="public posts read" color={C.orange} big={40} />
            <Tile value={crore(s.totals.engagement)} label="engagements" color={C.blue} big={40} />
            <Tile value={pct0(tone('negative').pct)} label={`negative toward ${who.replace(/^the /, 'the ')}`} color={C.red} big={40} />
            {next ? <Tile value={shortDay(next.date)} label="next key date" color={C.green} big={40} /> : <Tile value={pct1(stanceS('supportive').pct)} label={`support ${who}`} color={C.green} big={40} />}
          </div>
          {b.disclaimer && <p style={{ fontStyle: 'italic', fontSize: 15, marginTop: 30, opacity: 0.85 }}>{b.disclaimer}</p>}
        </div>
      </div>
    </Slide>,
  );

  // 2. In short
  const periodDays = (s.timeline || []).length;
  slides.push(
    <Slide key="short" n={num() + 1} footer={footer}>
      <Title>In short</Title>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 26 }}>
        <Tile value={fmt(total)} label={`public posts in ${periodDays} days`} color={C.orange} />
        <Tile value={crore(s.totals.engagement)} label="engagements" color={C.blue} />
        <Tile value={pct0(tone('negative').pct)} label={`negative toward ${who}`} color={C.red} />
        <Tile value={pct1(stanceS('supportive').pct)} label={`support ${who}`} color={C.green} />
      </div>
      <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 26 }}>
        {[
          ex.criticism && drivers.length > 0 && [C.blue, '1', <><b>{pct1(ex.criticism.linked_share)}</b> of the posts that criticise {who} rest on {listJoin(drivers.map((x) => lcFirst(shortLabel(x.label))))}.</>],
          engTotal > 0 && [C.orange, '2', <>Posts negative toward {who} draw <b>{pct1(share(toneEng.negative || 0, engTotal))}</b> of all engagement{travel ? <>, about <b>{travel.toFixed(0)} times</b> as much per post as neutral ones</> : ''}.</>],
          [C.purple, '3', <>Opinion is divided: {pct1(stanceP('critical').pct)} of posts criticise the protest itself, and <b>{pct1(stanceP('supportive').pct)}</b> support it.</>],
        ].filter(Boolean).map(([color, k, text]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 26 }}><Dot color={color}>{k}</Dot><div style={{ fontSize: 24, lineHeight: 1.35 }}>{text}</div></div>
        ))}
      </div>
    </Slide>,
  );

  // 3. Five things this week
  if ((b.this_week || []).length) {
    const colors = [C.blue, C.green, C.orange, C.purple, C.teal];
    slides.push(
      <Slide key="week" n={num() + 1} footer={footer}>
        <Title>{b.this_week.length === 5 ? 'Five things' : `${b.this_week.length} things`} to do this week</Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {b.this_week.map((x, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, background: C.panel, borderRadius: 12, padding: '12px 22px', boxShadow: '0 3px 10px rgba(20,39,94,.08)' }}>
              <Dot color={colors[i % colors.length]} size={58}>{i + 1}</Dot>
              <div style={{ width: 470, fontWeight: 700, fontSize: 23, color: C.navy }}>{x.title}</div>
              <div style={{ flex: 1, fontSize: 20 }}>{x.detail}</div>
            </div>
          ))}
        </div>
      </Slide>,
    );
  }

  // 4. Daily volume and phases
  if (chartDays.length >= 3) {
    const maxDay = Math.max(...chartDays.map((x) => x.total));
    slides.push(
      <Slide key="spike" n={num() + 1} footer={footer}>
        <Title>{phases.length >= 3 ? 'How the conversation built up' : 'Daily volume'}</Title>
        <div style={{ display: 'flex', gap: 48 }}>
          <div style={{ flex: 1.5 }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: C.navy, marginBottom: 12 }}>Relevant posts per day, {shortDay(chartDays[0].day)} to {shortDay(chartDays[chartDays.length - 1].day)}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: 430, borderBottom: `1px solid ${C.grey}` }}>
              {chartDays.map((x) => (
                <div key={x.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ fontSize: 17, marginBottom: 6 }}>{fmt(x.total)}</div>
                  <div style={{ width: '100%', height: `${(x.total / maxDay) * 360}px`, background: x === peak ? C.red : C.blue }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 8 }}>{chartDays.map((x) => <div key={x.day} style={{ flex: 1, textAlign: 'center', fontSize: 16 }}>{shortDay(x.day)}</div>)}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {phases.map((ph, i) => (
              <Card key={ph.title} color={ph.color} dark title={`${i + 1}  ${ph.title}`} style={{ flex: 1 }}>
                {shortDay(ph.p.from)}{ph.p.to !== ph.p.from ? ` to ${shortDay(ph.p.to)}` : ''}: {ph.p.min === ph.p.max ? fmt(ph.p.max) : `${fmt(ph.p.min)} to ${fmt(ph.p.max)}`} posts a day,{' '}
                {Math.round(ph.p.negMin) === Math.round(ph.p.negMax) ? pct0(ph.p.negMax) : `${pct0(ph.p.negMin)} to ${pct0(ph.p.negMax)}`} negative{ph.p.place ? `. Most named: ${ph.p.place}` : ''}.
              </Card>
            ))}
          </div>
        </div>
      </Slide>,
    );
  }

  // 5. Tone against engagement
  if (engTotal > 0) {
    const toneKeys = [['negative', C.red], ['neutral', C.grey], ['positive', C.green]];
    slides.push(
      <Slide key="tone" n={num() + 1} footer={footer}>
        <Title>{travel && travel >= 1.5 ? `Negative posts travel ${travel.toFixed(0)} times further` : 'Where the engagement goes'}</Title>
        <div style={{ display: 'flex', gap: 48 }}>
          <div style={{ flex: 1.7, paddingTop: 30 }}>
            <StackBars keys={toneKeys} rows={[
              { label: 'Share of posts', values: Object.fromEntries(toneKeys.map(([k]) => [k, tone(k).pct])) },
              { label: 'Share of engagement', values: Object.fromEntries(toneKeys.map(([k]) => [k, share(toneEng[k] || 0, engTotal)])) },
            ]} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {travel && <Tile value={`${travel.toFixed(0)}x`} label="engagement per post: negative compared with neutral" color={C.orange} big={86} />}
            {b.callouts?.tone && <Callout>{b.callouts.tone}</Callout>}
          </div>
        </div>
      </Slide>,
    );
  }

  // 6. Narratives
  if (narratives.length) {
    const driverKeys = drivers.map((x) => x.key);
    slides.push(
      <Slide key="narr" n={num() + 1} footer={footer}>
        <Title>{drivers[0] ? `The criticism rests on ${lcFirst(shortLabel(drivers[0].label)).replace(/^resignation demand$/, 'the resignation demand')}` : 'What drives the conversation'}</Title>
        <div style={{ display: 'flex', gap: 48 }}>
          <div style={{ flex: 1.7 }}>
            <HBars caption="Posts per narrative (a post can carry several)" labelWidth={250} rows={narratives.slice(0, 7).map((x) => ({
              label: shortLabel(x.label), value: x.count, color: driverKeys.includes(x.key) ? C.red : x === counter ? C.blue : C.grey,
            }))} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {ex.criticism && <Tile value={pct1(ex.criticism.linked_share)} label={`of ${fmt(ex.criticism.critical_posts)} critical posts carry ${listJoin(drivers.map((x) => lcFirst(shortLabel(x.label))))}`} color={C.red} big={78} />}
            {b.callouts?.narratives && <Callout>{b.callouts.narratives}</Callout>}
          </div>
        </div>
      </Slide>,
    );
  }

  // 7. What the posts are about
  if (targets.length >= 3) {
    const subjectFirst = targets[0]?.type === 'subject';
    slides.push(
      <Slide key="targets" n={num() + 1} footer={footer}>
        <Title>{subjectFirst ? 'About the person, not the process' : 'Where the criticism is aimed'}</Title>
        <div style={{ display: 'flex', gap: 48 }}>
          <div style={{ flex: 1.7 }}>
            <HBars caption="Share of posts negative, by what the post is about" labelWidth={210} max={100} valueFmt={pct0} barH={58} gap={26}
              rows={targets.slice(0, 5).map((t) => ({ ...t, color: t.value >= 50 ? C.red : C.green }))} />
            {b.callouts?.targets && <p style={{ fontStyle: 'italic', fontSize: 18, marginTop: 6 }}>{b.callouts.targets}</p>}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {subjectTarget && <Tile value={pct0(share(subjectTarget.posts, total))} label={`of posts are mainly about ${name}`} color={C.blue} big={52} />}
            {nickname && <Tile value={fmt(nickname.count)} label={`posts use the nickname "${nickname.term}"`} color={C.purple} big={52} />}
            {b.callouts?.targets_action && <Callout>{b.callouts.targets_action}</Callout>}
          </div>
        </div>
      </Slide>,
    );
  }

  // 8. Places
  if (placeBars.length >= 3) {
    slides.push(
      <Slide key="places" n={num() + 1} footer={footer}>
        <Title>{nextFront ? `The next front is ${nextFront.label}` : 'Where the conversation is concentrated'}</Title>
        <div style={{ display: 'flex', gap: 48 }}>
          <div style={{ flex: 1.6 }}>
            <HBars caption={`Share of posts negative, by place named (overall ${pct0(negOverall)})`} labelWidth={170} max={100} valueFmt={pct1} barH={50} gap={22}
              rows={placeBars.map((p) => ({ ...p, color: p.value > negOverall ? C.red : C.blue }))} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {trendCards.map((t, i) => (
              <Card key={t.place} title={`${t.place}, ${shortDay(t.day)}`}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Dot color={i ? C.red : C.blue} size={46}>{i + 1}</Dot><span>Named in {fmt(t.posts)} posts on its busiest day.</span></div>
              </Card>
            ))}
            {(ex.languages || []).length > 0 && (
              <Card title="Language">
                {ex.languages.slice(0, 3).map((l) => `${l.language} ${pct0(share(l.posts, total))}`).join(' · ')} of posts. Respond in {listJoin(ex.languages.slice(0, 3).map((l) => l.language))} at a minimum.
              </Card>
            )}
          </div>
        </div>
      </Slide>,
    );
  }

  // 9. Accounts and platforms
  if (accounts.length >= 3) {
    slides.push(
      <Slide key="accounts" n={num() + 1} footer={footer}>
        <Title>A few accounts set the tone</Title>
        <div style={{ display: 'flex', gap: 48 }}>
          <div style={{ flex: 1.6 }}>
            <HBars caption="Engagement score, lakh (top accounts)" labelWidth={300} valueFmt={lakh} rows={accounts} barH={38} gap={16} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {topByPosts && <Tile value={pct1(share(topByPosts.relevant, total))} label={`of posts are on ${PLATFORM_LABEL[topByPosts.platform]}`} color={C.orange} big={46} />}
            {topByReach && <Tile value={PLATFORM_LABEL[topByReach.platform]} label="has the strongest reach per post" color={C.purple} big={46} />}
            {negByPlatform && <Tile value={pct0(negByPlatform.pct)} label={`negative on ${PLATFORM_LABEL[negByPlatform.platform]}, the highest`} color={C.red} big={46} />}
            {b.callouts?.accounts && <p style={{ fontStyle: 'italic', fontSize: 17, margin: 0 }}>{b.callouts.accounts}</p>}
          </div>
        </div>
      </Slide>,
    );
  }

  // 10. Claims
  if (claims.length >= 2) {
    slides.push(
      <Slide key="claims" n={num() + 1} footer={footer}>
        <Title>The claims that matter can be checked</Title>
        <div style={{ display: 'flex', gap: 48 }}>
          <div style={{ flex: 1.7 }}>
            <HBars caption="Engagements on the top post carrying each claim, lakh" labelWidth={360} valueFmt={lakh} rows={claims} barH={38} gap={16} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {b.callouts?.claims_quote && <Card color={C.green} dark title="A model answer" style={{ flex: 1 }}><i style={{ fontSize: 21 }}>{b.callouts.claims_quote}</i></Card>}
            {b.callouts?.claims_note && <Callout>{b.callouts.claims_note}</Callout>}
          </div>
        </div>
      </Slide>,
    );
  }

  // 11. Threats
  if (threats && threats.critical > 0) {
    slides.push(
      <Slide key="threats" n={num() + 1} footer={footer}>
        <Title>{threats.at_subject > 0 && threats.at_organisers > 0 ? 'Threats run in both directions' : 'Explicit threats'}</Title>
        <div style={{ display: 'flex', gap: 48 }}>
          <div style={{ flex: 1 }}>
            <Donut label={`${fmt(threats.critical)} explicit threats`} parts={[
              { label: 'Protest organisers', value: threats.at_organisers, color: C.blue },
              { label: `${who[0].toUpperCase() + who.slice(1)} or the Commission`, value: threats.at_subject, color: C.red },
              { label: 'Others or not stated', value: otherThreats, color: C.grey },
            ]} />
          </div>
          <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {next && <Card title={fmtDay(next.date)}><div style={{ display: 'flex', gap: 16, alignItems: 'center' }}><Dot color={C.red} size={52}>!</Dot><span>{b.callouts?.next_risk || `${fmt(next.mobilisation_posts)} posts mobilise for it; watch for confrontation.`}</span></div></Card>}
            {ex.information && <Card title="Misinformation"><div style={{ display: 'flex', gap: 16, alignItems: 'center' }}><Dot color={C.orange} size={52}>?</Dot><span>{fmt(ex.information.misattributed_media)} posts shared or disputed doctored, misattributed or AI-generated media.</span></div></Card>}
            {ex.communal !== undefined && <Card title="Communal abuse"><div style={{ display: 'flex', gap: 16, alignItems: 'center' }}><Dot color={C.purple} size={52}>⊘</Dot><span>{fmt(ex.communal)} high-risk posts carry communal, caste or religious abuse. {b.callouts?.communal || ''}</span></div></Card>}
          </div>
        </div>
      </Slide>,
    );
  }

  // 12. Principles
  if ((b.principles || []).length) {
    const colors = [C.blue, C.orange, C.green];
    slides.push(
      <Slide key="principles" n={num() + 1} footer={footer}>
        <Title>{b.principles.length === 3 ? 'Three principles' : 'Principles'} for the response</Title>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${b.principles.length}, 1fr)`, gap: 30 }}>
          {b.principles.map((x, i) => (
            <div key={i} style={{ background: colors[i % 3], color: '#fff', borderRadius: 14, padding: '26px 20px', textAlign: 'center', minHeight: 200 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Dot color={C.navy} size={70}>{i + 1}</Dot></div>
              <div style={{ fontWeight: 700, fontSize: 24 }}>{x.title}</div>
              <div style={{ fontSize: 19, marginTop: 10 }}>{x.detail}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, marginTop: 30 }}>
          {b.protected && <Card style={{ minHeight: 180 }}><div style={{ fontWeight: 700, fontSize: 23, color: C.green, marginBottom: 10 }}>Protected: answer with facts</div><div style={{ fontSize: 20 }}>{b.protected}</div></Card>}
          {b.actionable && <Card style={{ minHeight: 180 }}><div style={{ fontWeight: 700, fontSize: 23, color: C.red, marginBottom: 10 }}>Actionable: platforms, police, courts</div><div style={{ fontSize: 20 }}>{b.actionable}</div></Card>}
        </div>
      </Slide>,
    );
  }

  // 13. Moves
  if ((b.moves || []).length) {
    const colors = [C.blue, C.green, C.orange, C.purple, C.teal, C.red];
    slides.push(
      <Slide key="moves" n={num() + 1} footer={footer}>
        <Title>{b.moves.length === 9 ? 'Nine moves' : 'Moves'}</Title>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }}>
          {b.moves.map((x, i) => (
            <div key={i} style={{ background: colors[i % colors.length], color: '#fff', borderRadius: 14, padding: '16px 20px', minHeight: 150 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 46 }}>{i + 1}</span>
                <span style={{ fontWeight: 700, fontSize: 21, lineHeight: 1.2 }}>{x.title}</span>
              </div>
              <div style={{ fontSize: 17, marginTop: 8, lineHeight: 1.35 }}>{x.detail}</div>
            </div>
          ))}
        </div>
      </Slide>,
    );
  }

  // 14. Draft statement
  if ((b.statement || []).length) {
    slides.push(
      <Slide key="statement" n={num() + 1} footer={footer}>
        <Title>{b.statement_title || 'A draft statement'}</Title>
        <div style={{ background: C.panel, borderRadius: 14, padding: '40px 40px', minHeight: 400, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
          {b.statement.map((para, i) => <p key={i} style={{ fontStyle: 'italic', fontSize: 21, lineHeight: 1.45, margin: 0, color: C.navy }}>{para}</p>)}
        </div>
        {b.statement_note && <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 22 }}><Dot color={C.orange} size={58}>✎</Dot><b style={{ fontSize: 21 }}>{b.statement_note}</b></div>}
      </Slide>,
    );
  }

  // 15. Plan
  if ((b.plan || []).length) {
    const colors = [C.red, C.orange, C.purple, C.blue, C.green];
    slides.push(
      <Slide key="plan" n={num() + 1} footer={footer}>
        <Title>The next {b.plan[b.plan.length - 1]?.label?.match(/\d+ days/) ? b.plan[b.plan.length - 1].label : 'steps'}</Title>
        <div style={{ position: 'relative', marginTop: 20 }}>
          <div style={{ position: 'absolute', left: 20, right: 20, top: 92, height: 6, background: '#c3cad8' }} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${b.plan.length}, 1fr)`, gap: 22 }}>
            {b.plan.map((x, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, color: C.navy, height: 50 }}>{x.label}</div>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 22px' }}><div style={{ width: 56, height: 56, borderRadius: '50%', background: colors[i % 5], position: 'relative', zIndex: 1 }} /></div>
                <div style={{ background: colors[i % 5], color: '#fff', borderRadius: 14, padding: '18px 16px', textAlign: 'left', minHeight: 330, fontSize: 20, lineHeight: 1.4 }}>{x.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </Slide>,
    );
  }

  // 16. Measures
  slides.push(
    <Slide key="measures" n={num() + 1} footer={footer}>
      <Title>How we will know it is working</Title>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 20 }}>
        <thead>
          <tr style={{ background: C.navy, color: '#fff', textAlign: 'left' }}>
            {['Measure', `Baseline, ${shortDay(from)} to ${shortDay(to)}`, 'Direction we want'].map((h) => <th key={h} style={{ padding: '16px 18px', borderRight: '1px solid #fff' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[
            [`Share of posts critical of ${who}`, pct1(stanceS('critical').pct), 'Down'],
            [`Share supportive or neutral toward ${who}`, `${pct1(stanceS('supportive').pct + stanceS('neutral').pct)} (${pct1(stanceS('supportive').pct)} + ${pct1(stanceS('neutral').pct)})`, 'Up'],
            engTotal > 0 && ['Share of engagement going to negative posts', pct1(share(toneEng.negative || 0, engTotal)), 'Down'],
            ['High and critical-risk posts', fmt(band('critical').count + band('high').count), 'Down'],
            ...(b.measures_extra || []).map((m) => [m.measure, m.baseline, m.direction]),
          ].filter(Boolean).map(([m, base, dir]) => (
            <tr key={m} style={{ borderBottom: '1px solid #d5dbe6' }}>
              <td style={{ padding: '16px 18px', fontWeight: 700, borderRight: '1px solid #d5dbe6' }}>{m}</td>
              <td style={{ padding: '16px 18px', borderRight: '1px solid #d5dbe6' }}>{base}</td>
              <td style={{ padding: '16px 18px', fontWeight: 700, color: C.green }}>{dir}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Slide>,
  );

  // 17. Support
  if ((brand.support || []).length) {
    const colors = [C.blue, C.purple, C.teal, C.orange, C.green];
    slides.push(
      <Slide key="support" n={num() + 1} footer={footer}>
        <Title>How {brand.short_name || (brand.name || '').replace(/ (Softech )?Solutions Limited$/i, '') || 'we'} can support</Title>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {brand.support.map((x, i) => (
            <Card key={i} style={{ minHeight: 190 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}><Dot color={colors[i % 5]} size={58}>{i + 1}</Dot><b style={{ fontSize: 22, color: C.navy }}>{x.title}</b></div>
              <div style={{ fontSize: 19 }}>{x.detail}</div>
            </Card>
          ))}
          {brand.safeguards && (
            <div style={{ background: C.navy, color: '#fff', borderRadius: 14, padding: '18px 22px', minHeight: 190 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}><Dot color={C.orange} size={58}>✓</Dot><b style={{ fontSize: 22 }}>Safeguards</b></div>
              <div style={{ fontSize: 19 }}>{brand.safeguards}</div>
            </div>
          )}
        </div>
        {brand.next_step && <div style={{ marginTop: 30, fontWeight: 700, fontSize: 22, color: C.navy }}>{brand.next_step}</div>}
      </Slide>,
    );
  }

  // 18. Notes on the figures (computed caveats)
  const t = s.totals;
  slides.push(
    <Slide key="notes" n={num() + 1} footer={footer}>
      <Title>Notes on the figures</Title>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 19 }}>
        <thead><tr style={{ background: C.navy, color: '#fff', textAlign: 'left' }}><th style={{ padding: '14px 18px', width: 260 }}>Item</th><th style={{ padding: '14px 18px' }}>What to know</th></tr></thead>
        <tbody>
          {[
            ['Coverage', `${fmt(t.collected)} posts collected; ${fmt(t.relevant)} analysed as relevant, ${fmt(t.excluded_unrelated)} set aside as unrelated${t.pending ? `, ${fmt(t.pending)} not yet analysed (mostly recent Instagram comments)` : ''}. Duplicates are merged at collection.`],
            threats && ['Explicit threats', `${fmt(threats.at_organisers)} at the protest organisers + ${fmt(threats.at_subject)} at ${who} or the Commission + ${fmt(otherThreats)} others = ${fmt(threats.critical)}. The executive report lists the newest 12.`],
            ex.information && ['Manipulated media', `${fmt(ex.information.misattributed_media)} posts share or dispute doctored, misattributed or AI-generated media (narrative label plus analyst notes).`],
            singleSource.length > 0 && ['Single-source items', `${singleSource.slice(0, 3).map((f) => f.statement.replace(/\.$/, '')).join('; ')}: do not repeat as fact.`],
            ['"Negative"', `Measures criticism of ${who} or support for the protest against ${who}, not hostility or threat.`],
          ].filter(Boolean).map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid #d5dbe6' }}><td style={{ padding: '14px 18px', fontWeight: 700, verticalAlign: 'top' }}>{k}</td><td style={{ padding: '14px 18px', lineHeight: 1.4 }}>{v}</td></tr>
          ))}
        </tbody>
      </table>
    </Slide>,
  );

  // 19. Closing
  if (b.closing) {
    const colors = [C.blue, C.green, C.purple, C.orange];
    slides.push(
      <Slide key="closing" dark footer={[brand.name, brand.classification].filter(Boolean).join('  |  ')}>
        <div style={{ display: 'flex', gap: 60, height: '100%' }}>
          <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <h1 style={{ fontFamily: SERIF, fontSize: 62, margin: '40px 0 0' }}>{b.closing.title}</h1>
            <p style={{ fontSize: 24, lineHeight: 1.4 }}>{b.closing.line}</p>
            <div style={{ fontSize: 18, lineHeight: 1.6, opacity: 0.9 }}>
              {brand.name && <div>{brand.name}</div>}
              {brand.address && <div>{brand.address}</div>}
              {brand.contact && <div>{brand.contact}</div>}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34 }}>
            {(b.closing.pillars || []).map((p, i) => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 24 }}><Dot color={colors[i % 4]} size={78}>{i + 1}</Dot><b style={{ fontSize: 25 }}>{p}</b></div>
            ))}
          </div>
        </div>
      </Slide>,
    );
  }

  return (
    <div className="situation-deck">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Lora:ital,wght@0,700;1,400&display=swap');
        @media screen { .situation-deck { display: flex; flex-direction: column; gap: 18px; } .situation-deck .deck-slide { zoom: 0.62; box-shadow: 0 2px 10px rgba(0,0,0,.15); } }
        @media print { .situation-deck .deck-slide:last-child { break-after: auto; page-break-after: auto; } }
      `}</style>
      {slides}
    </div>
  );
};

export default SituationDeck;
