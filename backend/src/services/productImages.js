import config from '../config/env.js';
import * as repo from '../repositories/productImages.js';
import * as igRepo from '../repositories/instagram.js';
import * as media from './igMedia.js';
import * as storefront from './storefront.js';
import { publishPost } from './instagram.js';
import { buildCaption } from './productCaption.js';
import { resolveAi } from './ai.js';
import { assertCanGenerateIgPost, incrementIgUsage } from './usage.js';
import { buildProductImagePrompt, buildProductVisionPrompt, resolveProductStyle } from '../lib/igPrompts.js';

// A product on a store's website → an AI image of THAT product → Instagram.
// The store's real photos are the references, so the model restages the product
// instead of inventing one, and the vision gate compares the result against them.
// Only images that pass (status = 'ready') can be posted: fail closed.

const MAX_REFERENCES = 2;
const MAX_CAPTION = 2200;

const badRequest = (message, status = 400) => Object.assign(new Error(message), { status });
const errText = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
export const withUrl = (row) => (row ? { ...row, image_url: row.image_file ? media.publicImageUrl(row.image_file) : null } : row);

async function findProduct(siteUrl, productId) {
  const product = (await storefront.getProducts(siteUrl)).find((p) => p.id === String(productId));
  if (!product) throw badRequest('That product is no longer on the website.');
  if (!product.images.length) throw badRequest('This product has no photo to work from.');
  return product;
}

// The generate → inspect loop for one row. Counts once against the plan's Instagram
// post limit, however many attempts it took.
async function render(workspaceId, row, product) {
  const images = await media.imageBackend(workspaceId);
  const references = await media.loadReferenceImages(product.images.slice(0, MAX_REFERENCES), { maxSize: 1024 });
  if (!references.length) throw new Error(`Couldn't download the photo of "${product.title}".`);

  const { jpeg, verdict, attempts } = await media.generateUntilPassed(images, {
    prompt: buildProductImagePrompt(product, { storeName: row.site_name, style: resolveProductStyle(row.style), notes: row.notes }),
    gatePrompt: buildProductVisionPrompt(product),
    references,
    format: 'square',
    attempts: config.instagram.maxRegenAttempts,
  });

  const file = await media.saveImage(jpeg); // the last attempt is kept either way, so a failure can be reviewed
  await media.deleteImage(row.image_file);
  await incrementIgUsage(workspaceId);
  return repo.update(row.id, {
    image_file: file,
    status: verdict.pass ? 'ready' : 'qa_failed',
    qa_score: verdict.score,
    qa_reasons: verdict.reasons,
    attempts,
    error: null,
  });
}

// Renders a claimed row and writes its caption. A failure lands on the row, which
// goes back to where it was if it already had an image.
async function fill(workspaceId, row, product, captionContext) {
  let done;
  try {
    done = await render(workspaceId, row, product);
  } catch (err) {
    return repo.update(row.id, { status: row.image_file && row.prev_status ? row.prev_status : 'failed', error: errText(err) });
  }
  if (done.caption) return done;
  try {
    const ai = await resolveAi(workspaceId, 'article', 'deepseek');
    return await repo.update(row.id, { caption: await buildCaption(captionContext, product, ai) });
  } catch (err) {
    return repo.update(row.id, { error: `The image is ready, but the caption failed: ${errText(err)}` });
  }
}

export async function createProductImage(workspaceId, userId, { siteUrl, productId, accountId, style, notes }) {
  await assertCanGenerateIgPost(workspaceId);
  const store = await storefront.getStoreInfo(siteUrl);
  const product = await findProduct(store.url, productId);
  const row = await repo.create(workspaceId, userId, {
    accountId,
    siteUrl: store.url, siteName: store.name, currency: store.currency,
    productId: product.id, productTitle: product.title, productUrl: product.url, sourceImage: product.images[0],
    style, notes,
  });
  return fill(workspaceId, row, product, { site_url: store.url, site_name: store.name, currency: store.currency });
}

// A fresh attempt at an existing image. Keeps the caption, which may have been edited.
export async function regenerateProductImage(workspaceId, id, { style, notes } = {}) {
  await assertCanGenerateIgPost(workspaceId);
  const claimed = await repo.claim(workspaceId, id, ['ready', 'qa_failed', 'failed'], 'generating');
  if (!claimed) throw badRequest('This image is busy or already posted.');
  const row = await repo.update(claimed.id, { style, notes });
  let product;
  try {
    product = await findProduct(row.site_url, row.product_id);
  } catch (err) {
    return repo.update(row.id, { status: row.prev_status, error: errText(err) });
  }
  return fill(workspaceId, row, product, { site_url: row.site_url, site_name: row.site_name, currency: row.currency });
}

export async function publishProductImage(workspaceId, id, input = {}) {
  const problem = media.publicUrlProblem();
  if (problem) throw badRequest(problem);
  const current = await repo.get(workspaceId, id);
  if (!current) throw badRequest('Image not found', 404);

  const accountId = input.accountId || current.account_id;
  const account = accountId ? await igRepo.getAccountMeta(workspaceId, accountId) : null;
  if (!account) throw badRequest('Pick the Instagram account to post to.');
  const caption = String(input.caption ?? current.caption ?? '').trim().slice(0, MAX_CAPTION);
  if (!caption) throw badRequest('Write a caption first.');

  const row = await repo.claim(workspaceId, id, ['ready'], 'publishing');
  if (!row) throw badRequest('Only images that passed the quality check can be posted.');
  try {
    const { mediaId, permalink } = await publishPost(
      await igRepo.getAccountWithToken(account.id), [media.publicImageUrl(row.image_file)], caption
    );
    return await repo.update(row.id, {
      status: 'published', account_id: account.id, caption, ig_media_id: mediaId, permalink, published_at: new Date(), error: null,
    });
  } catch (err) {
    await repo.update(row.id, { status: 'ready', account_id: account.id, caption, error: errText(err) });
    throw badRequest(errText(err));
  }
}

// ─── Daily jobs (instagram_automations with image_mode = 'ai') ──────────────

// Makes today's image for a leased job. Throws if it can't be used, so the job
// can fall back to the store's own photos rather than miss the day.
export async function renderForAutomation(automation, product, caption) {
  await assertCanGenerateIgPost(automation.workspace_id);
  const row = await repo.create(automation.workspace_id, automation.created_by, {
    accountId: automation.account_id, automationId: automation.id,
    siteUrl: automation.site_url, siteName: automation.site_name, currency: automation.currency,
    productId: product.id, productTitle: product.title, productUrl: product.url, sourceImage: product.images[0],
    style: automation.image_style, notes: automation.image_notes, caption,
  });
  let done;
  try {
    done = await render(automation.workspace_id, row, product);
  } catch (err) {
    await repo.update(row.id, { status: 'failed', error: errText(err) });
    throw err;
  }
  if (done.status !== 'ready') {
    throw new Error(`quality check failed (${done.qa_score}/100${done.qa_reasons?.length ? `: ${done.qa_reasons.join('; ')}` : ''})`);
  }
  return done;
}

export const markPosted = (row, { mediaId, permalink }) =>
  repo.update(row.id, { status: 'published', ig_media_id: mediaId, permalink, published_at: new Date() });
