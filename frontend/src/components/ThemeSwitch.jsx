import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../lib/theme';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

// Light / Dark / System. `labels` shows the words next to the icons (Account page);
// without it, it's a compact icon-only control (sidebar).
export function ThemeSwitch({ labels = false }) {
  const [pref, , setPref] = useTheme();
  return (
    <div className={`theme-switch ${labels ? 'theme-switch--labels' : ''}`} role="radiogroup" aria-label="Appearance">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          className={pref === value ? 'is-on' : ''}
          onClick={() => setPref(value)}
          title={`${label} appearance`}
        >
          <Icon size={15} aria-hidden="true" />
          {labels ? <span>{label}</span> : <span className="sr-only">{label}</span>}
        </button>
      ))}
    </div>
  );
}

// One button that flips light ↔ dark (home page menu).
export function ThemeToggle({ className = '' }) {
  const [, shown, setPref] = useTheme();
  const next = shown === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={className} onClick={() => setPref(next)} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {shown === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
