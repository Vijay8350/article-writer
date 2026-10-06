import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, Save, Wand2, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getIgBusinessDna, startIgResearch, saveIgBusinessDna, applyIgBusinessDna } from '../../lib/api';
import { errMsg, fmt, muted, danger, toLines, fromLines, Field, TextInput, TextArea, Toggle, LoadingCard } from './shared';

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

  return (
    <>
      <div className="card mb-24">
        <div className="card-header"><h2><Search size={16} /> Deep research</h2></div>
        <div className="card-body">
          <p className="form-helper mb-16" style={{ fontSize: 13 }}>
            Reads the Instagram profile, captions and customer comments plus up to 10 pages of the website, extracts facts with quoted
            evidence, writes the Business DNA only from those facts, then fact-checks it. Takes 1–3 minutes; you can leave this page.
          </p>
          <form onSubmit={research}>
            <div className="ig-two-col">
              <div className="form-group">
                <label className="form-label">Website (optional — defaults to the link in the Instagram bio)</label>
                <input className="form-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourstore.com" disabled={!canManage} />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label className="flex items-center gap-8" style={{ fontSize: 14, cursor: 'pointer', paddingBottom: 12 }}>
                  <input type="checkbox" checked={includeIg} disabled={!canManage} onChange={(e) => setIncludeIg(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
                  Include Instagram (profile, captions, comments)
                </label>
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={!canManage || running || busy === 'research'}>
              {running || busy === 'research' ? <><Loader2 size={16} className="spinning" /> Researching…</> : <><Search size={16} /> {built ? 'Research again' : 'Start research'}</>}
            </button>
          </form>

          {dna?.research_progress?.length > 0 && (
            <div className="mt-16" style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: 12 }}>
              <div className="flex items-center gap-8 mb-16" style={{ fontSize: 13 }}>
                <strong>{running ? 'Running' : dna.research_status === 'error' ? 'Last run failed' : 'Last run'}</strong>
                {dna.research_error && <span style={danger}>{dna.research_error}</span>}
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', fontSize: 13 }}>
                {[...dna.research_progress].reverse().map((ev, i) => (
                  <div key={i} className="flex gap-8" style={{ alignItems: 'flex-start', padding: '3px 0' }}>
                    {ev.level === 'warn'
                      ? <AlertTriangle size={14} style={{ color: 'var(--accent-warning)', flex: '0 0 auto', marginTop: 3 }} />
                      : <CheckCircle2 size={14} style={{ color: 'var(--accent-success)', flex: '0 0 auto', marginTop: 3 }} />}
                    <span>{ev.step}{ev.detail ? <span style={muted}> — {ev.detail}</span> : null}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {built && (
        <>
          <div className="card mb-24">
            <div className="card-header">
              <h2>🏷️ Business DNA</h2>
              <span style={muted}>Built {fmt(dna.generated_at)}</span>
            </div>
            <div className="card-body">
              <div className="mb-16">
                <Toggle checked={form.use_in_generation} disabled={!canManage} onChange={(v) => setForm({ ...form, use_in_generation: v })}
                  label="Use in generation" sub="Feed these business facts into every idea and caption for this account" />
              </div>
              <div className="ig-two-col">
                <div>
                  <Field label="Business name"><TextInput {...p} field="business_name" /></Field>
                  <Field label="Website"><TextInput {...p} field="website_url" /></Field>
                  <Field label="Summary"><TextArea {...p} field="summary" rows={4} /></Field>
                  <Field label="Industry"><TextInput {...p} field="industry" /></Field>
                  <Field label="Target customers"><TextArea {...p} field="target_customers" rows={2} /></Field>
                  <Field label="Brand voice"><TextArea {...p} field="brand_voice" rows={2} /></Field>
                  <Field label="Tone"><TextInput {...p} field="tone" /></Field>
                  <Field label="Visual cues"><TextArea {...p} field="visual_cues" rows={2} /></Field>
                  <Field label="Language"><TextInput {...p} field="language" /></Field>
                </div>
                <div>
                  <Field label="Offerings (one per line)"><TextArea {...p} field="offerings" /></Field>
                  <Field label="What makes it different"><TextArea {...p} field="usps" /></Field>
                  <Field label="Values"><TextArea {...p} field="brand_values" rows={2} /></Field>
                  <Field label="Key messages"><TextArea {...p} field="key_messages" /></Field>
                  <Field label="Content themes"><TextArea {...p} field="content_themes" /></Field>
                  <Field label="Calls to action"><TextArea {...p} field="ctas" rows={2} /></Field>
                  <Field label="Keywords"><TextArea {...p} field="keywords" rows={2} /></Field>
                  <Field label="Do's"><TextArea {...p} field="dos" rows={2} /></Field>
                  <Field label="Don'ts"><TextArea {...p} field="donts" rows={2} /></Field>
                </div>
              </div>
              {canManage && (
                <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={save} disabled={!!busy}>
                    {busy === 'save' ? <Loader2 size={16} className="spinning" /> : <Save size={16} />} Save
                  </button>
                  <button className="btn btn-secondary" onClick={apply} disabled={!!busy}>
                    {busy === 'apply' ? <Loader2 size={16} className="spinning" /> : <Wand2 size={16} />} Apply to Account DNA
                  </button>
                </div>
              )}
            </div>
          </div>

          {notes && (
            <div className="card">
              <div className="card-header">
                <h2>🔎 Research notes</h2>
                <span style={muted}>{notes.stats?.facts} facts · {notes.stats?.pages} pages · {notes.stats?.captions} captions · {notes.stats?.comments} comments</span>
              </div>
              <div className="card-body">
                {notes.gaps?.length > 0 && (
                  <div className="mb-16">
                    <strong style={{ fontSize: 14 }}>What the research couldn't establish</strong>
                    <ul style={{ paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {notes.gaps.map((g) => <li key={g}>{g}</li>)}
                    </ul>
                  </div>
                )}
                {Object.entries(byCategory).map(([cat, facts]) => (
                  <details key={cat} style={{ marginBottom: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 14, textTransform: 'capitalize' }}>{cat.replace('_', ' ')} ({facts.length})</summary>
                    <ul style={{ paddingLeft: 18, fontSize: 13, marginTop: 6 }}>
                      {facts.map((f, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>
                          {f.fact}{f.evidence && <span style={muted}> — “{f.evidence}”</span>} <span style={muted}>({f.source})</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
