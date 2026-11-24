import config from '../config/env.js';
import * as stores from '../repositories/stores.js';

// The public app's offline tokens expire after an hour. Before any Admin API call,
// ensureFreshToken() swaps a token that is about to expire for a new one (refresh
// tokens rotate, so a refresh for a store never runs twice at once — PM2 runs a single
// process). Pasted tokens (auth_source 'token') never expire and pass straight through.

const EARLY_MS = 5 * 60 * 1000;
const inflight = new Map(); // store id → refresh promise

const reconnectError = () => Object.assign(
  new Error('Your Shopify connection has expired. Reconnect your store in Settings.'),
  { status: 409, code: 'SHOPIFY_RECONNECT' }
);

const freshEnough = (c) => !c?.expiresAt || new Date(c.expiresAt).getTime() - Date.now() > EARLY_MS;

// The token endpoint for a shop (OAuth code, token exchange and refresh all use it).
export async function postToken(shop, params) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: config.shopify.clientId, client_secret: config.shopify.clientSecret, ...params }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, json };
}

// Token endpoint answer → the shape stores.saveTokens / upsertAppStore take.
export function tokenFields(json) {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    expiresIn: json.expires_in || null,
    refreshExpiresIn: json.refresh_token_expires_in || null,
    scopes: json.scope || null,
  };
}

async function refresh(creds) {
  // Another request may have refreshed it a moment ago: read the row again first.
  const current = (creds.id && await stores.getStoreById(creds.id)) || creds;
  if (freshEnough(current)) return current;
  if (!current.refreshToken) { if (current.id) await stores.markNeedsReconnect(current.id); throw reconnectError(); }

  let answer;
  try {
    answer = await postToken(current.shopDomain || current.storeUrl, { grant_type: 'refresh_token', refresh_token: current.refreshToken });
  } catch {
    throw Object.assign(new Error("Couldn't reach Shopify to renew the store connection. Try again in a moment."), { status: 503 });
  }
  if (answer.status === 400 || answer.status === 401) {
    // The refresh token is expired, revoked or the app was uninstalled: the merchant must reconnect.
    if (current.id) await stores.markNeedsReconnect(current.id);
    throw reconnectError();
  }
  if (!answer.ok || !answer.json?.access_token) {
    throw Object.assign(new Error('Shopify did not renew the store connection. Try again in a moment.'), { status: 503 });
  }
  const fields = tokenFields(answer.json);
  if (current.id) await stores.saveTokens(current.id, fields);
  return {
    ...current,
    accessToken: fields.accessToken,
    refreshToken: fields.refreshToken || current.refreshToken,
    expiresAt: fields.expiresIn ? new Date(Date.now() + fields.expiresIn * 1000) : null,
  };
}

// Make sure creds.accessToken is good for the next few minutes; updates creds in place.
export async function ensureFreshToken(creds) {
  if (!creds || freshEnough(creds)) return creds;
  const key = creds.id || creds.shopDomain || creds.storeUrl;
  if (!inflight.has(key)) inflight.set(key, refresh(creds).finally(() => inflight.delete(key)));
  const fresh = await inflight.get(key);
  creds.accessToken = fresh.accessToken;
  creds.refreshToken = fresh.refreshToken;
  creds.expiresAt = fresh.expiresAt;
  return creds;
}
