import React from 'react';
import { ExternalLink, Printer } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { recommendationGroups } from './reportRecommendations';

/**
 * Printable monitoring brief for a tenant event (report data version 2).
 * Pure presentation: every figure comes from the report document.
 */

export const PLATFORM_LABEL = { x: 'X', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', reddit: 'Reddit', telegram: 'Telegram' };
const TONE_COLOR = { positive: '#16a34a', neutral: '#94a3b8', negative: '#dc2626' };
const BAND_STYLE = {
  critical: 'bg-red-700 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-amber-200 text-amber-900',
  low: 'bg-slate-200 text-slate-700',
};
const FACT_STATUS = {
  verified: { label: 'Verified', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  single_source: { label: 'Single source', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  claim: { label: 'Claim — unverified', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
};
const ACTIVITY_LABEL = {
  protest: 'Protest', rally_march: 'Rally / march', meeting: 'Meeting', press_conference: 'Press conference',
  detention_arrest: 'Detentions / arrests', legal_action: 'Legal action', announcement: 'Announced',
};
const TARGET_LABEL = {
  subject: 'Subject', election_commission: 'Election Commission of India', protest_organisers: 'Protest organisers',
  police: 'Police', political_leader: 'Political leaders', government: 'Government', judiciary: 'Judiciary',
  media: 'Media', organisation: 'Organisations', other: 'Other',
};
const ACCOUNT_LABEL = {
  news_media: 'News outlet', journalist: 'Journalist', public_figure: 'Public figure', political_party: 'Party',
  organisation: 'Organisation', government: 'Government', individual: 'Account', unknown: 'Account',
};

/** Search terms as shown to readers: no short forms. */
const TERM_LABEL = { SIR: 'Special Intensive Revision', 'CEC resignation': 'Chief Election Commissioner resignation', CJP: 'Cockroach Janta Party', CEC: 'Chief Election Commissioner' };
const termLabel = (t) => TERM_LABEL[t] || t;

export const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN'));
/** Big numbers for tiles: 1.03 crore / 57.3 lakh. */
export const fmtBig = (n) => {
  const v = Number(n || 0);
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} crore`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)} lakh`;
  return v.toLocaleString('en-IN');
};
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "6 October 2026" (Indian Standard Time). */
export const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }) : '—');
/** "6 October 2026, 23:29" (Indian Standard Time, 24-hour clock). */
const fmtDate = (d) => (d ? `${fmtDay(d)}, ${new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })}` : '—');
/** "2026-10-06" → { day: 6, month: "October" } for chart and grid axes. */
const dayParts = (iso) => { const [, m, d] = iso.split('-'); return { day: Number(d), month: FULL_MONTHS[Number(m) - 1] }; };
const dayLabel = (iso) => { const [y, m, d] = iso.split('-'); return `${Number(d)} ${FULL_MONTHS[Number(m) - 1]} ${y}`; };
/** "2 Oct" or "1–3 Oct (peak 2 Oct)" from an activity group's publication days. */
const activityWhen = (g) => {
  if (!g.first_day) return '—';
  if (g.first_day === g.last_day) return dayLabel(g.first_day);
  return `${dayLabel(g.last_day)} back to ${dayLabel(g.first_day)}${g.peak_day ? `; busiest ${dayLabel(g.peak_day)}` : ''}`;
};
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/* ── building blocks ── */

const H2 = ({ n, children }) => (
  <h2 className="mt-9 mb-3 pb-1 border-b-2 border-[#1e3a5f] text-[17px] font-bold text-[#1e3a5f] break-after-avoid">
    {n ? <span className="mr-1">{n}.</span> : null}{children}
  </h2>
);

// Shrink long tile values (e.g. a hashtag) so they fit on one line instead of breaking mid-word.
const tileSize = (value) => {
  const n = String(value).length;
  if (n <= 11) return 'text-[22px] truncate';
  if (n <= 16) return 'text-[13px] whitespace-nowrap';
  return 'text-[11px] [overflow-wrap:anywhere]';
};

const Tiles = ({ items }) => (
  <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-0 border-t-4 border-indigo-500 bg-slate-50 rounded-b">
    {items.map(([value, label], i) => (
      <div key={i} className="px-3 py-3 border-r last:border-r-0 border-white">
        <div className={`${tileSize(value)} leading-tight font-bold text-[#1e3a5f]`}>{value}</div>
        <div className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
      </div>
    ))}
  </div>
);

const HBars = ({ rows, color = '#4f46e5', labelWidth = 'w-40', valueKey = 'value', suffix }) => {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          <div className={`${labelWidth} shrink-0 text-right text-slate-600 truncate`} title={r.label}>{r.label}</div>
          <div className="flex-1 flex items-center gap-2">
            <div className="h-4 rounded-sm" style={{ width: `${Math.max(1, (r[valueKey] / max) * 100)}%`, background: r.color || color }} />
            <span className="text-slate-700 tabular-nums whitespace-nowrap">{fmt(r[valueKey])}{suffix ? suffix(r) : ''}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const ToneBar = ({ tone }) => {
  const total = tone.reduce((a, t) => a + t.count, 0) || 1;
  return (
    <div className="flex h-8 w-full overflow-hidden rounded text-[11px] font-semibold text-white">
      {tone.filter((t) => t.count).map((t) => (
        <div key={t.key} className="flex items-center justify-center whitespace-nowrap overflow-hidden" style={{ width: `${(t.count / total) * 100}%`, background: TONE_COLOR[t.key] }}>
          {t.count / total > 0.2 ? `${t.key[0].toUpperCase()}${t.key.slice(1)} ${fmt(t.count)} (${t.pct}%)` : t.count / total > 0.05 ? `${t.pct}%` : ''}
        </div>
      ))}
    </div>
  );
};

/**
 * Daily stacked tone bars (SVG, print-safe) with each day's negativity % above
 * the bar and a red dot under days that carry high/critical-risk posts.
 */
export const DailyToneChart = ({ rows: chronological }) => {
  if (!chronological.length) return null;
  const rows = [...chronological].reverse(); // newest date first
  const W = 860; const H = 240; const padL = 36; const padB = 40; const padT = 26;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const slot = (W - padL) / rows.length;
  const bw = Math.min(46, slot * 0.7);
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Daily posts by tone">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#e2e8f0" />
          <text x={padL - 4} y={y(t) + 3} fontSize="9" textAnchor="end" fill="#64748b">{t.toLocaleString('en-IN')}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const x = padL + i * slot + (slot - bw) / 2;
        const segs = [['negative', TONE_COLOR.negative], ['neutral', TONE_COLOR.neutral], ['positive', TONE_COLOR.positive]];
        let top = r.total;
        return (
          <g key={r.day}>
            {segs.map(([k, color]) => {
              const v = r[k] || 0;
              const rect = <rect key={k} x={x} y={y(top)} width={bw} height={Math.max(0, y(top - v) - y(top))} fill={color} />;
              top -= v;
              return rect;
            })}
            <text x={x + bw / 2} y={y(r.total) - 12} fontSize="9" textAnchor="middle" fill="#334155" fontWeight="600">{r.total.toLocaleString('en-IN')}</text>
            <text x={x + bw / 2} y={y(r.total) - 3} fontSize="8" textAnchor="middle" fill={r.negative_pct >= 50 ? '#b91c1c' : '#64748b'}>{r.negative_pct}% neg</text>
            <text x={x + bw / 2} y={H - padB + 12} fontSize="9" textAnchor="middle" fill="#475569">{dayParts(r.day).day}</text>
            {(i === 0 || dayParts(rows[i - 1].day).month !== dayParts(r.day).month) && (
              <text x={x + bw / 2} y={H - 1} fontSize="8" textAnchor="middle" fill="#64748b">{dayParts(r.day).month}</text>
            )}
            {r.high_risk > 0 && <circle cx={x + bw / 2} cy={H - padB + 20} r={Math.min(5, 2 + Math.log2(r.high_risk + 1) / 2)} fill="#b91c1c" />}
          </g>
        );
      })}
      <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke="#94a3b8" />
    </svg>
  );
};

/** Places × days heat grid: darker cell = more posts naming that place that day. */
const LocationHeat = ({ trends }) => {
  if (!trends?.places?.length) return null;
  const max = Math.max(1, ...trends.places.flatMap((p) => p.by_day));
  const order = trends.days.map((_, i) => i).reverse(); // newest date first
  const days = order.map((i) => trends.days[i]);
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] border-collapse w-full">
        <thead>
          <tr>
            <th className="text-left px-1.5 py-1 font-semibold text-slate-600">Place</th>
            {days.map((d, i) => (
              <th key={d} className="px-0.5 py-1 font-normal text-slate-500 text-center leading-tight">
                {dayParts(d).day}
                {(i === 0 || dayParts(days[i - 1]).month !== dayParts(d).month) && <div className="text-[8px]">{dayParts(d).month}</div>}
              </th>
            ))}
            <th className="px-1.5 py-1 text-right font-semibold text-slate-600">Total</th>
            <th className="px-1.5 py-1 text-right font-semibold text-slate-600">% negative</th>
          </tr>
        </thead>
        <tbody>
          {trends.places.map((p) => (
            <tr key={p.place} className="border-t border-slate-100">
              <td className="px-1.5 py-1 font-medium whitespace-nowrap">{p.place}</td>
              {order.map((i) => p.by_day[i]).map((v, i) => {
                const a = v ? 0.12 + 0.88 * (v / max) : 0;
                return (
                  <td key={i} className="text-center tabular-nums" style={{ background: v ? `rgba(30,58,95,${a.toFixed(2)})` : 'transparent', color: a > 0.55 ? '#fff' : '#334155', minWidth: 26 }}>
                    {v || ''}
                  </td>
                );
              })}
              <td className="px-1.5 py-1 text-right tabular-nums font-semibold">{fmt(p.total)}</td>
              <td className="px-1.5 py-1 text-right tabular-nums" style={{ color: p.negative_pct >= 50 ? '#b91c1c' : '#334155' }}>{p.negative_pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Table = ({ head, rows, className = '' }) => (
  <div className="overflow-x-auto">
    <table className={`w-full text-[12px] border-collapse ${className}`}>
      <thead>
        <tr className="bg-[#1e3a5f] text-white text-left">
          {head.map((h) => <th key={h} className="px-2 py-1.5 font-semibold uppercase text-[10px] tracking-wide">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-200 even:bg-slate-50 align-top break-inside-avoid">
            {r.map((c, j) => <td key={j} className="px-2 py-1.5">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Link = ({ href, children }) => (href
  ? <a href={href} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-0.5">{children}<ExternalLink className="h-3 w-3 print:hidden" /></a>
  : <span>{children}</span>);

/** "▶ video" / "image" links to a post's footage. */
export const Footage = ({ items }) => (items && items.length ? (
  <span className="inline-flex flex-wrap gap-x-1.5 ml-1">
    {items.map((f, i) => (
      <a key={`${f.url}${i}`} href={f.url} target="_blank" rel="noreferrer" className="text-[11px] text-rose-700 hover:underline whitespace-nowrap">
        {f.kind === 'video' ? '▶ video' : 'image'}{items.length > 1 ? ` ${i + 1}` : ''}
      </a>
    ))}
  </span>
) : null);

const Sources = ({ urls }) => (
  <span className="inline-flex flex-wrap gap-x-2">
    {(urls || []).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="text-[11px] text-blue-700 hover:underline">{hostOf(u)}</a>)}
  </span>
);

const Bullets = ({ items }) => (items && items.length
  ? <ul className="list-disc pl-5 space-y-1 text-[13px] text-slate-800">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
  : <p className="text-[13px] text-slate-500">None identified in this period.</p>);

/* ── the brief ── */

const ReportBrief = ({ report, workspace, onDownloadPdf }) => {
  const d = report.data;
  const s = d.stats;
  const ev = d.event;
  const t = s.totals;
  const toneOf = (k) => s.tone.find((x) => x.key === k) || { count: 0, pct: 0 };
  const band = (k) => s.risk.bands.find((x) => x.key === k) || { count: 0, pct: 0 };
  const subjectMentions = s.share_of_voice.find((k) => k.term.toLowerCase() === (ev.subject?.name || '').toLowerCase());
  const topTag = s.hashtags[0];

  return (
    <article className="max-w-[900px] mx-auto text-slate-900 print:max-w-none print:text-[12px]">
      <div className="flex justify-end print:hidden mb-2">
        <Button variant="outline" size="sm" onClick={onDownloadPdf || (() => window.print())}><Printer className="h-4 w-4 mr-1" />{onDownloadPdf ? 'Download PDF' : 'Print / Save PDF'}</Button>
      </div>

      {/* Cover */}
      <div className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Public discussion monitoring report</div>
      <h1 className="text-[30px] font-extrabold text-[#1e3a5f] leading-tight mt-1">{ev.subject?.name || ev.short_name}</h1>
      {ev.subject?.role && <div className="text-[17px] font-semibold text-slate-700">{ev.subject.role}</div>}
      <p className="text-slate-600 text-sm mt-1">{ev.name}</p>

      <div className="mt-4"><Table
        head={['Report period', 'Generated', 'Posts analysed', 'Platforms']}
        rows={[[
          `${fmtDay(report.range_from || report.period_start)} to ${fmtDay(report.range_to || report.period_end)}`,
          fmtDay(report.created_at), fmt(t.relevant), s.by_platform.filter((p) => p.relevant).map((p) => PLATFORM_LABEL[p.platform]).join(', '),
        ]]}
      /></div>

      <div className="mt-5 space-y-3">
        <Tiles items={[
          [fmt(t.relevant), 'Relevant posts'],
          [s.lead_platform ? PLATFORM_LABEL[s.lead_platform.platform] : '—', `Lead platform${s.lead_platform ? ` (${s.lead_platform.share}%)` : ''}`],
          [fmt(s.places.count), 'Places named'],
          [fmt(toneOf('negative').count), 'Negative posts'],
          [fmtBig(t.engagement), 'Engagement'],
        ]} />
        <Tiles items={[
          [`${toneOf('positive').pct}%`, 'Positive'],
          [`${toneOf('neutral').pct}%`, 'Neutral'],
          [`${toneOf('negative').pct}%`, 'Negative share'],
          [fmt(band('critical').count + band('high').count), 'High / critical risk'],
          [topTag ? topTag.tag : (subjectMentions ? fmt(subjectMentions.count) : '—'), topTag ? `Top hashtag (${fmt(topTag.count)})` : 'Subject mentions'],
        ]} />
      </div>
      <p className="mt-2 text-[12px] italic text-slate-500">
        Platforms: {s.by_platform.filter((p) => p.relevant).map((p) => `${PLATFORM_LABEL[p.platform]} ${fmt(p.relevant)}`).join(' · ')}.
        {' '}{fmt(t.collected)} posts collected, {fmt(t.excluded_unrelated)} judged unrelated and excluded.
      </p>

      <H2>Executive summary</H2>
      <table className="w-full text-[13px] leading-relaxed border-collapse">
        <tbody>
          {[['In brief', d.bottom_line], ['What happened', d.executive_summary?.what_happened], ['When and where', d.executive_summary?.when_where],
            ['Who is involved', d.executive_summary?.who_involved], ['Why it matters', d.executive_summary?.why_attention], ['Online discussion', d.executive_summary?.social_discussion]]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <tr key={k} className="border-b border-slate-200 align-top break-inside-avoid">
                <td className="py-2 pr-4 w-40 font-semibold text-[#1e3a5f] whitespace-nowrap">{k}</td>
                <td className="py-2 text-slate-800">{v}</td>
              </tr>
            ))}
        </tbody>
      </table>

      {(s.key_intelligence || []).length > 0 && <>
        <H2>Key intelligence</H2>
        <div className="grid md:grid-cols-2 gap-2">
          {s.key_intelligence.map((k) => (
            <div key={k.key} className="border rounded p-3 bg-white break-inside-avoid" style={{ borderLeft: '4px solid #1e3a5f' }}>
              <div className="font-semibold text-[13px] text-[#1e3a5f]">{k.title}</div>
              <p className="text-[12px] text-slate-700 mt-1">{k.detail}</p>
              {k.caveat && <p className="text-[11px] italic text-slate-500 mt-1">{k.caveat}</p>}
            </div>
          ))}
        </div>
      </>}

      <H2>What requires attention</H2>
      <div className="space-y-2">
        {(d.attention || []).map((a, i) => (
          <div key={i} className={`border-l-4 rounded-r p-3 break-inside-avoid ${a.severity === 'high' ? 'border-red-600 bg-red-50' : a.severity === 'medium' ? 'border-amber-500 bg-amber-50' : 'border-slate-400 bg-slate-50'}`}>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{a.title}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-500">{a.severity}</span>
            </div>
            <p className="text-[13px] text-slate-700 mt-0.5">{a.detail}</p>
          </div>
        ))}
        {d.analyst_review?.risk_assessment && (
          <div className="border-l-4 border-[#1e3a5f] rounded-r p-3 bg-white border">
            <div className="font-semibold">Analyst risk assessment</div>
            <p className="text-[13px] text-slate-700 mt-0.5">{d.analyst_review.risk_assessment}</p>
          </div>
        )}
      </div>

      <H2>Posts by platform</H2>
      <HBars rows={s.by_platform.filter((p) => p.relevant).map((p) => ({ label: PLATFORM_LABEL[p.platform], value: p.relevant }))} labelWidth="w-24" />

      <H2>Tone toward {ev.subject?.name || 'the subject'}</H2>
      <ToneBar tone={s.tone} />

      {s.share_of_voice.length > 0 && <>
        <H2>Share of voice by keyword</H2>
        <p className="text-[12px] italic text-slate-500 mb-2">Relevant posts mentioning each tracked term. A post can mention several.</p>
        <HBars rows={s.share_of_voice.slice(0, 10).map((k) => ({ label: termLabel(k.term), value: k.count }))} />
      </>}

      <H2>Posts and negativity by day</H2>
      <p className="text-[12px] text-slate-600 mb-2">
        Relevant posts per day by publication date (Indian Standard Time), newest date first, split by tone toward {ev.subject?.name || 'the subject'}: <span className="inline-block w-2 h-2 align-middle" style={{ background: TONE_COLOR.negative }} /> negative,{' '}
        <span className="inline-block w-2 h-2 align-middle" style={{ background: TONE_COLOR.neutral }} /> neutral,{' '}
        <span className="inline-block w-2 h-2 align-middle" style={{ background: TONE_COLOR.positive }} /> positive. The figure above each bar is that day's share of negative posts;
        a red dot marks days with critical or high-risk posts. Peak: {fmt(s.volume_change.peak_posts)} posts on {s.volume_change.peak_day ? fmtDay(s.volume_change.peak_day) : '—'}.
      </p>
      <DailyToneChart rows={s.timeline} />
      <div className="mt-3"><Table
        head={['Day', 'Posts', '% negative', `Critical of ${ev.subject?.name || 'subject'}`, 'High-risk', 'Leading narrative', 'Most-named place']}
        rows={[...s.timeline].reverse().map((d) => [
          <b>{fmtDay(d.day)}</b>, fmt(d.total),
          <span style={{ color: d.negative_pct >= 50 ? '#b91c1c' : undefined, fontWeight: d.negative_pct >= 50 ? 600 : 400 }}>{d.negative_pct ?? '—'}%</span>,
          fmt(d.critical_of_subject), d.high_risk ? <span className="text-red-700 font-semibold">{fmt(d.high_risk)}</span> : '0',
          (ev.narratives || []).find((n) => n.key === d.top_narrative)?.label || '—', d.top_place || '—',
        ])}
      /></div>

      {s.location_trends?.places?.length > 0 && <>
        <H2>Location trends</H2>
        <p className="text-[12px] text-slate-600 mb-2">Daily posts naming each of the most-mentioned places, newest date first (darker = more posts), with each place's share of negative posts. A place counts only when a post names it.</p>
        <LocationHeat trends={s.location_trends} />
      </>}

      <H2 n="01">Activity analysis</H2>
      <Tiles items={[[fmt(s.activity.posts), 'Activity posts'], [fmt(t.relevant), 'Posts in window'], [s.lead_platform ? PLATFORM_LABEL[s.lead_platform.platform] : '—', 'Lead platform'], [fmtBig(t.engagement), 'Engagement']]} />
      <p className="text-[13px] mt-3 mb-2">Protests, marches, meetings, detentions and legal steps named in the posts.</p>
      <ul className="list-disc pl-5 space-y-1 text-[13px] mb-3">
        {s.activity.groups.filter((g) => g.place !== 'Unspecified').slice(0, 6).map((g) => (
          <li key={`${g.type}|${g.place}`}><b>{ACTIVITY_LABEL[g.type] || g.type} — {g.place}</b>: {fmt(g.posts)} posts ({fmt(g.news)} news/reporting, {fmt(g.critical_of_subject)} critical of {ev.subject?.name}). {d.activity_notes?.[`${g.type}|${g.place}`] || ''}</li>
        ))}
      </ul>
      <Table
        head={['Event', 'Posts dated', 'Place', 'What posts report']}
        rows={s.activity.groups.filter((g) => g.place !== 'Unspecified').slice(0, 8).map((g) => [
          <b>{ACTIVITY_LABEL[g.type] || g.type}</b>,
          activityWhen(g),
          g.place,
          <span>{d.activity_notes?.[`${g.type}|${g.place}`] || g.top?.summary || g.top?.excerpt} {g.top?.url && <Link href={g.top.url}>source</Link>}</span>,
        ])}
      />

      <H2 n="02">Where the discussion is located</H2>
      <Tiles items={[[fmt(s.places.count), 'Places named'], [s.places.rows[0]?.place || '—', 'Most named place'], [fmt(s.places.rows[0]?.posts), 'Posts at top place']]} />
      <p className="text-[12px] italic text-slate-500 mt-3 mb-2">Posts by place named in the text. Places are counted only when a post names them; nothing here tracks individuals.</p>
      <HBars rows={s.places.rows.slice(0, 8).map((r) => ({ label: r.place, value: r.posts }))} color="#1e3a5f" />
      <div className="mt-3"><Table
        head={['Place', 'Posts', 'Negative', 'Context']}
        rows={s.places.rows.slice(0, 8).map((r) => [<b>{r.place}</b>, fmt(r.posts), fmt(r.negative), d.place_context?.[r.place] || r.top?.summary || ''])}
      /></div>

      <H2 n="03">Sentiment and stance</H2>
      <Tiles items={[[fmt(toneOf('positive').count), `Positive (${toneOf('positive').pct}%)`], [fmt(toneOf('neutral').count), `Neutral (${toneOf('neutral').pct}%)`], [fmt(toneOf('negative').count), `Negative (${toneOf('negative').pct}%)`], [fmt(t.relevant), 'Analysed']]} />
      <p className="text-[12px] italic text-slate-500 mt-2">Tone is measured toward {ev.subject?.name || 'the subject'}: negative includes posts backing the protest against {ev.subject?.name || 'the subject'}. Negative is the criticism load, not a threat by itself.</p>
      <div className="grid md:grid-cols-2 gap-4 mt-3 text-[12px]">
        {[['Stance toward ' + (ev.subject?.name || 'the subject'), s.stance_toward_subject], ['Stance toward the protest and its demands', s.stance_toward_protest]].map(([title, rows]) => (
          <div key={title}>
            <div className="font-semibold mb-1">{title}</div>
            <HBars rows={rows.map((r) => ({ label: r.key, value: r.count, color: { supportive: '#16a34a', critical: '#dc2626', neutral: '#94a3b8', unclear: '#cbd5e1' }[r.key], pct: r.pct }))} labelWidth="w-20" suffix={(r) => ` (${r.pct}%)`} />
          </div>
        ))}
      </div>

            {s.tone_sections && <>
        <H2 n="04">Positive, negative and neutral posts</H2>
        <p className="text-[12px] text-slate-600 mb-3">Each post's tone toward {ev.subject?.name || 'the subject'}, separated. Positive: supports {ev.subject?.name || 'the subject'}. Negative: criticises {ev.subject?.name || 'the subject'} or backs the protest and its demands. Neutral: everything else, such as news reports and comment on the organisers or the police.</p>
        <div className="grid md:grid-cols-3 gap-3">
          {s.tone_sections.map((ts) => (
            <div key={ts.key} className="border rounded p-3 break-inside-avoid" style={{ borderTop: `4px solid ${TONE_COLOR[ts.key]}` }}>
              <div className="flex items-baseline justify-between">
                <span className="font-bold text-[15px] capitalize" style={{ color: TONE_COLOR[ts.key] === '#94a3b8' ? '#475569' : TONE_COLOR[ts.key] }}>{ts.key}</span>
                <span className="text-[13px] font-semibold">{fmt(ts.count)} · {ts.pct}%</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
                <div><b>Platforms:</b> {ts.by_platform.map((p) => `${PLATFORM_LABEL[p.platform]} ${fmt(p.count)}`).join(' · ') || '—'}</div>
                <div><b>Toward {ev.subject?.name || 'subject'}:</b> {ts.stance_toward_subject.slice(0, 3).map((x) => `${x.key} ${fmt(x.count)}`).join(' · ')}</div>
                <div><b>Mostly about:</b> {ts.targets.slice(0, 3).map((x) => `${TARGET_LABEL[x.key] || x.key} ${fmt(x.count)}`).join(' · ')}</div>
                <div><b>Narratives:</b> {ts.narratives.slice(0, 3).map((x) => `${(ev.narratives || []).find((n) => n.key === x.key)?.label || x.key} (${fmt(x.count)})`).join('; ') || '—'}</div>
                {ts.hashtags.length > 0 && <div><b>Hashtags:</b> {ts.hashtags.slice(0, 4).map((h) => h.tag).join(' ')}</div>}
                <div><b>Engagement:</b> {fmt(ts.engagement)}</div>
              </div>
            </div>
          ))}
        </div>
        {s.tone_sections.filter((ts) => ts.key === 'negative').map((ts) => (
          <div key={ts.key} className="mt-4">
            <div className="font-semibold text-[13px] mb-1 break-after-avoid capitalize" style={{ color: TONE_COLOR[ts.key] }}>{ts.key} posts — highest engagement</div>
            <Table
              head={['When', 'Platform', 'Account', 'What it says', 'Engagement']}
              rows={(ts.top_public.length >= 5 ? ts.top_public : ts.top_all).slice(0, 10).map((p) => [
                fmtDate(p.published_at), PLATFORM_LABEL[p.platform], p.author,
                <span>{p.summary || p.excerpt} {p.url && <Link href={p.url}>open</Link>}<Footage items={p.footage} /></span>, fmt(p.engagement),
              ])}
            />
          </div>
        ))}
      </>}

      <H2 n="05">Risk-band tracking</H2>
      <Tiles items={['critical', 'high', 'medium', 'low'].map((k) => [fmt(band(k).count), `${k} (${band(k).pct}%)`])} />
      <p className="text-[13px] mt-3">
        Read critical and high rows first. Criticism of a public official, satire and calls for resignation are lawful political speech and are tracked as sentiment only.
        Critical and high are reserved for threats of violence, incitement, doxxing, impersonation and manipulated media.
        {s.risk.reviewed ? ` An analyst reviewed ${fmt(s.risk.reviewed)} flagged posts; their decision overrides the model.` : ''}
        {' '}Private accounts are not named.
      </p>
      {s.risk.rows.length > 0 ? (
        <div className="mt-3"><Table
          head={['Band', 'When', 'Platform', 'Account', 'What it says', 'Why flagged']}
          rows={s.risk.rows.map((r) => [
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${BAND_STYLE[r.risk_band]}`}>{r.risk_band}</span>,
            fmtDate(r.published_at), PLATFORM_LABEL[r.platform], r.author,
            <span>{r.summary || r.excerpt} {r.url && <Link href={r.url}>open</Link>}<Footage items={r.footage} /></span>,
            <span>{r.risk_reason}{r.reviewed ? <em className="text-slate-500"> (reviewed)</em> : null}</span>,
          ])}
        /></div>
      ) : <p className="text-[13px] text-emerald-700 mt-2 font-medium">No post remains in the critical or high band after review.</p>}
      {s.risk.medium_rows.length > 0 && <>
        <div className="font-semibold text-[13px] mt-4 mb-1 break-after-avoid">Medium band — highest engagement</div>
        <Table
          head={['When', 'Platform', 'Account', 'What it says', 'Why']}
          rows={s.risk.medium_rows.slice(0, 6).map((r) => [fmtDate(r.published_at), PLATFORM_LABEL[r.platform], r.author, <span>{r.summary || r.excerpt} {r.url && <Link href={r.url}>open</Link>}<Footage items={r.footage} /></span>, r.risk_reason])}
        />
      </>}

      <H2 n="06">Who and what is being discussed</H2>
      <div className="space-y-1.5 mb-3">
        {s.target_table.map((r) => (
          <div key={r.type} className="flex items-center gap-2 text-xs">
            <div className="w-40 text-right text-slate-600 truncate">{r.type === 'subject' ? ev.subject?.name : (TARGET_LABEL[r.type] || r.type)}</div>
            <div className="flex-1 flex h-4 rounded-sm overflow-hidden" style={{ maxWidth: `${(r.posts / Math.max(...s.target_table.map((x) => x.posts))) * 70 + 10}%` }}>
              {['positive', 'neutral', 'negative'].map((k) => <div key={k} style={{ width: `${(r[k] / (r.posts || 1)) * 100}%`, background: TONE_COLOR[k] }} />)}
            </div>
            <span className="text-slate-600 whitespace-nowrap">{Math.round((r.negative / (r.posts || 1)) * 100)}% neg · {fmt(r.posts)} posts</span>
          </div>
        ))}
      </div>
      <Table head={['Target / entity', 'Posts', 'Positive', 'Neutral', 'Negative']} rows={s.target_table.map((r) => [<b>{r.type === 'subject' ? ev.subject?.name : (TARGET_LABEL[r.type] || r.type)}</b>, fmt(r.posts), fmt(r.positive), fmt(r.neutral), fmt(r.negative)])} />
      <p className="text-[12px] text-slate-600 mt-2">
        Most named people and organisations: {s.entities.slice(0, 10).map((e) => `${e.name} (${fmt(e.count)})`).join(', ')}.
      </p>

      <H2 n="07">Influencer ecosystem</H2>
      <Tiles items={[[fmt(s.influencer_totals.accounts), 'Public accounts'], [PLATFORM_LABEL[s.influencer_totals.top_platform] || '—', 'Top platform'], [fmtBig(s.influencer_totals.top_score), 'Top engagement score'], [fmtBig(s.influencer_totals.likes), 'Likes']]} />
      <p className="text-[12px] italic text-slate-500 mt-2 mb-2">
        Engagement score = likes + 2×comments + 3×shares + views/10. {fmt(s.influencer_totals.shares)} shares · {fmt(s.influencer_totals.comments)} comments.
        Only news outlets, journalists, public figures, parties and organisations are listed. Ranking reflects measurable reach, not intent.
      </p>
      <HBars rows={s.influencers.slice(0, 8).map((a) => ({ label: a.name || `@${a.handle}`, value: a.score }))} color="#1e3a5f" />
      <div className="mt-3"><Table
        head={['Account', 'Type', 'Platform', 'Posts', 'Score', 'Mostly']}
        rows={s.influencers.slice(0, 12).map((a) => [
          a.top?.url ? <Link href={a.top.url}>{a.name || `@${a.handle}`}</Link> : (a.name || `@${a.handle}`),
          ACCOUNT_LABEL[a.account_type] || 'Account', PLATFORM_LABEL[a.platform], fmt(a.posts), fmt(a.score), a.dominant_stance === 'critical' ? `critical of ${ev.subject?.name}` : a.dominant_stance,
        ])}
      /></div>

      <H2 n="08">Key narratives</H2>
      <div className="space-y-3">
        {s.narratives.map((n) => (
          <div key={n.key} className="border rounded p-3 break-inside-avoid">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-semibold">{n.label}</span>
              <span className="text-[12px] text-slate-500">{fmt(n.count)} posts · {n.pct}% · {n.trend} · {n.platforms.map((p) => `${PLATFORM_LABEL[p.platform]} ${p.count}`).join(', ')}</span>
            </div>
            <p className="text-[13px] text-slate-700 mt-1">{d.narrative_summaries?.[n.key] || n.description}</p>
            {n.examples.length > 0 && (
              <ul className="mt-1 text-[12px] text-slate-600 space-y-0.5">
                {n.examples.map((e) => <li key={e.id}>— {e.author}: {e.summary || e.excerpt} {e.url && <Link href={e.url}>open</Link>}<Footage items={e.footage} /></li>)}
              </ul>
            )}
          </div>
        ))}
      </div>

      <H2 n="09">Verified facts and claims</H2>
      <p className="text-[12px] text-slate-600 mb-2">From published reporting. Verified = two or more independent outlets. Social-media allegations are listed separately and are not verified by this brief.</p>
      <ul className="space-y-1.5">
        {(ev.facts || []).map((f, i) => (
          <li key={i} className="text-[13px] break-inside-avoid">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border mr-1.5 ${FACT_STATUS[f.status].cls}`}>{FACT_STATUS[f.status].label}</span>
            {f.statement}{f.claimed_by ? <em className="text-slate-500"> — {f.claimed_by}</em> : null} <Sources urls={f.sources} />
          </li>
        ))}
      </ul>
      {(d.allegation_themes || []).length > 0 && <>
        <div className="font-semibold text-[13px] mt-4 mb-1">Repeated allegations in posts (unverified)</div>
        <ul className="list-disc pl-5 text-[13px] space-y-0.5">
          {d.allegation_themes.map((a, i) => <li key={i}><span className="text-rose-700 font-medium">Allegation:</span> {a.theme} <span className="text-slate-500">— {a.status_note}</span></li>)}
        </ul>
      </>}
      {(ev.watch_items || []).length > 0 && <>
        <div className="font-semibold text-[13px] mt-4 mb-1">Event calendar</div>
        <ul className="text-[13px] space-y-0.5">
          {ev.watch_items.map((w, i) => <li key={i}><b>{fmtDay(w.date)}</b>: {w.description} <Sources urls={w.sources} /></li>)}
        </ul>
      </>}

      <H2 n="10">Recommended actions</H2>
      <p className="text-[12px] text-slate-500 mb-2">Considerations drawn from the monitored conversation; they are for the decision-maker's judgement, not instructions.</p>
      {recommendationGroups(report).map((g) => (
        <div key={g.key} className="break-inside-avoid mb-3"><div className="font-semibold text-[13px] mb-1">{g.title}</div><Bullets items={g.items} /></div>
      ))}
      {(d.analyst_review?.notes || []).length > 0 && <>
        <div className="font-semibold text-[13px] mt-4 mb-1">Analyst notes</div>
        <Bullets items={d.analyst_review.notes} />
      </>}

      <H2 n="11">Evidence register (media sample)</H2>
      <Table
        head={['When', 'Platform', 'Outlet / account', 'Summary']}
        rows={s.evidence.map((p) => [<b>{fmtDate(p.published_at)}</b>, PLATFORM_LABEL[p.platform], p.author, <span>{p.summary || p.excerpt} {p.url && <Link href={p.url}>source</Link>}<Footage items={p.footage} /></span>])}
      />

            {s.footage && s.footage.top.length > 0 && <>
        <H2 n="12">Footage</H2>
        <p className="text-[12px] text-slate-600 mb-2">
          {fmt(s.footage.videos)} relevant posts carry video and {fmt(s.footage.images)} carry images. The most-engaged, one per account; ▶ links open the video itself (direct file for X, the video page for YouTube).
        </p>
        <Table
          head={['When', 'Platform', 'Account', 'What it shows', 'Footage', 'Engagement']}
          rows={s.footage.top.map((p) => [
            fmtDate(p.published_at), PLATFORM_LABEL[p.platform], p.author,
            <span>{p.summary || p.excerpt} {p.url && <Link href={p.url}>post</Link>}</span>,
            <Footage items={p.footage} />, fmt(p.engagement),
          ])}
        />
      </>}

      <H2>Summary</H2>
      <ul className="list-disc pl-5 text-[13px] space-y-1">
        <li>Prepared for: {ev.subject?.name}, {ev.subject?.role}. Event: {ev.name}. Relevant posts analysed: {fmt(t.relevant)} of {fmt(t.collected)} collected.</li>
        <li>
          Not in the analysis: {fmt(t.collected - t.relevant)} posts — {fmt(t.excluded_unrelated)} read and set aside as unrelated to the event
          {t.pending ? `, ${fmt(t.pending)} collected but not yet analysed (mostly recent Instagram comments)` : ''}
          {t.analysis_failed ? `, ${fmt(t.analysis_failed)} that could not be analysed` : ''}. Duplicates are merged when posts are collected, so each post is counted once.
        </li>
        <li>Platforms: {s.by_platform.filter((p) => p.relevant).map((p) => `${PLATFORM_LABEL[p.platform]} ${fmt(p.relevant)}`).join(' · ')}.</li>
        <li>Places named: {fmt(s.places.count)}; most named {s.places.rows[0]?.place || '—'}. Tone toward {ev.subject?.name || 'the subject'} (positive / neutral / negative): {fmt(toneOf('positive').count)} / {fmt(toneOf('neutral').count)} / {fmt(toneOf('negative').count)}.</li>
        <li>Risk bands (critical / high / medium / low): {['critical', 'high', 'medium', 'low'].map((k) => fmt(band(k).count)).join(' / ')}.</li>
      </ul>

    </article>
  );
};

export default ReportBrief;
