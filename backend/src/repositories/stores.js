import { query } from '../db/index.js';
import { encrypt, decrypt } from '../lib/crypto.js';

// A workspace's Shopify store. Tokens are encrypted at rest. Three ways in:
//   token — an Admin API token pasted on the website (older custom apps)
//   oauth — "Connect with Shopify" on the website (the public app, authorization code grant)
//   app   — installed from Shopify (the public app, embedded, token exchange)
// The public app's offline tokens expire after an hour and come with a refresh token
// (services/shopifyTokens.js refreshes them).

function normalizeUrl(storeUrl) {
  return String(storeUrl).trim().replace(/\/$/, '').replace(/^https?:\/\//, '');
}

const COLUMNS = `id, workspace_id, store_url, shop_domain, access_token_encrypted, refresh_token_encrypted,
  token_expires_at, refresh_expires_at, scopes, auth_source, needs_reconnect, shop_name, created_at`;

function toCreds(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    storeUrl: r.store_url,
    shopDomain: r.shop_domain,
    accessToken: decrypt(r.access_token_encrypted),
    refreshToken: r.refresh_token_encrypted ? decrypt(r.refresh_token_encrypted) : null,
    expiresAt: r.token_expires_at,
    refreshExpiresAt: r.refresh_expires_at,
    scopes: r.scopes,
    authSource: r.auth_source,
    needsReconnect: r.needs_reconnect,
    shopName: r.shop_name,
  };
}

// The workspace's default store with its tokens DECRYPTED, or null.
export async function getDefaultStore(workspaceId) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM shopify_stores WHERE workspace_id = $1 ORDER BY is_default DESC, created_at ASC LIMIT 1`,
    [workspaceId]
  );
  return toCreds(rows[0]);
}

export async function getStoreById(id) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM shopify_stores WHERE id = $1`, [id]);
  return toCreds(rows[0]);
}

// The public app's connection for a shop (one per shop), with tokens decrypted.
export async function findAppStoreByShop(shopDomain) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM shopify_stores WHERE shop_domain = $1 AND auth_source <> 'token' LIMIT 1`,
    [String(shopDomain).toLowerCase()]
  );
  return toCreds(rows[0]);
}

export async function getStoreMeta(workspaceId) {
  const { rows } = await query(
    `SELECT id, store_url, shop_domain, shop_name, auth_source, needs_reconnect, scopes, created_at
     FROM shopify_stores
     WHERE workspace_id = $1
     ORDER BY is_default DESC, created_at ASC
     LIMIT 1`,
    [workspaceId]
  );
  return rows[0] || null;
}

// A pasted token. One store per workspace for now: replaces any existing rows.
export async function upsertStore(workspaceId, storeUrl, accessToken, shopName) {
  const cleanUrl = normalizeUrl(storeUrl);
  await query('DELETE FROM shopify_stores WHERE workspace_id = $1', [workspaceId]);
  const { rows } = await query(
    `INSERT INTO shopify_stores (workspace_id, store_url, shop_domain, access_token_encrypted, shop_name, is_default, auth_source)
     VALUES ($1, $2, $3, $4, $5, true, 'token')
     RETURNING id, store_url, shop_name`,
    [workspaceId, cleanUrl, cleanUrl.toLowerCase(), encrypt(accessToken), shopName || null]
  );
  return rows[0];
}

const expiry = (seconds) => (seconds ? new Date(Date.now() + Number(seconds) * 1000) : null);

// The public app's tokens for a shop, put in this workspace (replacing its store, and
// moving the shop away from any other workspace — Shopify keeps one token per shop).
export async function upsertAppStore(workspaceId, { shop, accessToken, refreshToken, expiresIn, refreshExpiresIn, scopes, source, shopName }) {
  const domain = String(shop).toLowerCase();
  await query(`DELETE FROM shopify_stores WHERE workspace_id = $1 OR (shop_domain = $2 AND auth_source <> 'token')`, [workspaceId, domain]);
  const { rows } = await query(
    `INSERT INTO shopify_stores (workspace_id, store_url, shop_domain, access_token_encrypted, refresh_token_encrypted,
        token_expires_at, refresh_expires_at, scopes, auth_source, shop_name, is_default, needs_reconnect, updated_at)
     VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, true, false, now())
     RETURNING id, store_url, shop_name`,
    [workspaceId, domain, encrypt(accessToken), refreshToken ? encrypt(refreshToken) : null,
      expiry(expiresIn), expiry(refreshExpiresIn), scopes || null, source, shopName || null]
  );
  return rows[0];
}

// A refreshed token pair for a store.
export async function saveTokens(id, { accessToken, refreshToken, expiresIn, refreshExpiresIn, scopes }) {
  await query(
    `UPDATE shopify_stores SET
        access_token_encrypted = $2,
        refresh_token_encrypted = COALESCE($3, refresh_token_encrypted),
        token_expires_at = $4,
        refresh_expires_at = COALESCE($5, refresh_expires_at),
        scopes = COALESCE($6, scopes),
        needs_reconnect = false,
        updated_at = now()
      WHERE id = $1`,
    [id, encrypt(accessToken), refreshToken ? encrypt(refreshToken) : null, expiry(expiresIn), expiry(refreshExpiresIn), scopes || null]
  );
}

export async function markNeedsReconnect(id) {
  await query('UPDATE shopify_stores SET needs_reconnect = true, updated_at = now() WHERE id = $1', [id]);
}

// The app was uninstalled from a shop: its tokens are dead, so drop them.
export async function deleteAppStoresForShop(shopDomain) {
  const { rows } = await query(
    `DELETE FROM shopify_stores WHERE shop_domain = $1 AND auth_source <> 'token' RETURNING workspace_id`,
    [String(shopDomain).toLowerCase()]
  );
  return rows.map((r) => r.workspace_id);
}

export async function deleteStores(workspaceId) {
  await query('DELETE FROM shopify_stores WHERE workspace_id = $1', [workspaceId]);
}
