import React from 'react';

// Small helpers shared by the Instagram Studio tabs.

export const errMsg = (err, fallback = 'Something went wrong') => err?.response?.data?.error || err?.message || fallback;
export const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
export const muted = { fontSize: 12, color: 'var(--text-muted)' };
export const danger = { fontSize: 12, color: 'var(--accent-danger)' };

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

export function Field({ label, hint, children }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
      {hint && <div className="form-helper">{hint}</div>}
    </div>
  );
}

// Controlled text input / textarea bound to obj[key].
export function TextInput({ value, onChange, field, placeholder, disabled }) {
  return <input className="form-input" value={value[field] ?? ''} disabled={disabled} placeholder={placeholder}
    onChange={(e) => onChange({ ...value, [field]: e.target.value })} />;
}

export function TextArea({ value, onChange, field, placeholder, rows = 3, disabled }) {
  return <textarea className="form-textarea" style={{ minHeight: 0 }} rows={rows} value={value[field] ?? ''} disabled={disabled}
    placeholder={placeholder} onChange={(e) => onChange({ ...value, [field]: e.target.value })} />;
}

export function Toggle({ checked, onChange, label, sub, disabled }) {
  return (
    <label className="flex items-center justify-between gap-12" style={{ cursor: disabled ? 'default' : 'pointer' }}>
      <span>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{label}</span>
        {sub && <span style={muted}>{sub}</span>}
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 20, height: 20, accentColor: 'var(--accent-primary)', flex: '0 0 auto' }} />
    </label>
  );
}

export const LoadingCard = () => (
  <div className="card"><div className="card-body"><div className="empty-state"><div className="spinner spinner-lg" /></div></div></div>
);
