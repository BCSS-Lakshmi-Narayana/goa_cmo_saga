import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const PLATFORM = { x: 'X', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', reddit: 'Reddit', telegram: 'Telegram' };

const istDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '');

const row = (p) => ({
  'Date (IST)': istDateTime(p.published_at),
  Platform: PLATFORM[p.platform] || p.platform,
  Type: p.post_type,
  Account: p.account || '',
  'Public account': p.public_account ? 'yes' : 'no',
  Handle: p.handle || '',
  'Post text': String(p.text || '').slice(0, 32000),
  Summary: p.summary || '',
  Tone: p.tone,
  'Stance toward subject': p.stance_toward_subject || '',
  'Stance toward protest': p.stance_toward_protest || '',
  Category: (p.category || '').replace(/_/g, ' '),
  'About (target)': p.target || '',
  Narratives: p.narratives || '',
  'Risk band': p.risk_band || '',
  Likes: p.likes ?? '',
  Comments: p.comments ?? '',
  Shares: p.shares ?? '',
  Views: p.views ?? '',
  Language: p.language || '',
  Link: p.url || '',
  'Footage type': [...new Set((p.footage || []).map((f) => f.kind))].join(', '),
  'Footage links': (p.footage || []).map((f) => f.url).join(' \n'),
});

const sheet = (rows) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [18, 10, 9, 22, 8, 18, 80, 50, 9, 14, 14, 20, 22, 30, 9, 8, 9, 8, 10, 8, 45, 12, 60].map((wch) => ({ wch }));
  return ws;
};

/**
 * Workbook with a summary sheet and one sheet per tone, so positive, negative
 * and neutral posts are separated.
 */
export const exportPostsExcel = (posts, { title, from, to }) => {
  const wb = XLSX.utils.book_new();
  const byTone = { positive: [], negative: [], neutral: [] };
  posts.forEach((p) => (byTone[p.tone] || byTone.neutral).push(p));

  const platforms = [...new Set(posts.map((p) => p.platform))];
  const summary = [
    ['Report', title],
    ['Period', `${from || 'start'} to ${to || 'latest'}`],
    ['Relevant posts', posts.length],
    [],
    ['Tone', 'Posts', 'Share', ...platforms.map((p) => PLATFORM[p] || p)],
    ...['positive', 'negative', 'neutral'].map((k) => [
      k[0].toUpperCase() + k.slice(1),
      byTone[k].length,
      posts.length ? `${((byTone[k].length / posts.length) * 100).toFixed(1)}%` : '0%',
      ...platforms.map((pl) => byTone[k].filter((p) => p.platform === pl).length),
    ]),
    [],
    ['Tone is the overall tone of a post. Stance toward the subject and toward the protest are separate columns on each sheet.'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');
  XLSX.utils.book_append_sheet(wb, sheet(byTone.positive.map(row)), 'Positive');
  XLSX.utils.book_append_sheet(wb, sheet(byTone.negative.map(row)), 'Negative');
  XLSX.utils.book_append_sheet(wb, sheet(byTone.neutral.map(row)), 'Neutral');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const safe = String(title || 'posts').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
  saveAs(new Blob([out], { type: 'application/octet-stream' }), `${safe}_posts_${from || 'all'}_to_${to || 'latest'}.xlsx`);
};
