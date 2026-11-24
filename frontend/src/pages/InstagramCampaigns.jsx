import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Plus, Play, Pause, Trash2, Loader2, Sparkles, ArrowLeft, ArrowRight, Pencil, Save, Check, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { getInstagramAccounts, getIgCampaigns, createIgCampaign, updateIgCampaign, setIgCampaignStatus, deleteIgCampaign, generateIgCampaignPost } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Section, Sheet, Segmented, EmptyState } from '../components/ui';
import { errMsg } from '../components/studio/shared';
import { ScheduleWindow, ImagesPerPost } from '../components/ScheduleFields';
import { toDateTimeInput, toDateInput, fromDateTimeInput, endOfDay, fmtDate, scheduleText } from '../lib/dates';
import '../styles/ig-studio.css';

const GOALS = ['Follower growth', 'Engagement & saves', 'Traffic & sales'];
const TONES = ['Calm & wise', 'Bold & punchy', 'Poetic'];
const PER_DAY = [1, 2, 3];
const STATUS_BADGE = { active: 'badge-success', paused: 'badge-warning', done: 'badge-purple' };
const STATUS_LABEL = { active: 'Active', paused: 'Paused', done: 'Done' };
const STEPS = ['Basics', 'Instructions', 'Review'];

// Presets as a segmented control. A saved value outside the presets stays visible when editing.
function Choice({ options, value, onChange, ariaLabel, format = (o) => String(o) }) {
  const shown = [...new Set([...options, value])];
  return (
    <div className="ig-seg-full">
      <Segmented value={value} onChange={onChange} ariaLabel={ariaLabel} options={shown.map((o) => ({ value: o, label: format(o) }))} />
    </div>
  );
}

const NEW_CAMPAIGN = {
  name: '', topic: '', goal: GOALS[1], tone: TONES[0], perDay: 1, imagesPerPost: 1, startsAt: '', endsAt: '', instructions: '', refs: '',
};

const formFrom = (c) => ({
  accountId: c.account_id, name: c.name, topic: c.topic || '', goal: c.goal || GOALS[1], tone: c.tone || TONES[0],
  perDay: c.per_day, imagesPerPost: c.images_per_post, startsAt: toDateTimeInput(c.starts_at), endsAt: toDateInput(c.ends_at),
  instructions: c.instructions || '', refs: (c.reference_images || []).join('\n'),
});

// Creates a campaign, or edits `campaign` when one is passed. Three steps in a side panel.
function Wizard({ accounts, campaign, onSaved, onCancel }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState(campaign ? formFrom(campaign) : { ...NEW_CAMPAIGN, accountId: accounts[0]?.id || '' });
  const [saving, setSaving] = useState(false);
  const handle = accounts.find((a) => a.id === f.accountId)?.username || 'account';
  const accountLocked = campaign?.posts_done > 0; // its posts belong to that account
  const images = Number(f.imagesPerPost) || 1;
  const refs = f.refs.split('\n').map((s) => s.trim()).filter(Boolean);
  const preview = `Campaign "${f.name || 'Untitled'}" for @${handle} — theme: ${f.topic || 'account DNA pillars'}. Goal: ${f.goal.toLowerCase()}. Tone: ${f.tone.toLowerCase()}. ${f.perDay} post(s) per day with ${images} image(s) in each, ${f.endsAt ? `until ${fmtDate(endOfDay(f.endsAt))}` : 'with no end date'}, at the account's scheduled slots.${f.instructions.trim() ? ` Your instructions: ${f.instructions.trim()}` : ''}${refs.length ? ' Visual direction: follow the reference images.' : ''} Every banner must pass the quality gate before publishing — skip, never force.`;

  const save = async () => {
    setSaving(true);
    try {
      const data = {
        ...f, referenceImages: refs, imagesPerPost: images, startsAt: fromDateTimeInput(f.startsAt), endsAt: endOfDay(f.endsAt),
      };
      const res = await (campaign ? updateIgCampaign(campaign.id, data) : createIgCampaign(data));
      toast.success(res.message);
      onSaved();
    } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    setSaving(false);
  };

  const footer = (
    <>
      {step === 1
        ? <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        : <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)} disabled={saving}><ArrowLeft size={16} /> Back</button>}
      {step < 3 ? (
        <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>Next <ArrowRight size={16} /></button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={16} className="spinning" /> : campaign ? <Save size={16} /> : <Sparkles size={16} />} {campaign ? 'Save changes' : 'Create campaign'}
        </button>
      )}
    </>
  );

  return (
    <Sheet
      open
      title={campaign ? `Edit ${campaign.name}` : 'New campaign'}
      subtitle={`Step ${step} of 3: ${STEPS[step - 1]}`}
      onClose={onCancel}
      busy={saving}
      footer={footer}
      width={640}
    >
      <ol className="ig-steps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i + 1 === step ? 'is-current' : i + 1 < step ? 'is-done' : ''} aria-current={i + 1 === step ? 'step' : undefined}>
            <span className="ig-steps__num">{i + 1 < step ? <Check size={12} aria-hidden="true" /> : i + 1}</span>{label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <>
          <div className="form-section">
            <h3 className="form-section__title">Basics</h3>
            <p className="form-section__desc">What the campaign is called, where it posts and what it's about.</p>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="cmp-name">Campaign name</label>
                <input id="cmp-name" className="form-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Festive Glow" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cmp-account">Account</label>
                <select id="cmp-account" className="form-select" value={f.accountId} disabled={accountLocked} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
                </select>
                {accountLocked && <div className="form-helper">This campaign already has posts on this account, so the account can't change.</div>}
              </div>
              <div className="form-group span-all">
                <label className="form-label" htmlFor="cmp-topic">Topic or theme</label>
                <input id="cmp-topic" className="form-input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Diwali jewellery styling" />
                <div className="form-helper">Leave blank to use the account's content pillars.</div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section__title">Style</h3>
            <p className="form-section__desc">What the posts aim for and how they sound.</p>
            <div className="form-group">
              <span className="form-label">Goal</span>
              <Choice options={GOALS} value={f.goal} onChange={(goal) => setF({ ...f, goal })} ariaLabel="Goal" />
            </div>
            <div className="form-group">
              <span className="form-label">Tone</span>
              <Choice options={TONES} value={f.tone} onChange={(tone) => setF({ ...f, tone })} ariaLabel="Tone" />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section__title">Cadence</h3>
            <p className="form-section__desc">How often it posts, and for how long.</p>
            <div className="form-grid">
              <div className="form-group">
                <span className="form-label">Posts per day</span>
                <Choice options={PER_DAY} value={f.perDay} onChange={(perDay) => setF({ ...f, perDay })} ariaLabel="Posts per day" />
              </div>
              <ImagesPerPost value={f.imagesPerPost} onChange={(imagesPerPost) => setF({ ...f, imagesPerPost })} />
              <ScheduleWindow startsAt={f.startsAt} endsAt={f.endsAt} onChange={(change) => setF({ ...f, ...change })} />
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <div className="form-section">
          <h3 className="form-section__title">Instructions</h3>
          <p className="form-section__desc">Both optional. Followed when writing the posts and designing their banners.</p>
          <div className="form-group">
            <label className="form-label" htmlFor="cmp-instructions">Instructions</label>
            <textarea id="cmp-instructions" className="form-textarea" rows={4} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} maxLength={2000}
              placeholder="e.g. Festive gold and red banners, mention the Diwali sale, keep the text short" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cmp-refs">Reference images</label>
            <textarea id="cmp-refs" className="form-textarea" rows={3} value={f.refs} onChange={(e) => setF({ ...f, refs: e.target.value })}
              placeholder={'https://…/reference-1.jpg\nhttps://…/reference-2.jpg'} aria-describedby="cmp-refs-hint" />
            <div className="form-helper" id="cmp-refs-hint">Up to 3 image links, one per line, showing the look you want. They guide the palette and composition, blended with the account's visual identity.</div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="form-section">
          <h3 className="form-section__title">Review</h3>
          <p className="form-section__desc">Check the summary, then {campaign ? 'save your changes' : 'create the campaign'}.</p>
          <div className="ig-review">{preview}</div>
          <div className="ig-badges">
            <span className="badge badge-purple">{images > 1 ? `${images} images per post` : 'Single image posts'}</span>
            <span className="badge badge-info">{f.endsAt ? `Ends ${fmtDate(endOfDay(f.endsAt))}` : 'No end date'}</span>
            <span className="badge badge-info">Designed banners</span>
            <span className="badge badge-info">Quality gate on every post</span>
          </div>
          {campaign ? (
            <div className="callout mt-16">
              <Info size={16} aria-hidden="true" />
              <span>
                {campaign.posts_done} post(s) are already made and stay as they are. New posts follow these settings.
                {campaign.status === 'done' && ' Saving brings it back paused unless it has already ended, so nothing posts until you resume it.'}
              </span>
            </div>
          ) : (
            <div className="callout mt-16">
              <Info size={16} aria-hidden="true" />
              <span>While it's active, the campaign feeds the account's autopilot slots (Studio → Schedule). You can also generate its posts one at a time.</span>
            </div>
          )}
        </div>
      )}
    </Sheet>
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

  const closeWizard = useCallback(() => setWizard(null), []);
  const newButton = canManage && accounts?.length > 0 && (
    <button className="btn btn-primary" onClick={() => setWizard('new')}><Plus size={16} /> New campaign</button>
  );

  return (
    <div className="page-container fade-in ig-page">
      <PageHeader
        title="Instagram Campaigns"
        subtitle="A themed run of posts, with its own topic, goal, tone and pace, that feeds an account's autopilot until it's done."
        actions={newButton || null}
      />

      {!accounts ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : accounts.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Megaphone}
            title="Connect an Instagram account first"
            text="Campaigns post to a connected Instagram account."
            action={<Link to="/instagram" className="btn btn-primary">Go to Instagram accounts</Link>}
          />
        </div>
      ) : (
        <>
          {wizard && (
            <Wizard
              key={wizard === 'new' ? 'new' : wizard.id}
              accounts={accounts}
              campaign={wizard === 'new' ? null : wizard}
              onCancel={closeWizard}
              onSaved={() => { setWizard(null); load(); }}
            />
          )}
          <Section flush title={`Campaigns (${campaigns.length})`}>
            {campaigns.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="No campaigns yet"
                text="A campaign themes a run of posts and feeds the account's autopilot until it's done."
                action={canManage && <button className="btn btn-primary" onClick={() => setWizard('new')}><Plus size={16} /> New campaign</button>}
              />
            ) : (
              <div className="list">
                {campaigns.map((c) => {
                  const pct = Math.min(100, Math.round((c.posts_done / c.posts_target) * 100));
                  return (
                    <div key={c.id} className="list-item list-item--top">
                      <div className="list-item__media" aria-hidden="true"><Megaphone size={20} /></div>
                      <div className="list-item__main">
                        <div className="list-item__title">
                          {c.name}
                          <span className={`badge ${STATUS_BADGE[c.status] || 'badge-info'}`}>{STATUS_LABEL[c.status] || c.status}</span>
                        </div>
                        <div className="list-item__meta">
                          <span>@{c.username}</span>
                          <span>{c.topic || 'Account DNA pillars'}</span>
                          <span>{c.goal} · {c.tone}</span>
                          <span>{c.per_day}/day · {c.images_per_post} image{c.images_per_post === 1 ? '' : 's'} per post{c.reference_images?.length ? ` · ${c.reference_images.length} reference image(s)` : ''}</span>
                        </div>
                        <div className="list-item__meta">{scheduleText(c)}</div>
                        <div className="ig-progress" title={c.posts_target ? `${c.posts_done} of ${c.posts_target} posts` : `${c.posts_done} posts`}>
                          {c.posts_target > 0 && <div className="meter" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>}
                          <span>{c.posts_done}{c.posts_target > 0 ? `/${c.posts_target}` : ''} generated · {c.published_count} published</span>
                        </div>
                      </div>
                      <div className="list-item__actions">
                        {c.status !== 'done' && (
                          <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act(`gen:${c.id}`, () => generateIgCampaignPost(c.id))}>
                            {busy === `gen:${c.id}` ? <Loader2 size={14} className="spinning" /> : <Sparkles size={14} />} Generate one
                          </button>
                        )}
                        <Link className="btn btn-ghost btn-sm" to={`/instagram-studio/${c.account_id}/content`}>Open in Studio</Link>
                        {canManage && (
                          <button className="btn btn-ghost btn-sm" disabled={!!busy} aria-label={`Edit campaign ${c.name}`} onClick={() => setWizard(c)}>
                            <Pencil size={14} /> Edit
                          </button>
                        )}
                        {canManage && c.status !== 'done' && (
                          <button className="btn btn-ghost btn-sm" disabled={!!busy}
                            onClick={() => act(`st:${c.id}`, () => setIgCampaignStatus(c.id, c.status === 'active' ? 'paused' : 'active'))}>
                            {busy === `st:${c.id}` ? <Loader2 size={14} className="spinning" /> : c.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                            {c.status === 'active' ? 'Pause' : 'Resume'}
                          </button>
                        )}
                        {canManage && (
                          <button className="btn btn-ghost btn-sm" disabled={!!busy} title="Delete" aria-label={`Delete campaign ${c.name}`}
                            onClick={() => window.confirm(`Delete "${c.name}"? Its posts stay in the Studio.`) && act(`del:${c.id}`, () => deleteIgCampaign(c.id))}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
