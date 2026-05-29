import { Router } from 'express';
import * as shopifyService from '../services/shopify.js';
import * as articleService from '../services/articleService.js';
import * as stores from '../repositories/stores.js';
import { calculateSeoScore } from '../lib/seo.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Loads the current user's Shopify creds or sends a 400.
async function getCreds(req, res) {
  const creds = await stores.getDefaultStore(req.user.id);
  if (!creds) {
    res.status(400).json({ success: false, error: 'No Shopify store connected. Connect one in Settings.' });
    return null;
  }
  return creds;
}

// Generate a new article
router.post('/generate', async (req, res, next) => {
  try {
    const { topic, wordCount, aiModel } = req.body || {};
    if (!topic) return res.status(400).json({ success: false, error: 'Topic is required' });

    const result = await articleService.generateArticleForUser(req.user.id, { topic, wordCount, aiModel });
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.code === 'LIMIT_REACHED') {
      return res.status(402).json({ success: false, error: error.message, code: 'LIMIT_REACHED' });
    }
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    console.error('❌ Article generation error:', error.message);
    next(error);
  }
});

// Instant: generate AND publish in one request
router.post('/generate-and-publish', async (req, res, next) => {
  try {
    const { topic, wordCount, aiModel, blogId } = req.body || {};
    if (!topic) return res.status(400).json({ success: false, error: 'Topic is required' });
    if (!blogId) return res.status(400).json({ success: false, error: 'Blog ID is required' });

    const { generated, created } = await articleService.generateAndPublishForUser(req.user.id, {
      topic, wordCount, aiModel, blogId,
    });
    res.json({ success: true, data: { article: generated, published: created }, message: 'Generated & published!' });
  } catch (error) {
    if (error.code === 'LIMIT_REACHED') {
      return res.status(402).json({ success: false, error: error.message, code: 'LIMIT_REACHED' });
    }
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error('❌ Generate-and-publish error:', msg);
    res.status(error.response?.status || 500).json({ success: false, error: msg });
  }
});

// Enhance an existing article
router.post('/enhance', async (req, res, next) => {
  try {
    const { article, instructions, aiModel } = req.body || {};
    if (!article) return res.status(400).json({ success: false, error: 'Article data is required' });

    const result = await articleService.enhanceArticleForUser(req.user.id, { article, instructions, aiModel });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Publish article to Shopify
router.post('/publish', async (req, res, next) => {
  try {
    const { blogId, article } = req.body || {};
    if (!blogId || !article) {
      return res.status(400).json({ success: false, error: 'Blog ID and article data are required' });
    }

    const created = await articleService.publishArticleForUser(req.user.id, blogId, article);
    console.log(`📤 Published article: "${created.title}" (ID: ${created.id})`);
    res.json({ success: true, data: created, message: 'Article published to Shopify!' });
  } catch (error) {
    const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error('❌ Publish error:', msg);
    res.status(error.response?.status || error.status || 500).json({ success: false, error: `Publish failed: ${msg}` });
  }
});

// Update existing article on Shopify
router.put('/update/:blogId/:articleId', async (req, res, next) => {
  try {
    const creds = await getCreds(req, res);
    if (!creds) return;
    const { blogId, articleId } = req.params;
    const { article } = req.body || {};
    const updated = await shopifyService.updateArticle(creds, blogId, articleId, article);
    res.json({ success: true, data: updated, message: 'Article updated!' });
  } catch (error) {
    next(error);
  }
});

// Get existing articles from Shopify
router.get('/existing/:blogId', async (req, res, next) => {
  try {
    const creds = await getCreds(req, res);
    if (!creds) return;
    const articles = await shopifyService.getArticles(creds, req.params.blogId);
    res.json({
      success: true,
      data: articles.map(a => ({
        id: a.id,
        title: a.title,
        handle: a.handle,
        tags: a.tags,
        author: a.author,
        publishedAt: a.published_at,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        summary: a.summary_html,
        image: a.image,
        bodyHtml: a.body_html,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Get single article
router.get('/existing/:blogId/:articleId', async (req, res, next) => {
  try {
    const creds = await getCreds(req, res);
    if (!creds) return;
    const article = await shopifyService.getArticle(creds, req.params.blogId, req.params.articleId);
    res.json({ success: true, data: article });
  } catch (error) {
    next(error);
  }
});

// Delete article
router.delete('/existing/:blogId/:articleId', async (req, res, next) => {
  try {
    const creds = await getCreds(req, res);
    if (!creds) return;
    await shopifyService.deleteArticle(creds, req.params.blogId, req.params.articleId);
    res.json({ success: true, message: 'Article deleted' });
  } catch (error) {
    next(error);
  }
});

// Get this user's blogs (needed by the UI to pick a publish target)
router.get('/blogs', async (req, res, next) => {
  try {
    const creds = await getCreds(req, res);
    if (!creds) return;
    const blogs = await shopifyService.getBlogs(creds);
    res.json({ success: true, data: blogs.map(b => ({ id: b.id, title: b.title, handle: b.handle })) });
  } catch (error) {
    next(error);
  }
});

// SEO score analysis
router.post('/seo-score', (req, res) => {
  const { article } = req.body || {};
  if (!article) return res.status(400).json({ success: false, error: 'Article data required' });
  res.json({ success: true, data: calculateSeoScore(article) });
});

export default router;
