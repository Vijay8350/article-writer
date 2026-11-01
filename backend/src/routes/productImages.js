import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as repo from '../repositories/productImages.js';
import * as igRepo from '../repositories/instagram.js';
import * as dnaRepo from '../repositories/dna.js';
import * as storefront from '../services/storefront.js';
import * as media from '../services/igMedia.js';
import {
  createProductImage, regenerateProductImage, publishProductImage, withUrl,
} from '../services/productImages.js';
import { PRODUCT_IMAGE_STYLES, isProductStyle } from '../lib/igPrompts.js';
import { clampImages } from '../lib/campaignSchedule.js';

// AI product images (/api/product-images). Everyone in the workspace can browse
// and generate; posting and deleting need owner/admin, like Instagram Studio.

const router = Router();
router.use(requireAuth, requireWorkspace);
const manage = requireWorkspaceRole('owner', 'admin');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PICKER_PRODUCTS = 300;
const MAX_NOTES = 500;

const bad = (res, error, status = 400) => res.status(status).json({ success: false, error });

function fail(res, next, err) {
  if (err.code === 'LIMIT_REACHED') return res.status(402).json({ success: false, error: err.message, code: 'LIMIT_REACHED' });
  if (err.status) return bad(res, err.message, err.status);
  return next(err);
}

// A failed generation still has a row to show, so it comes back as a warning.
const sendRow = (res, row, failedMessage, message) =>
  res.json({
    success: true,
    data: withUrl(row),
    ...(row.status === 'ready' && !row.error ? { message } : { warning: row.error || failedMessage }),
  });

const cleanStyle = (style) => (isProductStyle(style) ? style : null);
const cleanNotes = (notes) => String(notes || '').trim().slice(0, MAX_NOTES) || null;

async function accountFor(req) {
  const id = req.body?.accountId;
  if (!id) return null;
  if (!UUID_RE.test(id) || !(await igRepo.getAccountMeta(req.workspace.id, id))) {
    throw Object.assign(new Error('Pick a connected Instagram account'), { status: 400 });
  }
  return id;
}

router.param('id', (req, res, next, id) => (UUID_RE.test(id) ? next() : bad(res, 'Image not found', 404)));

// What the page needs to start: is the image engine ready, the styles, a website to suggest.
router.get('/status', async (req, res, next) => {
  try {
    const images = await (async () => {
      try {
        const backend = await media.imageBackend(req.workspace.id);
        return { provider: backend.provider, ...(await backend.check()) };
      } catch (err) { return { ok: false, detail: err.message }; }
    })();
    const [jobs, dna] = await Promise.all([igRepo.listAutomations(req.workspace.id), dnaRepo.getDna(req.workspace.id)]);
    const publishProblem = media.publicUrlProblem();
    res.json({
      success: true,
      data: {
        images,
        styles: PRODUCT_IMAGE_STYLES.map(({ key, label }) => ({ key, label })),
        defaultSite: jobs[0]?.site_url || dna?.shop?.domain || '',
        publishing: { ok: !publishProblem, detail: publishProblem },
      },
    });
  } catch (error) { next(error); }
});

// In-stock products with a photo, newest first, trimmed for the picker.
router.get('/products', async (req, res, next) => {
  try {
    if (!req.query.site) return bad(res, 'Website URL is required');
    let store;
    try { store = await storefront.getStoreInfo(req.query.site); }
    catch (err) { return bad(res, err.status ? err.message : 'That website address is not valid.'); }
    const products = (await storefront.getProducts(store.url))
      .filter((p) => p.available && p.images.length)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, MAX_PICKER_PRODUCTS)
      .map((p) => ({
        id: p.id, title: p.title, url: p.url, image: p.images[0],
        price: storefront.formatPrice(p.price, store.currency),
      }));
    res.json({ success: true, data: { store, products } });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try { res.json({ success: true, data: (await repo.list(req.workspace.id)).map(withUrl) }); }
  catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const { siteUrl, productId, style, notes, imagesPerPost } = req.body || {};
    if (!siteUrl || !productId) return bad(res, 'Pick a website and a product');
    const row = await createProductImage(req.workspace.id, req.user.id, {
      siteUrl, productId, accountId: await accountFor(req), style: cleanStyle(style), notes: cleanNotes(notes),
      imagesPerPost: clampImages(imagesPerPost),
    });
    sendRow(res, row, 'The image failed the quality check.', 'Image ready');
  } catch (err) { fail(res, next, err); }
});

router.post('/:id/regenerate', async (req, res, next) => {
  try {
    const { style, notes } = req.body || {};
    const row = await regenerateProductImage(req.workspace.id, req.params.id, {
      style: style === undefined ? undefined : cleanStyle(style),
      notes: notes === undefined ? undefined : cleanNotes(notes),
    });
    sendRow(res, row, 'The new image failed the quality check.', 'New image ready');
  } catch (err) { fail(res, next, err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!(await repo.get(req.workspace.id, req.params.id))) return bad(res, 'Image not found', 404);
    const { caption } = req.body || {};
    const row = await repo.update(req.params.id, {
      account_id: req.body?.accountId === undefined ? undefined : await accountFor(req),
      caption: caption === undefined ? undefined : String(caption).slice(0, 2200),
    });
    res.json({ success: true, data: withUrl(row), message: 'Saved' });
  } catch (err) { fail(res, next, err); }
});

router.post('/:id/publish', manage, async (req, res, next) => {
  try {
    const row = await publishProductImage(req.workspace.id, req.params.id, {
      accountId: await accountFor(req), caption: req.body?.caption,
    });
    res.json({ success: true, data: withUrl(row), message: 'Posted to Instagram' });
  } catch (err) { fail(res, next, err); }
});

router.delete('/:id', manage, async (req, res, next) => {
  try {
    const row = await repo.remove(req.workspace.id, req.params.id);
    if (!row) return bad(res, 'Image not found or busy', 404);
    await Promise.all([row.image_file, ...(row.extra_image_files || [])].map(media.deleteImage));
    res.json({ success: true, message: 'Image deleted' });
  } catch (error) { next(error); }
});

export default router;
