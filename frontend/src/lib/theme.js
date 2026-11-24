import { useEffect, useState } from 'react';

// Light / dark / system appearance. The choice is kept in this browser; the page's
// <html data-theme> is set before React renders (inline script in index.html), so
// there is no flash of the wrong theme.
const KEY = 'aw_theme';
const EVENT = 'aw-theme';
export const THEMES = ['light', 'dark', 'system'];

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : 'light';
  } catch {
    return 'light';
  }
}

const darkQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function resolveTheme(pref) {
  return pref === 'dark' || (pref === 'system' && darkQuery()?.matches) ? 'dark' : 'light';
}

export function applyTheme(pref = getThemePref()) {
  const theme = resolveTheme(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#fbfbfd');
  return theme;
}

export function setThemePref(pref) {
  if (!THEMES.includes(pref)) return;
  try { localStorage.setItem(KEY, pref); } catch { /* private mode: still applies for this visit */ }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pref }));
}

// While on "system", follow the device when it switches between light and dark.
export function watchSystemTheme() {
  const q = darkQuery();
  if (!q) return () => {};
  const onChange = () => {
    if (getThemePref() === 'system') {
      applyTheme('system');
      window.dispatchEvent(new CustomEvent(EVENT, { detail: 'system' }));
    }
  };
  q.addEventListener?.('change', onChange);
  return () => q.removeEventListener?.('change', onChange);
}

// [preference, theme actually shown, setter]
export function useTheme() {
  const [pref, setPref] = useState(getThemePref);
  const [shown, setShown] = useState(() => resolveTheme(getThemePref()));
  useEffect(() => {
    const on = (e) => { setPref(e.detail); setShown(resolveTheme(e.detail)); };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [pref, shown, setThemePref];
}
