import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, Quote, Palette } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStudioPrompts, addStudioPrompt, setStudioPromptActive, deleteStudioPrompt } from '../../lib/api';
import { Section, Sheet, EmptyState, Segmented } from '../ui';
import { errMsg, fmt, LoadingCard } from './shared';

const GROUPS = [
  ['quote_idea', 'Quote-idea prompts', 'Steer what the posts say. The autopilot rotates through the active ones, least recently used first.', Quote, 'quote-idea'],
  ['image_idea', 'Image-idea prompts', 'Steer how the artwork looks: scene, style and composition. Also rotated.', Palette, 'image-idea'],
];
const TYPE_OPTIONS = [{ value: 'quote_idea', label: 'Quote idea' }, { value: 'image_idea', label: 'Image idea' }];

export default function PromptsTab({ accountId, canManage }) {
  const [prompts, setPrompts] = useState(null);
  const [form, setForm] = useState({ type: 'quote_idea', label: '', promptText: '' });
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => getStudioPrompts(accountId).then((r) => setPrompts(r.data || []))
    .catch((err) => { toast.error(errMsg(err)); setPrompts([]); }), [accountId]);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    try { const res = await fn(); if (res?.message) toast.success(res.message); } catch (err) { toast.error(errMsg(err)); }
    await load();
    setBusy(null);
  };

  const openAdd = (type) => { setForm((f) => ({ ...f, type })); setAdding(true); };
  // Stable, so the sheet doesn't re-run its focus effect on every keystroke.
  const closeAdd = useCallback(() => setAdding(false), []);

  const add = (e) => {
    e.preventDefault();
    if (!form.label.trim() || !form.promptText.trim()) return toast.error('Add a label and the prompt text.');
    run('add', async () => {
      const res = await addStudioPrompt(accountId, form);
      setForm((f) => ({ ...f, label: '', promptText: '' }));
      setAdding(false);
      return res;
    });
  };

  if (!prompts) return <LoadingCard />;

  return (
    <div className="stack">
      {GROUPS.map(([type, title, help, Icon, noun]) => {
        const items = prompts.filter((p) => p.type === type);
        return (
          <Section
            key={type}
            flush
            title={`${title} (${items.length})`}
            description={help}
            actions={canManage && items.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => openAdd(type)}><Plus size={14} /> Add prompt</button>
            )}
          >
            {items.length === 0 ? (
              <EmptyState
                icon={Icon}
                title={`No ${noun} prompts yet`}
                text={type === 'quote_idea'
                  ? 'Add the angles you want posts written from. Without any, type a point on the Content tab.'
                  : 'Add the looks you want the artwork to follow.'}
                action={canManage && <button className="btn btn-primary" onClick={() => openAdd(type)}><Plus size={16} /> Add a {noun} prompt</button>}
              />
            ) : (
              <div className="list">
                {items.map((p) => (
                  <div key={p.id} className="list-item list-item--top">
                    <div className="list-item__main">
                      <div className="list-item__title">
                        {p.label}
                        {!p.active && <span className="badge badge-warning">Off</span>}
                      </div>
                      <p className="list-item__text">{p.prompt_text}</p>
                      <div className="list-item__meta">
                        <span>Used {p.use_count}×</span>
                        {p.last_used_at && <span>Last used {fmt(p.last_used_at)}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <div className="list-item__actions">
                        <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run(p.id, () => setStudioPromptActive(p.id, !p.active))}>
                          {busy === p.id ? <Loader2 size={14} className="spinning" /> : null}{p.active ? 'Turn off' : 'Turn on'}
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={!!busy} aria-label={`Delete prompt ${p.label}`} title="Delete"
                          onClick={() => window.confirm(`Delete "${p.label}"?`) && run(p.id, () => deleteStudioPrompt(p.id))}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        );
      })}

      {canManage && (
        <Sheet
          open={adding}
          title="Add a prompt"
          subtitle="The autopilot rotates through active prompts, least recently used first."
          onClose={closeAdd}
          busy={busy === 'add'}
          footer={(
            <>
              <button type="button" className="btn btn-ghost" onClick={closeAdd} disabled={busy === 'add'}>Cancel</button>
              <button className="btn btn-primary" type="submit" form="ig-add-prompt" disabled={busy === 'add'}>
                {busy === 'add' ? <Loader2 size={16} className="spinning" /> : <Plus size={16} />} Add prompt
              </button>
            </>
          )}
        >
          <form id="ig-add-prompt" onSubmit={add}>
            <div className="form-group">
              <span className="form-label">Type</span>
              <div className="ig-seg-full">
                <Segmented value={form.type} onChange={(type) => setForm({ ...form, type })} options={TYPE_OPTIONS} ariaLabel="Prompt type" />
              </div>
              <div className="form-helper">
                {form.type === 'quote_idea' ? 'Steers what the post says.' : 'Steers how the artwork looks.'}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ig-prompt-label">Label</label>
              <input id="ig-prompt-label" className="form-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Short label, e.g. small details" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ig-prompt-text">Prompt text</label>
              <textarea id="ig-prompt-text" className="form-textarea" rows={4} value={form.promptText}
                onChange={(e) => setForm({ ...form, promptText: e.target.value })}
                placeholder={form.type === 'quote_idea' ? 'The angle or seed, e.g. why small jewellery details complete an outfit' : 'The look, e.g. soft beige flatlay with gold accents, centered serif text'} />
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}
