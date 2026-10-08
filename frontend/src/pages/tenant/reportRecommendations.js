/**
 * Recommended actions for a report, shared by the executive and detailed formats:
 * three groups, each led by points computed from the report's own figures and
 * followed by the analyst's specific items.
 */

const PLATFORM = { x: 'X', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', reddit: 'Reddit', telegram: 'Telegram' };
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtBig = (n) => {
  const v = Number(n || 0);
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} crore`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)} lakh`;
  return v.toLocaleString('en-IN');
};
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const pctTxt = (n) => `${Number(n || 0).toFixed(1)}%`;
// Lower-case a label's first letter for mid-sentence use, but keep proper names ("Special Intensive Revision…").
export const lcFirst = (s) => (!s || /^[A-Z][\w'’-]* [A-Z]/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
export const listJoin = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export const recommendationGroups = (report) => {
  const d = report.data;
  const s = d.stats;
  const ev = d.event;
  const ex = s.executive_metrics || {};
  const recs = d.recommendations || {};
  const name = ev.subject?.name || ev.short_name || 'the subject';

  const narratives = (s.narratives || []).filter((n) => n.key !== 'other' && n.count > 0);
  const counter = narratives.find((n) => (ev.narratives || []).find((e) => e.key === n.key)?.example_protest_stance === 'critical');
  const drivers = ex.criticism?.top_narratives?.length
    ? ex.criticism.top_narratives.map((t) => ({ ...(narratives.find((n) => n.key === t.key) || { label: t.label, pct: 0 }), critical_share: t.share }))
    : narratives.filter((n) => n !== counter);
  const next = ex.next_point;
  const nextLabel = next ? fmtDay(next.date) : null;
  const nextWhat = next ? next.description.split('. ')[0].replace(/\.$/, '') : null;
  const platforms = [...(s.by_platform || [])].filter((p) => p.relevant).sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
  const influencer = (s.influencers || [])[0];
  const critical = (s.risk?.bands || []).find((b) => b.key === 'critical')?.count || 0;
  const vol = ex.volume;

  // Claims made in the same post share its engagement: list them together.
  const allegationGroups = Object.values((s.allegations || []).reduce((acc, a) => {
    const k = `${a.platform}:${a.engagement}`;
    (acc[k] = acc[k] || { ...a, texts: [] }).texts.push(`“${a.text}”`);
    return acc;
  }, {})).slice(0, 3);

  return [
    {
      key: 'fact_check',
      title: 'Claims to verify and answer, highest reach first',
      items: [
        ...allegationGroups.map((a) => `${listJoin(a.texts)} — ${fmtBig(a.engagement)} engagements on ${PLATFORM[a.platform] || a.platform}. Check ${a.texts.length > 1 ? 'each' : 'it'} against the official record and publish the finding if ${a.texts.length > 1 ? 'any is' : 'it is'} wrong.`),
        ...(recs.fact_check || []).map((x) => `Check ${lcFirst(x)}`),
      ],
    },
    {
      key: 'communication',
      title: 'Communication approach',
      items: [
        drivers.length && `Address the issues behind most criticism of ${name} first: ${listJoin(drivers.slice(0, 2).map((n) => `${lcFirst(n.label)}${n.critical_share !== undefined ? ` (in ${pctTxt(n.critical_share)} of critical posts)` : ''}`))}.`,
        platforms.length && `Respond where the discussion is: ${listJoin(platforms.slice(0, 2).map((p) => PLATFORM[p.platform] || p.platform))} carry the most engagement${influencer ? `, and the most influential voice is ${influencer.name || influencer.handle}` : ''}. Official responses on these platforms reach the audience that is engaging.`,
        next && vol && `Put factual material out before ${nextLabel}, while attention is highest; volume on ${fmtDay(vol.peak_day)} was about ${vol.peak_multiple}× a normal day.`,
        ...(recs.communication || []),
      ].filter(Boolean),
    },
    {
      key: 'monitoring',
      title: 'What to watch next',
      items: [
        next && `${nextLabel}: ${nextWhat}. ${fmt(next.mobilisation_posts)} posts mobilise for it, ${fmt(next.recent_posts)} of them in the last two days.`,
        `Explicit threats: ${fmt(critical)} so far${ex.threats ? ` (${fmt(ex.threats.at_subject)} at ${name} or the Commission)` : ''}; escalate any that name a date, a place or a home address.`,
        ex.information?.misattributed_media ? `Manipulated or misattributed media: ${fmt(ex.information.misattributed_media)} posts so far; flag new items early, before they spread.` : null,
        ...(recs.monitoring || []).filter((x) => !(next && x.includes(nextLabel) && /protest/i.test(x))
          && !(ex.information?.misattributed_media && /misattributed|AI-generated/i.test(x))),
      ].filter(Boolean),
    },
  ].filter((g) => g.items.length);
};
