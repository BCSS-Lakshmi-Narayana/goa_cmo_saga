import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ExternalLink, FileText, LogOut, MessageSquare, RefreshCw, Loader2,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import ReportsPanel from './tenant/ReportsPanel';

/**
 * Workspace for tenant (non-Goa) users: their monitored events, reports for
 * any period, and the collected posts. Talks only to /api/tenant/*.
 */

const PLATFORM_LABEL = { x: 'X', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', reddit: 'Reddit', telegram: 'Telegram' };
const PLATFORM_COLOR = { x: '#111827', youtube: '#dc2626', facebook: '#1d4ed8', instagram: '#c026d3', reddit: '#ea580c', telegram: '#0284c7' };
const BAND_CLS = { critical: 'bg-red-700 text-white', high: 'bg-orange-500 text-white', medium: 'bg-amber-200 text-amber-900', low: 'bg-slate-100 text-slate-600' };
const CATEGORY_LABEL = {
  direct_protest_coverage: 'Direct protest coverage',
  reaction_support: 'Reaction / support',
  criticism: 'Criticism',
  neutral_reporting: 'Neutral reporting',
  counter_reaction: 'Counter-reaction',
  news_media_coverage: 'News / media coverage',
  unrelated: 'Unrelated',
};
const fmtNum = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN'));
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—');
/* ─────────────────────────────── Posts ─────────────────────────────── */

const PostsView = ({ eventId, narratives }) => {
  const [filters, setFilters] = useState({ platform: '', category: '', stance: '', narrative: '', risk: '', sort: 'recent' });
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
        <select className={sel} value={filters.risk} onChange={setF('risk')}>
          <option value="">Any risk band</option>{['critical', 'high', 'medium', 'low'].map((k) => <option key={k} value={k}>{k}</option>)}
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
                {(p.platform === 'youtube' ? [] : (p.media || [])).filter((m) => m.url).slice(0, 4).map((m, i) => (
                  <a key={i} href={m.url} target="_blank" rel="noreferrer" className="text-rose-700 hover:underline">{/video|gif/.test(m.kind || '') ? '▶ video' : 'image'}</a>
                ))}
              </div>
              {p.parent_title && <div className="mt-1 text-xs text-slate-500">Comment on: {p.parent_title}</div>}
              <p className="mt-1 whitespace-pre-wrap text-slate-800">{p.text}</p>
              <div className="flex flex-wrap gap-1 mt-2 text-[11px]">
                <Badge variant="secondary">{CATEGORY_LABEL[p.analysis?.category] || '—'}</Badge>
                <Badge variant="outline">toward subject: {p.analysis?.stance_toward_subject || '—'}</Badge>
                <Badge variant="outline">toward protest: {p.analysis?.stance_toward_protest || '—'}</Badge>
                <Badge variant="outline">tone: {p.analysis?.sentiment || '—'}</Badge>
                {p.analysis?.target && <Badge variant="outline">about: {p.analysis.target}</Badge>}
                {(p.analysis?.review?.risk_band || p.analysis?.risk_band) && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${BAND_CLS[p.analysis?.review?.risk_band || p.analysis.risk_band]}`}>
                    risk: {p.analysis?.review?.risk_band || p.analysis.risk_band}{p.analysis?.review?.reviewed_at ? ' (reviewed)' : ''}
                  </span>
                )}
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
    const d = await api.get(`/tenant/events/${eventId}`);
    setDetail(d.data);
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
                {running ? `Updating (${detail.pipeline.stage}${detail.pipeline.progress ? ` ${detail.pipeline.progress.done + detail.pipeline.progress.failed}/${detail.pipeline.progress.total}` : ''})…` : 'Collect & refresh report'}
              </Button>
            </div>
            <Tabs defaultValue="report">
              <TabsList className="print:hidden">
                <TabsTrigger value="report"><FileText className="h-4 w-4 mr-1" />Reports</TabsTrigger>
                <TabsTrigger value="posts"><MessageSquare className="h-4 w-4 mr-1" />Posts</TabsTrigger>
              </TabsList>
              <TabsContent value="report">
                <ReportsPanel event={event} workspace={workspace} />
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
