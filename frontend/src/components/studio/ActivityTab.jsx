import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Info, AlertTriangle, XCircle, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStudioLogs } from '../../lib/api';
import { Section, EmptyState } from '../ui';
import { errMsg, fmt, LoadingCard } from './shared';

const LEVEL = {
  info: [Info, 'is-info', 'Info'],
  warn: [AlertTriangle, 'is-warn', 'Warning'],
  error: [XCircle, 'is-error', 'Error'],
};

// Everything the pipeline did for this account: text, quality-gate attempts, publishes, autopilot, comments, research.
export default function ActivityTab({ accountId }) {
  const [logs, setLogs] = useState(null);
  const load = useCallback(() => getStudioLogs(accountId).then((r) => setLogs(r.data || []))
    .catch((err) => { toast.error(errMsg(err)); setLogs([]); }), [accountId]);
  useEffect(() => { setLogs(null); load(); }, [load]);

  if (!logs) return <LoadingCard />;
  return (
    <Section
      flush
      title="Activity"
      description="Every step the Studio took for this account: writing, quality checks, publishing, autopilot, comments and research."
      actions={<button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>}
    >
      {logs.length === 0 ? (
        <EmptyState icon={History} title="No activity yet"
          text="Steps appear here as soon as the Studio writes, checks or publishes a post for this account."
          action={<button className="btn btn-secondary" onClick={load}><RefreshCw size={16} /> Refresh</button>} />
      ) : (
        <div className="list">
          {logs.map((l) => {
            const [Icon, tone, levelLabel] = LEVEL[l.level] || LEVEL.info;
            const reasons = l.context?.reasons?.length ? l.context.reasons.join('; ') : null;
            return (
              <div key={l.id} className="list-item list-item--top">
                <span className={`list-item__icon ${tone}`}><Icon size={16} aria-label={levelLabel} /></span>
                <div className="list-item__main">
                  <div className="ig-log-msg">{l.message}</div>
                  {reasons && <div className="ig-meta">{reasons}</div>}
                  <div className="list-item__meta">
                    <span className="ig-stage">{l.stage.replace('_', ' ')}</span>
                    <span>{fmt(l.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
