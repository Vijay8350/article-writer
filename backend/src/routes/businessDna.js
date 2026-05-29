import { Router } from 'express';
import { getShopInfo, getProducts, getCollections, getBlogs, getArticles, getPages } from '../services/shopify.js';
import { requireAuth } from '../middleware/auth.js';
import * as stores from '../repositories/stores.js';
import * as dnaRepo from '../repositories/dna.js';

const router = Router();
router.use(requireAuth);

// Get this user's cached Business DNA
router.get('/', async (req, res, next) => {
  try {
    const dna = await dnaRepo.getDna(req.user.id);
    if (!dna) {
      return res.json({ success: true, data: null, message: 'No Business DNA fetched yet. Click "Fetch Business DNA" to start.' });
    }
    res.json({ success: true, data: dna });
  } catch (error) {
    next(error);
  }
});

// Fetch Business DNA from this user's Shopify store
router.post('/fetch', async (req, res, next) => {
  try {
    const creds = await stores.getDefaultStore(req.user.id);
    if (!creds) {
      return res.status(400).json({ success: false, error: 'No Shopify store connected. Connect one in Settings first.' });
    }

    console.log(`🧬 Fetching Business DNA for user ${req.user.id}...`);

    const shop = await getShopInfo(creds);
    const products = await getProducts(creds);
    const collections = await getCollections(creds);

    let blogs = [];
    let allArticles = [];
    const warnings = [];
    try {
      blogs = await getBlogs(creds);
      for (const blog of blogs) {
        const articles = await getArticles(creds, blog.id);
        allArticles = allArticles.concat(
          articles.map(a => ({
            id: a.id,
            blogId: blog.id,
            blogHandle: blog.handle,
            blogTitle: blog.title,
            title: a.title,
            handle: a.handle,
            tags: a.tags,
            publishedAt: a.published_at,
            summary: a.summary_html,
            image: a.image,
          }))
        );
      }
    } catch (e) {
      const is403 = e.response?.status === 403;
      if (is403) warnings.push('Blogs & Articles: Your access token lacks the "read_content" scope. Add it in Shopify Admin → Settings → Apps → Develop apps → API credentials.');
    }

    let pages = [];
    try {
      pages = await getPages(creds);
    } catch (e) {
      const is403 = e.response?.status === 403;
      if (is403) warnings.push('Pages: Your access token lacks the "read_content" scope.');
    }

    const productTypes = [...new Set(products.map(p => p.product_type).filter(Boolean))];
    const vendors = [...new Set(products.map(p => p.vendor).filter(Boolean))];
    const allTags = products.flatMap(p => (p.tags || '').split(',').map(t => t.trim())).filter(Boolean);
    const tagCounts = {};
    allTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag]) => tag);

    const dna = {
      fetchedAt: new Date().toISOString(),
      warnings,
      shop: {
        name: shop.name,
        domain: shop.domain,
        myshopifyDomain: shop.myshopify_domain,
        email: shop.email,
        country: shop.country_name,
        currency: shop.currency,
        timezone: shop.timezone,
        description: shop.description || '',
      },
      analysis: {
        niche: productTypes.length > 0 ? productTypes.slice(0, 3).join(', ') : 'General Store',
        productTypes,
        vendors,
        topTags,
        targetAudience: 'Online shoppers interested in ' + (productTypes.slice(0, 2).join(' and ') || 'various products'),
        totalProducts: products.length,
        totalCollections: collections.length,
        totalArticles: allArticles.length,
        totalPages: pages.length,
        totalBlogs: blogs.length,
      },
      blogs: blogs.map(b => ({ id: b.id, title: b.title, handle: b.handle })),
      products: products.map(p => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        productType: p.product_type,
        vendor: p.vendor,
        tags: p.tags,
        image: p.images?.[0]?.src || null,
      })),
      collections,
      articles: allArticles,
      pages: pages.map(p => ({ id: p.id, title: p.title, handle: p.handle })),
    };

    await dnaRepo.saveDna(req.user.id, creds.id, dna);

    console.log('🧬 Business DNA fetched & stored.');
    res.json({ success: true, data: dna });
  } catch (error) {
    console.error('❌ Business DNA fetch error:', error.message);
    next(error);
  }
});

// Clear this user's DNA
router.delete('/', async (req, res, next) => {
  try {
    await dnaRepo.deleteDna(req.user.id);
    res.json({ success: true, message: 'Business DNA cleared' });
  } catch (error) {
    next(error);
  }
});

export default router;
