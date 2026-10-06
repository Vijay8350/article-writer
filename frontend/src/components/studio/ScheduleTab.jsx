import React, { useState, useEffect } from 'react';
import { Save, Loader2, Plus, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { getAccountDna, saveStudioSchedule, getIgCampaigns } from '../../lib/api';
import { errMsg, muted, timezoneOptions, browserTimezone, Toggle, LoadingCard } from './shared';

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
    <form onSubmit={save}>
      <div className="ig-two-col">
        <div className="card">
          <div className="card-header"><h2>⏰ Daily posting slots</h2></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Time zone</label>
              <select className="form-select" value={form.timezone} disabled={!canManage} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {timezoneOptions(form.timezone).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            {form.slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-8 mb-16">
                <input className="form-input" type="time" value={slot} disabled={!canManage} onChange={(e) => setSlot(i, e.target.value)} required />
                {canManage && (
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove slot" title="Remove"
                    onClick={() => setForm({ ...form, slots: form.slots.filter((_, j) => j !== i) })}><X size={14} /></button>
                )}
              </div>
            ))}
            {canManage && form.slots.length < 5 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, slots: [...form.slots, '18:00'] })}>
                <Plus size={14} /> Add a time slot
              </button>
            )}
            <p className="form-helper">Each slot publishes one post (up to 5 a day). Capped at 25 posts per account per 24 hours.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>🤖 Autopilot</h2></div>
          <div className="card-body">
            <Toggle checked={form.autopilot} disabled={!canManage} onChange={(v) => setForm({ ...form, autopilot: v })}
              label="Post automatically every day" sub="Text → image → quality check → publish, with no one in the loop" />
            <div className="ig-list-row mt-16" style={{ fontSize: 14 }}>
              <strong>What each slot posts</strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                {campaign
                  ? <>The active campaign <strong>{campaign.name}</strong> ({campaign.posts_done}/{campaign.posts_target} posts), then the quote-idea prompts once it finishes.</>
                  : <>The next active quote-idea prompt (least recently used). Start a <Link to="/instagram-campaigns">campaign</Link> to theme a run of posts.</>}
              </p>
            </div>
            <div className="ig-list-row" style={{ fontSize: 14 }}>
              <strong>Quality gate</strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                Up to {maxAttempts} image attempts per post. If none passes, the post is skipped — never forced.
              </p>
            </div>
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="card mt-24" style={{ borderColor: 'rgba(245, 158, 11, 0.35)' }}>
          <div className="card-body">
            {warnings.map((w) => (
              <div key={w} className="flex gap-8" style={{ fontSize: 13, alignItems: 'flex-start', marginBottom: 6 }}>
                <AlertTriangle size={15} style={{ color: 'var(--accent-warning)', flex: '0 0 auto', marginTop: 2 }} /> <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-12 mt-24">
        <button className="btn btn-primary" type="submit" disabled={saving || !canManage}>
          {saving ? <><Loader2 size={16} className="spinning" /> Saving…</> : <><Save size={16} /> Save schedule</>}
        </button>
        {!canManage && <span style={muted}>Only workspace owners and admins can change the schedule.</span>}
      </div>
    </form>
  );
}
