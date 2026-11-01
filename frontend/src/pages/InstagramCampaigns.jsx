import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Plus, Play, Pause, Trash2, Loader2, Sparkles, ArrowLeft, ArrowRight, Pencil, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { getInstagramAccounts, getIgCampaigns, createIgCampaign, updateIgCampaign, setIgCampaignStatus, deleteIgCampaign, generateIgCampaignPost } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { errMsg, muted } from '../components/studio/shared';

const GOALS = ['Follower growth', 'Engagement & saves', 'Traffic & sales'];
const TONES = ['Calm & wise', 'Bold & punchy', 'Poetic'];
const PER_DAY = [1, 2, 3];
const DAYS = [7, 14, 30];
const STATUS_BADGE = { active: 'badge-success', paused: 'badge-warning', done: 'badge-purple' };

function Chips({ options, value, onChange, format = (o) => o }) {
  // A saved value outside the presets stays visible when editing.
  const shown = [...new Set([...options, value])];
  return (
    <div className="chips">
      {shown.map((o) => (
        <button type="button" key={o} className={`chip ${value === o ? 'active' : ''}`} aria-pressed={value === o} onClick={() => onChange(o)}>{format(o)}</button>
      ))}
    </div>
  );
}

const NEW_CAMPAIGN = { name: '', topic: '', goal: GOALS[1], tone: TONES[0], perDay: 1, days: 7, refs: '' };

const formFrom = (c) => ({
  accountId: c.account_id, name: c.name, topic: c.topic || '', goal: c.goal || GOALS[1], tone: c.tone || TONES[0],
  perDay: c.per_day, days: c.days, refs: (c.reference_images || []).join('\n'),
});

// Creates a campaign, or edits `campaign` when one is passed.
function Wizard({ accounts, campaign, onSaved, onCancel }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState(campaign ? formFrom(campaign) : { ...NEW_CAMPAIGN, accountId: accounts[0]?.id || '' });
  const [saving, setSaving] = useState(false);
  const top = useRef(null);
  useEffect(() => { if (campaign) top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [campaign]);
  const handle = accounts.find((a) => a.id === f.accountId)?.username || 'account';
  const accountLocked = campaign?.posts_done > 0; // its posts belong to that account
  const total = f.perDay * f.days;
  const refs = f.refs.split('\n').map((s) => s.trim()).filter(Boolean);
  const preview = `Campaign "${f.name || 'Untitled'}" for @${handle} — theme: ${f.topic || 'account DNA pillars'}. Goal: ${f.goal.toLowerCase()}. Tone: ${f.tone.toLowerCase()}. Cadence: ${f.perDay} post(s) per day for ${f.days} days, at the account's scheduled slots.${refs.length ? ' Visual direction: follow the reference images.' : ''} Every idea de-duplicated; every image must pass the quality gate before publishing — skip, never force.`;

  const save = async () => {
    setSaving(true);
    try {
      const data = { ...f, referenceImages: refs };
      const res = await (campaign ? updateIgCampaign(campaign.id, data) : createIgCampaign(data));
      toast.success(res.message);
      onSaved();
    } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    setSaving(false);
  };

  return (
    <div className="card mb-24" ref={top} style={{ maxWidth: 760 }}>
      <div className="card-header">
        <h2>{campaign ? `Edit ${campaign.name}` : 'New campaign'} · step {step} of 3 — {['', 'Basics', 'Reference images', 'Review'][step]}</h2>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
      <div className="card-body">
        {step === 1 && (
          <>
            <div className="ig-two-col">
              <div className="form-group">
                <label className="form-label">Campaign name</label>
                <input className="form-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Festive Glow" />
              </div>
              <div className="form-group">
                <label className="form-label">Account</label>
                <select className="form-select" value={f.accountId} disabled={accountLocked} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
                </select>
                {accountLocked && <div className="form-helper">This campaign already has posts on this account, so the account can't change.</div>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Topic / theme</label>
              <input className="form-input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Diwali jewellery styling" />
            </div>
            <div className="form-group"><label className="form-label">Goal</label><Chips options={GOALS} value={f.goal} onChange={(goal) => setF({ ...f, goal })} /></div>
            <div className="form-group"><label className="form-label">Tone</label><Chips options={TONES} value={f.tone} onChange={(tone) => setF({ ...f, tone })} /></div>
            <div className="ig-two-col">
              <div className="form-group"><label className="form-label">Posts per day</label><Chips options={PER_DAY} value={f.perDay} onChange={(perDay) => setF({ ...f, perDay })} /></div>
              <div className="form-group"><label className="form-label">Duration</label><Chips options={DAYS} value={f.days} onChange={(days) => setF({ ...f, days })} format={(d) => `${d} days`} /></div>
            </div>
            <div className="flex justify-between"><span /><button className="btn btn-primary" onClick={() => setStep(2)}>Next <ArrowRight size={16} /></button></div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="form-helper mb-16" style={{ fontSize: 13 }}>
              Optional — paste up to 3 image URLs showing the look you want (palette, texture, composition). The image model uses them
              for art direction, blended with the account's visual identity. Leave blank to use only the account's visual identity.
            </p>
            <textarea className="form-textarea" rows={4} value={f.refs} onChange={(e) => setF({ ...f, refs: e.target.value })}
              placeholder={'https://…/reference-1.jpg\nhttps://…/reference-2.jpg'} />
            <div className="flex justify-between mt-16">
              <button className="btn btn-secondary" onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>Next <ArrowRight size={16} /></button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 16, fontSize: 14, lineHeight: 1.6 }}>{preview}</div>
            <div className="chips mt-16">
              <span className="badge badge-purple">{total} posts total</span>
              <span className="badge badge-info">Quality gate on every post</span>
              <span className="badge badge-info">Uses the account's DNA</span>
            </div>
            {campaign ? (
              <p className="form-helper mt-16">
                {campaign.posts_done} of these are already made and stay as they are. New posts follow these settings.
                {total <= campaign.posts_done && ' This total is already reached, so saving ends the campaign.'}
                {campaign.status === 'done' && total > campaign.posts_done && ' Saving brings it back paused, so nothing posts until you resume it.'}
              </p>
            ) : (
              <p className="form-helper mt-16">
                While it's active, the campaign feeds the account's autopilot slots (Studio → Schedule). You can also generate its posts one at a time.
              </p>
            )}
            <div className="flex justify-between mt-16">
              <button className="btn btn-secondary" onClick={() => setStep(2)}><ArrowLeft size={16} /> Back</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <Loader2 size={16} className="spinning" /> : campaign ? <Save size={16} /> : <Sparkles size={16} />} {campaign ? 'Save changes' : 'Create campaign'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function InstagramCampaigns() {
  const { activeRole } = useAuth();
  const canManage = activeRole === 'owner' || activeRole === 'admin';
  const [accounts, setAccounts] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [wizard, setWizard] = useState(null); // 'new', or the campaign being edited
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const [a, c] = await Promise.all([getInstagramAccounts(), getIgCampaigns()]);
      setAccounts(a.data || []);
      setCampaigns(c.data || []);
    } catch (err) { toast.error(errMsg(err)); setAccounts([]); }
  };
  useEffect(() => { load(); }, []);

  const act = async (key, fn) => {
    setBusy(key);
    try { toast.success((await fn()).message || 'Done', { duration: 6000 }); } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    await load();
    setBusy(null);
  };

  return (
    <div className="page-container fade-in">
      <div className="page-header flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>📣 Instagram Campaigns</h1>
          <p>A themed run of posts — topic, goal, tone and cadence — that feeds an account's autopilot slots until it's done.</p>
        </div>
        {canManage && accounts?.length > 0 && !wizard && (
          <button className="btn btn-primary" onClick={() => setWizard('new')}><Plus size={16} /> New campaign</button>
        )}
      </div>

      {!accounts ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : accounts.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Megaphone size={48} /><h3>Connect an Instagram account first</h3>
          <p><Link to="/instagram">Go to Instagram Accounts</Link> to connect one.</p>
        </div></div></div>
      ) : (
        <>
          {wizard && (
            <Wizard
              key={wizard === 'new' ? 'new' : wizard.id}
              accounts={accounts}
              campaign={wizard === 'new' ? null : wizard}
              onCancel={() => setWizard(null)}
              onSaved={() => { setWizard(null); load(); }}
            />
          )}
          <div className="card">
            <div className="card-header"><h2>Campaigns ({campaigns.length})</h2></div>
            <div className="card-body">
              {campaigns.length === 0 ? (
                <div className="empty-state"><Megaphone size={48} /><h3>No campaigns yet</h3><p>Create one to theme a run of posts.</p></div>
              ) : campaigns.map((c) => {
                const pct = c.posts_target ? Math.min(100, Math.round((c.posts_done / c.posts_target) * 100)) : 0;
                return (
                  <div key={c.id} className="ig-list-row">
                    <div className="flex justify-between gap-12" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                        <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
                          <strong>{c.name}</strong>
                          <span style={{ color: 'var(--text-muted)' }}>@{c.username}</span>
                          <span className={`badge ${STATUS_BADGE[c.status] || 'badge-info'}`}>{c.status}</span>
                        </div>
                        <div style={muted}>{c.topic || 'Account DNA pillars'} · {c.goal} · {c.tone} · {c.per_day}/day for {c.days} days{c.reference_images?.length ? ` · ${c.reference_images.length} reference image(s)` : ''}</div>
                        <div className="flex items-center gap-8 mt-16" title={`${c.posts_done} of ${c.posts_target} posts`}>
                          <div style={{ flex: 1, maxWidth: 320, height: 8, borderRadius: 4, background: 'rgba(139, 92, 246, 0.12)' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: 'var(--accent-primary)' }} />
                          </div>
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{c.posts_done}/{c.posts_target} generated · {c.published_count} published</span>
                        </div>
                      </div>
                      <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                        {c.status !== 'done' && (
                          <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act(`gen:${c.id}`, () => generateIgCampaignPost(c.id))}>
                            {busy === `gen:${c.id}` ? <Loader2 size={14} className="spinning" /> : <Sparkles size={14} />} Generate one
                          </button>
                        )}
                        <Link className="btn btn-ghost btn-sm" to={`/instagram-studio/${c.account_id}/content`}>Open in Studio</Link>
                        {canManage && (
                          <button className="btn btn-ghost btn-sm" disabled={!!busy} title="Edit" aria-label="Edit campaign" onClick={() => setWizard(c)}>
                            <Pencil size={14} />
                          </button>
                        )}
                        {canManage && c.status !== 'done' && (
                          <button className="btn btn-ghost btn-sm" disabled={!!busy} title={c.status === 'active' ? 'Pause' : 'Resume'} aria-label={c.status === 'active' ? 'Pause' : 'Resume'}
                            onClick={() => act(`st:${c.id}`, () => setIgCampaignStatus(c.id, c.status === 'active' ? 'paused' : 'active'))}>
                            {c.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                          </button>
                        )}
                        {canManage && (
                          <button className="btn btn-ghost btn-sm" disabled={!!busy} title="Delete" aria-label="Delete campaign"
                            onClick={() => window.confirm(`Delete "${c.name}"? Its posts stay in the Studio.`) && act(`del:${c.id}`, () => deleteIgCampaign(c.id))}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      <style>{'.spinning { animation: spin 1s linear infinite; }'}</style>
    </div>
  );
}
