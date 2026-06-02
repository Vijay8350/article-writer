import React, { useState } from 'react';
import { Building2, Plus, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { createWorkspace } from '../lib/api';

export default function Workspaces() {
  const { workspaces, activeWorkspaceId, switchWorkspace, refreshWorkspaces } = useAuth();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Enter a workspace name');
    setCreating(true);
    try {
      const res = await createWorkspace(name.trim());
      toast.success('Workspace created');
      setName('');
      await refreshWorkspaces();
      switchWorkspace(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
    setCreating(false);
  };

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>🏢 Workspaces</h1>
        <p>Each workspace is a separate tenant with its own store, articles, plan, and team.</p>
      </div>

      <div className="card mb-24" style={{ maxWidth: 600 }}>
        <div className="card-header"><h2>Your workspaces</h2></div>
        <div className="card-body">
          {workspaces.length === 0 ? (
            <div className="empty-state"><Building2 size={48} /><p>You don't belong to any workspace yet.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {workspaces.map(w => {
                const isActive = w.id === activeWorkspaceId;
                return (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <strong>{w.name}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {w.slug} · role: <strong>{w.role}</strong>{w.status === 'suspended' ? ' · ⚠️ suspended' : ''}
                      </div>
                    </div>
                    {isActive ? (
                      <span className="badge badge-success"><Check size={12} /> Active</span>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => switchWorkspace(w.id)}>Switch</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-header"><h2><Plus size={16} /> Create a workspace</h2></div>
        <div className="card-body">
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Store" />
              <div className="form-helper">You'll become the owner. Each workspace has its own Shopify store, plan, and members.</div>
            </div>
            <button className="btn btn-primary w-full" type="submit" disabled={creating}>
              {creating ? <><Loader2 size={16} className="spinning" /> Creating...</> : <><Plus size={16} /> Create Workspace</>}
            </button>
          </form>
        </div>
      </div>
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
