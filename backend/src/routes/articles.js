import { Router } from 'express';
import * as shopifyService from '../services/shopify.js';
import * as articleService from '../services/articleService.js';
import * as stores from '../repositories/stores.js';
import { calculateSeoScore } from '../lib/seo.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';

const router = Router();
router.use(requireAuth, requireWorkspace);

async function getCreds(req, res) {
  const creds = await stores.getDefaultStore(req.workspace.id);
  if (!creds) {
    res.status(400).json({ success: false, error: 'No Shopify store connected. Connect one in Settings.' });
    return null;
  }
  return creds;
}

router.post('/generate', async (req, res, next) => {
  try {
    const { topic, wordCount, aiModel } = req.body || {};
    if (!topic) return res.status(400).json({ success: false, error: 'Topic is required' });
    const result = await articleService.generateArticleForWorkspace(
      req.workspace.id, { topic, wordCount, aiModel }, req.user.id
    );
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.code === 'LIMIT_REACHED') {
      return res.status(402).json({ success: false, error: error.message, code: 'LIMIT_REACHED' });
    }
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    next(error);
  }
});

router.post('/generate-and-publish', async (req, res, next) => {
  try {
    const { topic, wordCount, aiModel, blogId } = req.body || {};
    if (!topic) return res.status(400).json({ success: false, error: 'Topic is required' });
    if (!blogId) return res.status(400).json({ success: false, error: 'Blog ID is required' });
    const { generated, created } = await articleService.generateAndPublishForWorkspace(
      req.workspace.id, { topic, wordCount, aiModel, blogId }, req.user.id
    );
    res.json({ success: true, data: { article: generated, published: created }, message: 'Generated & published!' });
  } catch (error) {
    if (error.code === 'LIMIT_REACHED') {
      return res.status(402).json({ success: false, error: error.message, code: 'LIMIT_REACHED' });
    }
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    res.status(error.response?.status || 500).json({ success: false, error: msg });
  }
});

router.post('/enhance', async (req, res, next) => {
  try {
    const { article, instructions, aiModel } = req.body || {};
    if (!article) return res.status(400).json({ success: false, error: 'Article data is required' });
    const result = await articleService.enhanceArticleForWorkspace(req.workspace.id, { article, instructions, aiModel });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

router.post('/publish', async (req, res, next) => {
  try {
    const { blogId, article } = req.body || {};
    if (!blogId || !article) return res.status(400).json({ success: false, error: 'Blog ID and article are required' });
    const created = await articleService.publishArticleForWorkspace(req.workspace.id, blogId, article, req.user.id);
    res.json({ success: true, data: created, message: 'Article published to Shopify!' });
  } catch (error) {
    const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    res.status(error.response?.status || error.status || 500).json({ success: false, error: `Publish failed: ${msg}` });
  }
});

router.put('/update/:blogId/:articleId', async (req, res, next) => {
  try {
    const creds = await getCreds(req, res); if (!creds) return;
    const updated = await shopifyService.updateArticle(creds, req.params.blogId, req.params.articleId, req.body?.article);
    res.json({ success: true, data: updated, message: 'Article updated!' });
  } catch (error) { next(error); }
});

router.get('/existing/:blogId', async (req, res, next) => {
  try {
    const creds = await getCreds(req, res); if (!creds) return;
    const articles = await shopifyService.getArticles(creds, req.params.blogId);
    res.json({
      success: true,
      data: articles.map(a => ({
        id: a.id, title: a.title, handle: a.handle, tags: a.tags, author: a.author,
        publishedAt: a.published_at, createdAt: a.created_at, updatedAt: a.updated_at,
        summary: a.summary_html, image: a.image, bodyHtml: a.body_html,
      })),
    });
  } catch (error) { next(error); }
});

router.get('/existing/:blogId/:articleId', async (req, res, next) => {
  try {
    const creds = await getCreds(req, res); if (!creds) return;
    res.json({ success: true, data: await shopifyService.getArticle(creds, req.params.blogId, req.params.articleId) });
  } catch (error) { next(error); }
});

router.delete('/existing/:blogId/:articleId', async (req, res, next) => {
  try {
    const creds = await getCreds(req, res); if (!creds) return;
    await shopifyService.deleteArticle(creds, req.params.blogId, req.params.articleId);
    res.json({ success: true, message: 'Article deleted' });
  } catch (error) { next(error); }
});

router.get('/blogs', async (req, res, next) => {
  try {
    const creds = await getCreds(req, res); if (!creds) return;
    const blogs = await shopifyService.getBlogs(creds);
    res.json({ success: true, data: blogs.map(b => ({ id: b.id, title: b.title, handle: b.handle })) });
  } catch (error) { next(error); }
});

router.post('/seo-score', (req, res) => {
  if (!req.body?.article) return res.status(400).json({ success: false, error: 'Article required' });
  res.json({ success: true, data: calculateSeoScore(req.body.article) });
});

export default router;
