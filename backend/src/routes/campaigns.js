import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import * as campaigns from '../repositories/campaigns.js';
import * as stores from '../repositories/stores.js';

const router = Router();
router.use(requireAuth, requireWorkspace);

const CADENCES = ['manual', 'daily', 'monthly'];
const PUBLISH_MODES = ['live', 'draft'];

router.get('/', async (req, res, next) => {
  try { res.json({ success: true, data: await campaigns.listForWorkspace(req.workspace.id) }); }
  catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, collectionHandle, collectionTitle, cadence, articlesPerRun,
      wordCount, aiModel, blogId, publishMode } = req.body || {};

    if (!collectionTitle) return res.status(400).json({ success: false, error: 'A category/collection is required' });
    if (!blogId) return res.status(400).json({ success: false, error: 'A target blog is required' });
    if (cadence && !CADENCES.includes(cadence)) return res.status(400).json({ success: false, error: 'Invalid cadence' });
    if (publishMode && !PUBLISH_MODES.includes(publishMode)) return res.status(400).json({ success: false, error: 'Invalid publish mode' });

    const store = await stores.getStoreMeta(req.workspace.id);
    if (!store) return res.status(400).json({ success: false, error: 'Connect a Shopify store first' });

    const perRun = Math.min(Math.max(parseInt(articlesPerRun) || 1, 1), 20);

    const row = await campaigns.create(req.workspace.id, req.user.id, {
      name: name || collectionTitle, collectionHandle, collectionTitle,
      cadence: cadence || 'manual', articlesPerRun: perRun,
      wordCount: parseInt(wordCount) || 1500,
      aiModel: aiModel === 'deepseek' ? 'deepseek' : 'gemini',
      blogId, publishMode: publishMode === 'live' ? 'live' : 'draft',
    });
    res.status(201).json({ success: true, data: row });
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
    const row = await campaigns.triggerNow(req.workspace.id, req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, message: `Queued ${row.articles_per_run} article(s).`, data: row });
  } catch (error) { next(error); }
});

router.get('/:id/articles', async (req, res, next) => {
  try { res.json({ success: true, data: await campaigns.listArticles(req.workspace.id, req.params.id) }); }
  catch (error) { next(error); }
});

export default router;
