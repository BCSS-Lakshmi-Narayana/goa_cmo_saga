import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import ReportBrief, { Footage, PLATFORM_LABEL } from './ReportBrief';

const istDay = (d) => (d ? new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10) : undefined);
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
const TONES = [['positive', '#16a34a'], ['negative', '#dc2626'], ['neutral', '#475569']];

/** Appendix: every relevant post in the period, grouped by tone, with links and footage. */
export const PostsAppendix = ({ posts }) => (
  <section style={{ breakBefore: 'page' }} className="max-w-[900px] mx-auto text-slate-900">
    <h2 className="mt-2 mb-1 pb-1 border-b-2 border-[#1e3a5f] text-[17px] font-bold text-[#1e3a5f]">Appendix — all posts in the period</h2>
    <p className="text-[11px] text-slate-600 mb-3">
      {posts.length.toLocaleString('en-IN')} relevant posts, newest first within each tone. Private individuals' posts are listed by link only; "Stance" is toward the subject.
    </p>
    {TONES.map(([tone, color]) => {
      const rows = posts.filter((p) => p.tone === tone);
      return (
        <div key={tone} className="mb-5">
          <h3 className="text-[14px] font-bold capitalize mb-1" style={{ color, breakAfter: 'avoid' }}>{tone} — {rows.length.toLocaleString('en-IN')} posts</h3>
          <table className="w-full text-[9.5px] border-collapse">
            <thead>
              <tr className="bg-[#1e3a5f] text-white text-left">
                {['When (IST)', 'Platform', 'Account', 'Post', 'Stance', 'Links'].map((h) => <th key={h} className="px-1.5 py-1 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={i} className="border-b border-slate-200 align-top" style={{ breakInside: 'avoid' }}>
                  <td className="px-1.5 py-1 whitespace-nowrap">{fmtDate(p.published_at)}</td>
                  <td className="px-1.5 py-1">{PLATFORM_LABEL[p.platform] || p.platform}{p.post_type !== 'original' ? ` (${p.post_type})` : ''}</td>
                  <td className="px-1.5 py-1">{p.public_account ? (p.account || p.handle) : 'Private account'}</td>
                  <td className="px-1.5 py-1">{p.summary || String(p.text || '').slice(0, 220)}</td>
                  <td className="px-1.5 py-1">{p.stance_toward_subject || ''}</td>
                  <td className="px-1.5 py-1 whitespace-nowrap">{p.url && <a href={p.url} className="text-blue-700">post</a>}<Footage items={p.footage} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    })}
  </section>
);

/**
 * Print-ready brief at /workspace/print/:reportId. With ?autoprint=1 it opens
 * the browser's print dialog once rendered, so "Save as PDF" gives the file;
 * the document title becomes the suggested file name.
 */
const PrintReport = () => {
  const { reportId } = useParams();
  const params = new URLSearchParams(window.location.search);
  const withPosts = params.get('posts') === '1';
  // ?pdf=1: rendered by the server's headless Chrome into a PDF file (no print dialog).
  const forPdf = params.get('pdf') === '1';
  const [ready, setReady] = useState(false);
  const [state, setState] = useState({ report: null, workspace: null, posts: null, error: null });

  useEffect(() => {
    (async () => {
      const [r, w] = await Promise.all([api.get(`/tenant/reports/${reportId}`), api.get('/tenant/workspace')]);
      const report = r.data.report;
      let posts = null;
      if (withPosts) {
        const { data } = await api.get(`/tenant/events/${report.event_id}/posts/export`, {
          params: { from: istDay(report.range_from), to: istDay(report.range_to) }, timeout: 300000,
        });
        posts = data.posts;
      }
      setState({ report, workspace: w.data.workspace, posts, error: null });
    })().catch((err) => setState({ report: null, workspace: null, posts: null, error: err.response?.status ? `HTTP ${err.response.status}` : err.message }));
  }, [reportId, withPosts]);

  useEffect(() => {
    if (!state.report) return;
    const r = state.report;
    const day = (d) => (d ? new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10) : 'all');
    document.title = `${(r.title || 'report').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}_${day(r.range_from || r.period_start)}_to_${day(r.range_to || r.period_end)}${withPosts ? '_with_posts' : ''}`;
    // Let the browser lay out the brief before printing (or before the server captures it).
    requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    if (new URLSearchParams(window.location.search).get('autoprint') === '1') {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => window.print(), 300)));
    }
  }, [state.report, withPosts]);


  if (state.error) return <p data-print-error="1" style={{ padding: 24 }}>Could not load report ({state.error}).</p>;
  if (!state.report) return null;
  return (
    <div className="bg-white" data-print-ready={ready ? '1' : '0'}>
      {forPdf ? (
        <>
          {/* Server-rendered PDF: real page margins with page numbers; there is no browser header/footer here. */}
          <style>{'@page { size: A4; margin: 14mm 13mm 16mm 13mm; @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 9px; color: #64748b; } } .print\\:hidden { display: none !important; } tr, li { break-inside: avoid; } h2 { break-after: avoid; } html, body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }'}</style>
          <ReportBrief report={state.report} workspace={state.workspace} />
          {state.posts && <PostsAppendix posts={state.posts} />}
        </>
      ) : (
      <>
      {/* Zero page margin leaves the browser no room for its own header/footer (page URL, date,
          title), in every browser. The frame table's header and footer rows repeat on each printed
          page and stand in for the top and bottom margins; the cell padding is the side margin. */}
      <style>{'@page { size: A4; margin: 0; } .print-frame { width: 100%; border-collapse: collapse; } .print-frame > thead > tr > td { height: 14mm; padding: 0; } .print-frame > tfoot > tr > td { height: 16mm; padding: 0; } .print-frame > tbody > tr > td { padding: 0 13mm; vertical-align: top; } .print-frame > tbody > tr { break-inside: auto !important; } .print\\:hidden { display: none !important; } tr, li { break-inside: avoid; } h2 { break-after: avoid; } html, body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }'}</style>
      <table className="print-frame">
        <thead><tr><td /></tr></thead>
        <tfoot><tr><td /></tr></tfoot>
        <tbody><tr><td>
          <ReportBrief report={state.report} workspace={state.workspace} />
          {state.posts && <PostsAppendix posts={state.posts} />}
        </td></tr></tbody>
      </table>
      </>
      )}
    </div>
  );
};

export default PrintReport;
