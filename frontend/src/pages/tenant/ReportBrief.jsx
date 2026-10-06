import React from 'react';
import { ExternalLink, Printer } from 'lucide-react';
import { Button } from '../../components/ui/button';

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
  subject: 'The CEC (subject)', election_commission: 'Election Commission', protest_organisers: 'Protest organisers',
  police: 'Police', political_leader: 'Political leaders', government: 'Government', judiciary: 'Judiciary',
  media: 'Media', organisation: 'Organisations', other: 'Other',
};
const ACCOUNT_LABEL = {
  news_media: 'News outlet', journalist: 'Journalist', public_figure: 'Public figure', political_party: 'Party',
  organisation: 'Organisation', government: 'Government', individual: 'Account', unknown: 'Account',
};

const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN'));
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const shortDay = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/* ── building blocks ── */

const H2 = ({ n, children }) => (
  <h2 className="mt-9 mb-3 pb-1 border-b-2 border-[#1e3a5f] text-[17px] font-bold text-[#1e3a5f] break-after-avoid">
    {n ? <span className="mr-1">{n}.</span> : null}{children}
  </h2>
);

const Tiles = ({ items }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-0 border-t-4 border-indigo-500 bg-slate-50 rounded-b">
    {items.map(([value, label], i) => (
      <div key={i} className="px-3 py-3 border-r last:border-r-0 border-white">
        <div className="text-[22px] leading-tight font-bold text-[#1e3a5f] truncate">{value}</div>
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
          {t.count / total > 0.08 ? `${t.key[0].toUpperCase()}${t.key.slice(1)} ${fmt(t.count)} (${t.pct}%)` : ''}
        </div>
      ))}
    </div>
  );
};

const Timeline = ({ rows }) => {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="flex items-end gap-1 h-44 border-b border-l border-slate-300 px-1 pt-2">
      {rows.map((r) => (
        <div key={r.day} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${r.day}: ${r.total} posts (${r.negative} negative)`}>
          <span className="text-[9px] text-slate-600 tabular-nums">{r.total}</span>
          <div className="w-full flex flex-col justify-end" style={{ height: `${(r.total / max) * 85}%` }}>
            <div className="w-full bg-rose-500" style={{ height: `${r.total ? (r.negative / r.total) * 100 : 0}%` }} />
            <div className="w-full bg-indigo-500 flex-1" />
          </div>
          <span className="text-[9px] text-slate-500 mt-1">{shortDay(r.day)}</span>
        </div>
      ))}
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

const Sources = ({ urls }) => (
  <span className="inline-flex flex-wrap gap-x-2">
    {(urls || []).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="text-[11px] text-blue-700 hover:underline">{hostOf(u)}</a>)}
  </span>
);

const Bullets = ({ items }) => (items && items.length
  ? <ul className="list-disc pl-5 space-y-1 text-[13px] text-slate-800">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
  : <p className="text-[13px] text-slate-500">None identified in this period.</p>);

/* ── the brief ── */

const ReportBrief = ({ report, workspace }) => {
  const d = report.data;
  const s = d.stats;
  const ev = d.event;
  const t = s.totals;
  const toneOf = (k) => s.tone.find((x) => x.key === k) || { count: 0, pct: 0 };
  const band = (k) => s.risk.bands.find((x) => x.key === k) || { count: 0, pct: 0 };
  const subjectMentions = s.share_of_voice.find((k) => k.term.toLowerCase() === (ev.subject?.name || '').toLowerCase());
  const topTag = s.hashtags[0];
  const rec = d.recommendations || {};

  return (
    <article className="max-w-[900px] mx-auto text-slate-900 print:max-w-none print:text-[12px]">
      <div className="flex justify-end print:hidden mb-2">
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print / Save PDF</Button>
      </div>

      {/* Cover */}
      <div className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Public discussion monitoring brief · {workspace?.name || 'Workspace'}</div>
      <h1 className="text-[30px] font-extrabold text-[#1e3a5f] leading-tight mt-1">{ev.short_name}</h1>
      <p className="text-slate-600 text-sm">India · Aggregate monitoring of public posts by media, organisations, public figures and the public</p>

      <div className="mt-4"><Table
        head={['Monitoring window', 'Generated', 'Posts analysed', 'Platforms']}
        rows={[[`${fmtDay(report.period_start)} – ${fmtDay(report.period_end)}`, fmtDay(report.created_at), fmt(t.relevant), s.by_platform.filter((p) => p.relevant).map((p) => PLATFORM_LABEL[p.platform]).join(', ')]]}
      /></div>

      <div className="mt-5 space-y-3">
        <Tiles items={[
          [fmt(t.relevant), 'Relevant posts'],
          [s.lead_platform ? PLATFORM_LABEL[s.lead_platform.platform] : '—', `Lead platform${s.lead_platform ? ` (${s.lead_platform.share}%)` : ''}`],
          [fmt(s.places.count), 'Places named'],
          [fmt(toneOf('negative').count), 'Negative posts'],
          [fmt(t.engagement), 'Engagement'],
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
        {' '}{fmt(t.collected)} posts collected, {fmt(t.excluded_unrelated)} judged unrelated and excluded. Keywords: {[...(ev.keywords || []).slice(0, 8), ...(ev.hashtags || []).slice(0, 4)].join(', ')}.
      </p>

      {/* Bottom line + attention */}
      <div className="mt-6 rounded border-l-4 border-[#1e3a5f] bg-slate-50 p-4">
        <p className="text-[14px] leading-relaxed"><span className="font-bold text-[#1e3a5f]">Bottom line. </span>{d.bottom_line}</p>
        {d.analyst_review && <p className="text-[11px] text-slate-500 mt-2">Reviewed by analyst on {fmtDay(d.analyst_review.reviewed_at)}.</p>}
      </div>

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

      <H2>Tone split</H2>
      <ToneBar tone={s.tone} />

      {s.share_of_voice.length > 0 && <>
        <H2>Share of voice by keyword</H2>
        <p className="text-[12px] italic text-slate-500 mb-2">Relevant posts mentioning each tracked term. A post can mention several.</p>
        <HBars rows={s.share_of_voice.slice(0, 10).map((k) => ({ label: k.term, value: k.count }))} />
      </>}

      <H2>Mentions timeline</H2>
      <p className="text-[12px] text-slate-600 mb-2">
        Daily relevant posts by publication date (IST), {s.timeline[0] ? shortDay(s.timeline[0].day) : ''} to {s.timeline.length ? shortDay(s.timeline[s.timeline.length - 1].day) : ''}.
        Peak day: {fmt(s.volume_change.peak_posts)} posts on {s.volume_change.peak_day ? fmtDay(s.volume_change.peak_day) : '—'}.
        Latest 24 hours: {fmt(s.volume_change.last_24h)} posts vs {fmt(s.volume_change.previous_24h)} in the 24 hours before. <span className="inline-block w-2 h-2 bg-rose-500 align-middle" /> negative share of each day.
      </p>
      <Timeline rows={s.timeline} />

      <H2>Executive summary</H2>
      <div className="space-y-1.5 text-[13px] leading-relaxed">
        {[['What happened', d.executive_summary?.what_happened], ['When and where', d.executive_summary?.when_where], ['Who is involved', d.executive_summary?.who_involved],
          ['Why it is receiving attention', d.executive_summary?.why_attention], ['Social-media discussion', d.executive_summary?.social_discussion]]
          .map(([k, v]) => <p key={k}><span className="font-semibold">{k}: </span>{v}</p>)}
      </div>

      <H2 n="01">Activity analysis</H2>
      <Tiles items={[[fmt(s.activity.posts), 'Activity posts'], [fmt(t.relevant), 'Posts in window'], [s.lead_platform ? PLATFORM_LABEL[s.lead_platform.platform] : '—', 'Lead platform'], [fmt(t.engagement), 'Engagement']]} />
      <p className="text-[13px] mt-3 mb-2">Protests, marches, meetings, detentions and legal steps named in the posts.</p>
      <ul className="list-disc pl-5 space-y-1 text-[13px] mb-3">
        {s.activity.groups.slice(0, 6).map((g) => (
          <li key={`${g.type}|${g.place}`}><b>{ACTIVITY_LABEL[g.type] || g.type} — {g.place}</b>: {fmt(g.posts)} posts ({fmt(g.news)} news/reporting, {fmt(g.critical_of_subject)} critical of the subject). {d.activity_notes?.[`${g.type}|${g.place}`] || ''}</li>
        ))}
      </ul>
      <Table
        head={['Event', 'When', 'Place', 'What posts report']}
        rows={s.activity.groups.slice(0, 8).map((g) => [
          <b>{ACTIVITY_LABEL[g.type] || g.type}</b>,
          g.dates.join(', ') || '—',
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
      <p className="text-[12px] italic text-slate-500 mt-2">Tone and stance are measured separately. Negative tone is the criticism load, not a threat by itself.</p>
      <div className="grid md:grid-cols-2 gap-4 mt-3 text-[12px]">
        {[['Stance toward ' + (ev.subject?.name || 'the subject'), s.stance_toward_subject], ['Stance toward the protest and its demands', s.stance_toward_protest]].map(([title, rows]) => (
          <div key={title}>
            <div className="font-semibold mb-1">{title}</div>
            <HBars rows={rows.map((r) => ({ label: r.key, value: r.count, color: { supportive: '#16a34a', critical: '#dc2626', neutral: '#94a3b8', unclear: '#cbd5e1' }[r.key], pct: r.pct }))} labelWidth="w-20" suffix={(r) => ` (${r.pct}%)`} />
          </div>
        ))}
      </div>

      <H2 n="04">Risk-band tracking</H2>
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
            <span>{r.summary || r.excerpt} {r.url && <Link href={r.url}>open</Link>}</span>,
            <span>{r.risk_reason}{r.reviewed ? <em className="text-slate-500"> (reviewed)</em> : null}</span>,
          ])}
        /></div>
      ) : <p className="text-[13px] text-emerald-700 mt-2 font-medium">No post remains in the critical or high band after review.</p>}
      {s.risk.medium_rows.length > 0 && <>
        <div className="font-semibold text-[13px] mt-4 mb-1">Medium band — highest engagement</div>
        <Table
          head={['When', 'Platform', 'Account', 'What it says', 'Why']}
          rows={s.risk.medium_rows.slice(0, 6).map((r) => [fmtDate(r.published_at), PLATFORM_LABEL[r.platform], r.author, <span>{r.summary || r.excerpt} {r.url && <Link href={r.url}>open</Link>}</span>, r.risk_reason])}
        />
      </>}

      <H2 n="05">Who and what is being discussed</H2>
      <div className="space-y-1.5 mb-3">
        {s.target_table.map((r) => (
          <div key={r.type} className="flex items-center gap-2 text-xs">
            <div className="w-40 text-right text-slate-600 truncate">{TARGET_LABEL[r.type] || r.type}</div>
            <div className="flex-1 flex h-4 rounded-sm overflow-hidden" style={{ maxWidth: `${(r.posts / Math.max(...s.target_table.map((x) => x.posts))) * 70 + 10}%` }}>
              {['positive', 'neutral', 'negative'].map((k) => <div key={k} style={{ width: `${(r[k] / (r.posts || 1)) * 100}%`, background: TONE_COLOR[k] }} />)}
            </div>
            <span className="text-slate-600 whitespace-nowrap">{Math.round((r.negative / (r.posts || 1)) * 100)}% neg · {fmt(r.posts)} posts</span>
          </div>
        ))}
      </div>
      <Table head={['Target / entity', 'Posts', 'Positive', 'Neutral', 'Negative']} rows={s.target_table.map((r) => [<b>{TARGET_LABEL[r.type] || r.type}</b>, fmt(r.posts), fmt(r.positive), fmt(r.neutral), fmt(r.negative)])} />
      <p className="text-[12px] text-slate-600 mt-2">
        Most named people and organisations: {s.entities.slice(0, 10).map((e) => `${e.name} (${fmt(e.count)})`).join(', ')}.
      </p>

      <H2 n="06">Influencer ecosystem</H2>
      <Tiles items={[[fmt(s.influencer_totals.accounts), 'Public accounts'], [PLATFORM_LABEL[s.influencer_totals.top_platform] || '—', 'Top platform'], [fmt(s.influencer_totals.top_score), 'Top engagement score'], [fmt(s.influencer_totals.likes), 'Likes']]} />
      <p className="text-[12px] italic text-slate-500 mt-2 mb-2">
        Engagement score = likes + 2×comments + 3×shares + views/10. {fmt(s.influencer_totals.shares)} shares · {fmt(s.influencer_totals.comments)} comments.
        Only news outlets, journalists, public figures, parties and organisations are listed. Ranking reflects measurable reach, not intent.
      </p>
      <HBars rows={s.influencers.slice(0, 8).map((a) => ({ label: a.name || `@${a.handle}`, value: a.score }))} color="#1e3a5f" />
      <div className="mt-3"><Table
        head={['Account', 'Type', 'Platform', 'Posts', 'Score', 'Mostly']}
        rows={s.influencers.slice(0, 12).map((a) => [
          a.top?.url ? <Link href={a.top.url}>{a.name || `@${a.handle}`}</Link> : (a.name || `@${a.handle}`),
          ACCOUNT_LABEL[a.account_type] || 'Account', PLATFORM_LABEL[a.platform], fmt(a.posts), fmt(a.score), a.dominant_stance === 'critical' ? 'critical of subject' : a.dominant_stance,
        ])}
      /></div>

      <H2 n="07">Evidence register (media sample)</H2>
      <Table
        head={['When', 'Platform', 'Outlet / account', 'Summary']}
        rows={s.evidence.map((p) => [<b>{fmtDate(p.published_at)}</b>, PLATFORM_LABEL[p.platform], p.author, <span>{p.summary || p.excerpt} {p.url && <Link href={p.url}>source</Link>}</span>])}
      />

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
                {n.examples.map((e) => <li key={e.id}>— {e.author}: {e.summary || e.excerpt} {e.url && <Link href={e.url}>open</Link>}</li>)}
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

      <H2 n="10">Recommended considerations</H2>
      <p className="text-[12px] text-slate-500 mb-2">Neutral, information-focused considerations for the office. Not messaging or persuasion advice.</p>
      <div className="grid md:grid-cols-2 gap-4">
        {[['Fact-check against official records', rec.fact_check], ['Questions a factual clarification could answer', rec.clarifications], ['Communication considerations', rec.communication],
          ['Information gaps', rec.information_gaps], ['Continue monitoring', rec.monitoring], ['Safety and platform reporting', rec.safety]]
          .filter(([, items]) => items && items.length)
          .map(([title, items]) => <div key={title} className="break-inside-avoid"><div className="font-semibold text-[13px] mb-1">{title}</div><Bullets items={items} /></div>)}
      </div>
      {(d.analyst_review?.notes || []).length > 0 && <>
        <div className="font-semibold text-[13px] mt-4 mb-1">Analyst notes</div>
        <Bullets items={d.analyst_review.notes} />
      </>}

      <H2>Summary</H2>
      <ul className="list-disc pl-5 text-[13px] space-y-1">
        <li>Prepared for: {workspace?.name}. Event: {ev.name}. Relevant posts analysed: {fmt(t.relevant)} of {fmt(t.collected)} collected.</li>
        <li>Platforms: {s.by_platform.filter((p) => p.relevant).map((p) => `${PLATFORM_LABEL[p.platform]} ${fmt(p.relevant)}`).join(' · ')}.</li>
        <li>Places named: {fmt(s.places.count)}; most named {s.places.rows[0]?.place || '—'}. Tone (positive / neutral / negative): {fmt(toneOf('positive').count)} / {fmt(toneOf('neutral').count)} / {fmt(toneOf('negative').count)}.</li>
        <li>Risk bands (critical / high / medium / low): {['critical', 'high', 'medium', 'low'].map((k) => fmt(band(k).count)).join(' / ')}.</li>
      </ul>

      <H2>Methodology and sources</H2>
      <ul className="list-disc pl-5 text-[12px] text-slate-700 space-y-1">{d.methodology.map((m, i) => <li key={i}>{m}</li>)}</ul>
      <div className="text-[12px] mt-3">
        <div className="font-semibold mb-1">Published sources</div>
        <ol className="list-decimal pl-5 space-y-0.5">
          {(ev.sources || []).map((src) => <li key={src.url}><a href={src.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{src.title || src.url}</a>{src.publisher ? ` — ${src.publisher}` : ''}{src.published_at ? `, ${fmtDay(src.published_at)}` : ''}</li>)}
        </ol>
      </div>
      <p className="text-[10px] text-slate-400 mt-6 text-center">{workspace?.name} · {ev.short_name} · generated {fmtDay(report.created_at)}</p>
    </article>
  );
};

export default ReportBrief;
