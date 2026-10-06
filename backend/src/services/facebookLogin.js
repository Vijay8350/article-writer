import axios from 'axios';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import config from '../config/env.js';

// "Connect with Facebook" (Instagram API with Facebook Login), ported from the
// Insta Post Generator: OAuth dialog → code → long-lived user token → the user's
// Pages with their linked Instagram Business accounts → each Page token (long-
// lived, used for publishing) is stored encrypted, one row per Instagram account.

const GRAPH = 'https://graph.facebook.com';
const STATE_TTL_MS = 10 * 60 * 1000;

export const isConfigured = () => Boolean(config.facebook.appId && config.facebook.appSecret);
export const redirectUri = () => `${config.publicBaseUrl}/api/meta/oauth/callback`;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload) => createHmac('sha256', config.jwt.secret).update(payload).digest();

// The OAuth `state`: which workspace/user started the connect, signed so it can't
// be forged, short-lived, and bound to a nonce kept in an httpOnly cookie.
export function createState({ workspaceId, userId }) {
  const nonce = randomBytes(16).toString('hex');
  const payload = b64url(JSON.stringify({ w: workspaceId, u: userId, n: nonce, exp: Date.now() + STATE_TTL_MS }));
  return { state: `${payload}.${b64url(sign(payload))}`, nonce };
}

export function verifyState(state, cookieNonce) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!data.exp || data.exp < Date.now() || !cookieNonce || data.n !== cookieNonce) return null;
  return { workspaceId: data.w, userId: data.u };
}

export function dialogUrl(state) {
  const url = new URL(`https://www.facebook.com/${config.instagram.apiVersion}/dialog/oauth`);
  url.searchParams.set('client_id', config.facebook.appId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('scope', config.facebook.scopes.join(','));
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

async function graphGet(path, params) {
  try {
    const { data } = await axios.get(`${GRAPH}/${config.instagram.apiVersion}/${path}`, { params, timeout: 30000 });
    return data;
  } catch (err) {
    throw new Error(err.response?.data?.error?.message || err.message);
  }
}

// code → short-lived user token → long-lived user token (~60 days).
export async function exchangeCode(code) {
  const short = await graphGet('oauth/access_token', {
    client_id: config.facebook.appId, client_secret: config.facebook.appSecret, redirect_uri: redirectUri(), code,
  });
  const long = await graphGet('oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: config.facebook.appId, client_secret: config.facebook.appSecret,
    fb_exchange_token: short.access_token,
  });
  return long.access_token;
}

// The user's Pages with their linked Instagram Business account (if any). Page
// tokens derived from a long-lived user token don't expire.
export async function pagesWithInstagram(userToken) {
  const data = await graphGet('me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: userToken, limit: 100,
  });
  return (data.data || []).map((p) => ({
    pageId: p.id,
    pageName: p.name,
    pageAccessToken: p.access_token,
    instagram: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username } : null,
  }));
}

// Meta's data-deletion callback: verify the signed_request (HMAC-SHA256 with the app secret).
export function parseSignedRequest(signedRequest) {
  if (!config.facebook.appSecret) return null;
  const [encodedSig, payload] = String(signedRequest || '').split('.');
  if (!encodedSig || !payload) return null;
  const sig = Buffer.from(encodedSig, 'base64url');
  const expected = createHmac('sha256', config.facebook.appSecret).update(payload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
}
