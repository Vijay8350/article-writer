import * as geminiService from './gemini.js';
import * as deepseekService from './deepseek.js';
import * as shopifyService from './shopify.js';
import { selectRelevantImages } from './imageMatcher.js';
import * as stores from '../repositories/stores.js';
import * as aiKeysRepo from '../repositories/aiKeys.js';
import * as dnaRepo from '../repositories/dna.js';
import * as usage from './usage.js';
import * as activity from '../repositories/activity.js';
import { calculateSeoScore, countWords } from '../lib/seo.js';

// Loads everything a generation needs for one workspace.
export async function loadWorkspaceContext(workspaceId) {
  const [creds, keys, dna] = await Promise.all([
    stores.getDefaultStore(workspaceId),
    aiKeysRepo.getKeys(workspaceId),
    dnaRepo.getDna(workspaceId),
  ]);
  return { creds, keys, dna };
}

// `actor` is the user who triggered the action (for activity logging).
export async function generateArticleForWorkspace(workspaceId, { topic, wordCount, aiModel }, actor) {
  await usage.assertCanGenerate(workspaceId);

  const { keys, dna } = await loadWorkspaceContext(workspaceId);
  if (!dna) {
    const e = new Error('Business DNA not fetched yet. Fetch it first from the Business DNA page.');
    e.status = 400;
    throw e;
  }

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

  await usage.incrementUsage(workspaceId);
  if (actor) activity.log(actor, 'generate', article.title);

  const seoScore = calculateSeoScore(article);
  return {
    ...article,
    seoScore,
    aiModel: aiModel || 'gemini',
    wordCount: countWords(article.bodyHtml),
    insertedImages: selectedImages,
  };
}

export async function enhanceArticleForWorkspace(workspaceId, { article, instructions, aiModel }) {
  const { keys, dna } = await loadWorkspaceContext(workspaceId);
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

export async function generateAndPublishForWorkspace(workspaceId, { topic, wordCount, aiModel, blogId }, actor) {
  if (!blogId) {
    const e = new Error('A blog must be selected to publish.');
    e.status = 400;
    throw e;
  }
  const generated = await generateArticleForWorkspace(workspaceId, { topic, wordCount, aiModel }, actor);
  const created = await publishArticleForWorkspace(workspaceId, blogId, generated, actor);
  return { generated, created };
}

export async function publishArticleForWorkspace(workspaceId, blogId, article, actor) {
  const creds = await stores.getDefaultStore(workspaceId);
  if (!creds) {
    const e = new Error('No Shopify store connected.');
    e.status = 400;
    throw e;
  }
  const created = await shopifyService.createArticle(creds, blogId, {
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
  if (actor) activity.log(actor, article.published === false ? 'save_draft' : 'publish', article.title);
  return created;
}
