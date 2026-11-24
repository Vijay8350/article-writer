import config from '../config/env.js';
import * as repo from '../repositories/productImages.js';
import * as igRepo from '../repositories/instagram.js';
import * as media from './igMedia.js';
import * as compositor from './postCompositor.js';
import * as scene from './productScene.js';
import * as storefront from './storefront.js';
import { publishPost } from './instagram.js';
import { buildCaption } from './productCaption.js';
import { resolveAi } from './ai.js';
import { assertCanGenerateIgPost, incrementIgUsage, assertFeature } from './usage.js';
import {
  buildPostPrompt, buildPostGatePrompt, buildScenePrompt, buildSceneGatePrompt, resolveProductStyle, productBannerCopy, bannerCopyLines,
} from '../lib/igPrompts.js';
import {
  pickDesign, variantOf, planSlides, planSceneSlides, framedSlidePlan, layoutSentence, lookOf, describeDesign, textProblems,
} from '../lib/postDesigns.js';
import { setOf, sceneLayoutSentence } from '../lib/postScenes.js';
import { PRICE_FORMS } from '../lib/imageVariety.js';

// A product on a store's website → a designed 4:5 post → Instagram. When the store has a
// photo of it on a plain backdrop, the model designs the whole scene around the product
// (new backdrop, set or frame, light and words every time) and the real product's pixels
// are laid back over its drawing (services/productScene.js), so the product's design
// can't change. Otherwise the model designs around an empty zone and the photo goes in
// a frame there. Every post takes a new look and set or format (lib/postDesigns.js).
// Only images that pass the gate (status = 'ready') can be posted: fail closed.

const SLIDE_PARALLEL = 3;
const SCENE_SLIDE_PARALLEL = 1; // a scene holds ~150 MB of full-size masks while it works: one at a time on a small server
const MAX_CAPTION = 2200;
const PHOTO_SIZE = 1350; // big enough for a full-width photo without enlarging it
const COLLAGE_PHOTOS = 3; // the lookbook trio shows three of the store's photos
const DESIGN_HISTORY = 40; // enough of an account's past posts to rotate every look

const badRequest = (message, status = 400) => Object.assign(new Error(message), { status });
const errText = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
const allFiles = (row) => [row.image_file, ...(row.extra_image_files || [])].filter(Boolean);
export const imageUrlsOf = (row) => allFiles(row).map(media.publicImageUrl);
export const withUrl = (row) => {
  if (!row) return row;
  const [imageUrl = null, ...extraUrls] = imageUrlsOf(row);
  return { ...row, image_url: imageUrl, extra_urls: extraUrls, design_label: describeDesign(row.variant) };
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
  const priceText = PRICE_FORMS[design.price] || PRICE_FORMS.plain;
  return productBannerCopy(product, {
    price: price ? priceText(price) : null,
    discount: was > Number(product.price) ? `${Math.round((1 - product.price / was) * 100)}% OFF` : null,
    storeName: row.site_name,
    cta: design.cta,
  });
}

// The store's photos of the product, cover first, each with what the compositor needs
// to know about it (lib/postDesigns.js plans from that). Unreadable photos are skipped.
async function loadPhotos(product, count) {
  const want = Math.min(product.images.length, Math.max(count, COLLAGE_PHOTOS));
  const refs = await media.loadReferenceImages(product.images.slice(0, want), { maxSize: PHOTO_SIZE, limit: want });
  const photos = refs.map((r) => Buffer.from(r.data, 'base64'));
  const analyses = [];
  for (const photo of photos) analyses.push(await compositor.analysePhoto(photo)); // one at a time: small server
  return { photos, analyses };
}

// The product's main colour, when the photo is clean enough to tell.
const colourOf = (info) => (info?.plain ? info.colour : null);
const asRef = (jpeg) => ({ data: jpeg.toString('base64'), mimeType: 'image/jpeg' });
const textCheck = (copy) => (copy
  ? (v) => textProblems(v.renderedText, [copy.headline, copy.price, copy.discount, copy.cta], { brand: copy.storeName })
  : null);

// One scene image: the model designs the post around the product of `photo` (on its
// stage), then the real product is laid back over its drawing. A product the model moved
// or redrew fails that attempt; the gate compares the post with the store's own photo.
// `refused` counts the attempts the paste-back refused.
async function renderScene(images, { product, row, photo, info, plan, style, look, set, copy = null, slide = null }) {
  const input = await scene.stageImage(photo, info, plan.place, images.portraitFrame);
  let refused = 0;
  const result = await media.generateUntilPassed(images, {
    prompt: buildScenePrompt(product, {
      storeName: row.site_name, style, look, set, plan, copy, notes: row.notes, slide,
      layout: copy ? sceneLayoutSentence(plan, { discount: Boolean(copy.discount), frame: images.portraitFrame }) : '',
      tall: images.portraitFrame === '2:3', backdrop: scene.backdropName(info.backdrop),
    }),
    gatePrompt: buildSceneGatePrompt({ texts: copy ? bannerCopyLines(copy) : [], brief: row.notes, slide: Boolean(slide) }),
    references: [input],
    compareTo: [asRef(photo)],
    finish: async (art) => {
      const { jpeg, problems } = await scene.layProductBack(art, photo, info, plan.place);
      if (problems.length) refused++;
      return { jpeg, problems };
    },
    format: 'portrait',
    attempts: config.instagram.maxRegenAttempts,
    check: textCheck(copy),
  });
  return { ...result, refused };
}

// One framed slide: the model designs around an empty zone, the photo goes in its frame.
async function renderFramedSlide(images, { product, row, photo, info, plan, style, look, coverRef, slide }) {
  const guide = await compositor.guideImage(plan, images.portraitFrame);
  return media.generateUntilPassed(images, {
    prompt: buildPostPrompt(product, {
      storeName: row.site_name, style, look, notes: row.notes, productColour: colourOf(info),
      slide, tall: images.portraitFrame === '2:3',
    }),
    gatePrompt: buildPostGatePrompt({ brief: row.notes, decor: plan.decor, slide: true }),
    references: [guide, coverRef],
    compareTo: [],
    finish: (art) => compositor.composePost(art, plan, [photo], [info], look),
    format: 'portrait',
    attempts: config.instagram.maxRegenAttempts,
  });
}

// The slides after the cover: the store's other photos of the product, in the cover's
// look. After a scene cover, up to postDesigns.SCENE_SLIDES plain-backdrop photos get a
// scene of their own, the rest go in frames. Scene slides run one at a time (they hold
// big masks while they work), framed ones three at a time beside them; `beat` is called
// after each, so a long carousel keeps its job lease. One that fails its check is left
// out; the slides stay in order.
async function renderExtraSlides({ images, row, product, photos, analyses, cover, design, style, look, recent, beat }) {
  const count = row.images_per_post - 1;
  if (count < 1) return { files: [], skipped: 0 };
  const plans = (design.mode === 'scene' ? planSceneSlides(analyses, count, { cover: design, notes: row.notes, recent }) : planSlides(analyses, count))
    .map((p, i) => ({ ...p, slide: { index: i + 2, total: count + 1 } }));
  // A framed slide sees the cover beside its guide; a scene slide edits only its own
  // stage (a second picture could pull the product out of place) and is told the look.
  const coverRef = asRef(cover);
  const one = async (p) => {
    try {
      const common = { product, row, photo: photos[p.photo], info: analyses[p.photo], style, look, slide: p.slide };
      let result = p.scene
        ? await renderScene(images, { ...common, plan: p.scene, set: setOf(p.set) })
        : await renderFramedSlide(images, { ...common, plan: p.plan, coverRef });
      // the model kept moving or redrawing the product in every scene try: frame the photo
      const framed = p.scene && !result.verdict.pass && result.refused === result.attempts && framedSlidePlan(analyses[p.photo], p.slide.index);
      if (framed) result = await renderFramedSlide(images, { ...common, plan: framed, coverRef });
      const { jpeg, verdict } = result;
      if (!verdict.pass) throw new Error(verdict.reasons[0] || `score ${verdict.score}`);
      return await media.saveImage(jpeg);
    } finally {
      await beat?.();
    }
  };
  const [sceneResults, framedResults] = await Promise.all([
    media.mapLimit(plans.filter((p) => p.scene), SCENE_SLIDE_PARALLEL, one),
    media.mapLimit(plans.filter((p) => !p.scene), SLIDE_PARALLEL, one),
  ]);
  const byPlan = new Map();
  plans.filter((p) => p.scene).forEach((p, k) => byPlan.set(p, sceneResults[k]));
  plans.filter((p) => !p.scene).forEach((p, k) => byPlan.set(p, framedResults[k]));
  const results = plans.map((p) => byPlan.get(p));
  const files = results.filter((r) => typeof r === 'string');
  return { files, skipped: count - files.length, reason: results.find((r) => r?.error)?.error.message };
}

// A framed cover: the model designs around the format's empty zones, the store's photos
// go in them (three for the lookbook trio).
async function renderFramedCover(images, { product, row, photos, analyses, design, style, look, copy }) {
  const used = design.plan.plans.length;
  return media.generateUntilPassed(images, {
    prompt: buildPostPrompt(product, {
      storeName: row.site_name, style, look, copy, notes: row.notes, productColour: colourOf(analyses[0]),
      layout: layoutSentence(design.plan, { discount: Boolean(copy?.discount), frame: images.portraitFrame }), tall: images.portraitFrame === '2:3',
    }),
    gatePrompt: buildPostGatePrompt({ texts: copy ? bannerCopyLines(copy) : [], brief: row.notes, decor: design.plan.decor }),
    references: [await compositor.guideImage(design.plan, images.portraitFrame)],
    compareTo: [],
    finish: (art) => compositor.composePost(art, design.plan, photos.slice(0, used), analyses.slice(0, used), look),
    format: 'portrait',
    attempts: config.instagram.maxRegenAttempts,
    check: textCheck(copy),
  });
}

// The generate → inspect loop for one row: the cover, then any extra slides. Counts
// once against the plan's Instagram post limit, however many images it took. `beat` is
// called between images (it keeps a long render's row and job lease alive).
async function render(workspaceId, row, product, { beat: heartbeat = null } = {}) {
  // a missed heartbeat never fails the render
  const beat = async () => { try { await heartbeat?.(); } catch { /* the next one will do */ } };
  const images = await media.imageBackend(workspaceId);
  const { photos, analyses } = await loadPhotos(product, row.images_per_post);
  if (!photos.length) throw new Error(`Couldn't download the photo of "${product.title}".`);

  // A new look and set (or format) each time, recorded first so a job right behind this
  // one can't pick the same. A carousel already shows several photos, so no trio cover.
  const recent = await repo.recentDesigns(workspaceId, row.account_id, DESIGN_HISTORY);
  const choose = (scenes) => pickDesign(recent, {
    style: row.style, notes: row.notes, analyses, allowCollage: row.images_per_post <= 1, scenes,
  });
  let design = choose(true);
  if (design.error) throw new Error(`No layout can show the photo of "${product.title}" well: ${design.error}.`);
  await repo.update(row.id, { variant: variantOf(design) });

  const coverOf = (d) => {
    const style = resolveProductStyle(d.style);
    const look = lookOf(d.look);
    const copy = style.banner ? bannerCopy(product, row, d) : null;
    const job = d.mode === 'scene'
      ? renderScene(images, { product, row, photo: photos[d.photo], info: analyses[d.photo], plan: d.plan, style, look, set: setOf(d.set), copy })
      : renderFramedCover(images, { product, row, photos, analyses, design: d, style, look, copy });
    return job.then((r) => ({ ...r, style, look }));
  };
  let cover = await coverOf(design);
  await beat();
  // The model kept moving or redrawing this product in every scene attempt: show the
  // real photo in a frame instead, which can't change it.
  if (!cover.verdict.pass && design.mode === 'scene' && cover.refused === cover.attempts) {
    const framed = choose(false);
    if (!framed.error) {
      design = framed;
      await repo.update(row.id, { variant: variantOf(design) });
      cover = await coverOf(design);
      await beat();
    }
  }
  const { jpeg, verdict, style, look } = cover;
  const attempts = cover.attempts;

  const extras = verdict.pass
    ? await renderExtraSlides({ images, row, product, photos, analyses, cover: jpeg, design, style, look, recent, beat })
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
// goes back to where it was (its image and that image's design) if it had one.
async function fill(workspaceId, row, product, captionContext) {
  let done;
  try {
    done = await render(workspaceId, row, product, { beat: () => repo.update(row.id, {}) });
  } catch (err) {
    const back = row.image_file && row.prev_status;
    return repo.update(row.id, { status: back ? row.prev_status : 'failed', error: errText(err), ...(back ? { variant: row.variant || {} } : {}) });
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
  await assertFeature(automation.workspace_id, 'product_posts');
  await assertCanGenerateIgPost(automation.workspace_id);
  const row = await repo.create(automation.workspace_id, automation.created_by, {
    accountId: automation.account_id, automationId: automation.id,
    siteUrl: automation.site_url, siteName: automation.site_name, currency: automation.currency,
    productId: product.id, productTitle: product.title, productUrl: product.url, sourceImage: product.images[0],
    style: automation.image_style, notes: automation.image_notes, caption, imagesPerPost: automation.images_per_post,
  });
  let done;
  try {
    // A long render keeps its row fresh and the job's lease, so nothing else claims either.
    done = await render(automation.workspace_id, row, product, {
      beat: () => Promise.all([repo.update(row.id, {}), igRepo.extendLease(automation.id)]),
    });
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
