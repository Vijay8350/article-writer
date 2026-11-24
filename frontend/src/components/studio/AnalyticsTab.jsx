import React, { useState, useEffect } from 'react';
import { BarChart3, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStudioAnalytics } from '../../lib/api';
import { Section, EmptyState } from '../ui';
import { errMsg, LoadingCard } from './shared';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const num = (v) => (v == null ? '—' : Number(v).toLocaleString());

function StatTile({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{compact.format(value)}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// Latest metrics per published post (refreshed every 6 hours for 14 days after publishing).
export default function AnalyticsTab({ accountId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    setRows(null);
    getStudioAnalytics(accountId).then((r) => setRows(r.data || [])).catch((err) => { toast.error(errMsg(err)); setRows([]); });
  }, [accountId]);

  if (!rows) return <LoadingCard />;
  const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const sorted = [...rows].sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1));
  const maxLikes = Math.max(1, ...rows.map((r) => r.likes ?? 0));

  return (
    <>
      <div className="stat-row" style={{ '--cols': 5 }}>
        <StatTile label="Published" value={rows.length} />
        <StatTile label="Likes" value={sum('likes')} />
        <StatTile label="Reach" value={sum('reach')} />
        <StatTile label="Saves" value={sum('saves')} />
        <StatTile label="Comments" value={sum('comments')} />
      </div>

      <Section
        flush
        title="Posts by likes"
        description="Studio posts that went live, with their latest numbers. Refreshed every 6 hours for two weeks after publishing."
      >
        {rows.length === 0 ? (
          <EmptyState icon={BarChart3} title="No published posts yet"
            text="Numbers appear here once Studio posts go live, and refresh every 6 hours for two weeks." />
        ) : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Likes</th>
                    <th className="num">Reach</th>
                    <th className="num">Saves</th>
                    <th className="num">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="ig-cell-title">
                          {r.permalink ? <a href={r.permalink} target="_blank" rel="noreferrer">{r.headline} <ExternalLink size={11} aria-hidden="true" /></a> : r.headline}
                        </div>
                        <div className="ig-meta">{new Date(r.published_at).toLocaleDateString()}{r.fetched_at ? '' : ' · no numbers yet'}</div>
                      </td>
                      <td title={`${num(r.likes)} likes`}>
                        <div className="ig-likes">
                          <div className="meter"><div style={{ width: `${Math.round(((r.likes ?? 0) / maxLikes) * 100)}%` }} /></div>
                          <span>{num(r.likes)}</span>
                        </div>
                      </td>
                      <td className="num">{num(r.reach)}</td>
                      <td className="num">{num(r.saves)}</td>
                      <td className="num">{num(r.comments)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ig-footnote">Reach and saves need the Instagram insights permission; without it they show “—”.</p>
          </>
        )}
      </Section>
    </>
  );
}
