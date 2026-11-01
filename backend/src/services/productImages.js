import config from '../config/env.js';
import * as repo from '../repositories/productImages.js';
import * as igRepo from '../repositories/instagram.js';
import * as media from './igMedia.js';
import * as storefront from './storefront.js';
import { publishPost } from './instagram.js';
import { buildCaption } from './productCaption.js';
import { resolveAi } from './ai.js';
import { assertCanGenerateIgPost, incrementIgUsage } from './usage.js';
import {
  buildProductImagePrompt, buildBannerVisionPrompt, resolveProductStyle, extraSlideStyles, productBannerCopy, bannerCopyLines,
} from '../lib/igPrompts.js';
import { pickVariant, describeVariant, layoutsAfter } from '../lib/imageVariety.js';

// A product on a store's website → a designed image → Instagram. The model only designs
// around an empty card: the store's real photo is placed on it afterwards, so the
// product's design can't change. Only images that pass the gate (status = 'ready') can
// be posted: fail closed.

const SLIDE_PARALLEL = 3;
const MAX_CAPTION = 2200;

const badRequest = (message, status = 400) => Object.assign(new Error(message), { status });
const errText = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
const allFiles = (row) => [row.image_file, ...(row.extra_image_files || [])].filter(Boolean);
export const imageUrlsOf = (row) => allFiles(row).map(media.publicImageUrl);
export const withUrl = (row) => {
  if (!row) return row;
  const [imageUrl = null, ...extraUrls] = imageUrlsOf(row);
  return { ...row, image_url: imageUrl, extra_urls: extraUrls };
};

async function findProduct(siteUrl, productId) {
  const product = (await storefront.getProducts(siteUrl)).find((p) => p.id === String(productId));
  if (!product) throw badRequest('That product is no longer on the website.');
  if (!product.images.length) throw badRequest('This product has no photo to work from.');
  return product;
}

function bannerCopy(product, row, design) {
  const was = Number(product.compareAtPrice);
  const price = storefront.formatPrice(product.price, row.currency);
  return productBannerCopy(product, {
    price: price ? design.priceText(price) : null,
    discount: was > Number(product.price) ? `${Math.round((1 - product.price / was) * 100)}% OFF` : null,
    storeName: row.site_name,
    cta: design.cta,
  });
}

// The slides after the cover: the store's other photos of the product on new
// backgrounds. One that fails its check is left out.
async function renderExtraSlides({ images, row, product, photos, cover, coverStyle, variant, design }) {
  const count = row.images_per_post - 1;
  if (count < 1) return { files: [], skipped: 0 };
  const styles = extraSlideStyles(coverStyle.key);
  const layouts = layoutsAfter(variant.layout, count);
  const coverRef = { data: cover.toString('base64'), mimeType: 'image/jpeg' };
  const results = await media.mapLimit(layouts, SLIDE_PARALLEL, async (layout, i) => {
    const photo = photos[(i + 1) % photos.length];
    const { jpeg, verdict } = await media.generateUntilPassed(images, {
      prompt: buildProductImagePrompt(product, {
        storeName: row.site_name, style: styles[i % styles.length], slide: { index: i + 2, total: count + 1 }, design,
      }),
      gatePrompt: buildBannerVisionPrompt({ hasCard: true }),
      references: [await media.layoutTemplate(layout), coverRef],
      compareTo: [],
      finish: (art) => media.placeRealPhoto(art, photo, layout, variant.frame),
      format: 'square',
      attempts: config.instagram.maxRegenAttempts,
    });
    if (!verdict.pass) throw new Error(verdict.reasons[0] || `score ${verdict.score}`);
    return media.saveImage(jpeg);
  });
  const files = results.filter((r) => typeof r === 'string');
  return { files, skipped: count - files.length, reason: results.find((r) => r?.error)?.error.message };
}

// The generate → inspect loop for one row: the cover, then any extra slides. Counts
// once against the plan's Instagram post limit, however many images it took.
async function render(workspaceId, row, product) {
  const images = await media.imageBackend(workspaceId);
  const photos = await media.loadReferenceImages(product.images.slice(0, row.images_per_post), { maxSize: 1024, limit: row.images_per_post });
  if (!photos.length) throw new Error(`Couldn't download the photo of "${product.title}".`);

  // A new look each time, recorded first so a job right behind this one can't pick the same.
  const variant = pickVariant(await repo.recentDesigns(workspaceId, row.account_id));
  await repo.update(row.id, { variant });
  const design = describeVariant(variant);

  const style = resolveProductStyle(row.style);
  const copy = style.banner ? bannerCopy(product, row, design) : null;
  const { jpeg, verdict, attempts } = await media.generateUntilPassed(images, {
    prompt: buildProductImagePrompt(product, { storeName: row.site_name, style, notes: row.notes, copy, design }),
    gatePrompt: buildBannerVisionPrompt({ texts: copy ? bannerCopyLines(copy) : [], brief: row.notes, hasCard: true }),
    references: [await media.layoutTemplate(variant.layout)],
    compareTo: [],
    finish: (art) => media.placeRealPhoto(art, photos[0], variant.layout, variant.frame),
    format: 'square',
    attempts: config.instagram.maxRegenAttempts,
  });

  const extras = verdict.pass
    ? await renderExtraSlides({ images, row, product, photos, cover: jpeg, coverStyle: style, variant, design })
    : { files: [], skipped: 0 };
  const file = await media.saveImage(jpeg); // the last attempt is kept either way, so a failure can be reviewed
  await Promise.all(allFiles(row).map(media.deleteImage));
  await incrementIgUsage(workspaceId);
  return repo.update(row.id, {
    image_file: file,
    extra_image_files: extras.files,
    status: verdict.pass ? 'ready' : 'qa_failed',
    qa_score: verdict.score,
    qa_reasons: verdict.reasons,
    attempts,
    error: extras.skipped ? `${extras.skipped} extra image(s) failed the quality check and were left out: ${extras.reason}`.slice(0, 500) : null,
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

export async function createProductImage(workspaceId, userId, { siteUrl, productId, accountId, style, notes, imagesPerPost }) {
  await assertCanGenerateIgPost(workspaceId);
  const store = await storefront.getStoreInfo(siteUrl);
  const product = await findProduct(store.url, productId);
  const row = await repo.create(workspaceId, userId, {
    accountId,
    siteUrl: store.url, siteName: store.name, currency: store.currency,
    productId: product.id, productTitle: product.title, productUrl: product.url, sourceImage: product.images[0],
    style, notes, imagesPerPost,
  });
  return fill(workspaceId, row, product, { site_url: store.url, site_name: store.name, currency: store.currency });
}

// A fresh attempt at an existing image. Keeps the caption, which may have been edited.
export async function regenerateProductImage(workspaceId, id, { style, notes, imagesPerPost } = {}) {
  await assertCanGenerateIgPost(workspaceId);
  const claimed = await repo.claim(workspaceId, id, ['ready', 'qa_failed', 'failed'], 'generating');
  if (!claimed) throw badRequest('This image is busy or already posted.');
  const row = await repo.update(claimed.id, { style, notes, images_per_post: imagesPerPost });
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
    const { mediaId, permalink } = await publishPost(await igRepo.getAccountWithToken(account.id), imageUrlsOf(row), caption);
    return await repo.update(row.id, {
      status: 'published', account_id: account.id, caption, ig_media_id: mediaId, permalink, published_at: new Date(), error: null,
    });
  } catch (err) {
    await repo.update(row.id, { status: 'ready', account_id: account.id, caption, error: errText(err) });
    throw badRequest(errText(err));
  }
}

// ─── Daily jobs (instagram_automations with image_mode = 'ai') ──────────────

// Makes today's post for a leased job. Throws if it can't be used: nothing goes
// out unoptimized, and the job tries again in an hour with the next product.
export async function renderForAutomation(automation, product, caption) {
  await assertCanGenerateIgPost(automation.workspace_id);
  const row = await repo.create(automation.workspace_id, automation.created_by, {
    accountId: automation.account_id, automationId: automation.id,
    siteUrl: automation.site_url, siteName: automation.site_name, currency: automation.currency,
    productId: product.id, productTitle: product.title, productUrl: product.url, sourceImage: product.images[0],
    style: automation.image_style, notes: automation.image_notes, caption, imagesPerPost: automation.images_per_post,
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
