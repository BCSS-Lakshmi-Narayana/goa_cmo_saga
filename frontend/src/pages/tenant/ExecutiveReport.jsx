import React from 'react';
import { PLATFORM_LABEL, DailyToneChart, Footage, fmt, fmtBig, fmtDay } from './ReportBrief';

/**
 * Executive-format report: a short, decision-oriented reading of the same
 * report data as the detailed brief. Every figure and every judgement
 * (levels, interpretations) is computed from the report's stats.
 */

const NAVY = '#1e3a5f';
// Lower-case a label's first letter for mid-sentence use, but keep proper names ("Special Intensive Revision…").
const lcFirst = (s) => (!s || /^[A-Z][\w'’-]* [A-Z]/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
const pctTxt = (n) => `${Number(n || 0).toFixed(1)}%`;
const share = (n, total) => (total ? (100 * n) / total : 0);
const listJoin = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

const H2 = ({ n, children }) => (
  <h2 className="mt-7 mb-2 pb-1 border-b-2 text-[17px] font-bold tracking-wide uppercase" style={{ borderColor: NAVY, color: NAVY, breakAfter: 'avoid' }}>
    {n}. {children}
  </h2>
);
const H3 = ({ children }) => <h3 className="mt-4 mb-1.5 text-[14px] font-bold text-slate-800" style={{ breakAfter: 'avoid' }}>{children}</h3>;
const P = ({ children }) => <p className="text-[13px] leading-relaxed text-slate-800 mb-2">{children}</p>;
const Bullets = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1 text-[13px] text-slate-800 mb-2">{items.filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}</ul>
);
const Note = ({ label, children }) => (
  <div className="my-3 border-l-4 bg-slate-50 px-3 py-2 text-[13px] text-slate-800" style={{ borderColor: NAVY }}>
    <span className="font-bold">{label}: </span>{children}
  </div>
);
const Table = ({ head, rows, align = [] }) => (
  <table className="w-full text-[12.5px] border-collapse mb-3">
    <thead style={{ breakAfter: 'avoid' }}>
      <tr style={{ background: NAVY }} className="text-white text-left">
        {head.map((h, i) => <th key={h} className={`px-2.5 py-1.5 font-semibold ${align[i] === 'r' ? 'text-right' : ''}`}>{h}</th>)}
      </tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={i} className="border-b border-slate-200 odd:bg-white even:bg-slate-50">
          {r.map((c, j) => <td key={j} className={`px-2.5 py-1.5 align-top ${align[j] === 'r' ? 'text-right tabular-nums' : ''}`}>{c}</td>)}
        </tr>
      ))}
    </tbody>
  </table>
);

const LEVEL_STYLE = { high: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-emerald-100 text-emerald-800', info: 'bg-slate-100 text-slate-700' };
const Level = ({ level, children }) => <span className={`inline-block rounded px-2 py-0.5 text-[12px] font-semibold ${LEVEL_STYLE[level]}`}>{children}</span>;

const ExecutiveReport = ({ report }) => {
  const d = report.data;
  const s = d.stats;
  const ev = d.event;
  const ex = s.executive_metrics || {};
  const name = ev.subject?.name || ev.short_name || 'the subject';
  const total = s.totals.relevant || 0;

  const tone = (k) => s.tone.find((x) => x.key === k) || { count: 0, pct: 0 };
  const stanceS = (k) => (s.stance_toward_subject || []).find((x) => x.key === k) || { count: 0, pct: 0 };
  const stanceP = (k) => (s.stance_toward_protest || []).find((x) => x.key === k) || { count: 0, pct: 0 };
  const band = (k) => s.risk.bands.find((x) => x.key === k) || { count: 0, pct: 0 };
  const neg = tone('negative').pct;
  const pos = tone('positive').pct;
  const criticalOfSubject = stanceS('critical').pct;
  const protestSupport = stanceP('supportive').pct;
  const highCritical = band('critical').count + band('high').count;
  const highCriticalShare = share(highCritical, total);

  // Volume: the peak day against the median day; the last day of the period.
  const days = [...(s.timeline || [])].sort((a, b) => a.day.localeCompare(b.day));
  const peak = days.reduce((m, x) => (!m || x.total > m.total ? x : m), null);
  const others = days.filter((x) => x !== peak).map((x) => x.total).sort((a, b) => a - b);
  const median = ex.volume?.median_day_posts ?? (others.length ? others[Math.floor(others.length / 2)] : 0);
  const multiple = ex.volume?.peak_multiple ?? (median ? Number((peak.total / median).toFixed(1)) : null);
  const last = days[days.length - 1];
  const peakIsRecent = peak && days.indexOf(peak) >= days.length - 3;

  // Narratives: "other" left out; the counter-narrative is the one whose examples are critical of the protest.
  const narratives = (s.narratives || []).filter((n) => n.key !== 'other' && n.count > 0);
  const counter = narratives.find((n) => (ev.narratives || []).find((e) => e.key === n.key)?.example_protest_stance === 'critical');
  // What drives criticism of the subject: the narratives critical posts carry most (falls back to the overall ranking).
  const drivers = ex.criticism?.top_narratives?.length
    ? ex.criticism.top_narratives.map((t) => ({ ...(narratives.find((n) => n.key === t.key) || { label: t.label, pct: 0 }), critical_share: t.share }))
    : narratives.filter((n) => n !== counter);
  const leading = drivers;
  const next = ex.next_point;
  const nextLabel = next ? fmtDay(next.date) : null;
  const nextWhat = next ? next.description.split('. ')[0].replace(/\.$/, '') : null;
  const platforms = [...s.by_platform].filter((p) => p.relevant).sort((a, b) => b.relevant - a.relevant);
  const period = `${fmtDay(d.range?.from || report.range_from || report.period_start)} to ${fmtDay(d.range?.to || report.range_to || report.period_end)}`;

  // Levels for the overall assessment.
  const toneWord = neg >= 50 ? 'Predominantly negative' : neg >= 35 && neg > pos ? 'Mostly negative' : pos >= 50 ? 'Predominantly positive' : 'Mixed';
  const sizeWord = (p) => (p >= 30 ? ['high', 'Significant'] : p >= 15 ? ['medium', 'Moderate'] : ['low', 'Limited']);
  const intensity = multiple >= 10 || (peakIsRecent && multiple >= 5) ? ['high', 'High'] : multiple >= 3 ? ['medium', 'Elevated'] : ['low', 'Moderate'];
  const riskLevel = highCritical === 0 ? ['low', 'None identified'] : highCriticalShare < 3 ? ['medium', 'Limited in volume, but requires attention'] : ['high', 'Elevated'];
  const mobilisation = !next ? ['info', 'No scheduled mobilisation identified']
    : next.recent_posts >= 0.3 * next.mobilisation_posts ? ['high', `Increasing ahead of ${nextLabel}`] : ['medium', `Present ahead of ${nextLabel}`];
  const integrity = ex.information?.misattributed_media ? ['medium', 'Requires continued monitoring'] : ['low', 'No significant issues identified'];

  // ── Extra material for the decision-maker ──
  const vc = s.volume_change || {};
  const dayChange = vc.previous_24h ? ((vc.last_24h - vc.previous_24h) / vc.previous_24h) * 100 : null;
  // Places: merge spellings and "Place, City" duplicates of the same venue.
  const placeKey = (x) => x.toLowerCase().replace(/,.*$/, '').replace(/bhawan/g, 'bhavan').trim();
  const places = [];
  (s.places?.rows || []).forEach((r) => { if (!places.some((x) => placeKey(x.place) === placeKey(r.place))) places.push(r); });
  const influencers = (s.influencers || []).slice(0, 10);
  const mainStance = (st = {}) => {
    const known = Object.entries(st).filter(([k]) => k !== 'unclear').sort((a, b) => b[1] - a[1]);
    return known.length ? known[0][0] : 'unclear';
  };
  const threatRows = ex.threats?.rows || (s.risk?.rows || []).filter((r) => r.risk_band === 'critical');
  const shownThreats = (threatRows.length >= 5 ? threatRows : s.risk?.rows || []).slice(0, 12);
  const facts = ev.facts || [];
  const factCount = (k) => facts.filter((f) => f.status === k).length;
  const openClaims = facts.filter((f) => f.status !== 'verified');
  const upcoming = (d.attention || []).filter((a) => /^Upcoming/i.test(a.title));
  const recs = d.recommendations || {};
  const REC_TITLES = [
    ['fact_check', 'Fact-check priorities'],
    ['clarifications', 'Clarifications the Commission could issue'],
    ['communication', 'Communication'],
    ['information_gaps', 'Information gaps to close'],
    ['monitoring', 'Monitoring'],
    ['safety', 'Safety and security'],
  ].filter(([k]) => (recs[k] || []).length);

  const assessment = [
    ['Conversation intensity', intensity],
    ['Overall tone', [neg >= 50 ? 'high' : 'medium', toneWord]],
    [`Direct criticism of ${name}`, sizeWord(criticalOfSubject)],
    ['Support for the protest or its demands', sizeWord(protestSupport)],
    ['High and critical risk', riskLevel],
    ['Mobilisation risk', mobilisation],
    ['Information integrity risk', integrity],
  ];

  return (
    <article className="max-w-[900px] mx-auto text-slate-900">
      {/* Cover */}
      <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">Executive social media monitoring report</div>
      <h1 className="text-[28px] font-extrabold leading-tight mt-1" style={{ color: NAVY }}>{name}</h1>
      {ev.subject?.role && <div className="text-[16px] font-semibold text-slate-700">{ev.subject.role}</div>}
      <p className="text-[13px] text-slate-600 mt-1">{ev.name}</p>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[12.5px] border-y py-2" style={{ borderColor: NAVY }}>
        <div><span className="font-semibold">Monitoring period: </span>{period}</div>
        <div><span className="font-semibold">Platforms: </span>{platforms.map((p) => PLATFORM_LABEL[p.platform] || p.platform).join(', ')}</div>
      </div>

      <div className="mt-4 grid grid-cols-4 border-t-4 bg-slate-50" style={{ borderColor: NAVY }}>
        {[
          [fmt(total), 'Relevant posts'],
          [pctTxt(neg), 'Negative tone'],
          [pctTxt(criticalOfSubject), `Critical of ${name}`],
          [dayChange === null ? '—' : `${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(0)}%`, 'Last 24 hours against the 24 before'],
        ].map(([v, l]) => (
          <div key={l} className="px-3 py-2.5 border-r last:border-r-0 border-white">
            <div className="text-[22px] font-bold leading-tight" style={{ color: NAVY }}>{v}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</div>
          </div>
        ))}
      </div>

      {/* 1 */}
      <H2 n={1}>Executive summary</H2>
      <H3>Overall conversation</H3>
      <P>
        The monitored conversation shows a {lcFirst(toneWord)} overall tone ({pctTxt(neg)} negative), with discussion largely centred on{' '}
        {listJoin(narratives.slice(0, 4).map((n) => lcFirst(n.label)))}.
      </P>
      <P>
        However, overall sentiment should not be read directly as public sentiment toward {name}. The stance analysis shows that{' '}
        {pctTxt(criticalOfSubject)} of relevant posts were critical of {name}, while {pctTxt(protestSupport)} expressed support for the protest or its demands.
      </P>
      {peak && (
        <P>
          Conversation volume {peakIsRecent ? 'increased significantly' : 'peaked'} on {fmtDay(peak.day)}
          {last && last !== peak ? `, followed by ${last.total >= median * 3 ? 'continued high activity' : 'lower activity'} on ${fmtDay(last.day)}` : ''}.
          {next ? ` ${nextWhat}, on ${nextLabel}, is the key near-term mobilisation watchpoint.` : ''}
        </P>
      )}

      <H3>Key findings</H3>
      <Table
        head={['Indicator', 'Observation']}
        align={['l', 'r']}
        rows={[
          ['Relevant posts analysed', fmt(total)],
          ['Negative overall tone', pctTxt(neg)],
          [`Critical toward ${name}`, pctTxt(criticalOfSubject)],
          ['Supportive of the protest or its demands', pctTxt(protestSupport)],
          ['High and critical risk posts', fmt(highCritical)],
          ['Explicit threats or calls for violence', fmt(band('critical').count)],
          ...(next ? [[`Mobilisation posts for ${nextLabel}`, fmt(next.mobilisation_posts)]] : []),
          ['Views recorded by the platforms', fmtBig(s.totals.views)],
          ['Engagements (likes, comments, shares)', fmtBig(s.totals.engagement)],
        ]}
      />
      <Note label="Executive takeaway">
        The conversation is {lcFirst(toneWord)}, with direct criticism of {name} concentrated around{' '}
        {listJoin(leading.slice(0, 2).map((n) => lcFirst(n.label)))}.
        {counter && counter.pct >= 10 ? ` At the same time, a substantial parallel conversation (${pctTxt(counter.pct)} of posts) is ${lcFirst(counter.label)}.` : ''}
        {' '}{next ? `The ${nextLabel} mobilisation` : 'Further mobilisation'}
        {ex.information?.misattributed_media
          ? ' and the spread of potentially misleading or manipulated content are the key areas requiring continued monitoring.'
          : ' is the key area requiring continued monitoring.'}
      </Note>

      {/* 2 */}
      <H2 n={2}>Conversation landscape</H2>
      <H3>Volume and tone</H3>
      <P>{fmt(total)} relevant posts were analysed across {platforms.length} platforms.</P>
      <Table
        head={['Tone', 'Posts', 'Share']}
        align={['l', 'r', 'r']}
        rows={['negative', 'neutral', 'positive'].map((k) => tone(k)).sort((a, b) => b.pct - a.pct)
          .map((t) => [t.key[0].toUpperCase() + t.key.slice(1), fmt(t.count), pctTxt(t.pct)])}
      />
      <H3>Platform contribution</H3>
      <Table
        head={['Platform', 'Relevant posts', 'Share']}
        align={['l', 'r', 'r']}
        rows={platforms.map((p) => [PLATFORM_LABEL[p.platform] || p.platform, fmt(p.relevant), pctTxt(share(p.relevant, total))])}
      />
      <H3>Posts and negativity by day</H3>
      <p className="text-[11.5px] text-slate-600 mb-1" style={{ breakAfter: 'avoid' }}>Relevant posts per day (newest first), split by tone; the line is the share of negative posts.</p>
      <DailyToneChart rows={days} />
      {peak && (
        <>
          <H3>Activity trend</H3>
          <P>
            {peakIsRecent && multiple >= 3
              ? `Conversation remained comparatively limited during the earlier monitoring period before increasing sharply on ${fmtDay(peak.day)}.`
              : `Conversation peaked on ${fmtDay(peak.day)}.`}
          </P>
          <Bullets items={[
            `${fmtDay(peak.day)}: ${fmt(peak.total)} relevant posts`,
            last && last !== peak ? `${fmtDay(last.day)}: ${fmt(last.total)} relevant posts` : null,
            multiple ? `${fmtDay(peak.day)} was about ${multiple}× the median daily volume (${fmt(median)} posts)` : null,
          ]}
          />
          <Note label="Interpretation">
            {peakIsRecent
              ? `The discussion appears to have entered a higher-intensity phase${next ? ' ahead of the announced protest activity' : ''}.`
              : 'Activity has eased since the peak; watch for renewed spikes around scheduled events.'}
          </Note>
        </>
      )}

      {/* 3 */}
      <H2 n={3}>What is driving the conversation?</H2>
      <H3>Top narratives</H3>
      <Table
        head={['Rank', 'Narrative', 'Posts', 'Share']}
        align={['l', 'l', 'r', 'r']}
        rows={narratives.slice(0, 7).map((n, i) => [i + 1, n.label, fmt(n.count), pctTxt(n.pct)])}
      />
      <H3>Narrative interpretation</H3>
      <Bullets items={[
        narratives[0] && `${narratives[0].label} is the dominant narrative (${pctTxt(narratives[0].pct)} of relevant posts)${narratives[0].key === leading[0]?.key ? ` and the primary criticism directed at ${name}` : ''}.`,
        leading[0]?.critical_share !== undefined && `Among posts critical of ${name}, ${listJoin(leading.slice(0, 2).map((n) => `${pctTxt(n.critical_share)} carry ${lcFirst(n.label)}`))}.`,
        leading[1] && leading[1].key !== narratives[0]?.key && `${leading[1].label} forms a significant supporting theme (${pctTxt(leading[1].pct)} of relevant posts).`,
        counter && `A separate and substantial narrative, ${lcFirst(counter.label)} (${pctTxt(counter.pct)}), shows that the conversation is not uniformly aligned with the protest.`,
      ]}
      />

      {(s.allegations || []).length > 0 && (
        <>
          <H3>Allegations circulating about {name}</H3>
          <p className="text-[11.5px] text-slate-600 mb-1" style={{ breakAfter: 'avoid' }}>The most-engaged allegations stated in posts. These are claims made by posters, not findings.</p>
          <Table head={['Allegation', 'Platform', 'Engagement']} align={['l', 'l', 'r']}
            rows={s.allegations.slice(0, 8).map((a) => [a.text, PLATFORM_LABEL[a.platform] || a.platform, fmt(a.engagement)])} />
        </>
      )}
      {(d.allegation_themes || []).length > 0 && (
        <>
          <H3>Main allegation themes and their status</H3>
          <Table head={['Theme', 'Status']} rows={d.allegation_themes.map((a) => [a.theme, a.status_note])} />
        </>
      )}

      {/* 4 */}
      <H2 n={4}>Stance analysis</H2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <H3>Stance toward {name}</H3>
          <Table head={['Stance', 'Share']} align={['l', 'r']}
            rows={[...(s.stance_toward_subject || [])].sort((a, b) => b.pct - a.pct).map((x) => [x.key[0].toUpperCase() + x.key.slice(1), pctTxt(x.pct)])} />
        </div>
        <div>
          <H3>Stance toward the protest or its demands</H3>
          <Table head={['Stance', 'Share']} align={['l', 'r']}
            rows={[...(s.stance_toward_protest || [])].sort((a, b) => b.pct - a.pct).map((x) => [x.key[0].toUpperCase() + x.key.slice(1), pctTxt(x.pct)])} />
        </div>
      </div>
      <Note label="Key interpretation">
        The two stance measures should be read separately.{' '}
        {protestSupport > criticalOfSubject
          ? `Support for the protest or its demands (${pctTxt(protestSupport)}) is stronger than direct criticism of ${name} (${pctTxt(criticalOfSubject)}), and only ${pctTxt(stanceS('supportive').pct)} of posts support ${name}.`
          : `Direct criticism of ${name} (${pctTxt(criticalOfSubject)}) outweighs support for the protest or its demands (${pctTxt(protestSupport)}).`}
        {' '}This distinction matters when interpreting the overall negative tone.
      </Note>

      {(s.target_table || []).length > 0 && (
        <>
          <H3>What the posts are mainly about</H3>
          <Table head={['Mainly about', 'Posts', 'Negative', 'Neutral', 'Positive']} align={['l', 'r', 'r', 'r', 'r']}
            rows={s.target_table.slice(0, 6).map((t) => [
              { subject: name, election_commission: 'The Election Commission', protest_organisers: 'The protest organisers', police: 'The police', political_leader: 'Political leaders', government: 'The government', judiciary: 'The judiciary', media: 'The media', organisation: 'Organisations', other: 'Other' }[t.type] || t.type,
              fmt(t.posts), pctTxt(share(t.negative, t.posts)), pctTxt(share(t.neutral, t.posts)), pctTxt(share(t.positive, t.posts)),
            ])} />
        </>
      )}

      {/* 5 */}
      <H2 n={5}>Who is driving the conversation</H2>
      <H3>Most influential public accounts</H3>
      <p className="text-[11.5px] text-slate-600 mb-1" style={{ breakAfter: 'avoid' }}>Ranked by engagement score (likes, plus twice the comments, three times the shares and a tenth of the views). Only public figures, media and organisations are named.</p>
      <Table head={['Account', 'Platform', 'Posts', 'Engagement score', 'Main stance toward ' + name]} align={['l', 'l', 'r', 'r', 'l']}
        rows={influencers.map((i) => [
          <span><span className="font-semibold">{i.name || i.handle}</span>{i.top?.url ? <> · <a href={i.top.url} className="text-blue-700">top post</a></> : null}</span>,
          PLATFORM_LABEL[i.platform] || i.platform, fmt(i.posts), fmtBig(i.score), mainStance(i.stances),
        ])} />
      {(s.calls_to_action || []).length > 0 && (
        <>
          <H3>Most-shared calls to action</H3>
          <Table head={['Call to action', 'Engagement']} align={['l', 'r']}
            rows={s.calls_to_action.slice(0, 6).map((c) => [c.text, fmt(c.engagement)])} />
        </>
      )}

      {/* 6 */}
      <H2 n={6}>Where the conversation is concentrated</H2>
      <Table head={['Place', 'Posts', 'Negative share', 'Most-engaged post']} align={['l', 'r', 'r', 'l']}
        rows={places.slice(0, 8).map((r) => [
          r.place, fmt(r.posts), pctTxt(share(r.negative, r.posts)),
          r.top?.url ? <a href={r.top.url} className="text-blue-700">{(r.top.summary || r.top.excerpt || 'open').slice(0, 70)}</a> : '—',
        ])} />

      {/* 7 */}
      <H2 n={7}>Risk and information environment</H2>
      <H3>Risk distribution</H3>
      <Table
        head={['Risk level', 'Posts', 'Share']}
        align={['l', 'r', 'r']}
        rows={['critical', 'high', 'medium', 'low'].map((k) => [k[0].toUpperCase() + k.slice(1), fmt(band(k).count), pctTxt(band(k).pct)])}
      />
      <H3>Key risk observations</H3>
      <Bullets items={[
        `${fmt(highCritical)} posts were classified as high or critical risk (${pctTxt(highCriticalShare)} of relevant posts).`,
        `${fmt(band('critical').count)} posts contain explicit threats or calls for violence${ex.threats ? `: ${fmt(ex.threats.at_subject)} aimed at ${name} or the Commission and ${fmt(ex.threats.at_organisers)} at the protest organisers` : ''}.`,
        'High-risk content includes communal and gendered abuse, calls to disrupt activities, and misattributed or manipulated media.',
        `Threats and abuse are aimed both at ${name} and the Commission and at the protest organisers.`,
      ]}
      />
      {ex.information && (
        <>
          <H3>Information integrity</H3>
          <P>
            {fmt(ex.information.misattributed_media)} posts share or dispute potentially manipulated, fabricated, AI-generated or misattributed media,
            alongside {fmt(ex.information.allegations_as_fact)} posts presenting unverified allegations as fact.
          </P>
        </>
      )}
      <Note label="Assessment">
        Although high and critical risk content is a {highCriticalShare < 3 ? 'small' : 'notable'} proportion of the conversation, individual posts can reach far larger audiences
        {ex.threats?.max_engagement ? ` (the most-engaged explicit threat reached ${fmt(ex.threats.max_engagement)} engagements)` : ''}, so they warrant monitoring on potential impact rather than volume alone.
      </Note>

      {shownThreats.length > 0 && (
        <>
          <H3>{threatRows.length >= 5 ? 'Explicit threats requiring attention' : 'High-risk posts requiring attention'} (newest first)</H3>
          <p className="text-[11.5px] text-slate-600 mb-1" style={{ breakAfter: 'avoid' }}>Each was read by an analyst. Private individuals are not named.</p>
          <Table head={['Date', 'Platform', 'Account', 'What it says', 'Link']}
            rows={shownThreats.map((r) => [
              fmtDay(r.published_at), PLATFORM_LABEL[r.platform] || r.platform, r.author,
              r.risk_reason || r.summary || '',
              <span className="whitespace-nowrap">{r.url && <a href={r.url} className="text-blue-700">post</a>}<Footage items={r.footage} /></span>,
            ])} />
        </>
      )}

      {/* 8 */}
      {facts.length > 0 && (
        <>
          <H2 n={8}>Facts and claims</H2>
          <P>
            Of {fmt(facts.length)} statements tracked for this event, {fmt(factCount('verified'))} are verified by more than one published source,{' '}
            {fmt(factCount('single_source'))} rest on a single source and {fmt(factCount('claim'))} are claims with no independent confirmation.
            Unconfirmed items should not be repeated as fact in any response.
          </P>
          {openClaims.length > 0 && (
            <Table head={['Unconfirmed statement', 'Status', 'Made by']}
              rows={openClaims.slice(0, 10).map((f) => [f.statement, f.status === 'claim' ? 'Claim' : 'Single source', f.claimed_by || '—'])} />
          )}
        </>
      )}

      {/* 9 */}
      <H2 n={9}>Forward-looking watchpoints</H2>
      {upcoming.length > 0 && (
        <>
          <H3>Upcoming dates</H3>
          <Table head={['Date', 'What']} rows={upcoming.map((a) => [a.title.replace(/^Upcoming:\s*/i, ''), a.detail])} />
        </>
      )}
      {next && (
        <>
          <H3>{nextLabel}</H3>
          <P>
            {nextWhat} is the primary forward-looking watchpoint. {fmt(next.mobilisation_posts)} posts relate to mobilisation for it
            {next.recent_posts ? `, including ${fmt(next.recent_posts)} on ${listJoin(next.recent_days.map((x) => fmtDay(x)))}` : ''}.
          </P>
        </>
      )}
      <H3>Monitor for</H3>
      <div className="grid grid-cols-2 gap-x-6">
        {[
          ['Mobilisation', ['Participation calls', 'Location or route changes', 'Influencer amplification', 'Organisational coordination']],
          ['Narrative escalation', [...leading.slice(0, 2).map((n) => `New developments: ${lcFirst(n.label)}`), 'Police and legal-action narratives']],
          ['Risk escalation', ['Direct threats', 'Calls for disruption', 'Communal or inflammatory narratives']],
          ['Information integrity', ['Edited videos', 'AI-generated content', 'Misattributed images or news', 'Viral claims without supporting evidence']],
        ].map(([title, items]) => (
          <div key={title} style={{ breakInside: 'avoid' }}>
            <div className="text-[13px] font-semibold text-slate-800 mt-1">{title}</div>
            <Bullets items={items} />
          </div>
        ))}
      </div>

      {/* 10 */}
      {REC_TITLES.length > 0 && (
        <>
          <H2 n={10}>Recommended actions</H2>
          <p className="text-[11.5px] text-slate-600 mb-1" style={{ breakAfter: 'avoid' }}>Considerations drawn from the monitored conversation; they are for the decision-maker's judgement, not instructions.</p>
          <div className="grid grid-cols-2 gap-x-6">
            {REC_TITLES.map(([k, title]) => (
              <div key={k} style={{ breakInside: 'avoid' }}>
                <H3>{title}</H3>
                <Bullets items={recs[k]} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* 11 */}
      <div style={{ breakInside: 'avoid' }}>
      <H2 n={11}>Overall assessment</H2>
      <Table head={['Indicator', 'Current situation']} rows={assessment.map(([label, [level, text]]) => [label, <Level level={level}>{text}</Level>])} />
      <Note label="Bottom line">
        {peakIsRecent
          ? 'The discussion has moved from general commentary toward a higher-intensity phase'
          : 'The discussion peaked earlier in the period'}
        {leading.length ? `, with ${listJoin(leading.slice(0, 2).map((n) => lcFirst(n.label)))} driving criticism of ${name}.` : '.'}
        {counter ? ` At the same time, significant counter-narratives are directed at the protest organisers.` : ''}
        {' '}The immediate monitoring priority should be {listJoin([
          next ? `the ${nextLabel} mobilisation` : 'further mobilisation',
          'narrative escalation',
          'high-impact risk content',
          'information-integrity issues',
        ])}.
      </Note>
      </div>
    </article>
  );
};

export default ExecutiveReport;
