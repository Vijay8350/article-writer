import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as scheduled from '../repositories/scheduledPosts.js';
import * as stores from '../repositories/stores.js';

const router = Router();
router.use(requireAuth);

// List this user's scheduled posts
router.get('/', async (req, res, next) => {
  try {
    const rows = await scheduled.listForUser(req.user.id);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Queue a new scheduled post
router.post('/', async (req, res, next) => {
  try {
    const { topic, runAt, blogId, wordCount, aiModel } = req.body || {};
    if (!topic || !runAt) {
      return res.status(400).json({ success: false, error: 'topic and runAt are required' });
    }
    const when = new Date(runAt);
    if (isNaN(when.getTime())) {
      return res.status(400).json({ success: false, error: 'runAt must be a valid date/time' });
    }

    const store = await stores.getStoreMeta(req.user.id);
    if (!store) {
      return res.status(400).json({ success: false, error: 'Connect a Shopify store before scheduling.' });
    }

    const row = await scheduled.create(req.user.id, {
      topic,
      runAt: when.toISOString(),
      blogId,
      wordCount,
      aiModel,
      storeId: store.id,
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
});

// Cancel a pending scheduled post
router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await scheduled.cancel(req.user.id, req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Job not found or no longer pending' });
    }
    res.json({ success: true, message: 'Scheduled post cancelled' });
  } catch (error) {
    next(error);
  }
});

export default router;
