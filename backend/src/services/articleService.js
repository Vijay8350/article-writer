import * as geminiService from './gemini.js';
import * as deepseekService from './deepseek.js';
import * as shopifyService from './shopify.js';
import { selectRelevantImages } from './imageMatcher.js';
import * as stores from '../repositories/stores.js';
import * as aiKeysRepo from '../repositories/aiKeys.js';
import * as dnaRepo from '../repositories/dna.js';
import * as usage from './usage.js';
import { calculateSeoScore, countWords } from '../lib/seo.js';

// Loads everything a generation needs for one user.
export async function loadUserContext(userId) {
  const [creds, keys, dna] = await Promise.all([
    stores.getDefaultStore(userId),
    aiKeysRepo.getKeys(userId),
    dnaRepo.getDna(userId),
  ]);
  return { creds, keys, dna };
}

// Core generation used by both the /generate route and the scheduled worker.
// Phase 3 augments this with image selection.
export async function generateArticleForUser(userId, { topic, wordCount, aiModel }) {
  // Enforce the monthly plan cap on every article-creating path.
  await usage.assertCanGenerate(userId);

  const { keys, dna } = await loadUserContext(userId);
  if (!dna) {
    const e = new Error('Business DNA not fetched yet. Fetch it first from the Business DNA page.');
    e.status = 400;
    throw e;
  }

  // Auto-pick the most relevant existing product images for this topic.
  const selectedImages = selectRelevantImages(topic, dna.products || [], { max: 4 });

  const businessContext = {
    storeName: dna.shop.name,
    storeDomain: dna.shop.domain,
    niche: dna.analysis.niche,
    targetAudience: dna.analysis.targetAudience,
    wordCount: wordCount || 1500,
    products: dna.products,
    collections: dna.collections,
    existingArticles: dna.articles,
    selectedImages,
  };

  const useDeepseek = aiModel === 'deepseek';
  const service = useDeepseek ? deepseekService : geminiService;
  const apiKey = (useDeepseek ? keys.deepseekKey : keys.geminiKey) || undefined;

  const article = await service.generateArticle(topic, businessContext, apiKey);

  // Count usage only on a successful generation.
  await usage.incrementUsage(userId);

  const seoScore = calculateSeoScore(article);
  return {
    ...article,
    seoScore,
    aiModel: aiModel || 'gemini',
    wordCount: countWords(article.bodyHtml),
    insertedImages: selectedImages, // surfaced to the UI
  };
}

export async function enhanceArticleForUser(userId, { article, instructions, aiModel }) {
  const { keys, dna } = await loadUserContext(userId);
  const ctx = dna ? {
    storeName: dna.shop.name,
    products: dna.products,
    collections: dna.collections,
  } : {};

  const useDeepseek = aiModel === 'deepseek';
  const service = useDeepseek ? deepseekService : geminiService;
  const apiKey = (useDeepseek ? keys.deepseekKey : keys.geminiKey) || undefined;

  const enhanced = await service.enhanceArticle(
    article,
    instructions || 'Improve SEO, add internal links, make more engaging',
    ctx,
    apiKey
  );
  return { ...enhanced, seoScore: calculateSeoScore(enhanced), wordCount: countWords(enhanced.bodyHtml) };
}

// Instant mode + worker: generate then immediately publish. Single place where
// the monthly-limit check (Phase 5) is enforced for auto-publish paths.
export async function generateAndPublishForUser(userId, { topic, wordCount, aiModel, blogId }) {
  if (!blogId) {
    const e = new Error('A blog must be selected to publish.');
    e.status = 400;
    throw e;
  }
  // The limit check + usage increment happen inside generateArticleForUser, so
  // both instant publish and the scheduled worker are covered automatically.
  const generated = await generateArticleForUser(userId, { topic, wordCount, aiModel });
  const created = await publishArticleForUser(userId, blogId, generated);
  return { generated, created };
}

// Publishes to the user's connected store. Throws 400 if no store connected.
export async function publishArticleForUser(userId, blogId, article) {
  const creds = await stores.getDefaultStore(userId);
  if (!creds) {
    const e = new Error('No Shopify store connected.');
    e.status = 400;
    throw e;
  }
  return shopifyService.createArticle(creds, blogId, {
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
}
