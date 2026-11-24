import crypto from 'crypto';
import { query, withTransaction } from '../db/index.js';

// Workspaces and accounts that come from installing the Shopify app, webhook
// de-duplication, and Shopify-billed subscriptions.

// The workspace created by installing the app on this shop, if any.
export async function findWorkspaceByShop(shop) {
  const { rows } = await query('SELECT id, name, status, origin, shopify_shop FROM workspaces WHERE shopify_shop = $1', [shop]);
  return rows[0] || null;
}

// The account that stands for a shop's staff inside the app. It has no usable password
// (users.kind = 'shopify'), so it can only be reached from the Shopify admin.
export async function findShopUser(shop) {
  const { rows } = await query(
    "SELECT id, email, name, role, status FROM users WHERE kind = 'shopify' AND email = $1",
    [shopUserEmail(shop)]
  );
  return rows[0] || null;
}

export const shopUserEmail = (shop) => `owner@${shop}`;

// A new install: the shop's account and its own workspace (Free plan), in one transaction.
export async function createShopWorkspace(shop, { shopName } = {}) {
  return withTransaction(async (client) => {
    const unusable = `!shopify:${crypto.randomBytes(16).toString('hex')}`; // never a valid bcrypt hash
    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, name, role, status, kind)
       VALUES ($1, $2, $3, 'user', 'active', 'shopify')
       ON CONFLICT (email) DO UPDATE SET kind = 'shopify'
       RETURNING id, email, name, role, status`,
      [shopUserEmail(shop), unusable, shopName || shop]
    );
    const user = userRes.rows[0];
    const slugBase = shop.replace('.myshopify.com', '').replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'shop';
    const wsRes = await client.query(
      `INSERT INTO workspaces (name, slug, owner_user_id, origin, shopify_shop)
       VALUES ($1, $2, $3, 'shopify', $4)
       ON CONFLICT (shopify_shop) WHERE shopify_shop IS NOT NULL DO UPDATE SET name = workspaces.name
       RETURNING id, name, status, origin, shopify_shop`,
      [shopName || shop, `${slugBase}-${crypto.randomBytes(3).toString('hex')}`, user.id, shop]
    );
    const ws = wsRes.rows[0];
    await client.query(
      `INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
      [ws.id, user.id]
    );
    await client.query(
      `INSERT INTO subscriptions (workspace_id, plan_id, current_period_start) VALUES ($1, 'free', now())
       ON CONFLICT (workspace_id) DO NOTHING`,
      [ws.id]
    );
    return { workspace: ws, user };
  });
}

// The shop's account becomes a member of a website workspace that connected this shop
// (owner if it has no owner of its own kind there yet → we use admin, the website owner stays owner).
export async function ensureShopUserIn(workspaceId, shop, { shopName } = {}) {
  let user = await findShopUser(shop);
  if (!user) {
    const unusable = `!shopify:${crypto.randomBytes(16).toString('hex')}`;
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, name, role, status, kind)
       VALUES ($1, $2, $3, 'user', 'active', 'shopify')
       ON CONFLICT (email) DO UPDATE SET kind = 'shopify'
       RETURNING id, email, name, role, status`,
      [shopUserEmail(shop), unusable, shopName || shop]
    );
    user = rows[0];
  }
  await query(
    `INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
    [workspaceId, user.id]
  );
  return user;
}

export async function setWorkspaceName(id, name) {
  if (name) await query('UPDATE workspaces SET name = $2 WHERE id = $1 AND origin = $3', [id, name, 'shopify']);
}

// true the first time an event id is seen (Shopify may deliver a webhook more than once).
export async function recordWebhook(eventId, topic, shop) {
  const { rowCount } = await query(
    `INSERT INTO shopify_webhook_events (event_id, topic, shop_domain) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [eventId, topic, shop]
  );
  return rowCount > 0;
}

// ── Shopify Billing ──
export async function getSubscription(workspaceId) {
  const { rows } = await query(
    `SELECT plan_id, billing_source, shopify_subscription_id, shopify_status, shopify_pending_id, shopify_pending_plan
       FROM subscriptions WHERE workspace_id = $1`,
    [workspaceId]
  );
  return rows[0] || null;
}

// A charge was created and is waiting for the merchant's approval.
export async function setPending(workspaceId, { subscriptionId, planId }) {
  await query(
    `INSERT INTO subscriptions (workspace_id, plan_id, current_period_start, shopify_pending_id, shopify_pending_plan)
     VALUES ($1, 'free', now(), $2, $3)
     ON CONFLICT (workspace_id) DO UPDATE SET shopify_pending_id = $2, shopify_pending_plan = $3, updated_at = now()`,
    [workspaceId, subscriptionId, planId]
  );
}

export async function setShopifyPlan(workspaceId, { planId, subscriptionId, status }) {
  await query(
    `INSERT INTO subscriptions (workspace_id, plan_id, current_period_start, billing_source, shopify_subscription_id, shopify_status)
     VALUES ($1, $2, now(), 'shopify', $3, $4)
     ON CONFLICT (workspace_id) DO UPDATE SET plan_id = $2, billing_source = 'shopify',
       shopify_subscription_id = $3, shopify_status = $4, shopify_pending_id = NULL, shopify_pending_plan = NULL, updated_at = now()`,
    [workspaceId, planId, subscriptionId, status]
  );
}

// Back to Free when the Shopify subscription ends (cancelled, declined, uninstalled).
export async function endShopifyPlan(workspaceId, status = 'CANCELLED') {
  await query(
    `UPDATE subscriptions SET plan_id = 'free', shopify_status = $2, shopify_subscription_id = NULL, updated_at = now()
      WHERE workspace_id = $1 AND billing_source = 'shopify'`,
    [workspaceId, status]
  );
}

export async function workspaceIdsBySubscription(subscriptionId) {
  const { rows } = await query('SELECT workspace_id FROM subscriptions WHERE shopify_subscription_id = $1', [subscriptionId]);
  return rows.map((r) => r.workspace_id);
}

// shop/redact (48 hours after uninstall): delete what we hold about the shop. A workspace
// that exists only because of the install goes entirely; a website workspace keeps
// everything except the shop's connection and the Business DNA read from it.
export async function redactShop(shop) {
  return withTransaction(async (client) => {
    const own = await client.query("SELECT id FROM workspaces WHERE shopify_shop = $1 AND origin = 'shopify'", [shop]);
    for (const { id } of own.rows) await client.query('DELETE FROM workspaces WHERE id = $1', [id]);
    await client.query(
      `DELETE FROM users u WHERE u.kind = 'shopify' AND u.email = $1
         AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_user_id = u.id)`,
      [shopUserEmail(shop)]
    );
    const stores = await client.query('DELETE FROM shopify_stores WHERE shop_domain = $1 RETURNING workspace_id', [shop]);
    const touched = [...new Set(stores.rows.map((r) => r.workspace_id))];
    if (touched.length) await client.query('DELETE FROM business_dna WHERE workspace_id = ANY($1::uuid[])', [touched]);
    return { workspacesDeleted: own.rowCount, storesDeleted: stores.rowCount };
  });
}
