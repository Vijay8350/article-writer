import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Shared page building blocks. Styles live in index.css (".ui" section).

// Props for a masked API key / access token field. Chrome ignores autocomplete="off" on
// password fields and fills the saved login (email into the field above, password here),
// which would save the person's password as their key; "new-password" stops that, and the
// data-* flags keep 1Password, LastPass and Bitwarden out too.
export const SECRET_INPUT = {
  type: 'password',
  autoComplete: 'new-password',
  spellCheck: false,
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
};

// Title + one-line description on the left, the page's actions on the right.
export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <header className="page-header page-header--split">
      <div className="page-header__text">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

// A panel that slides in from the right for "New …" and "Edit …" forms, so a page
// can lead with what already exists. Escape or the backdrop closes it (unless busy).
export function Sheet({ open, title, subtitle, onClose, children, footer, busy = false, width = 600 }) {
  const panel = useRef(null);
  // Latest close handler and busy flag, so the effect below runs only when the sheet
  // opens or closes (pages often pass an inline arrow; re-running would steal focus).
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busyRef.current) closeRef.current?.(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus the first field once, when the sheet opens
    const t = setTimeout(() => panel.current?.querySelector('input, textarea, select, button:not(.sheet__close)')?.focus(), 60);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; clearTimeout(t); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet__scrim" onClick={() => { if (!busy) onClose?.(); }} />
      <div className="sheet__panel" ref={panel} style={{ '--sheet-width': `${width}px` }}>
        <div className="sheet__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="sheet__close" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </div>
  );
}

// A row of mutually exclusive choices (date ranges, sources, modes).
export function Segmented({ value, onChange, options, ariaLabel, size = 'md', disabled = false }) {
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'is-on' : ''}
            onClick={() => onChange(o.value)}
            disabled={disabled || o.disabled}
            title={o.title}
          >
            {Icon && <Icon size={15} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Nothing here yet: say what goes here and offer the next step.
export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty-state">
      {Icon && <Icon aria-hidden="true" />}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

// An on/off switch (Apple style). Label it with aria-label or a <label htmlFor>.
export function Switch({ checked, onChange, disabled = false, id, label }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

// A setting: title and explanation on the left, its control (usually a Switch) on the right.
export function SettingRow({ title, description, children, htmlFor }) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        {htmlFor ? <label htmlFor={htmlFor} className="setting-row__title">{title}</label> : <div className="setting-row__title">{title}</div>}
        {description && <div className="setting-row__desc">{description}</div>}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

// A card with a titled header and optional actions on the right.
export function Section({ title, description, actions, children, className = '', bodyClassName = '', flush = false }) {
  return (
    <section className={`card section ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          <div className="section__head">
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="section__actions">{actions}</div>}
        </div>
      )}
      <div className={`${flush ? '' : 'card-body'} ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}
