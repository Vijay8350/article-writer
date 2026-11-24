import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { createWorkspace } from '../lib/api';
import { PageHeader, Section, Sheet, EmptyState } from '../components/ui';
import '../styles/workspace.css';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };

export default function Workspaces() {
  const { workspaces, activeWorkspaceId, switchWorkspace, refreshWorkspaces } = useAuth();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [switchTo, setSwitchTo] = useState(null);

  const openSheet = () => setSheetOpen(true);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // switchWorkspace only knows workspaces from its own render, so switch to a new
  // one once the refreshed list (which includes it) has arrived.
  useEffect(() => {
    if (switchTo && workspaces.some(w => w.id === switchTo)) {
      switchWorkspace(switchTo);
      setSwitchTo(null);
    }
  }, [switchTo, workspaces, switchWorkspace]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Enter a workspace name');
    setCreating(true);
    try {
      const res = await createWorkspace(name.trim());
      toast.success('Workspace created');
      setName('');
      setSheetOpen(false);
      await refreshWorkspaces();
      switchWorkspace(res.data.id);
      setSwitchTo(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
    setCreating(false);
  };

  const newButton = (
    <button className="btn btn-primary" onClick={openSheet}><Plus size={16} /> New workspace</button>
  );

  return (
    <div className="page-container page-container--narrow fade-in">
      <PageHeader
        title="Workspaces"
        subtitle="Each workspace has its own Shopify store, articles, plan and team."
        actions={newButton}
      />

      <Section
        flush
        title="Your workspaces"
        description={workspaces.length ? `You belong to ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}.` : null}
      >
        {workspaces.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No workspaces yet"
            text="A workspace holds one store's articles, posts and team. Create one to get started."
            action={newButton}
          />
        ) : (
          <ul className="list">
            {workspaces.map(w => {
              const isActive = w.id === activeWorkspaceId;
              return (
                <li key={w.id} className="list-item">
                  <span className="list-item__media wk-avatar wk-avatar--ink" aria-hidden="true">{(w.name || '?').charAt(0)}</span>
                  <div className="list-item__main">
                    <div className="list-item__title">
                      <span className="wk-truncate">{w.name}</span>
                      {w.status === 'suspended' && <span className="badge badge-warning">Suspended</span>}
                    </div>
                    <div className="list-item__meta">
                      <span>Your role: {ROLE_LABEL[w.role] || w.role}</span>
                      <span>{w.slug}</span>
                    </div>
                  </div>
                  <div className="list-item__actions">
                    {isActive ? (
                      <span className="status status--on">Active</span>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => switchWorkspace(w.id)}>Switch</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Sheet
        open={sheetOpen}
        title="New workspace"
        subtitle="A separate space with its own Shopify store, plan and members. You'll be the owner."
        onClose={closeSheet}
        busy={creating}
        width={480}
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={closeSheet} disabled={creating}>Cancel</button>
            <button type="submit" form="new-workspace-form" className="btn btn-primary" disabled={creating}>
              {creating ? <><Loader2 size={16} className="spinning" /> Creating…</> : <><Plus size={16} /> Create workspace</>}
            </button>
          </>
        )}
      >
        <form id="new-workspace-form" onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label" htmlFor="workspace-name">Name</label>
            <input id="workspace-name" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Store" />
            <div className="form-helper">Usually your store or brand name.</div>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
