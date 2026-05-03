import { Router } from 'express';
import * as geminiService from '../services/gemini.js';
import * as deepseekService from '../services/deepseek.js';
import * as shopifyService from '../services/shopify.js';
import { getBusinessDna } from './businessDna.js';

const router = Router();

// Generate a new article
router.post('/generate', async (req, res, next) => {
  try {
    const { topic, wordCount, aiModel, blogId } = req.body;
    if (!topic) return res.status(400).json({ success: false, error: 'Topic is required' });

    const dna = getBusinessDna();
    if (!dna) {
      return res.status(400).json({ success: false, error: 'Business DNA not fetched yet. Please fetch it first from the Business DNA page.' });
    }

    const businessContext = {
      storeName: dna.shop.name,
      storeDomain: dna.shop.domain,
      niche: dna.analysis.niche,
      targetAudience: dna.analysis.targetAudience,
      wordCount: wordCount || 1500,
      products: dna.products,
      collections: dna.collections,
      existingArticles: dna.articles,
    };

    console.log(`\n✍️ Generating article with ${aiModel || 'gemini'}...`);
    console.log(`  Topic: ${topic}`);
    console.log(`  Word count: ${wordCount || 1500}`);

    const service = (aiModel === 'deepseek') ? deepseekService : geminiService;
    const article = await service.generateArticle(topic, businessContext);

    // Calculate SEO score
    const seoScore = calculateSeoScore(article);

    console.log(`  ✅ Article generated: "${article.title}"`);
    const actualWords = countWords(article.bodyHtml);
    console.log(`  📊 Word count: ${actualWords} (requested: ${wordCount || 1500})`);
    if (actualWords < (wordCount || 1500) * 0.7) {
      console.warn(`  ⚠️ Article is significantly shorter than requested!`);
    }

    res.json({
      success: true,
      data: {
        ...article,
        seoScore,
        aiModel: aiModel || 'gemini',
        wordCount: countWords(article.bodyHtml),
      },
    });
  } catch (error) {
    console.error('❌ Article generation error:', error.message);
    next(error);
  }
});

// Enhance an existing article
router.post('/enhance', async (req, res, next) => {
  try {
    const { article, instructions, aiModel } = req.body;
    if (!article) return res.status(400).json({ success: false, error: 'Article data is required' });

    const dna = getBusinessDna();
    const ctx = dna ? {
      storeName: dna.shop.name,
      products: dna.products,
      collections: dna.collections,
    } : {};

    const service = (aiModel === 'deepseek') ? deepseekService : geminiService;
    const enhanced = await service.enhanceArticle(article, instructions || 'Improve SEO, add internal links, make more engaging', ctx);
    const seoScore = calculateSeoScore(enhanced);

    res.json({
      success: true,
      data: { ...enhanced, seoScore, wordCount: countWords(enhanced.bodyHtml) },
    });
  } catch (error) {
    next(error);
  }
});

// Publish article to Shopify
router.post('/publish', async (req, res, next) => {
  try {
    const { blogId, article } = req.body;
    if (!blogId || !article) {
      return res.status(400).json({ success: false, error: 'Blog ID and article data are required' });
    }

    const created = await shopifyService.createArticle(blogId, {
      title: article.title,
      bodyHtml: article.bodyHtml,
      tags: article.tags,
      summary: article.summary,
      handle: article.handle,
      author: article.author,
      published: article.published !== false,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      image: article.image || undefined,
    });

    console.log(`📤 Published article: "${created.title}" (ID: ${created.id})`);

    res.json({ success: true, data: created, message: 'Article published to Shopify!' });
  } catch (error) {
    const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error('❌ Publish error:', msg);
    res.status(error.response?.status || 500).json({ success: false, error: `Publish failed: ${msg}` });
  }
});

// Update existing article on Shopify
router.put('/update/:blogId/:articleId', async (req, res, next) => {
  try {
    const { blogId, articleId } = req.params;
    const { article } = req.body;

    const updated = await shopifyService.updateArticle(blogId, articleId, article);
    res.json({ success: true, data: updated, message: 'Article updated!' });
  } catch (error) {
    next(error);
  }
});

// Get existing articles from Shopify
router.get('/existing/:blogId', async (req, res, next) => {
  try {
    const articles = await shopifyService.getArticles(req.params.blogId);
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
    const article = await shopifyService.getArticle(req.params.blogId, req.params.articleId);
    res.json({ success: true, data: article });
  } catch (error) {
    next(error);
  }
});

// Delete article
router.delete('/existing/:blogId/:articleId', async (req, res, next) => {
  try {
    await shopifyService.deleteArticle(req.params.blogId, req.params.articleId);
    res.json({ success: true, message: 'Article deleted' });
  } catch (error) {
    next(error);
  }
});

// SEO score analysis
router.post('/seo-score', (req, res) => {
  const { article } = req.body;
  if (!article) return res.status(400).json({ success: false, error: 'Article data required' });
  const score = calculateSeoScore(article);
  res.json({ success: true, data: score });
});

// ─── SEO Score Calculator ───────────────────────────────────
function calculateSeoScore(article) {
  const checks = [];
  let totalScore = 0;
  const maxScore = 100;

  // 1. Title (15 points)
  const titleLen = (article.title || '').length;
  if (titleLen >= 50 && titleLen <= 70) {
    checks.push({ name: 'Title Length', status: 'pass', score: 15, tip: `${titleLen} chars — perfect!` });
    totalScore += 15;
  } else if (titleLen >= 30 && titleLen <= 80) {
    checks.push({ name: 'Title Length', status: 'warn', score: 10, tip: `${titleLen} chars — aim for 50-70` });
    totalScore += 10;
  } else {
    checks.push({ name: 'Title Length', status: 'fail', score: 0, tip: `${titleLen} chars — should be 50-70` });
  }

  // 2. Meta Title (10 points)
  const seoTitleLen = (article.seoTitle || '').length;
  if (seoTitleLen >= 50 && seoTitleLen <= 60) {
    checks.push({ name: 'SEO Title', status: 'pass', score: 10, tip: `${seoTitleLen} chars — perfect!` });
    totalScore += 10;
  } else if (seoTitleLen > 0) {
    checks.push({ name: 'SEO Title', status: 'warn', score: 5, tip: `${seoTitleLen} chars — aim for 50-60` });
    totalScore += 5;
  } else {
    checks.push({ name: 'SEO Title', status: 'fail', score: 0, tip: 'Missing — add a meta title' });
  }

  // 3. Meta Description (10 points)
  const metaLen = (article.seoDescription || '').length;
  if (metaLen >= 150 && metaLen <= 160) {
    checks.push({ name: 'Meta Description', status: 'pass', score: 10, tip: `${metaLen} chars — perfect!` });
    totalScore += 10;
  } else if (metaLen > 0) {
    checks.push({ name: 'Meta Description', status: 'warn', score: 5, tip: `${metaLen} chars — aim for 150-160` });
    totalScore += 5;
  } else {
    checks.push({ name: 'Meta Description', status: 'fail', score: 0, tip: 'Missing — add a meta description' });
  }

  // 4. Word Count (15 points)
  const words = countWords(article.bodyHtml || '');
  if (words >= 1000) {
    checks.push({ name: 'Word Count', status: 'pass', score: 15, tip: `${words} words — great depth!` });
    totalScore += 15;
  } else if (words >= 500) {
    checks.push({ name: 'Word Count', status: 'warn', score: 10, tip: `${words} words — aim for 1000+` });
    totalScore += 10;
  } else {
    checks.push({ name: 'Word Count', status: 'fail', score: 5, tip: `${words} words — too short, aim for 1000+` });
    totalScore += 5;
  }

  // 5. Headings (15 points)
  const h2Count = ((article.bodyHtml || '').match(/<h2/gi) || []).length;
  const h3Count = ((article.bodyHtml || '').match(/<h3/gi) || []).length;
  if (h2Count >= 3 && h3Count >= 1) {
    checks.push({ name: 'Heading Structure', status: 'pass', score: 15, tip: `${h2Count} H2s, ${h3Count} H3s — well structured!` });
    totalScore += 15;
  } else if (h2Count >= 2) {
    checks.push({ name: 'Heading Structure', status: 'warn', score: 10, tip: `${h2Count} H2s — add more subheadings` });
    totalScore += 10;
  } else {
    checks.push({ name: 'Heading Structure', status: 'fail', score: 0, tip: 'Missing H2/H3 headings' });
  }

  // 6. Internal Links (15 points)
  const links = ((article.bodyHtml || '').match(/<a\s+href/gi) || []).length;
  if (links >= 3) {
    checks.push({ name: 'Internal Links', status: 'pass', score: 15, tip: `${links} links — great for SEO!` });
    totalScore += 15;
  } else if (links >= 1) {
    checks.push({ name: 'Internal Links', status: 'warn', score: 8, tip: `${links} links — add more internal links` });
    totalScore += 8;
  } else {
    checks.push({ name: 'Internal Links', status: 'fail', score: 0, tip: 'No links — add product/collection links' });
  }

  // 7. Images/Placeholders (10 points)
  const images = ((article.bodyHtml || '').match(/<img|article-image-placeholder/gi) || []).length;
  if (images >= 2) {
    checks.push({ name: 'Images', status: 'pass', score: 10, tip: `${images} images — visually rich!` });
    totalScore += 10;
  } else if (images >= 1) {
    checks.push({ name: 'Images', status: 'warn', score: 5, tip: '1 image — add more for engagement' });
    totalScore += 5;
  } else {
    checks.push({ name: 'Images', status: 'fail', score: 0, tip: 'No images — add image placeholders' });
  }

  // 8. Tags (10 points)
  const tagCount = (article.tags || '').split(',').filter(t => t.trim()).length;
  if (tagCount >= 5) {
    checks.push({ name: 'Tags', status: 'pass', score: 10, tip: `${tagCount} tags — well categorized!` });
    totalScore += 10;
  } else if (tagCount >= 2) {
    checks.push({ name: 'Tags', status: 'warn', score: 5, tip: `${tagCount} tags — add more` });
    totalScore += 5;
  } else {
    checks.push({ name: 'Tags', status: 'fail', score: 0, tip: 'Missing or too few tags' });
  }

  return { score: Math.min(totalScore, maxScore), maxScore, checks };
}

function countWords(html) {
  if (!html) return 0;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(' ').length : 0;
}

export default router;
