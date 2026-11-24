import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, Save, Wand2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { getIgBusinessDna, startIgResearch, saveIgBusinessDna, applyIgBusinessDna } from '../../lib/api';
import { Section } from '../ui';
import { errMsg, fmt, toLines, fromLines, Field, TextInput, TextArea, Toggle, LoadingCard } from './shared';

const RUNNING = ['queued', 'researching', 'analyzing'];
const LIST_FIELDS = ['offerings', 'usps', 'brand_values', 'key_messages', 'content_themes', 'ctas', 'keywords', 'dos', 'donts'];
const TEXT_FIELDS = ['business_name', 'website_url', 'summary', 'industry', 'target_customers', 'brand_voice', 'tone', 'visual_cues', 'language'];

const toForm = (d) => ({
  ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, d?.[f] || ''])),
  ...Object.fromEntries(LIST_FIELDS.map((f) => [f, toLines(d?.[f])])),
  use_in_generation: d?.use_in_generation ?? true,
});

// Per-account Business DNA, built by background deep research (Instagram + website → evidence-backed facts).
export default function BusinessDnaTab({ accountId, canManage }) {
  const [dna, setDna] = useState(undefined);
  const [form, setForm] = useState(null);
  const [website, setWebsite] = useState('');
  const [includeIg, setIncludeIg] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async (resetForm) => {
    try {
      const { data } = await getIgBusinessDna(accountId);
      setDna(data);
      if (resetForm) {
        setForm(toForm(data));
        setWebsite(data?.research_request?.website_url || data?.website_url || '');
      }
      return data;
    } catch (err) {
      toast.error(errMsg(err));
      setDna(null);
      return null;
    }
  }, [accountId]);

  useEffect(() => { setDna(undefined); load(true); }, [load]);

  // Live progress while research runs; reload the form once it finishes.
  const running = RUNNING.includes(dna?.research_status);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(async () => {
      const d = await load(false);
      if (d && !RUNNING.includes(d.research_status)) {
        setForm(toForm(d));
        if (d.research_status === 'done') toast.success('Business DNA is ready');
        else toast.error(d.research_error || 'Research failed');
      }
    }, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  const research = async (e) => {
    e.preventDefault();
    setBusy('research');
    try {
      const res = await startIgResearch(accountId, { websiteUrl: website, includeInstagram: includeIg });
      toast.success(res.message);
      await load(false);
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(null);
  };

  const save = async () => {
    setBusy('save');
    try {
      const payload = { ...form, ...Object.fromEntries(LIST_FIELDS.map((f) => [f, fromLines(form[f])])) };
      const res = await saveIgBusinessDna(accountId, payload);
      setDna(res.data);
      toast.success(res.message);
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(null);
  };

  const apply = async () => {
    if (!window.confirm('Copy voice, audience, pillars and rules from the Business DNA onto the Account DNA?')) return;
    setBusy('apply');
    try { toast.success((await applyIgBusinessDna(accountId)).message); } catch (err) { toast.error(errMsg(err)); }
    setBusy(null);
  };

  if (dna === undefined || !form) return <LoadingCard />;
  const built = Boolean(dna?.generated_at);
  const notes = dna?.research_notes;
  const p = { value: form, onChange: setForm, disabled: !canManage };
  const byCategory = (notes?.facts || []).reduce((m, f) => ({ ...m, [f.category]: [...(m[f.category] || []), f] }), {});
  const runLabel = running ? 'Running now' : dna.research_status === 'error' ? 'Last run failed' : 'Last run';

  return (
    <div className="stack">
      {!canManage && (
        <div className="callout callout--info"><Info size={16} aria-hidden="true" /> Only workspace owners and admins can run research or edit the Business DNA.</div>
      )}

      <Section
        title="Deep research"
        description="Reads the Instagram profile, captions and customer comments plus up to 10 pages of the website, pulls out facts with quoted evidence, writes the Business DNA only from those facts, then fact-checks it. Takes 1–3 minutes; you can leave this page."
      >
        <form onSubmit={research}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="ig-research-site">Website</label>
              <input id="ig-research-site" className="form-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourstore.com"
                disabled={!canManage} aria-describedby="ig-research-site-hint" />
              <div className="form-helper" id="ig-research-site-hint">Optional. Defaults to the link in the Instagram bio.</div>
            </div>
            <div className="form-group">
              <span className="form-label">Sources</span>
              <label className="ig-check-label">
                <input type="checkbox" checked={includeIg} disabled={!canManage} onChange={(e) => setIncludeIg(e.target.checked)} />
                Include Instagram (profile, captions, comments)
              </label>
            </div>
          </div>
          <div className="form-actions ig-mt">
            <button className="btn btn-primary" type="submit" disabled={!canManage || running || busy === 'research'}>
              {running || busy === 'research' ? <><Loader2 size={16} className="spinning" /> Researching…</> : <><Search size={16} /> {built ? 'Research again' : 'Start research'}</>}
            </button>
          </div>
        </form>

        {dna?.research_progress?.length > 0 && (
          <div className="ig-run" aria-live="polite">
            <div className="ig-run__head">
              <span className={`status ${running ? 'status--warn' : dna.research_status === 'error' ? 'status--error' : 'status--on'}`}>{runLabel}</span>
            </div>
            {dna.research_error && <div className="callout callout--danger callout--compact mb-16">{dna.research_error}</div>}
            <div className="ig-log">
              {[...dna.research_progress].reverse().map((ev, i) => (
                <div key={i} className="ig-log__row">
                  {ev.level === 'warn'
                    ? <AlertTriangle size={14} className="ig-log__warn" aria-label="Warning" />
                    : <CheckCircle2 size={14} className="ig-log__ok" aria-label="Done" />}
                  <span>{ev.step}{ev.detail ? <span className="ig-meta"> — {ev.detail}</span> : null}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {built && (
        <>
          <Section title="Business DNA" description={`Built ${fmt(dna.generated_at)}. Correct anything the research got wrong, then save.`}>
            <Toggle checked={form.use_in_generation} disabled={!canManage} onChange={(v) => setForm({ ...form, use_in_generation: v })}
              label="Use in generation" sub="Feed these business facts into every idea and caption for this account." />

            <div className="form-section ig-after-toggle">
              <h3 className="form-section__title">The business</h3>
              <p className="form-section__desc">What it is, who it serves, and how it sounds.</p>
              <div className="form-grid">
                <Field label="Business name"><TextInput {...p} field="business_name" /></Field>
                <Field label="Website"><TextInput {...p} field="website_url" /></Field>
                <Field label="Industry"><TextInput {...p} field="industry" /></Field>
                <Field label="Language"><TextInput {...p} field="language" /></Field>
                <Field label="Summary" span><TextArea {...p} field="summary" rows={4} /></Field>
                <Field label="Target customers"><TextArea {...p} field="target_customers" rows={2} /></Field>
                <Field label="Brand voice"><TextArea {...p} field="brand_voice" rows={2} /></Field>
                <Field label="Tone"><TextInput {...p} field="tone" /></Field>
                <Field label="Visual cues"><TextArea {...p} field="visual_cues" rows={2} /></Field>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section__title">What to say</h3>
              <p className="form-section__desc">One item per line.</p>
              <div className="form-grid">
                <Field label="Offerings"><TextArea {...p} field="offerings" /></Field>
                <Field label="What makes it different"><TextArea {...p} field="usps" /></Field>
                <Field label="Key messages"><TextArea {...p} field="key_messages" /></Field>
                <Field label="Content themes"><TextArea {...p} field="content_themes" /></Field>
                <Field label="Values"><TextArea {...p} field="brand_values" rows={2} /></Field>
                <Field label="Calls to action"><TextArea {...p} field="ctas" rows={2} /></Field>
                <Field label="Keywords" span><TextArea {...p} field="keywords" rows={2} /></Field>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section__title">Rules</h3>
              <p className="form-section__desc">One per line.</p>
              <div className="form-grid">
                <Field label="Do's"><TextArea {...p} field="dos" rows={2} /></Field>
                <Field label="Don'ts"><TextArea {...p} field="donts" rows={2} /></Field>
              </div>
            </div>

            {canManage && (
              <div className="form-actions ig-end">
                <button className="btn btn-secondary" onClick={apply} disabled={!!busy}>
                  {busy === 'apply' ? <Loader2 size={16} className="spinning" /> : <Wand2 size={16} />} Apply to Account DNA
                </button>
                <button className="btn btn-primary" onClick={save} disabled={!!busy}>
                  {busy === 'save' ? <Loader2 size={16} className="spinning" /> : <Save size={16} />} Save
                </button>
              </div>
            )}
          </Section>

          {notes && (
            <Section
              title="Research notes"
              description={`${notes.stats?.facts ?? 0} facts from ${notes.stats?.pages ?? 0} pages, ${notes.stats?.captions ?? 0} captions and ${notes.stats?.comments ?? 0} comments.`}
            >
              {notes.gaps?.length > 0 && (
                <div className="callout callout--warning mb-16">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <div>
                    <strong>What the research couldn't establish</strong>
                    <ul>{notes.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
                  </div>
                </div>
              )}
              <div className="ig-facts">
                {Object.entries(byCategory).map(([cat, facts]) => (
                  <details key={cat}>
                    <summary>{cat.replace('_', ' ')} ({facts.length})</summary>
                    <ul>
                      {facts.map((f, i) => (
                        <li key={i}>
                          {f.fact}{f.evidence && <span className="ig-meta"> — “{f.evidence}”</span>} <span className="ig-meta">({f.source})</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
