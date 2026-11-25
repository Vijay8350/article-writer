// Running inside the Shopify admin (shopify.html sets the flag before the app loads).
export const isEmbedded = () => typeof window !== 'undefined' && window.__AW_EMBEDDED__ === true;

// Where the app lives inside the admin iframe: /shopify/dashboard, /shopify/seo, …
export const EMBEDDED_BASE = '/shopify';

// Shopify's session token (from App Bridge) → our own session for this shop's workspace.
export async function startShopifySession() {
  if (!window.shopify?.idToken) throw new Error('Open Glowquill from your Shopify admin.');
  const idToken = await window.shopify.idToken();
  const res = await fetch('/api/shopify/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body.error || 'Could not open Glowquill. Reload to try again.');
  appFeatures = { instagram: body.data?.appFeatures?.instagram === true };
  return body.data; // { token, user, workspaces, workspaceId, shop, appFeatures }
}

// What the app shows inside the Shopify admin, from the server's session answer above
// (SHOPIFY_APP_INSTAGRAM). Set before the app renders; a reload asks the server again.
let appFeatures = { instagram: false };

// Instagram pages, menu items and numbers: always on the website; inside the Shopify admin
// only once the server turns them on (Facebook Login fails until Meta approves the app).
export const showInstagram = () => !isEmbedded() || appFeatures.instagram;

// /instagram, /instagram-studio/…, /instagram-scheduler, …
export const isInstagramPath = (path) => /^\/instagram(?:[-/]|$)/.test(String(path || ''));

// The plan features and limits that belong to Instagram (hidden along with it).
export const INSTAGRAM_FEATURES = new Set(['product_posts', 'studio', 'comments', 'insights']);
export const INSTAGRAM_LIMITS = new Set(['monthly_ig_post_limit', 'max_ig_accounts', 'max_automations']);

// Open a page outside the iframe (Shopify's charge approval page).
export function openTop(url) {
  window.open(url, '_top');
}
