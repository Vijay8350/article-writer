import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Checks for everything Shopify sends us. Pure: the secrets are passed in.

// A shop's permanent domain: name.myshopify.com, nothing else (no paths, no ports).
const SHOP_RE = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;

// "mystore", "mystore.myshopify.com", "https://mystore.myshopify.com/admin" → mystore.myshopify.com;
// anything else (a custom domain, a URL to somewhere else) → null.
export function normalizeShop(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  const admin = String(input).match(/admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/i);
  if (admin) s = admin[1].toLowerCase();
  if (!s.includes('.')) s = `${s}.myshopify.com`;
  return SHOP_RE.test(s) ? s : null;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// OAuth redirect (and app URL) query string: hmac over the other parameters, sorted.
export function verifyQueryHmac(queryObj, secret) {
  const { hmac, signature, ...rest } = queryObj || {};
  if (!hmac || !secret) return false;
  const message = Object.keys(rest).sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(',') : rest[k]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return safeEqual(digest, hmac);
}

// Webhook body: base64 HMAC-SHA256 of the raw bytes in X-Shopify-Hmac-Sha256.
export function verifyWebhookHmac(rawBody, header, secret) {
  if (!header || !secret || !rawBody) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return safeEqual(digest, header);
}

// The ID (session) token App Bridge gives the embedded app: HS256 with the client
// secret, aud = client id, iss and dest on the same shop. → { shop, userId, payload }.
export function verifyIdToken(idToken, { clientId, clientSecret }) {
  const payload = jwt.verify(idToken, clientSecret, { algorithms: ['HS256'], audience: clientId, clockTolerance: 5 });
  const issHost = new URL(payload.iss).hostname;
  const destHost = new URL(payload.dest).hostname;
  if (issHost !== destHost) throw new Error('Session token issuer and destination differ');
  const shop = normalizeShop(destHost);
  if (!shop) throw new Error('Session token is not for a Shopify store');
  return { shop, userId: payload.sub || null, payload };
}

// OAuth state: who started "Connect with Shopify" (signed, 10 minutes).
export function signState(data, secret) {
  return jwt.sign({ ...data, nonce: crypto.randomBytes(12).toString('hex') }, secret, { expiresIn: '10m', audience: 'shopify-connect' });
}
export function readState(state, secret) {
  return jwt.verify(state, secret, { audience: 'shopify-connect' });
}

// The Content-Security-Policy that lets the Shopify admin (and only it) frame the app for a shop.
// Without a shop in the URL (an in-app reload can drop it) any Shopify admin may frame it.
export function frameAncestors(shop) {
  const s = normalizeShop(shop);
  return s
    ? `frame-ancestors https://${s} https://admin.shopify.com;`
    : 'frame-ancestors https://*.myshopify.com https://admin.shopify.com;';
}
