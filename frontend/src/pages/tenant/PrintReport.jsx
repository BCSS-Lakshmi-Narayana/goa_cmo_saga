import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import ReportBrief from './ReportBrief';

/**
 * Print-ready brief at /workspace/print/:reportId. With ?autoprint=1 it opens
 * the browser's print dialog once rendered, so "Save as PDF" gives the file;
 * the document title becomes the suggested file name.
 */
const PrintReport = () => {
  const { reportId } = useParams();
  const [state, setState] = useState({ report: null, workspace: null, error: null });

  useEffect(() => {
    Promise.all([api.get(`/tenant/reports/${reportId}`), api.get('/tenant/workspace')])
      .then(([r, w]) => setState({ report: r.data.report, workspace: w.data.workspace, error: null }))
      .catch((err) => setState({ report: null, workspace: null, error: err.response?.status ? `HTTP ${err.response.status}` : err.message }));
  }, [reportId]);

  useEffect(() => {
    if (!state.report) return;
    const r = state.report;
    const day = (d) => (d ? new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10) : 'all');
    document.title = `${(r.title || 'report').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}_${day(r.range_from || r.period_start)}_to_${day(r.range_to || r.period_end)}`;
    // Let the browser lay out the brief before printing.
    if (new URLSearchParams(window.location.search).get('autoprint') === '1') {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => window.print(), 300)));
    }
  }, [state.report]);

  if (state.error) return <p style={{ padding: 24 }}>Could not load report ({state.error}).</p>;
  if (!state.report) return null;
  return (
    <div className="bg-white">
      <style>{'@page { size: A4; margin: 14mm 13mm 16mm 13mm; } .print\\:hidden { display: none !important; } tr, li { break-inside: avoid; } h2 { break-after: avoid; } html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }'}</style>
      <ReportBrief report={state.report} workspace={state.workspace} />
    </div>
  );
};

export default PrintReport;
