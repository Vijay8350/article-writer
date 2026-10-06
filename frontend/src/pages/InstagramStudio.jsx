import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Sparkles, Dna, ListTodo, AlarmClock, Building, BarChart3, History, CheckCircle2, XCircle, RefreshCw, Instagram } from 'lucide-react';
import { getInstagramAccounts, getStudioStatus } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import ContentTab from '../components/studio/ContentTab';
import DnaTab from '../components/studio/DnaTab';
import PromptsTab from '../components/studio/PromptsTab';
import ScheduleTab from '../components/studio/ScheduleTab';
import BusinessDnaTab from '../components/studio/BusinessDnaTab';
import AnalyticsTab from '../components/studio/AnalyticsTab';
import ActivityTab from '../components/studio/ActivityTab';
import { LoadingCard } from '../components/studio/shared';

const TABS = [
  ['content', 'Content', Sparkles],
  ['dna', 'Account DNA', Dna],
  ['prompts', 'Prompts', ListTodo],
  ['schedule', 'Schedule', AlarmClock],
  ['business-dna', 'Business DNA', Building],
  ['analytics', 'Analytics', BarChart3],
  ['activity', 'Activity', History],
];

function Readiness({ status, onRecheck }) {
  if (!status) return null;
  const items = [['DeepSeek (text)', status.deepseek], ['Gemini (images)', status.gemini], ['Publishing', status.publishing]];
  return (
    <div className="flex items-center gap-12 mb-24" style={{ flexWrap: 'wrap', fontSize: 13 }}>
      {items.map(([label, s]) => (
        <span key={label} className="flex items-center gap-8" title={s.detail} style={{ color: 'var(--text-secondary)' }}>
          {s.ok
            ? <CheckCircle2 size={15} style={{ color: 'var(--accent-success)' }} aria-label="ready" />
            : <XCircle size={15} style={{ color: 'var(--accent-danger)' }} aria-label="not ready" />}
          {label}{!s.ok && <span style={{ color: 'var(--text-muted)', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {s.detail}</span>}
        </span>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={onRecheck}><RefreshCw size={13} /> Re-check</button>
    </div>
  );
}

export default function InstagramStudio() {
  const { accountId, tab = 'content' } = useParams();
  const navigate = useNavigate();
  const { activeRole, activeWorkspaceId } = useAuth();
  const canManage = activeRole === 'owner' || activeRole === 'admin';
  const [accounts, setAccounts] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getInstagramAccounts().then((r) => setAccounts(r.data || [])).catch(() => setAccounts([]));
    getStudioStatus().then((r) => setStatus(r.data)).catch(() => {});
  }, [activeWorkspaceId]);

  // No account in the URL (or one from another workspace) → the default account.
  useEffect(() => {
    if (accounts?.length && !accounts.some((a) => a.id === accountId)) {
      navigate(`/instagram-studio/${accounts[0].id}/${tab}`, { replace: true });
    }
  }, [accounts, accountId, tab, navigate]);

  const recheck = () => getStudioStatus(true).then((r) => setStatus(r.data)).catch(() => {});
  const account = accounts?.find((a) => a.id === accountId);
  const TabComponent = { content: ContentTab, dna: DnaTab, prompts: PromptsTab, schedule: ScheduleTab, 'business-dna': BusinessDnaTab, analytics: AnalyticsTab, activity: ActivityTab }[tab] || ContentTab;

  return (
    <div className="page-container fade-in">
      <div className="page-header flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>✨ Instagram Studio</h1>
          <p>AI quote posts in each account's voice: DeepSeek writes, Gemini designs, a quality check guards every image.</p>
        </div>
        {accounts?.length > 1 && account && (
          <select className="form-select" style={{ width: 'auto', minWidth: 200 }} value={accountId}
            onChange={(e) => navigate(`/instagram-studio/${e.target.value}/${tab}`)} aria-label="Instagram account">
            {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}{a.is_default ? ' (default)' : ''}</option>)}
          </select>
        )}
      </div>

      {!accounts ? <LoadingCard /> : accounts.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Instagram size={48} />
          <h3>Connect an Instagram account first</h3>
          <p><Link to="/instagram">Go to Instagram Accounts</Link> to connect one.</p>
        </div></div></div>
      ) : !account ? <LoadingCard /> : (
        <>
          <Readiness status={status} onRecheck={recheck} />
          <div className="tabs" role="tablist">
            {TABS.map(([key, label, Icon]) => (
              <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? 'active' : ''}`}
                onClick={() => navigate(`/instagram-studio/${accountId}/${key}`)}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          <TabComponent key={`${accountId}-${tab}`} accountId={accountId} canManage={canManage} maxAttempts={status?.maxRegenAttempts ?? 3} />
        </>
      )}
      <style>{'.spinning { animation: spin 1s linear infinite; }'}</style>
    </div>
  );
}
