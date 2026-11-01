import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import * as campaigns from '../repositories/campaigns.js';
import * as stores from '../repositories/stores.js';
import { parseWindow, clampImages } from '../lib/campaignSchedule.js';

const router = Router();
router.use(requireAuth, requireWorkspace);

const CADENCES = ['manual', 'daily', 'monthly'];
const PUBLISH_MODES = ['live', 'draft'];

// Shared by create and edit: { fields } or { error }.
function parseCampaign(body) {
  const { name, collectionHandle, collectionTitle, cadence, articlesPerRun,
    wordCount, aiModel, blogId, publishMode, instructions, imagesPerPost } = body || {};

  if (!collectionTitle) return { error: 'A category/collection is required' };
  if (!blogId) return { error: 'A target blog is required' };
  if (cadence && !CADENCES.includes(cadence)) return { error: 'Invalid cadence' };
  if (publishMode && !PUBLISH_MODES.includes(publishMode)) return { error: 'Invalid publish mode' };
  let window;
  try { window = parseWindow(body); } catch (err) { return { error: err.message }; }

  return {
    fields: {
      ...window,
      instructions: String(instructions || '').trim().slice(0, 2000),
      imagesPerPost: clampImages(imagesPerPost, 3),
      name: String(name || '').trim() || collectionTitle, collectionHandle, collectionTitle,
      cadence: cadence || 'manual',
      articlesPerRun: Math.min(Math.max(parseInt(articlesPerRun) || 1, 1), 20),
      wordCount: parseInt(wordCount) || 1500,
      aiModel: aiModel === 'deepseek' ? 'deepseek' : 'gemini',
      blogId: String(blogId), publishMode: publishMode === 'live' ? 'live' : 'draft',
    },
  };
}

router.get('/', async (req, res, next) => {
  try { res.json({ success: true, data: await campaigns.listForWorkspace(req.workspace.id) }); }
  catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const { fields, error } = parseCampaign(req.body);
    if (error) return res.status(400).json({ success: false, error });

    const store = await stores.getStoreMeta(req.workspace.id);
    if (!store) return res.status(400).json({ success: false, error: 'Connect a Shopify store first' });

    const row = await campaigns.create(req.workspace.id, req.user.id, fields);
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});

// Edits a campaign's settings. Articles already written stay as they are.
router.put('/:id', async (req, res, next) => {
  try {
    const { fields, error } = parseCampaign(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const row = await campaigns.update(req.workspace.id, req.params.id, fields);
    if (!row) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, data: row, message: 'Campaign saved' });
  } catch (error) { next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!['active', 'paused'].includes(status)) return res.status(400).json({ success: false, error: 'status must be active or paused' });
    const ok = await campaigns.setStatus(req.workspace.id, req.params.id, status);
    if (!ok) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, message: `Campaign ${status}` });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await campaigns.remove(req.workspace.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) { next(error); }
});

router.post('/:id/run-now', async (req, res, next) => {
  try {
    const current = await campaigns.getOwned(req.workspace.id, req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'Campaign not found' });
    if (current.ends_at && new Date(current.ends_at) <= new Date()) {
      return res.status(400).json({ success: false, error: 'This campaign has reached its end date. Edit it to extend it.' });
    }
    const row = await campaigns.triggerNow(req.workspace.id, req.params.id);
    res.json({ success: true, message: `Queued ${row.articles_per_run} article(s).`, data: row });
  } catch (error) { next(error); }
});

router.get('/:id/articles', async (req, res, next) => {
  try { res.json({ success: true, data: await campaigns.listArticles(req.workspace.id, req.params.id) }); }
  catch (error) { next(error); }
});

export default router;
