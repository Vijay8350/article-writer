import * as repo from '../repositories/instagram.js';
import * as deepseek from './deepseek.js';
import { resolveAi } from './ai.js';
import * as storefront from './storefront.js';
import * as instagram from './instagram.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CAPTION = 2200; // Instagram limits
const MAX_HASHTAGS = 30;

// Rotation: never-posted in-stock products first (newest first — so new arrivals
// go out soon), then whichever was posted longest ago. `history` is oldest-first.
// Products that failed in the last 24h are skipped, and ones that failed twice
// since their last success go to the back, so a bad product can't stall the queue.
export function pickProduct(products, history) {
  const candidates = products.filter((p) => p.available && p.images.length);
  if (!candidates.length) throw new Error('No in-stock products with images found on the website');

  const stats = new Map();
  for (const h of history) {
    const s = stats.get(h.product_id) || { lastPublished: 0, lastFailed: 0, fails: 0 };
    const t = new Date(h.created_at).getTime();
    if (h.status === 'published') Object.assign(s, { lastPublished: t, fails: 0 });
    else Object.assign(s, { lastFailed: t, fails: s.fails + 1 });
    stats.set(h.product_id, s);
  }
  const none = { lastPublished: 0, lastFailed: 0, fails: 0 };
  const stat = (p) => stats.get(p.id) || none;

  const ready = candidates.filter((p) => Date.now() - stat(p).lastFailed >= DAY_MS);
  if (!ready.length) throw new Error('Every product failed in the last 24 hours — see the errors in the post history');
  ready.sort((a, b) =>
    (stat(a).fails >= 2) - (stat(b).fails >= 2)
    || stat(a).lastPublished - stat(b).lastPublished
    || new Date(b.createdAt) - new Date(a.createdAt));
  return ready[0];
}

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

// Case-insensitive de-dupe that keeps the first spelling seen.
function uniqueTags(tags) {
  const seen = new Map();
  for (const t of tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()];
}

export async function buildCaption(automation, product, { apiKey, model } = {}) {
  const storeName = automation.site_name || new URL(automation.site_url).hostname;
  const price = storefront.formatPrice(product.price, automation.currency);
  const onSale = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.price);
  const priceLine = onSale
    ? `${price} (was ${storefront.formatPrice(product.compareAtPrice, automation.currency)}, ${Math.round((1 - product.price / product.compareAtPrice) * 100)}% off)`
    : price;
  const fixedTags = automation.hashtags?.match(HASHTAG_RE) || [];

  const prompt = `You write Instagram captions for "${storeName}", an online store.

PRODUCT
Title: ${product.title}
Price: ${priceLine || 'n/a'}
Type: ${product.productType || 'n/a'}
Tags: ${product.tags || 'n/a'}
Description: ${product.description || 'n/a'}
${automation.caption_instructions ? `\nSTORE OWNER'S INSTRUCTIONS (follow these): ${automation.caption_instructions}\n` : ''}
Write the caption:
- A scroll-stopping hook as the first line (it's all people see before "more")
- 2–4 short lines on why this product is great, using only the details above — never invent specs
- Mention the price
- End with a call to action to shop now
- Emojis welcome; keep it under 900 characters
- Do NOT put any URL or hashtags in the caption — they are added separately

Also suggest up to ${Math.max(5, 20 - fixedTags.length)} relevant, popular hashtags.

Return ONLY valid JSON, no markdown: {"caption": "...", "hashtags": ["#tag", "..."]}`;

  const raw = await deepseek.complete(prompt, apiKey, { temperature: 0.8, maxTokens: 1200, model });
  let body;
  let aiTags = [];
  try {
    const parsed = JSON.parse(raw.replace(/```json\s*|```/g, '').trim());
    body = String(parsed.caption || '').trim();
    aiTags = (Array.isArray(parsed.hashtags) ? parsed.hashtags.join(' ') : '').match(HASHTAG_RE) || [];
  } catch {
    body = raw.trim(); // model ignored the JSON format — use its text as-is
  }
  if (!body) throw new Error('DeepSeek returned an empty caption');

  const tagRoom = Math.max(0, MAX_HASHTAGS - (body.match(HASHTAG_RE) || []).length);
  const hashtags = uniqueTags([...fixedTags, ...aiTags]).slice(0, tagRoom).join(' ');
  const tail = `\n\n🛒 Shop now: ${product.url}${hashtags ? `\n\n${hashtags}` : ''}`;
  return body.slice(0, MAX_CAPTION - tail.length) + tail;
}

async function prepare(automation) {
  const products = await storefront.getProducts(automation.site_url);
  const product = pickProduct(products, await repo.productHistory(automation));
  // Captions are always DeepSeek, with the workspace's own key + chosen model when set.
  const ai = await resolveAi(automation.workspace_id, 'article', 'deepseek');
  const caption = await buildCaption(automation, product, ai);
  return { product, caption, imageUrls: product.images.map(storefront.instagramImageUrl) };
}

// Dry run for the UI: the product that would post next and its caption. Publishes nothing.
export async function previewAutomation(automation) {
  const { product, caption, imageUrls } = await prepare(automation);
  return {
    product: { id: product.id, title: product.title, url: product.url, price: product.price },
    caption,
    imageUrls,
    format: imageUrls.length > 1 ? 'carousel' : 'single',
  };
}

// Runs one LEASED automation end-to-end; always logs the outcome and releases the lease.
export async function runAutomation(automation, trigger) {
  let prepared = null;
  let ok = false;
  try {
    prepared = await prepare(automation);
    const account = await repo.getAccountWithToken(automation.account_id);
    const { mediaId, permalink } = await instagram.publishPost(account, prepared.imageUrls, prepared.caption);
    ok = true;
    return await repo.logPost(automation, {
      trigger, ...productFields(prepared), status: 'published', igMediaId: mediaId, permalink,
    });
  } catch (err) {
    return await repo.logPost(automation, {
      trigger, ...(prepared ? productFields(prepared) : {}), status: 'failed', error: err.message,
    });
  } finally {
    await repo.finishRun(automation.id, { trigger, ok });
  }
}

function productFields({ product, caption, imageUrls }) {
  return {
    productId: product.id, productTitle: product.title, productUrl: product.url,
    imageCount: imageUrls.length, caption,
  };
}

// Scheduler hook: at most one due automation per call.
export async function runDueInstagramPost() {
  const automation = await repo.claimDue();
  if (!automation) return false;
  console.log(`📸 Instagram autopost ${automation.id} (${automation.site_url})`);
  const post = await runAutomation(automation, 'schedule');
  if (post.status === 'published') console.log(`✅ Instagram posted "${post.product_title}" ${post.permalink || ''}`);
  else console.error(`❌ Instagram autopost ${automation.id} failed: ${post.error}`);
  return true;
}

// Scheduler hook: keep Instagram Login tokens alive (they expire after 60 days).
export async function refreshDueInstagramToken() {
  const account = await repo.claimTokenRefresh();
  if (!account) return false;
  try {
    const { accessToken, expiresAt } = await instagram.refreshToken(account.accessToken);
    await repo.markTokenRefreshed(account.id, accessToken, expiresAt);
  } catch (err) {
    await repo.markTokenRefreshFailed(account.id, err.message);
    console.error(`❌ Instagram token refresh for @${account.username} failed: ${err.message}`);
  }
  return true;
}
