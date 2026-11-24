import config from '../config/env.js';
import * as stores from '../repositories/stores.js';
import * as repo from '../repositories/shopifyApp.js';
import * as workspacesRepo from '../repositories/workspaces.js';
import * as memberships from '../repositories/memberships.js';
import * as plansRepo from '../repositories/plans.js';
import { normalizeShop, verifyQueryHmac, verifyIdToken, signState, readState } from '../lib/shopifyAuth.js';
import { postToken, tokenFields } from './shopifyTokens.js';
import { graphql } from './shopify.js';
import { buildSession } from './session.js';

// The public Shopify app, for two kinds of customer:
//  • website visitors connect their store with "Connect with Shopify" (authorization code grant);
//  • merchants who install from Shopify open the app inside their admin (session token →
//    token exchange) and get a workspace of their own without signing up.
// Both get expiring offline tokens (required for public apps); shopifyTokens refreshes them.

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

export function isConfigured() {
  return Boolean(config.shopify.clientId && config.shopify.clientSecret);
}
function requireConfigured() {
  if (!isConfigured()) throw fail(503, "The Shopify app isn't set up on this server yet (SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET).");
}

const callbackUrl = () => `${config.publicBaseUrl}/api/shopify/callback`;

async function shopName(shop, accessToken) {
  try {
    const data = await graphql({ storeUrl: shop, shopDomain: shop, accessToken }, '{ shop { name } }');
    return data?.shop?.name || null;
  } catch { return null; }
}

// ── Website: "Connect with Shopify" ──────────────────────────────────────────────

export async function connectUrl({ workspaceId, userId, shopInput }) {
  requireConfigured();
  const shop = normalizeShop(shopInput);
  if (!shop) throw fail(400, "Enter your store's Shopify address, like mystore.myshopify.com.");
  const existing = await stores.findAppStoreByShop(shop);
  if (existing && existing.workspaceId !== workspaceId) {
    throw fail(409, 'This store is already connected to another Article Writer workspace. Open Article Writer from your Shopify admin instead.');
  }
  const state = signState({ w: workspaceId, u: userId, s: shop }, config.jwt.secret);
  const params = new URLSearchParams({ client_id: config.shopify.clientId, scope: config.shopify.scopes, redirect_uri: callbackUrl(), state });
  return `https://${shop}/admin/oauth/authorize?${params}`;
}

// Shopify sends the merchant back here after they approve. → { workspaceId, shop }
export async function handleCallback(q) {
  requireConfigured();
  if (!verifyQueryHmac(q, config.shopify.clientSecret)) throw fail(400, "That sign-in link from Shopify couldn't be verified. Try connecting again.");
  const shop = normalizeShop(q.shop);
  let state;
  try { state = readState(q.state, config.jwt.secret); } catch { throw fail(400, 'That sign-in link has expired. Try connecting again.'); }
  if (!shop || state.s !== shop) throw fail(400, "The store Shopify returned doesn't match the one you entered. Try again.");

  const member = await memberships.get(state.w, state.u);
  if (!member || !['owner', 'admin'].includes(member.role)) throw fail(403, 'Only workspace owners and admins can connect a store.');
  const existing = await stores.findAppStoreByShop(shop);
  if (existing && existing.workspaceId !== state.w) throw fail(409, 'This store is already connected to another Article Writer workspace.');

  const answer = await postToken(shop, { code: String(q.code || ''), expiring: '1' });
  if (!answer.ok || !answer.json?.access_token) throw fail(502, "Shopify didn't hand over access to the store. Try connecting again.");
  const fields = tokenFields(answer.json);
  await stores.upsertAppStore(state.w, { shop, ...fields, source: 'oauth', shopName: await shopName(shop, fields.accessToken) });
  return { workspaceId: state.w, shop };
}

// ── Inside the Shopify admin ─────────────────────────────────────────────────────

// The embedded app's sign-in: Shopify's session token in, our own session out.
export async function embeddedSession(idToken) {
  requireConfigured();
  let shop;
  try { ({ shop } = verifyIdToken(idToken, config.shopify)); } catch {
    throw fail(401, 'Your Shopify session expired. Reload the app.', { retrySession: true });
  }

  let store = await stores.findAppStoreByShop(shop);
  let workspaceId = store?.workspaceId || (await repo.findWorkspaceByShop(shop))?.id || null;

  // First open (or after a reinstall): swap the session token for an offline token.
  if (!store || store.needsReconnect) {
    const answer = await postToken(shop, {
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: idToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      expiring: '1',
    });
    if (answer.status === 400 || answer.status === 401) throw fail(401, 'Your Shopify session expired. Reload the app.', { retrySession: true });
    if (!answer.ok || !answer.json?.access_token) throw fail(502, "Shopify didn't give the app access to your store. Reload to try again.");
    const fields = tokenFields(answer.json);
    const name = await shopName(shop, fields.accessToken);
    if (!workspaceId) workspaceId = (await repo.createShopWorkspace(shop, { shopName: name })).workspace.id;
    else await repo.setWorkspaceName(workspaceId, name);
    await stores.upsertAppStore(workspaceId, { shop, ...fields, source: store?.authSource === 'oauth' ? 'oauth' : 'app', shopName: name });
    store = await stores.findAppStoreByShop(shop);
  }

  const ws = await workspacesRepo.getById(workspaceId);
  if (!ws) throw fail(404, 'Your workspace was not found. Reload the app.');
  if (ws.status === 'suspended') throw fail(403, 'This workspace has been suspended.', { code: 'WORKSPACE_SUSPENDED' });
  const user = ws.origin === 'shopify'
    ? (await repo.findShopUser(shop)) || (await repo.ensureShopUserIn(workspaceId, shop))
    : await repo.ensureShopUserIn(workspaceId, shop);

  const session = await buildSession({ ...user, kind: 'shopify' }, { expiresIn: '12h' });
  return { ...session, workspaceId, shop };
}

// ── Shopify Billing ──────────────────────────────────────────────────────────────

const SUB_NAME = (plan) => `Article Writer ${plan.name}`;

async function appCreds(workspaceId) {
  const creds = await stores.getDefaultStore(workspaceId);
  if (!creds || creds.authSource === 'token') throw fail(400, 'Shopify billing works for stores connected through the Shopify app.');
  return creds;
}

async function billingCurrency(creds) {
  try { return (await graphql(creds, '{ shopBillingPreferences { currency } }'))?.shopBillingPreferences?.currency || 'USD'; }
  catch { return 'USD'; }
}

// What a plan costs a shop billed in `currency`: INR stores pay the INR price, others the USD price.
export function shopifyPrice(plan, currency) {
  if (currency === 'INR' && Number(plan.price_inr) > 0) return { amount: Number(plan.price_inr), currencyCode: 'INR' };
  if (Number(plan.price_usd) > 0) return { amount: Number(plan.price_usd), currencyCode: 'USD' };
  return null;
}

async function activeSubscriptions(creds) {
  const data = await graphql(creds, `{
    currentAppInstallation { activeSubscriptions { id name status test currentPeriodEnd } }
  }`);
  return data?.currentAppInstallation?.activeSubscriptions || [];
}

// The plans a Shopify-connected workspace can choose, priced for its shop, and where it stands.
export async function billingInfo(workspaceId) {
  const creds = await appCreds(workspaceId);
  const currency = await billingCurrency(creds);
  const plans = (await plansRepo.list()).filter((p) => p.is_active !== false);
  const sub = await repo.getSubscription(workspaceId);
  return {
    currency,
    test: config.shopify.billingTest,
    currentPlan: sub?.plan_id || 'free',
    status: sub?.shopify_status || null,
    plans: plans.map((p) => ({ id: p.id, name: p.name, description: p.description, price: p.id === 'free' ? { amount: 0, currencyCode: currency } : shopifyPrice(p, currency) })),
  };
}

// Choose a plan: Free cancels the Shopify charge; a paid plan returns Shopify's approval page.
export async function subscribe(workspaceId, planId) {
  const creds = await appCreds(workspaceId);
  const plan = await plansRepo.getById(String(planId));
  if (!plan || plan.is_active === false) throw fail(400, 'That plan is not offered.');
  const sub = await repo.getSubscription(workspaceId);

  if (plan.id === 'free') {
    if (sub?.shopify_subscription_id) {
      const data = await graphql(creds, `mutation Cancel($id: ID!) {
        appSubscriptionCancel(id: $id) { appSubscription { id status } userErrors { field message } }
      }`, { id: sub.shopify_subscription_id });
      const errs = data?.appSubscriptionCancel?.userErrors || [];
      if (errs.length) throw fail(422, errs.map((e) => e.message).join('; '));
    }
    await repo.endShopifyPlan(workspaceId, 'CANCELLED');
    return { done: true, message: "You're on the Free plan." };
  }

  const price = shopifyPrice(plan, await billingCurrency(creds));
  if (!price) throw fail(400, `${plan.name} doesn't have a price for Shopify billing yet.`);
  const shop = creds.shopDomain || creds.storeUrl;
  const returnUrl = `https://${shop}/admin/apps/${config.shopify.appHandle}/shopify/plan?billing=return`;
  const data = await graphql(creds, `mutation Create($name: String!, $returnUrl: URL!, $test: Boolean, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: $lineItems) {
      appSubscription { id status }
      confirmationUrl
      userErrors { field message }
    }
  }`, {
    name: SUB_NAME(plan),
    returnUrl,
    test: config.shopify.billingTest,
    lineItems: [{ plan: { appRecurringPricingDetails: { price, interval: 'EVERY_30_DAYS' } } }],
  });
  const out = data?.appSubscriptionCreate;
  if (out?.userErrors?.length) throw fail(422, out.userErrors.map((e) => e.message).join('; '));
  if (!out?.confirmationUrl) throw fail(502, "Shopify didn't return an approval page. Try again.");
  await repo.setPending(workspaceId, { subscriptionId: out.appSubscription?.id || null, planId: plan.id });
  return { confirmationUrl: out.confirmationUrl };
}

// After the merchant approves (or declines), and from the webhook: match our plan to Shopify's.
export async function syncBilling(workspaceId) {
  const creds = await appCreds(workspaceId);
  const sub = await repo.getSubscription(workspaceId);
  const active = (await activeSubscriptions(creds)).find((s) => s.status === 'ACTIVE');
  if (!active) {
    if (sub?.billing_source === 'shopify') await repo.endShopifyPlan(workspaceId, 'CANCELLED');
    return { planId: 'free', status: null };
  }
  let planId = null;
  if (sub?.shopify_pending_id && sub.shopify_pending_id === active.id) planId = sub.shopify_pending_plan;
  else if (sub?.shopify_subscription_id === active.id) planId = sub.plan_id;
  else planId = (await plansRepo.list()).find((p) => SUB_NAME(p) === active.name)?.id || null;
  if (!planId) return { planId: sub?.plan_id || 'free', status: active.status };
  await repo.setShopifyPlan(workspaceId, { planId, subscriptionId: active.id, status: active.status });
  return { planId, status: active.status };
}

// ── Webhooks ─────────────────────────────────────────────────────────────────────

export async function handleWebhook({ topic, shop, payload }) {
  switch (topic) {
    case 'app/uninstalled': {
      // Shopify ends the app's charges itself; drop the dead tokens and fall back to Free.
      const workspaceIds = await stores.deleteAppStoresForShop(shop);
      for (const id of workspaceIds) await repo.endShopifyPlan(id, 'CANCELLED');
      return { workspaces: workspaceIds.length };
    }
    case 'app_subscriptions/update': {
      const store = await stores.findAppStoreByShop(shop);
      if (!store) return { skipped: 'no store' };
      const status = payload?.app_subscription?.status;
      const id = payload?.app_subscription?.admin_graphql_api_id;
      if (status && status !== 'ACTIVE' && id) {
        const sub = await repo.getSubscription(store.workspaceId);
        if (sub?.shopify_subscription_id === id) await repo.endShopifyPlan(store.workspaceId, status);
        return { ended: status };
      }
      return syncBilling(store.workspaceId);
    }
    case 'app/scopes_update':
      return { ok: true };
    // Privacy: the app reads products, collections and blog content, never customers or
    // orders, so it holds no customer data to report or delete.
    case 'customers/data_request':
    case 'customers/redact':
      return { customerData: 'none held' };
    case 'shop/redact':
      return repo.redactShop(shop);
    default:
      return { ignored: topic };
  }
}
