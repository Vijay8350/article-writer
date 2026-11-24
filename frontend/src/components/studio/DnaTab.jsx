import React, { useState, useEffect } from 'react';
import { Save, Loader2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAccountDna, saveAccountDna } from '../../lib/api';
import { Section } from '../ui';
import { errMsg, toLines, fromLines, Field, TextInput, TextArea, LoadingCard } from './shared';

// Account DNA: the voice, audience and visual identity every idea, caption and image is conditioned on.
export default function DnaTab({ accountId, canManage }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(null);
    getAccountDna(accountId).then((res) => {
      const d = res.data || {};
      const vi = d.visual_identity || {};
      setForm({
        persona: d.persona || '', tone: d.tone || '', audience: d.audience || '', niche: d.niche || '',
        content_pillars: toLines(d.content_pillars), language: d.language || 'English',
        palette: (vi.palette || []).join(', '), mood: vi.mood || '', style: vi.style || '', font: vi.font || '', layout: vi.layout || '',
        dos: toLines(d.dos), donts: toLines(d.donts), examples: toLines(d.examples), hashtag_strategy: d.hashtag_strategy || '',
      });
    }).catch((err) => { toast.error(errMsg(err)); setForm({}); });
  }, [accountId]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saveAccountDna(accountId, {
        persona: form.persona, tone: form.tone, audience: form.audience, niche: form.niche,
        content_pillars: fromLines(form.content_pillars), language: form.language,
        visual_identity: { palette: form.palette, mood: form.mood, style: form.style, font: form.font, layout: form.layout },
        dos: fromLines(form.dos), donts: fromLines(form.donts), examples: fromLines(form.examples), hashtag_strategy: form.hashtag_strategy,
      });
      toast.success(res.message || 'Saved');
    } catch (err) {
      toast.error(errMsg(err));
    }
    setSaving(false);
  };

  if (!form) return <LoadingCard />;
  const p = { value: form, onChange: setForm, disabled: !canManage };

  return (
    <form onSubmit={save} className="stack">
      {!canManage && (
        <div className="callout callout--info"><Info size={16} aria-hidden="true" /> Only workspace owners and admins can edit the Account DNA.</div>
      )}
      <Section
        title="Account DNA"
        description='Shapes every idea, caption and image made for this account. Fill it in once and change it any time, or build a Business DNA and use "Apply to Account DNA".'
      >
        <div className="form-section">
          <h3 className="form-section__title">Voice and audience</h3>
          <p className="form-section__desc">Who is speaking, and who they speak to.</p>
          <div className="form-grid">
            <Field label="Persona or brand voice" span><TextInput {...p} field="persona" placeholder="e.g. warm, witty stylist who loves everyday elegance" /></Field>
            <Field label="Tone"><TextInput {...p} field="tone" placeholder="e.g. confident and kind" /></Field>
            <Field label="Language"><TextInput {...p} field="language" placeholder="English, Hindi, Hinglish…" /></Field>
            <Field label="Target audience"><TextInput {...p} field="audience" placeholder="e.g. Indian women 20–35 who love affordable jewellery" /></Field>
            <Field label="Niche"><TextInput {...p} field="niche" placeholder="e.g. jewellery styling quotes" /></Field>
            <Field label="Content pillars" hint="One per line." span><TextArea {...p} field="content_pillars" placeholder={'self-love\neveryday elegance\nstyling tips'} /></Field>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section__title">Visual identity</h3>
          <p className="form-section__desc">How the images should look.</p>
          <div className="form-grid">
            <Field label="Palette" hint="Colours, separated by commas."><TextInput {...p} field="palette" placeholder="#f5e6d3, gold, deep maroon" /></Field>
            <Field label="Mood"><TextInput {...p} field="mood" placeholder="soft luxury, festive, minimal" /></Field>
            <Field label="Style references"><TextInput {...p} field="style" placeholder="minimalist flatlay, film grain" /></Field>
            <Field label="Font feel"><TextInput {...p} field="font" placeholder="elegant serif, bold sans" /></Field>
            <Field label="Layout preference" span><TextInput {...p} field="layout" placeholder="centered text, plenty of space" /></Field>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section__title">Rules</h3>
          <p className="form-section__desc">One per line. Followed in every post.</p>
          <div className="form-grid">
            <Field label="Do's"><TextArea {...p} field="dos" placeholder={'keep the headline under 8 words\nend with a punchy line'} /></Field>
            <Field label="Don'ts"><TextArea {...p} field="donts" placeholder={'no prices on the image\nno politics'} /></Field>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section__title">Examples and hashtags</h3>
          <p className="form-section__desc">Posts that sound right, and how to pick hashtags.</p>
          <div className="form-grid">
            <Field label="Example posts or captions" hint="One per line." span><TextArea {...p} field="examples" rows={4} /></Field>
            <Field label="Hashtag strategy" span><TextArea {...p} field="hashtag_strategy" rows={2} placeholder="3 broad + 4 medium + 3 niche tags" /></Field>
          </div>
        </div>

        <div className="form-actions ig-end">
          <button className="btn btn-primary" type="submit" disabled={saving || !canManage}>
            {saving ? <><Loader2 size={16} className="spinning" /> Saving…</> : <><Save size={16} /> Save Account DNA</>}
          </button>
        </div>
      </Section>
    </form>
  );
}
