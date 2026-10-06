import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { BACKEND_URL } from '../../lib/api';
import ReportBrief from './ReportBrief';

/**
 * Bare page the server's PDF renderer opens: /workspace/print/:reportId#token=…
 * The short-lived token comes in the URL fragment (never sent to a server) and
 * is used only for these two requests — nothing is stored. Sets
 * window.__REPORT_READY__ once the brief has rendered.
 */
const PrintReport = () => {
  const { reportId } = useParams();
  const [state, setState] = useState({ report: null, workspace: null, error: null });

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    const client = axios.create({ baseURL: `${BACKEND_URL}/api`, headers: { Authorization: `Bearer ${token}` } });
    Promise.all([client.get(`/tenant/reports/${reportId}`), client.get('/tenant/workspace')])
      .then(([r, w]) => setState({ report: r.data.report, workspace: w.data.workspace, error: null }))
      .catch((err) => {
        window.__REPORT_ERROR__ = err.response?.status ? `HTTP ${err.response.status}` : err.message;
        setState({ report: null, workspace: null, error: window.__REPORT_ERROR__ });
      });
  }, [reportId]);

  useEffect(() => {
    if (state.report) {
      // Let the browser lay out the brief before signalling.
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__REPORT_READY__ = true; }));
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
