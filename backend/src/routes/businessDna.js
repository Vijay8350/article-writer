import { Router } from 'express';
import { getShopInfo, getProducts, getCollections, getBlogs, getArticles, getPages } from '../services/shopify.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '../data');
const dnaPath = resolve(dataDir, 'businessDna.json');
const router = Router();

// In-memory cache
let cachedDna = null;

// Load from file on startup
try {
  if (existsSync(dnaPath)) {
    cachedDna = JSON.parse(readFileSync(dnaPath, 'utf-8'));
    console.log('📂 Loaded cached Business DNA');
  }
} catch (e) { /* ignore */ }

// Get cached Business DNA
router.get('/', (req, res) => {
  if (!cachedDna) {
    return res.json({ success: true, data: null, message: 'No Business DNA fetched yet. Click "Fetch Business DNA" to start.' });
  }
  res.json({ success: true, data: cachedDna });
});

// Fetch Business DNA from Shopify
router.post('/fetch', async (req, res, next) => {
  try {
    console.log('🧬 Fetching Business DNA...');

    // 1. Shop Info
    const shop = await getShopInfo();
    console.log(`  ✅ Shop: ${shop.name}`);

    // 2. Products
    const products = await getProducts();
    console.log(`  ✅ Products: ${products.length}`);

    // 3. Collections
    const collections = await getCollections();
    console.log(`  ✅ Collections: ${collections.length}`);

    // 4. Blogs & Articles (may fail if token lacks read_content scope)
    let blogs = [];
    let allArticles = [];
    const warnings = [];
    try {
      blogs = await getBlogs();
      console.log(`  ✅ Blogs: ${blogs.length}`);

      for (const blog of blogs) {
        const articles = await getArticles(blog.id);
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
      console.log(`  ✅ Articles: ${allArticles.length}`);
    } catch (e) {
      const is403 = e.response?.status === 403;
      console.warn(`  ⚠️ Blogs/Articles: ${is403 ? 'Access denied (token needs read_content scope)' : e.message}`);
      if (is403) warnings.push('Blogs & Articles: Your access token lacks the "read_content" scope. Add it in Shopify Admin → Settings → Apps → Develop apps → API credentials.');
    }

    // 5. Pages (may fail if token lacks read_content scope)
    let pages = [];
    try {
      pages = await getPages();
      console.log(`  ✅ Pages: ${pages.length}`);
    } catch (e) {
      const is403 = e.response?.status === 403;
      console.warn(`  ⚠️ Pages: ${is403 ? 'Access denied (token needs read_content scope)' : e.message}`);
      if (is403) warnings.push('Pages: Your access token lacks the "read_content" scope.');
    }

    // 6. Analyze business
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

    // Cache to memory and file
    cachedDna = dna;
    try {
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
      writeFileSync(dnaPath, JSON.stringify(dna, null, 2));
    } catch (e) {
      console.warn('Could not write DNA cache:', e.message);
    }

    console.log('🧬 Business DNA fetched successfully!');
    res.json({ success: true, data: dna });
  } catch (error) {
    console.error('❌ Business DNA fetch error:', error.message);
    next(error);
  }
});

// Clear cached DNA
router.delete('/', (req, res) => {
  cachedDna = null;
  try {
    if (existsSync(dnaPath)) {
      writeFileSync(dnaPath, '');
    }
  } catch (e) { /* ignore */ }
  res.json({ success: true, message: 'Business DNA cleared' });
});

// Export for use by article generator
export function getBusinessDna() {
  return cachedDna;
}

export default router;
