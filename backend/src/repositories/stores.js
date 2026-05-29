import { query } from '../db/index.js';
import { encrypt, decrypt } from '../lib/crypto.js';

function normalizeUrl(storeUrl) {
  return String(storeUrl).trim().replace(/\/$/, '').replace(/^https?:\/\//, '');
}

// Returns the user's default store with the access token DECRYPTED, or null.
export async function getDefaultStore(userId) {
  const { rows } = await query(
    `SELECT id, store_url, access_token_encrypted, shop_name
     FROM shopify_stores
     WHERE user_id = $1
     ORDER BY is_default DESC, created_at ASC
     LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    storeUrl: r.store_url,
    accessToken: decrypt(r.access_token_encrypted),
    shopName: r.shop_name,
  };
}

// Returns store metadata only (no token) for display.
export async function getStoreMeta(userId) {
  const { rows } = await query(
    `SELECT id, store_url, shop_name, created_at
     FROM shopify_stores
     WHERE user_id = $1
     ORDER BY is_default DESC, created_at ASC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

// One store per user for now: replace any existing rows.
export async function upsertStore(userId, storeUrl, accessToken, shopName) {
  const cleanUrl = normalizeUrl(storeUrl);
  await query('DELETE FROM shopify_stores WHERE user_id = $1', [userId]);
  const { rows } = await query(
    `INSERT INTO shopify_stores (user_id, store_url, access_token_encrypted, shop_name, is_default)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, store_url, shop_name`,
    [userId, cleanUrl, encrypt(accessToken), shopName || null]
  );
  return rows[0];
}

export async function deleteStores(userId) {
  await query('DELETE FROM shopify_stores WHERE user_id = $1', [userId]);
}
