import React, { useId } from 'react';
import { Switch, SettingRow } from '../ui';

// Small helpers shared by the Instagram Studio tabs.

export const errMsg = (err, fallback = 'Something went wrong') => err?.response?.data?.error || err?.message || fallback;
export const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
export const muted = { fontSize: 12, color: 'var(--text-muted)' };
export const danger = { fontSize: 12, color: 'var(--accent-danger)' };

// The rest of a multi-image post, under its cover.
export function ExtraImages({ urls }) {
  return (
    <div className="ig-post-extras">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="" loading="lazy" /></a>
      ))}
    </div>
  );
}

// Arrays ⇄ one-item-per-line textareas.
export const toLines = (arr) => (arr || []).join('\n');
export const fromLines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

export function browserTimezone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  return tz === 'Asia/Calcutta' ? 'Asia/Kolkata' : tz;
}

// Browsers list canonical names (e.g. Asia/Calcutta), so always include the current value.
export function timezoneOptions(current) {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([current, 'Asia/Kolkata', 'UTC', ...all].filter(Boolean))];
}

// A labelled field. The label and hint are tied to the (single) child control.
// `span` makes it take the whole row of a .form-grid.
export function Field({ label, hint, children, span = false }) {
  const autoId = useId();
  const id = (React.isValidElement(children) && children.props.id) || autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const control = React.isValidElement(children)
    ? React.cloneElement(children, { id, ...(hintId ? { 'aria-describedby': hintId } : {}) })
    : children;
  return (
    <div className={`form-group${span ? ' span-all' : ''}`}>
      <label className="form-label" htmlFor={id}>{label}</label>
      {control}
      {hint && <div className="form-helper" id={hintId}>{hint}</div>}
    </div>
  );
}

// Controlled text input / textarea bound to obj[key].
export function TextInput({ value, onChange, field, placeholder, disabled, id, ...rest }) {
  return <input className="form-input" id={id} aria-describedby={rest['aria-describedby']} value={value[field] ?? ''} disabled={disabled} placeholder={placeholder}
    onChange={(e) => onChange({ ...value, [field]: e.target.value })} />;
}

export function TextArea({ value, onChange, field, placeholder, rows = 3, disabled, id, ...rest }) {
  return <textarea className="form-textarea" id={id} aria-describedby={rest['aria-describedby']} style={{ minHeight: 0 }} rows={rows} value={value[field] ?? ''} disabled={disabled}
    placeholder={placeholder} onChange={(e) => onChange({ ...value, [field]: e.target.value })} />;
}

// An on/off setting: title and explanation on the left, a switch on the right.
export function Toggle({ checked, onChange, label, sub, disabled }) {
  const id = useId();
  return (
    <SettingRow title={label} description={sub} htmlFor={id}>
      <Switch id={id} checked={checked} disabled={disabled} onChange={onChange} />
    </SettingRow>
  );
}

export const LoadingCard = () => (
  <div className="card"><div className="card-body"><div className="empty-state"><div className="spinner spinner-lg" /></div></div></div>
);
