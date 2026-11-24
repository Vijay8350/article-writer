import React, { useState, useEffect } from 'react';
import { Save, Loader2, Plus, X, AlertTriangle, Bot, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { getAccountDna, saveStudioSchedule, getIgCampaigns } from '../../lib/api';
import { Section, Switch } from '../ui';
import { errMsg, timezoneOptions, browserTimezone, LoadingCard } from './shared';

// Autopilot: each daily slot runs the whole pipeline — text → image + quality gate → publish.
export default function ScheduleTab({ accountId, canManage, maxAttempts }) {
  const [form, setForm] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(null);
    setWarnings([]);
    Promise.all([getAccountDna(accountId), getIgCampaigns().catch(() => ({ data: [] }))]).then(([d, c]) => {
      const dna = d.data || {};
      setForm({ slots: dna.posting_slots?.length ? dna.posting_slots : ['10:00'], timezone: dna.timezone || browserTimezone(), autopilot: Boolean(dna.autopilot) });
      setCampaign((c.data || []).find((x) => x.account_id === accountId && x.status === 'active' && x.posts_done < x.posts_target) || null);
    }).catch((err) => { toast.error(errMsg(err)); setForm({ slots: [], timezone: browserTimezone(), autopilot: false }); });
  }, [accountId]);

  const setSlot = (i, v) => setForm((f) => ({ ...f, slots: f.slots.map((s, j) => (j === i ? v : s)) }));

  const save = async (e) => {
    e.preventDefault();
    if (form.autopilot && !window.confirm('Turn autopilot on? It will publish to Instagram on its own at these times.')) return;
    setSaving(true);
    try {
      const res = await saveStudioSchedule(accountId, form);
      setWarnings(res.warnings || []);
      setForm((f) => ({ ...f, slots: res.data.posting_slots.length ? res.data.posting_slots : f.slots }));
      toast.success(res.message || 'Saved');
    } catch (err) {
      toast.error(errMsg(err));
    }
    setSaving(false);
  };

  if (!form) return <LoadingCard />;

  return (
    <form onSubmit={save} className="stack">
      {!canManage && (
        <div className="callout callout--info"><Info size={16} aria-hidden="true" /> Only workspace owners and admins can change the schedule.</div>
      )}

      <section className="card">
        <div className="status-card">
          <div className={`status-card__icon ${form.autopilot ? 'is-on' : ''}`}><Bot size={22} aria-hidden="true" /></div>
          <div className="status-card__main">
            <div className="status-card__title">
              <label htmlFor="ig-autopilot">Post automatically every day</label>
              <span className={`status ${form.autopilot ? 'status--on' : 'status--off'}`}>{form.autopilot ? 'On' : 'Off'}</span>
            </div>
            <div className="status-card__text">
              At each time below: text, image, quality check, publish, with no one in the loop. Changes apply when you save.
            </div>
          </div>
          <Switch id="ig-autopilot" checked={form.autopilot} disabled={!canManage} onChange={(v) => setForm({ ...form, autopilot: v })} />
        </div>
      </section>

      <div className="grid-2">
        <Section title="Posting times" description="Each time publishes one post, up to 5 a day. At most 25 posts per account in 24 hours.">
          <div className="form-group">
            <label className="form-label" htmlFor="ig-timezone">Time zone</label>
            <select id="ig-timezone" className="form-select" value={form.timezone} disabled={!canManage} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
              {timezoneOptions(form.timezone).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <span className="form-label">Times</span>
          <div className="ig-slots">
            {form.slots.map((slot, i) => (
              <div key={i} className="ig-slot">
                <input className="form-input" type="time" value={slot} disabled={!canManage} onChange={(e) => setSlot(i, e.target.value)} required aria-label={`Posting time ${i + 1}`} />
                {canManage && (
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove posting time ${i + 1}`} title="Remove"
                    onClick={() => setForm({ ...form, slots: form.slots.filter((_, j) => j !== i) })}><X size={14} /></button>
                )}
              </div>
            ))}
            {form.slots.length === 0 && <p className="form-helper">No posting times yet.</p>}
          </div>
          {canManage && form.slots.length < 5 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, slots: [...form.slots, '18:00'] })}>
              <Plus size={14} /> Add a time
            </button>
          )}
        </Section>

        <Section title="What each slot posts" description="Where the autopilot takes its next post from.">
          <dl className="kv">
            <dt>Content</dt>
            <dd>
              {campaign
                ? <>The active campaign <strong>{campaign.name}</strong> ({campaign.posts_done}/{campaign.posts_target} posts), then the quote-idea prompts once it finishes.</>
                : <>The next active quote-idea prompt (least recently used). Start a <Link to="/instagram-campaigns">campaign</Link> to theme a run of posts.</>}
            </dd>
            <dt>Quality check</dt>
            <dd>Up to {maxAttempts} image attempts per post. If none passes, the post is skipped, never forced.</dd>
          </dl>
        </Section>
      </div>

      {warnings.length > 0 && (
        <div className="callout callout--warning" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>{warnings.map((w) => <p key={w}>{w}</p>)}</div>
        </div>
      )}

      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={saving || !canManage}>
          {saving ? <><Loader2 size={16} className="spinning" /> Saving…</> : <><Save size={16} /> Save schedule</>}
        </button>
      </div>
    </form>
  );
}
