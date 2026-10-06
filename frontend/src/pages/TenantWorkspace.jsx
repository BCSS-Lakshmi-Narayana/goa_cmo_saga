import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import {
  AlertTriangle, ExternalLink, FileText, LogOut, MessageSquare, Printer, RefreshCw, Loader2,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

/**
 * Workspace for tenant (non-Goa) users: their monitored events, the collected
 * posts and the executive report. Talks only to /api/tenant/*.
 */

const PLATFORM_LABEL = { x: 'X', facebook: 'Facebook', instagram: 'Instagram' };
const PLATFORM_COLOR = { x: '#111827', facebook: '#1d4ed8', instagram: '#c026d3' };
const CATEGORY_LABEL = {
  direct_protest_coverage: 'Direct protest coverage',
  reaction_support: 'Reaction / support',
  criticism: 'Criticism',
  neutral_reporting: 'Neutral reporting',
  counter_reaction: 'Counter-reaction',
  news_media_coverage: 'News / media coverage',
  unrelated: 'Unrelated',
};
const FACT_STATUS = {
  verified: { label: 'Verified', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  single_source: { label: 'Single source', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  claim: { label: 'Claim — unverified', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
};
const SEVERITY_CLS = {
  high: 'border-l-rose-600 bg-rose-50',
  medium: 'border-l-amber-500 bg-amber-50',
  low: 'border-l-slate-400 bg-slate-50',
};
const STANCE_CLS = {
  supportive: 'bg-emerald-500', critical: 'bg-rose-500', neutral: 'bg-slate-400', unclear: 'bg-slate-200',
  positive: 'bg-emerald-500', negative: 'bg-rose-500', mixed: 'bg-amber-400',
};

const fmtNum = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN'));
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }) : '—');
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

const Section = ({ id, title, children, subtitle }) => (
  <section id={id} className="break-inside-avoid-page">
    <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-1">{title}</h2>
    {subtitle && <p className="text-sm text-slate-500 mb-3">{subtitle}</p>}
    <div className="space-y-3">{children}</div>
  </section>
);

const SourceLinks = ({ urls }) => (
  <span className="inline-flex flex-wrap gap-x-2">
    {(urls || []).map((u) => (
      <a key={u} href={u} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline">
        {hostOf(u)}
      </a>
    ))}
  </span>
);

const PostRef = ({ p }) => (
  <div className="text-sm border rounded-md p-2 bg-white">
    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
      <span className="font-medium" style={{ color: PLATFORM_COLOR[p.platform] }}>{PLATFORM_LABEL[p.platform]}</span>
      <span>{p.author}</span>
      <span>· {fmtDate(p.published_at)}</span>
      {p.engagement ? <span>· {fmtNum(p.engagement)} engagements</span> : null}
      {p.url && (
        <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto text-blue-700 inline-flex items-center gap-1">
          open <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
    <p className="text-slate-700">{p.excerpt}</p>
  </div>
);

const ShareBar = ({ rows }) => {
  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded">
        {rows.filter((r) => r.count).map((r) => (
          <div key={r.key} className={STANCE_CLS[r.key]} style={{ width: `${(r.count / total) * 100}%` }} title={`${r.key}: ${r.count}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-600">
        {rows.map((r) => (
          <span key={r.key} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${STANCE_CLS[r.key]}`} />
            {r.key} {r.pct}% ({r.count})
          </span>
        ))}
      </div>
    </div>
  );
};

const Kpi = ({ label, value, hint }) => (
  <div className="rounded-lg border bg-white p-3">
    <div className="text-xs text-slate-500">{label}</div>
    <div className="text-2xl font-semibold text-slate-900">{value}</div>
    {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
  </div>
);

const List = ({ items }) => (
  items && items.length ? (
    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  ) : <p className="text-sm text-slate-500">None identified in this period.</p>
);

/* ─────────────────────────────── Report ─────────────────────────────── */

const ReportView = ({ report }) => {
  const d = report.data;
  const s = d.stats;
  const ev = d.event;
  const negativeHighEngagement = (s.high_engagement_posts || []).filter((p) => p.stance_toward_subject === 'critical').slice(0, 5);
  const disputed = (ev.facts || []).filter((f) => f.status !== 'verified');
  const growth = s.volume_change.previous_24h
    ? Math.round(((s.volume_change.last_24h - s.volume_change.previous_24h) / s.volume_change.previous_24h) * 100)
    : null;

  return (
    <div className="max-w-5xl mx-auto print:max-w-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{report.title}</h1>
          <p className="text-sm text-slate-500">
            Generated {fmtDate(report.created_at)} · Posts from {fmtDate(report.period_start)} to {fmtDate(report.period_end)} · {fmtNum(s.totals.relevant)} relevant posts
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
          <Printer className="h-4 w-4 mr-1" /> Print / Save PDF
        </Button>
      </div>

      <Section id="attention" title="What requires attention">
        {(d.attention || []).map((a, i) => (
          <div key={i} className={`border-l-4 rounded-r-md p-3 ${SEVERITY_CLS[a.severity] || SEVERITY_CLS.low}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-slate-600" />
              <span className="font-medium text-slate-900">{a.title}</span>
              <Badge variant="outline" className="ml-auto text-xs">{a.severity}</Badge>
            </div>
            <p className="text-sm text-slate-700 mt-1">{a.detail}</p>
          </div>
        ))}
      </Section>

      <Section id="summary" title="Executive summary">
        <Card><CardContent className="pt-4 space-y-2 text-sm text-slate-800">
          {[
            ['What happened', d.executive_summary.what_happened],
            ['When and where', d.executive_summary.when_where],
            ['Who was involved', d.executive_summary.who_involved],
            ['Why it is receiving attention', d.executive_summary.why_attention],
            ['Social-media discussion', d.executive_summary.social_discussion],
          ].map(([k, v]) => (
            <p key={k}><span className="font-semibold">{k}: </span>{v}</p>
          ))}
        </CardContent></Card>
      </Section>

      <Section id="overview" title="Event overview" subtitle="Facts from published reporting, labelled by how well they are sourced. Social-media claims are kept separately below.">
        <Card><CardContent className="pt-4">
          <div className="grid sm:grid-cols-2 gap-2 text-sm mb-4">
            <div><span className="text-slate-500">Event: </span>{ev.name}</div>
            <div><span className="text-slate-500">Date/time: </span>{fmtDate(ev.start_date)} IST</div>
            <div><span className="text-slate-500">Location: </span>{ev.location}</div>
            <div><span className="text-slate-500">Directed at: </span>{ev.subject?.name} ({ev.subject?.role})</div>
            <div className="sm:col-span-2"><span className="text-slate-500">Organisers: </span>{(ev.organisers || []).map((o) => `${o.name}${o.role ? ` (${o.role})` : ''}`).join('; ')}</div>
          </div>
          <ul className="space-y-2">
            {(ev.facts || []).map((f, i) => (
              <li key={i} className="text-sm flex flex-col gap-1 border-b pb-2 last:border-0">
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded border ${FACT_STATUS[f.status].cls}`}>{FACT_STATUS[f.status].label}</span>
                  <span className="text-slate-800">{f.statement}{f.claimed_by ? <em className="text-slate-500"> — claimed by {f.claimed_by}</em> : null}</span>
                </div>
                <div className="pl-1"><SourceLinks urls={f.sources} /></div>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      </Section>

      <Section id="social" title="Social media analysis">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Relevant posts" value={fmtNum(s.totals.relevant)} hint={`${fmtNum(s.totals.collected)} collected · ${fmtNum(s.totals.excluded_unrelated)} unrelated excluded`} />
          <Kpi label="Original posts / reposts" value={`${fmtNum(s.totals.originals)} / ${fmtNum(s.totals.reposts)}`} />
          <Kpi label="Engagement (originals)" value={fmtNum(s.totals.total_engagement)} hint="likes + comments + shares" />
          <Kpi label="Last 24h vs previous 24h" value={`${s.volume_change.last_24h} / ${s.volume_change.previous_24h}`} hint={growth === null ? `peak day ${s.volume_change.peak_day || '—'}` : `${growth > 0 ? '+' : ''}${growth}% · peak ${s.volume_change.peak_day}`} />
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          {s.by_platform.map((p) => (
            <Card key={p.platform}><CardContent className="pt-4 text-sm">
              <div className="font-semibold" style={{ color: PLATFORM_COLOR[p.platform] }}>{PLATFORM_LABEL[p.platform]}</div>
              <div className="text-slate-700">{fmtNum(p.relevant)} relevant ({fmtNum(p.originals)} original, {fmtNum(p.reposts)} reposts)</div>
              <div className="text-slate-500 text-xs">{fmtNum(p.engagement)} engagements · {fmtNum(p.collected)} collected</div>
            </CardContent></Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-0"><CardTitle className="text-sm">Posting activity by day (IST)</CardTitle></CardHeader>
          <CardContent className="h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.timeline}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {['x', 'facebook', 'instagram'].map((k) => (
                  <Bar key={k} dataKey={k} name={PLATFORM_LABEL[k]} stackId="a" fill={PLATFORM_COLOR[k]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-3 gap-3">
          <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Post types</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {s.categories.map((c) => (
                <div key={c.key} className="flex justify-between"><span>{CATEGORY_LABEL[c.key] || c.key}</span><span className="text-slate-500">{c.count} · {c.pct}%</span></div>
              ))}
            </CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Top hashtags</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {s.hashtags.length ? s.hashtags.slice(0, 10).map((h) => (
                <div key={h.tag} className="flex justify-between"><span>{h.tag}</span><span className="text-slate-500">{h.count}</span></div>
              )) : <p className="text-slate-500">Few hashtags were used.</p>}
            </CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Most discussed people & organisations</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {s.entities.slice(0, 10).map((e) => (
                <div key={e.name} className="flex justify-between"><span>{e.name}</span><span className="text-slate-500">{e.count}</span></div>
              ))}
            </CardContent></Card>
        </div>
      </Section>

      <Section id="stance" title="Public sentiment and stance" subtitle="Stance and sentiment are measured separately. A critical post is an opinion, not evidence for what it alleges.">
        <Card><CardContent className="pt-4 space-y-4">
          <div><div className="text-sm font-medium mb-1">Stance toward {ev.subject?.name}</div><ShareBar rows={s.stance_toward_subject} /></div>
          <div><div className="text-sm font-medium mb-1">Stance toward the protest and its demands</div><ShareBar rows={s.stance_toward_protest} /></div>
          <div><div className="text-sm font-medium mb-1">Overall tone (sentiment)</div><ShareBar rows={s.sentiment} /></div>
        </CardContent></Card>
        <div className="grid md:grid-cols-3 gap-3">
          {[
            ['Supportive of ' + (ev.subject?.name || 'subject'), s.stance_examples.supportive_of_subject],
            ['Critical of ' + (ev.subject?.name || 'subject'), s.stance_examples.critical_of_subject],
            ['Neutral / informational', s.stance_examples.neutral],
          ].map(([label, rows]) => (
            <div key={label}>
              <div className="text-xs font-semibold text-slate-600 mb-1">{label} — highest-engagement examples</div>
              <div className="space-y-2">{rows.length ? rows.map((p, i) => <PostRef key={i} p={p} />) : <p className="text-sm text-slate-500">None in sample.</p>}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="narratives" title="Key narratives">
        {s.narratives.map((n) => (
          <Card key={n.key}><CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{n.label}</span>
              <Badge variant="outline">{n.count} posts · {n.pct}%</Badge>
              <Badge variant="outline">{n.trend}</Badge>
              <span className="text-xs text-slate-500">{n.platforms.map((p) => `${PLATFORM_LABEL[p.platform]} ${p.count}`).join(' · ')}</span>
            </div>
            <p className="text-sm text-slate-700 mt-1">{d.narrative_summaries?.[n.key] || n.description}</p>
            <div className="grid md:grid-cols-3 gap-2 mt-2">{n.examples.map((p, i) => <PostRef key={i} p={p} />)}</div>
          </CardContent></Card>
        ))}
      </Section>

      <Section id="accounts" title="Key accounts and amplification" subtitle="Ranked by measurable engagement on relevant posts in this sample. No inference is made about automation, coordination or intent.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr><th className="p-2">Account</th><th className="p-2">Platform</th><th className="p-2">Posts (orig/repost)</th><th className="p-2">Engagement</th><th className="p-2">Followers</th><th className="p-2">Dominant stance toward subject</th></tr>
            </thead>
            <tbody>
              {s.top_accounts_by_engagement.map((a) => (
                <tr key={`${a.platform}${a.handle}`} className="border-t">
                  <td className="p-2">{a.top_post?.url ? <a className="text-blue-700 hover:underline" href={a.top_post.url} target="_blank" rel="noreferrer">@{a.handle}</a> : `@${a.handle}`}{a.name ? <span className="text-slate-500"> · {a.name}</span> : null}</td>
                  <td className="p-2">{PLATFORM_LABEL[a.platform]}</td>
                  <td className="p-2">{a.posts} ({a.originals}/{a.reposts})</td>
                  <td className="p-2">{fmtNum(a.engagement)}</td>
                  <td className="p-2">{fmtNum(a.followers)}</td>
                  <td className="p-2">{a.dominant_stance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="risks" title="Risk and issue summary">
        <Card><CardContent className="pt-4 space-y-4 text-sm">
          <div>
            <div className="font-semibold mb-1">Discussion volume</div>
            <p className="text-slate-700">{s.volume_change.last_24h} relevant posts in the most recent 24 hours of the sample, against {s.volume_change.previous_24h} in the 24 hours before. The busiest day was {s.volume_change.peak_day || '—'} ({s.volume_change.peak_posts} posts).</p>
          </div>
          <div>
            <div className="font-semibold mb-1">Repeated allegations <span className="font-normal text-slate-500">(made in posts and not verified by this report)</span></div>
            {(d.allegation_themes || []).length ? (
              <ul className="space-y-1">{d.allegation_themes.map((t, i) => (
                <li key={i}><span className="text-rose-700 font-medium">Allegation:</span> {t.theme} <span className="text-slate-500">— {t.status_note}</span></li>
              ))}</ul>
            ) : <p className="text-slate-500">None grouped.</p>}
          </div>
          <div>
            <div className="font-semibold mb-1">Disputed or single-source claims in published reporting</div>
            <ul className="space-y-1">{disputed.map((f, i) => (
              <li key={i}><span className={`text-[11px] px-1.5 py-0.5 rounded border mr-1 ${FACT_STATUS[f.status].cls}`}>{FACT_STATUS[f.status].label}</span>{f.statement} <SourceLinks urls={f.sources} /></li>
            ))}</ul>
          </div>
          <div>
            <div className="font-semibold mb-1">High-engagement critical posts</div>
            <div className="space-y-2">{negativeHighEngagement.length ? negativeHighEngagement.map((p, i) => <PostRef key={i} p={p} />) : <p className="text-slate-500">None in sample.</p>}</div>
          </div>
          <div>
            <div className="font-semibold mb-1">Announced offline activity</div>
            <ul className="space-y-1">{(ev.watch_items || []).map((w, i) => (
              <li key={i}><span className="font-medium">{fmtDay(w.date)}:</span> {w.description} <span className={`text-[11px] px-1.5 py-0.5 rounded border ml-1 ${FACT_STATUS[w.status].cls}`}>{FACT_STATUS[w.status].label}</span> <SourceLinks urls={w.sources} /></li>
            ))}</ul>
          </div>
        </CardContent></Card>
      </Section>

      <Section id="recommendations" title="Response considerations" subtitle="Neutral, information-focused considerations. Not messaging or persuasion advice.">
        <div className="grid md:grid-cols-2 gap-3">
          {[
            ['Claims to fact-check against official records', d.recommendations?.fact_check],
            ['Questions that need clarification', d.recommendations?.clarifications],
            ['Public concerns that may need addressing', d.recommendations?.public_concerns],
            ['Information gaps', d.recommendations?.information_gaps],
            ['Continue monitoring', d.recommendations?.continued_monitoring],
          ].map(([t, items]) => (
            <Card key={t}><CardHeader className="pb-1"><CardTitle className="text-sm">{t}</CardTitle></CardHeader><CardContent><List items={items} /></CardContent></Card>
          ))}
        </div>
      </Section>

      <Section id="method" title="Methodology and sources">
        <Card><CardContent className="pt-4 text-sm text-slate-700 space-y-2">
          <ul className="list-disc pl-5 space-y-1">{d.methodology.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <div className="pt-2">
            <div className="font-semibold mb-1">Published sources</div>
            <ul className="space-y-0.5">{(ev.sources || []).map((src) => (
              <li key={src.url}><a href={src.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{src.title || src.url}</a>{src.publisher ? <span className="text-slate-500"> — {src.publisher}</span> : null}{src.published_at ? <span className="text-slate-500">, {fmtDay(src.published_at)}</span> : null}</li>
            ))}</ul>
          </div>
        </CardContent></Card>
      </Section>
    </div>
  );
};

/* ─────────────────────────────── Posts ─────────────────────────────── */

const PostsView = ({ eventId, narratives }) => {
  const [filters, setFilters] = useState({ platform: '', category: '', stance: '', narrative: '', sort: 'recent' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ posts: [], total: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { page, limit: 25, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
    api.get(`/tenant/events/${eventId}/posts`, { params })
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch(() => toast.error('Could not load posts'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId, filters, page]);

  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };
  const sel = 'border rounded-md px-2 py-1 text-sm bg-white';
  const pages = Math.max(1, Math.ceil(data.total / 25));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap gap-2 mb-3">
        <select className={sel} value={filters.platform} onChange={setF('platform')}>
          <option value="">All platforms</option>{Object.entries(PLATFORM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={sel} value={filters.category} onChange={setF('category')}>
          <option value="">All post types</option>{Object.entries(CATEGORY_LABEL).filter(([k]) => k !== 'unrelated').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={sel} value={filters.stance} onChange={setF('stance')}>
          <option value="">Any stance</option>{['supportive', 'critical', 'neutral', 'unclear'].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select className={sel} value={filters.narrative} onChange={setF('narrative')}>
          <option value="">Any narrative</option>{(narratives || []).map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
        </select>
        <select className={sel} value={filters.sort} onChange={setF('sort')}>
          <option value="recent">Newest first</option><option value="engagement">Most engagement</option>
        </select>
        <span className="text-sm text-slate-500 self-center ml-auto">{fmtNum(data.total)} posts</span>
      </div>
      {loading ? <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : (
        <div className="space-y-2">
          {data.posts.map((p) => (
            <Card key={p._id}><CardContent className="pt-3 pb-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold" style={{ color: PLATFORM_COLOR[p.platform] }}>{PLATFORM_LABEL[p.platform]}</span>
                <span className="text-slate-800">{p.author_name || ''} {p.author_handle ? `@${p.author_handle}` : ''}</span>
                <span>{fmtDate(p.published_at)}</span>
                {p.post_type !== 'original' && <Badge variant="outline" className="text-[10px]">{p.post_type}{p.original_author_handle ? ` of @${p.original_author_handle}` : ''}</Badge>}
                {p.language && <span>lang: {p.language}</span>}
                {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto text-blue-700 inline-flex items-center gap-1">open <ExternalLink className="h-3 w-3" /></a>}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-800">{p.text}</p>
              <div className="flex flex-wrap gap-1 mt-2 text-[11px]">
                <Badge variant="secondary">{CATEGORY_LABEL[p.analysis?.category] || '—'}</Badge>
                <Badge variant="outline">toward subject: {p.analysis?.stance_toward_subject || '—'}</Badge>
                <Badge variant="outline">toward protest: {p.analysis?.stance_toward_protest || '—'}</Badge>
                <Badge variant="outline">tone: {p.analysis?.sentiment || '—'}</Badge>
                {p.analysis?.target && <Badge variant="outline">about: {p.analysis.target}</Badge>}
              </div>
              {(p.analysis?.claims || []).filter((c) => c.kind === 'allegation').length > 0 && (
                <div className="mt-1 text-xs text-rose-700">Allegation (unverified): {p.analysis.claims.filter((c) => c.kind === 'allegation').map((c) => c.text).join('; ')}</div>
              )}
              <div className="mt-1 text-xs text-slate-500">
                likes {fmtNum(p.metrics?.likes)} · comments {fmtNum(p.metrics?.comments)} · shares {fmtNum(p.metrics?.shares)} · views {fmtNum(p.metrics?.views)}
                {p.hashtags?.length ? ` · ${p.hashtags.join(' ')}` : ''}
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
      <div className="flex justify-center items-center gap-2 mt-4">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <span className="text-sm text-slate-500">Page {page} of {pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </div>
  );
};

/* ─────────────────────────────── Shell ─────────────────────────────── */

const TenantWorkspace = () => {
  const { user, logout } = useAuth();
  const [workspace, setWorkspace] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/tenant/workspace'), api.get('/tenant/events')])
      .then(([w, e]) => {
        setWorkspace(w.data.workspace);
        setEvents(e.data.events);
        if (e.data.events[0]) setEventId(e.data.events[0].id);
      })
      .catch(() => toast.error('Could not load workspace'))
      .finally(() => setLoading(false));
  }, []);

  const loadEvent = useCallback(async () => {
    if (!eventId) return;
    const [d, r] = await Promise.all([
      api.get(`/tenant/events/${eventId}`),
      api.get(`/tenant/events/${eventId}/reports/latest`).catch(() => ({ data: { report: null } })),
    ]);
    setDetail(d.data);
    setReport(r.data.report);
  }, [eventId]);

  useEffect(() => { loadEvent().catch(() => toast.error('Could not load event')); }, [loadEvent]);

  // While an update runs, poll until it finishes, then reload the report.
  const running = detail?.pipeline?.running;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => loadEvent().catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [running, loadEvent]);

  const refresh = async () => {
    try {
      await api.post(`/tenant/events/${eventId}/refresh`);
      toast.success('Collecting new posts and rebuilding the report. This can take several minutes.');
      loadEvent();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not start update');
    }
  };

  const event = detail?.event;
  const narratives = useMemo(() => event?.narratives || [], [event]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <header className="bg-white border-b print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <FileText className="h-5 w-5 text-slate-700" />
          <div>
            <div className="font-semibold text-slate-900">{workspace?.name || 'Workspace'}</div>
            <div className="text-xs text-slate-500">{workspace?.client_description}</div>
          </div>
          {events.length > 1 && (
            <select className="border rounded-md px-2 py-1 text-sm" value={eventId || ''} onChange={(e) => setEventId(e.target.value)}>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-slate-600">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-1" />Sign out</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4">
        {!event ? <p className="text-slate-600">No events in this workspace yet.</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3 print:hidden">
              <h1 className="text-xl font-semibold text-slate-900">{event.name}</h1>
              <span className="text-xs text-slate-500">Last collected {fmtDate(event.last_collected_at)}</span>
              <Button size="sm" variant="outline" className="ml-auto" onClick={refresh} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                {running ? `Updating (${detail.pipeline.stage})…` : 'Collect & refresh report'}
              </Button>
            </div>
            <Tabs defaultValue="report">
              <TabsList className="print:hidden">
                <TabsTrigger value="report"><FileText className="h-4 w-4 mr-1" />Executive report</TabsTrigger>
                <TabsTrigger value="posts"><MessageSquare className="h-4 w-4 mr-1" />Posts</TabsTrigger>
              </TabsList>
              <TabsContent value="report" className="bg-white rounded-lg p-4 md:p-6 print:p-0">
                {report ? <ReportView report={report} /> : <p className="text-slate-600">No report yet. Use “Collect & refresh report”.</p>}
              </TabsContent>
              <TabsContent value="posts">
                <PostsView eventId={eventId} narratives={narratives} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
};

export default TenantWorkspace;
