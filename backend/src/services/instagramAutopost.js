import * as repo from '../repositories/instagram.js';
import { resolveAi } from './ai.js';
import * as storefront from './storefront.js';
import * as instagram from './instagram.js';
import { buildCaption } from './productCaption.js';
import { renderForAutomation, markPosted, imageUrlsOf } from './productImages.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  };
}

// Runs one LEASED automation end-to-end; always logs the outcome and releases the lease.
export async function runAutomation(automation, trigger) {
  let prepared = null;
  let ok = false;
  try {
    prepared = await prepare(automation);
    const account = await repo.getAccountWithToken(automation.account_id);
    // The store's photos are the raw material: only the finished images get posted.
    const image = await renderForAutomation(automation, prepared.product, prepared.caption);
    const imageUrls = imageUrlsOf(image);
    const { mediaId, permalink } = await instagram.publishPost(account, imageUrls, prepared.caption);
    ok = true;
    await markPosted(image, { mediaId, permalink });
    return await repo.logPost(automation, {
      trigger, ...productFields({ ...prepared, imageUrls }), imageSource: 'ai',
      status: 'published', igMediaId: mediaId, permalink, error: image.error,
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
