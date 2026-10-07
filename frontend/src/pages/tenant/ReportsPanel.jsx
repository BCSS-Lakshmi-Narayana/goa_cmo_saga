import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText, Loader2, Eye } from 'lucide-react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import ReportBrief from './ReportBrief';
import { exportPostsExcel } from './exportPostsExcel';

/**
 * Pick a period, generate a report for it, and download it as PDF (or the
 * period's posts as Excel, split by tone). Earlier reports stay listed.
 */

const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const istDaysAgo = (n) => new Date(Date.now() + 5.5 * 3600000 - n * 86400000).toISOString().slice(0, 10);
const istDay = (d) => (d ? new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10) : null);
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '');

const periodLabel = (r) => (r.range_from || r.range_to
  ? `${r.range_from ? fmtDay(r.range_from) : 'Start'} – ${r.range_to ? fmtDay(r.range_to) : 'latest'}`
  : `Whole event${r.period_start ? ` (${fmtDay(r.period_start)} – ${fmtDay(r.period_end)})` : ''}`);

const ReportsPanel = ({ event, workspace }) => {
  const eventStart = istDay(event.collection_plan?.since || event.start_date) || istDaysAgo(7);
  const [from, setFrom] = useState(eventStart);
  const [to, setTo] = useState(istToday());
  const [reports, setReports] = useState([]);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState({});

  const loadList = useCallback(async () => {
    const { data } = await api.get(`/tenant/events/${event.id}/reports`);
    setReports(data.reports);
    return data.reports;
  }, [event.id]);

  const openReport = useCallback(async (id) => {
    const { data } = await api.get(`/tenant/reports/${id}`);
    setOpen(data.report);
  }, []);

  useEffect(() => {
    loadList().then((list) => {
      const latest = list.find((r) => r.status === 'ready');
      if (latest) openReport(latest.id);
    }).catch(() => toast.error('Could not load reports'));
  }, [loadList, openReport]);

  // Poll while any report is generating.
  const pending = reports.some((r) => r.status === 'generating');
  useEffect(() => {
    if (!pending) return undefined;
    const t = setInterval(async () => {
      const before = new Set(reports.filter((r) => r.status === 'ready').map((r) => r.id));
      const list = await loadList().catch(() => null);
      const done = list?.find((r) => r.status === 'ready' && !before.has(r.id));
      if (done) { toast.success('Report ready'); openReport(done.id); }
      const failed = list?.find((r) => r.status === 'failed' && reports.find((x) => x.id === r.id)?.status === 'generating');
      if (failed) toast.error(`Report failed: ${failed.error || 'unknown error'}`);
    }, 4000);
    return () => clearInterval(t);
  }, [pending, reports, loadList, openReport]);

  const preset = (days) => {
    if (days === 'all') { setFrom(eventStart); setTo(istToday()); return; }
    setFrom(istDaysAgo(days - 1)); setTo(istToday());
  };

  const generate = async () => {
    if (from && to && from > to) { toast.error('"From" must be on or before "To"'); return; }
    try {
      await api.post(`/tenant/events/${event.id}/reports`, { from, to });
      toast.success('Generating report…');
      loadList();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not start the report');
    }
  };

  // The server renders the brief (optionally with every post appended) to a PDF file,
  // so no browser print header or footer ends up in it.
  const downloadPdf = async (r, withPosts = false) => {
    const key = `pdf${withPosts ? 'p' : ''}${r.id}`;
    setBusy((b) => ({ ...b, [key]: true }));
    const note = toast.loading(withPosts ? 'Preparing PDF with all posts — this can take a few minutes…' : 'Preparing PDF…');
    try {
      const res = await api.get(`/tenant/reports/${r.id}/pdf`, { params: withPosts ? { posts: 1 } : {}, responseType: 'blob', timeout: 900000 });
      const name = (res.headers['content-disposition'] || '').match(/filename="([^"]+)"/)?.[1] || 'report.pdf';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('PDF downloaded', { id: note });
    } catch (e) {
      let message = 'Could not prepare the PDF';
      try { message = JSON.parse(await e.response.data.text()).message || message; } catch (_) { /* not JSON */ }
      toast.error(message, { id: note });
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const downloadExcel = async (r) => {
    setBusy((b) => ({ ...b, [`xls${r.id}`]: true }));
    try {
      const f = istDay(r.range_from);
      const t = istDay(r.range_to);
      const { data } = await api.get(`/tenant/events/${event.id}/posts/export`, { params: { from: f || undefined, to: t || undefined }, timeout: 180000 });
      exportPostsExcel(data.posts, { title: event.short_name || event.name, from: f, to: t });
    } catch (e) {
      toast.error('Could not export posts');
    } finally {
      setBusy((b) => ({ ...b, [`xls${r.id}`]: false }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4 print:hidden">
        <div className="font-semibold text-slate-900 mb-2">Generate a report</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-slate-500 mb-1">From</span>
            <input type="date" className="border rounded-md px-2 py-1.5 text-sm" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-slate-500 mb-1">To</span>
            <input type="date" className="border rounded-md px-2 py-1.5 text-sm" value={to} min={from || undefined} max={istToday()} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1">
            {[['Today', 1], ['Last 3 days', 3], ['Last 7 days', 7], ['Whole event', 'all']].map(([label, d]) => {
              const active = to === istToday() && from === (d === 'all' ? eventStart : istDaysAgo(d - 1));
              return (
                <Button key={label} type="button" variant={active ? 'default' : 'outline'} size="sm" onClick={() => preset(d)} aria-pressed={active}>{label}</Button>
              );
            })}
          </div>
          <Button onClick={generate} disabled={pending} className="ml-auto">
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
            {pending ? 'Generating…' : 'Generate report'}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">Dates are Indian Standard Time. The report covers posts published in the period; positive, negative and neutral posts are broken down separately, and the Excel download has one sheet for each. “PDF” is the brief alone; “PDF + posts” adds every post in the period, grouped positive, negative and neutral, with post and footage links. Both download a ready PDF file.</p>
      </div>

      {reports.length > 0 && (
        <div className="bg-white rounded-lg border print:hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="p-2">Period</th><th className="p-2">Posts</th><th className="p-2">Created</th><th className="p-2">Status</th><th className="p-2 text-right">Download</th></tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className={`border-t ${open?.id === r.id ? 'bg-indigo-50' : ''}`}>
                  <td className="p-2 font-medium">{periodLabel(r)}</td>
                  <td className="p-2">{r.status === 'ready' ? Number(r.post_count || 0).toLocaleString('en-IN') : '—'}</td>
                  <td className="p-2 text-slate-500">{fmtDateTime(r.created_at)}</td>
                  <td className="p-2">{r.status === 'generating' ? <span className="inline-flex items-center gap-1 text-amber-700"><Loader2 className="h-3 w-3 animate-spin" />generating</span> : r.status === 'failed' ? <span className="text-red-700">failed</span> : <span className="text-emerald-700">ready</span>}</td>
                  <td className="p-2">
                    {r.status === 'ready' && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openReport(r.id)}><Eye className="h-4 w-4 mr-1" />View</Button>
                        <Button variant="outline" size="sm" onClick={() => downloadPdf(r)} disabled={busy[`pdf${r.id}`]} title="The brief without the post list">
                          {busy[`pdf${r.id}`] ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => downloadPdf(r, true)} disabled={busy[`pdfp${r.id}`]} title="The brief plus every post in the period, grouped by tone">
                          {busy[`pdfp${r.id}`] ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}PDF + posts
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => downloadExcel(r)} disabled={busy[`xls${r.id}`]}>
                          {busy[`xls${r.id}`] ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}Excel
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-lg p-4 md:p-6 print:p-0">
        {open ? <ReportBrief report={open} workspace={workspace} onDownloadPdf={() => downloadPdf(open)} />
          : <p className="text-slate-600">No report yet. Choose a period and generate one.</p>}
      </div>
    </div>
  );
};

export default ReportsPanel;
