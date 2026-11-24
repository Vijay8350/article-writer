// Running inside the Shopify admin (shopify.html sets the flag before the app loads).
export const isEmbedded = () => typeof window !== 'undefined' && window.__AW_EMBEDDED__ === true;

// Where the app lives inside the admin iframe: /shopify/dashboard, /shopify/seo, …
export const EMBEDDED_BASE = '/shopify';

// Shopify's session token (from App Bridge) → our own session for this shop's workspace.
export async function startShopifySession() {
  if (!window.shopify?.idToken) throw new Error('Open Article Writer from your Shopify admin.');
  const idToken = await window.shopify.idToken();
  const res = await fetch('/api/shopify/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body.error || 'Could not open Article Writer. Reload to try again.');
  return body.data; // { token, user, workspaces, workspaceId, shop }
}

// Open a page outside the iframe (Shopify's charge approval page).
export function openTop(url) {
  window.open(url, '_top');
}
