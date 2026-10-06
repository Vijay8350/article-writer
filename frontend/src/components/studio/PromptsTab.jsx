import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStudioPrompts, addStudioPrompt, setStudioPromptActive, deleteStudioPrompt } from '../../lib/api';
import { errMsg, fmt, muted, LoadingCard } from './shared';

const GROUPS = [
  ['quote_idea', 'Quote-idea prompts', 'Steer what the posts say. The autopilot rotates through the active ones, least recently used first.'],
  ['image_idea', 'Image-idea prompts', 'Steer how the artwork looks (scene, style, composition). Also rotated.'],
];

export default function PromptsTab({ accountId, canManage }) {
  const [prompts, setPrompts] = useState(null);
  const [form, setForm] = useState({ type: 'quote_idea', label: '', promptText: '' });
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => getStudioPrompts(accountId).then((r) => setPrompts(r.data || []))
    .catch((err) => { toast.error(errMsg(err)); setPrompts([]); }), [accountId]);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    try { const res = await fn(); if (res?.message) toast.success(res.message); } catch (err) { toast.error(errMsg(err)); }
    await load();
    setBusy(null);
  };

  const add = (e) => {
    e.preventDefault();
    if (!form.label.trim() || !form.promptText.trim()) return toast.error('Add a label and the prompt text.');
    run('add', async () => {
      const res = await addStudioPrompt(accountId, form);
      setForm((f) => ({ ...f, label: '', promptText: '' }));
      return res;
    });
  };

  if (!prompts) return <LoadingCard />;

  return (
    <>
      <div className="ig-two-col mb-24">
        {GROUPS.map(([type, title, help]) => {
          const items = prompts.filter((p) => p.type === type);
          return (
            <div className="card" key={type}>
              <div className="card-header"><h2>{title} ({items.length})</h2></div>
              <div className="card-body">
                <p className="form-helper mb-16">{help}</p>
                {items.length === 0 ? <p style={muted}>None yet.</p> : items.map((p) => (
                  <div key={p.id} className="ig-list-row flex justify-between gap-12" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 14 }}>{p.label}</strong>
                        {!p.active && <span className="badge badge-warning">disabled</span>}
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{p.prompt_text}</p>
                      <p style={muted}>used {p.use_count}×{p.last_used_at ? ` · last ${fmt(p.last_used_at)}` : ''}</p>
                    </div>
                    {canManage && (
                      <div className="flex gap-8" style={{ flex: '0 0 auto' }}>
                        <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run(p.id, () => setStudioPromptActive(p.id, !p.active))}>
                          {p.active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={!!busy} aria-label="Delete prompt" title="Delete"
                          onClick={() => window.confirm(`Delete "${p.label}"?`) && run(p.id, () => deleteStudioPrompt(p.id))}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {canManage && (
        <div className="card">
          <div className="card-header"><h2>➕ Add a prompt</h2></div>
          <div className="card-body">
            <form onSubmit={add}>
              <div className="ig-two-col">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="quote_idea">Quote idea</option>
                    <option value="image_idea">Image idea</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Label</label>
                  <input className="form-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Short label, e.g. small details" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Prompt text</label>
                <textarea className="form-textarea" style={{ minHeight: 0 }} rows={3} value={form.promptText}
                  onChange={(e) => setForm({ ...form, promptText: e.target.value })}
                  placeholder={form.type === 'quote_idea' ? 'The angle or seed, e.g. why small jewellery details complete an outfit' : 'The look, e.g. soft beige flatlay with gold accents, centered serif text'} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy === 'add'}>
                {busy === 'add' ? <Loader2 size={16} className="spinning" /> : <Plus size={16} />} Add prompt
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
