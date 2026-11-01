import { Router } from 'express';
import { getShopInfo, getProducts, getCollections, getBlogs, getArticles, getPages } from '../services/shopify.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace.js';
import * as stores from '../repositories/stores.js';
import * as dnaRepo from '../repositories/dna.js';
import { buildSocialDna } from '../services/socialDna.js';

const router = Router();
router.use(requireAuth, requireWorkspace);

router.get('/', async (req, res, next) => {
  try {
    const dna = await dnaRepo.getDna(req.workspace.id);
    if (!dna) return res.json({ success: true, data: null, message: 'No Business DNA fetched yet.' });
    res.json({ success: true, data: dna });
  } catch (error) { next(error); }
});

router.post('/fetch', requireWorkspaceRole('owner', 'admin', 'member'), async (req, res, next) => {
  try {
    const creds = await stores.getDefaultStore(req.workspace.id);
    if (!creds) {
      return res.status(400).json({ success: false, error: 'No Shopify store connected for this workspace.' });
    }

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
            id: a.id, blogId: blog.id, blogHandle: blog.handle, blogTitle: blog.title,
            title: a.title, handle: a.handle, tags: a.tags,
            publishedAt: a.published_at, summary: a.summary_html, image: a.image,
          }))
        );
      }
    } catch (e) {
      if (e.response?.status === 403) warnings.push('Blogs & Articles: token lacks "read_content" scope.');
    }

    let pages = [];
    try {
      pages = await getPages(creds);
    } catch (e) {
      if (e.response?.status === 403) warnings.push('Pages: token lacks "read_content" scope.');
    }

    const productTypes = [...new Set(products.map(p => p.product_type).filter(Boolean))];
    const vendors = [...new Set(products.map(p => p.vendor).filter(Boolean))];
    const allTags = products.flatMap(p => (p.tags || '').split(',').map(t => t.trim())).filter(Boolean);
    const tagCounts = {};
    allTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag]) => tag);

    const dna = {
      source: 'shopify',
      fetchedAt: new Date().toISOString(),
      warnings,
      shop: {
        name: shop.name, domain: shop.domain, myshopifyDomain: shop.myshopify_domain,
        email: shop.email, country: shop.country_name, currency: shop.currency, timezone: shop.timezone,
        description: shop.description || '',
      },
      analysis: {
        niche: productTypes.length > 0 ? productTypes.slice(0, 3).join(', ') : 'General Store',
        productTypes, vendors, topTags,
        targetAudience: 'Online shoppers interested in ' + (productTypes.slice(0, 2).join(' and ') || 'various products'),
        totalProducts: products.length, totalCollections: collections.length,
        totalArticles: allArticles.length, totalPages: pages.length, totalBlogs: blogs.length,
      },
      blogs: blogs.map(b => ({ id: b.id, title: b.title, handle: b.handle })),
      products: products.map(p => {
        const variant = p.variants?.[0] || {};
        const inStock = (p.variants || []).some(v => !v.inventory_management || v.inventory_policy === 'continue' || v.inventory_quantity > 0);
        return {
          id: p.id, title: p.title, handle: p.handle, productType: p.product_type,
          vendor: p.vendor, tags: p.tags, image: p.images?.[0]?.src || null,
          price: variant.price ?? null,
          compareAtPrice: variant.compare_at_price ?? null,
          description: String(p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240),
          available: p.status === 'active' && Boolean(p.published_at) && inStock,
        };
      }),
      collections,
      articles: allArticles,
      pages: pages.map(p => ({ id: p.id, title: p.title, handle: p.handle })),
    };

    await dnaRepo.saveDna(req.workspace.id, creds.id, dna);
    res.json({ success: true, data: dna });
  } catch (error) { next(error); }
});

// Pulls the store's current collections without rebuilding anything else. If Shopify can't
// be read, the saved list is left alone: a failed sync must never empty it.
router.post('/sync-collections', requireWorkspaceRole('owner', 'admin', 'member'), async (req, res, next) => {
  try {
    const creds = await stores.getDefaultStore(req.workspace.id);
    if (!creds) return res.status(400).json({ success: false, error: 'No Shopify store connected for this workspace.' });
    const current = await dnaRepo.getDna(req.workspace.id);
    if (!current) return res.status(400).json({ success: false, error: 'Fetch your Business DNA first.' });

    let collections;
    try {
      collections = await getCollections(creds, { strict: true });
    } catch (err) {
      const denied = [401, 403].includes(err.response?.status);
      return res.status(denied ? 400 : 502).json({
        success: false,
        error: denied ? "Your Shopify token can't read collections. Check its read_products permission." : "Couldn't reach Shopify, so your collections were not changed. Please try again.",
      });
    }

    const handles = (list) => new Set((list || []).map((c) => c.handle));
    const before = handles(current.collections);
    const now = handles(collections);
    const added = collections.filter((c) => !before.has(c.handle)).map((c) => c.title);
    const removed = (current.collections || []).filter((c) => !now.has(c.handle)).map((c) => c.title);

    const syncedAt = await dnaRepo.saveCollections(req.workspace.id, collections);
    const changes = [added.length && `${added.length} new`, removed.length && `${removed.length} removed`].filter(Boolean);
    res.json({
      success: true,
      data: { collections, syncedAt, added, removed },
      message: changes.length ? `Collections synced: ${changes.join(', ')}` : `Collections are up to date (${collections.length})`,
    });
  } catch (error) { next(error); }
});

// Alternative source: build the DNA from a connected Instagram account and/or the public website.
router.post('/fetch-social', requireWorkspaceRole('owner', 'admin', 'member'), async (req, res, next) => {
  try {
    const { websiteUrl, instagramAccountId } = req.body || {};
    const dna = await buildSocialDna(req.workspace.id, { websiteUrl, instagramAccountId });
    res.json({ success: true, data: dna });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    next(error);
  }
});

router.delete('/', requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
  try {
    await dnaRepo.deleteDna(req.workspace.id);
    res.json({ success: true, message: 'Business DNA cleared' });
  } catch (error) { next(error); }
});

export default router;
