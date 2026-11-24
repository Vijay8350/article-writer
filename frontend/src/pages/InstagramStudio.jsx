import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Sparkles, Dna, ListTodo, AlarmClock, Building, BarChart3, History, RefreshCw, Instagram, AlertTriangle } from 'lucide-react';
import { getInstagramAccounts, getStudioStatus } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState } from '../components/ui';
import ContentTab from '../components/studio/ContentTab';
import DnaTab from '../components/studio/DnaTab';
import PromptsTab from '../components/studio/PromptsTab';
import ScheduleTab from '../components/studio/ScheduleTab';
import BusinessDnaTab from '../components/studio/BusinessDnaTab';
import AnalyticsTab from '../components/studio/AnalyticsTab';
import ActivityTab from '../components/studio/ActivityTab';
import { LoadingCard } from '../components/studio/shared';
import '../styles/ig-studio.css';

const TABS = [
  ['content', 'Content', Sparkles],
  ['dna', 'Account DNA', Dna],
  ['prompts', 'Prompts', ListTodo],
  ['schedule', 'Schedule', AlarmClock],
  ['business-dna', 'Business DNA', Building],
  ['analytics', 'Analytics', BarChart3],
  ['activity', 'Activity', History],
];

// What the Studio needs to work: a status dot per service, and the reasons only when something is wrong.
function Readiness({ status, onRecheck }) {
  if (!status) return null;
  const imageProvider = { codex: 'Codex', openai: 'OpenAI', gemini: 'Gemini' }[status.images?.provider] || 'Image';
  const items = [['DeepSeek text', status.deepseek], [`${imageProvider} images`, status.images || status.gemini], ['Publishing', status.publishing]];
  const problems = items.filter(([, s]) => !s?.ok);
  return (
    <>
      <div className="ig-ready" aria-label="Studio readiness">
        {items.map(([label, s]) => (
          <span key={label} className={`status ${s?.ok ? 'status--on' : 'status--error'}`} title={s?.detail}>
            {label}<span className="sr-only">{s?.ok ? ': ready' : ': not ready'}</span>
          </span>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={onRecheck}><RefreshCw size={13} /> Re-check</button>
      </div>
      {problems.length > 0 && (
        <div className="callout callout--warning ig-ready-callout" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <ul>
            {problems.map(([label, s]) => (
              <li key={label}><strong>{label}:</strong> {s?.detail || 'Not ready.'}</li>
            ))}
          </ul>
        </div>
      )}
    </>
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

  const picker = account && (accounts.length > 1 ? (
    <select className="form-select ig-account-select" value={accountId}
      onChange={(e) => navigate(`/instagram-studio/${e.target.value}/${tab}`)} aria-label="Instagram account">
      {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}{a.is_default ? ' (default)' : ''}</option>)}
    </select>
  ) : (
    <span className="ig-account-name"><Instagram size={16} aria-hidden="true" /> @{account.username}</span>
  ));

  return (
    <div className="page-container fade-in ig-page">
      <PageHeader
        title="Instagram Studio"
        subtitle="Quote posts written and designed by AI in each account's voice, with a quality check on every image."
        actions={picker || null}
      />

      {!accounts ? <LoadingCard /> : accounts.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Instagram}
            title="Connect an Instagram account first"
            text="Studio posts are written for, and published to, a connected Instagram account."
            action={<Link to="/instagram" className="btn btn-primary">Go to Instagram accounts</Link>}
          />
        </div>
      ) : !account ? <LoadingCard /> : (
        <>
          <Readiness status={status} onRecheck={recheck} />
          <div className="tabs" role="tablist" aria-label="Studio sections">
            {TABS.map(([key, label, Icon]) => (
              <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? 'active' : ''}`}
                onClick={() => navigate(`/instagram-studio/${accountId}/${key}`)}>
                <Icon size={15} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          <TabComponent key={`${accountId}-${tab}`} accountId={accountId} canManage={canManage} maxAttempts={status?.maxRegenAttempts ?? 3} />
        </>
      )}
    </div>
  );
}
