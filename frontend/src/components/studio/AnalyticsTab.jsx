import React, { useState, useEffect } from 'react';
import { BarChart3, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStudioAnalytics } from '../../lib/api';
import { errMsg, muted, LoadingCard } from './shared';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const num = (v) => (v == null ? '—' : Number(v).toLocaleString());

function StatTile({ label, value }) {
  return (
    <div className="stat-card" style={{ padding: 16 }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: 24, marginTop: 4 }}>{compact.format(value)}</div>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }} className="mb-24">
        <StatTile label="Published" value={rows.length} />
        <StatTile label="Likes" value={sum('likes')} />
        <StatTile label="Reach" value={sum('reach')} />
        <StatTile label="Saves" value={sum('saves')} />
        <StatTile label="Comments" value={sum('comments')} />
      </div>

      <div className="card">
        <div className="card-header"><h2><BarChart3 size={16} /> Posts by likes</h2></div>
        <div className="card-body">
          {rows.length === 0 ? (
            <div className="empty-state"><BarChart3 size={48} /><h3>No published posts yet</h3>
              <p>Metrics appear after posts go live and refresh every 6 hours for two weeks.</p></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Post</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, minWidth: 140 }}>Likes</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Reach</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Saves</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-secondary)' }}>
                      <td style={{ padding: '8px', maxWidth: 320 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.permalink ? <a href={r.permalink} target="_blank" rel="noreferrer">{r.headline} <ExternalLink size={11} /></a> : r.headline}
                        </div>
                        <div style={muted}>{new Date(r.published_at).toLocaleDateString()}{r.fetched_at ? '' : ' · no metrics yet'}</div>
                      </td>
                      <td style={{ padding: '8px' }} title={`${num(r.likes)} likes`}>
                        <div className="flex items-center gap-8">
                          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(139, 92, 246, 0.12)' }}>
                            <div style={{ width: `${Math.round(((r.likes ?? 0) / maxLikes) * 100)}%`, height: '100%', borderRadius: 4, background: 'var(--accent-primary)' }} />
                          </div>
                          <span style={{ minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(r.likes)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(r.reach)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(r.saves)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(r.comments)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="form-helper">Reach and saves need the Instagram insights permission; they show “—” without it.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
