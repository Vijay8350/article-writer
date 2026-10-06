import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Info, AlertTriangle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStudioLogs } from '../../lib/api';
import { errMsg, fmt, muted, LoadingCard } from './shared';

const LEVEL = {
  info: [Info, 'var(--accent-info)'],
  warn: [AlertTriangle, 'var(--accent-warning)'],
  error: [XCircle, 'var(--accent-danger)'],
};

// Everything the pipeline did for this account: text, quality-gate attempts, publishes, autopilot, comments, research.
export default function ActivityTab({ accountId }) {
  const [logs, setLogs] = useState(null);
  const load = useCallback(() => getStudioLogs(accountId).then((r) => setLogs(r.data || []))
    .catch((err) => { toast.error(errMsg(err)); setLogs([]); }), [accountId]);
  useEffect(() => { setLogs(null); load(); }, [load]);

  if (!logs) return <LoadingCard />;
  return (
    <div className="card">
      <div className="card-header">
        <h2>🧾 Activity</h2>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>
      <div className="card-body">
        {logs.length === 0 ? <p style={muted}>Nothing yet.</p> : logs.map((l) => {
          const [Icon, color] = LEVEL[l.level] || LEVEL.info;
          const reasons = l.context?.reasons?.length ? l.context.reasons.join('; ') : null;
          return (
            <div key={l.id} className="ig-list-row flex gap-12" style={{ alignItems: 'flex-start' }}>
              <Icon size={16} style={{ color, flex: '0 0 auto', marginTop: 3 }} aria-label={l.level} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{l.message}</div>
                {reasons && <div style={{ ...muted, overflowWrap: 'anywhere' }}>{reasons}</div>}
                <div style={muted}>{l.stage.replace('_', ' ')} · {fmt(l.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
