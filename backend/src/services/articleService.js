import * as shopifyService from './shopify.js';
import { resolveAi } from './ai.js';
import { selectRelevantImages, pickFeaturedImage } from './imageMatcher.js';
import { planArticleImages, addAiImages, productImageLimit, stripImagePlaceholders } from './articleImages.js';
import { readHostedImage } from './igMedia.js';
import * as stores from '../repositories/stores.js';
import * as dnaRepo from '../repositories/dna.js';
import * as usage from './usage.js';
import * as activity from '../repositories/activity.js';
import { calculateSeoScore, calculateAeoScore, countWords } from '../lib/seo.js';
import { structureBody, tidySeoFields, extractFaqs, withFaqSchema, stripFaqSchema } from '../lib/articleStructure.js';
import { relevantCatalog, repairLinks } from '../lib/articleCatalog.js';
import { acceptEdit } from '../lib/articleCraft.js';

const DEFAULT_ENHANCE_INSTRUCTIONS = 'Optimize this article for search engines and AI answer engines: question-led headings, a direct answer under each one, key takeaways and a strong FAQ. Add internal links and keep it human.';
const MIN_KEPT_LENGTH = 0.7; // an edit that loses more than this much of the article is rejected

export async function loadWorkspaceContext(workspaceId) {
  const [creds, dna] = await Promise.all([
    stores.getDefaultStore(workspaceId),
    dnaRepo.getDna(workspaceId),
  ]);
  return { creds, dna };
}

// ─── Core generation ────────────────────────────────────────────────────────
// A second pass over the draft. It only replaces the draft if everything survived, and
// any failure here keeps the draft: an edit can make an article better, never lose it.
async function editDraft(ai, article, context) {
  try {
    const edited = await ai.service.editArticle(article, context, ai.apiKey, ai.model);
    if (!acceptEdit(article, edited)) {
      console.warn(`Editor pass rejected for "${article.title}": it changed the structure or length`);
      return article;
    }
    return { ...article, title: edited.title || article.title, bodyHtml: edited.bodyHtml, summary: edited.summary || article.summary };
  } catch (err) {
    console.warn(`Editor pass skipped for "${article.title}": ${err.message}`);
    return article;
  }
}

// `brief` comes from a campaign: { instructions, imageCount }.
export async function generateArticleForWorkspace(workspaceId, { topic, wordCount, aiModel, primaryKeyword, secondaryKeywords, imageMode, brief }, actor) {
  await usage.assertCanGenerate(workspaceId);

  const { dna } = await loadWorkspaceContext(workspaceId);
  if (!dna) {
    const e = new Error('Business DNA not fetched yet. Fetch it first from the Business DNA page.');
    e.status = 400;
    throw e;
  }

  const imagePlan = await planArticleImages(workspaceId, imageMode, { imageCount: brief?.imageCount });

  // Featured image first (the hero), then inline images excluding that product.
  // With ChatGPT images on, the store photo hero is only the fallback.
  const productHero = pickFeaturedImage(topic, dna.products || []);
  const inlineImages = selectRelevantImages(topic, dna.products || [], {
    max: productImageLimit(imagePlan.mode),
    excludeHandles: productHero ? [productHero.productHandle] : [],
    relevantOnly: Boolean(imagePlan.backend),
  });

  const businessContext = {
    storeName: dna.shop.name,
    storeDomain: dna.shop.domain,
    niche: dna.analysis.niche,
    targetAudience: dna.analysis.targetAudience,
    wordCount: wordCount || 1500,
    ...relevantCatalog(`${topic} ${primaryKeyword || ''}`, dna),
    featuredImage: productHero,
    inlineImages,
    selectedImages: inlineImages, // back-compat with older prompt code paths
    aiImageSlots: imagePlan.slots,
    campaignInstructions: brief?.instructions,
    primaryKeyword: primaryKeyword || topic,
    secondaryKeywords: Array.isArray(secondaryKeywords) ? secondaryKeywords : [],
    brandSummary: dna.brand?.summary,
    brandVoice: dna.brand?.voice,
    brandKeywords: dna.brand?.keywords,
  };

  const ai = await resolveAi(workspaceId, 'article', aiModel);
  const draft = await ai.service.generateArticle(topic, businessContext, ai.apiKey, ai.model);
  const article = await editDraft(ai, draft, businessContext);

  await usage.incrementUsage(workspaceId);
  if (actor) activity.log(actor, 'generate', article.title, workspaceId);

  const aiImages = imagePlan.backend ? await addAiImages({ plan: imagePlan, article, topic, dna, brief }) : null;
  if (aiImages) article.bodyHtml = aiImages.bodyHtml;
  const featuredImage = aiImages?.hero || productHero;

  // Everything a model can't be trusted to do exactly happens here, before scoring.
  const keyword = primaryKeyword || article.primaryKeyword || topic;
  const finished = {
    ...article,
    primaryKeyword: keyword,
    bodyHtml: structureBody(repairLinks(article.bodyHtml, dna)),
    ...tidySeoFields(article, { primaryKeyword: keyword }),
    featuredImage,
  };
  const warnings = [
    imagePlan.warning,
    ...(aiImages?.warnings || []),
    !featuredImage && 'No image for the featured/hero slot — article will publish without a main image.',
  ].filter(Boolean);
  return {
    ...finished,
    insertedImages: inlineImages,
    aiImages: aiImages?.images || [],
    imageMode: imagePlan.mode,
    faqExtracted: extractFaqs(finished.bodyHtml).length,
    seoScore: calculateSeoScore(finished),
    aeoScore: calculateAeoScore(finished),
    aiModel: ai.provider,
    wordCount: countWords(finished.bodyHtml),
    publishWarning: warnings.join(' ') || undefined,
  };
}

export async function enhanceArticleForWorkspace(workspaceId, { article, instructions, aiModel }) {
  const { dna } = await loadWorkspaceContext(workspaceId);
  const ctx = dna ? { storeName: dna.shop.name, ...relevantCatalog(article.title, dna) } : {};

  const originalBody = stripFaqSchema(article.bodyHtml || article.body_html);
  const ai = await resolveAi(workspaceId, 'enhance', aiModel);
  const enhanced = await ai.service.enhanceArticle(
    { ...article, bodyHtml: originalBody },
    instructions || DEFAULT_ENHANCE_INSTRUCTIONS,
    ctx,
    ai.apiKey,
    ai.model
  );

  const bodyHtml = structureBody(repairLinks(stripImagePlaceholders(enhanced.bodyHtml), dna || {}));
  if (countWords(bodyHtml) < countWords(originalBody) * MIN_KEPT_LENGTH) {
    throw Object.assign(new Error('The AI shortened this article too much, so the result was discarded. Please try again.'), { status: 502 });
  }
  const before = (html) => (String(html).match(/<img\b/gi) || []).length;
  const lostImages = before(originalBody) - before(bodyHtml);

  const finished = {
    ...enhanced,
    ...tidySeoFields(enhanced, { keepHandle: true }),
    handle: article.handle, // a published article's URL never changes
    bodyHtml,
    primaryKeyword: article.primaryKeyword,
    featuredImage: article.image || article.featuredImage,
  };
  return {
    ...finished,
    seoScore: calculateSeoScore(finished),
    aeoScore: calculateAeoScore(finished),
    wordCount: countWords(bodyHtml),
    warning: lostImages > 0 ? `The AI removed ${lostImages} image(s) from this article. Check it before updating.` : undefined,
  };
}

// Saves changes to an article already on Shopify, in place: same URL, same status.
export async function updateArticleForWorkspace(workspaceId, blogId, articleId, article) {
  const creds = await stores.getDefaultStore(workspaceId);
  if (!creds) throw Object.assign(new Error('No Shopify store connected.'), { status: 400 });
  return shopifyService.updateArticle(creds, blogId, articleId, {
    ...article,
    bodyHtml: withFaqSchema(stripImagePlaceholders(article.bodyHtml)),
  });
}

export async function generateAndPublishForWorkspace(workspaceId, { topic, wordCount, aiModel, blogId, primaryKeyword, secondaryKeywords, imageMode }, actor) {
  if (!blogId) {
    const e = new Error('A blog must be selected to publish.');
    e.status = 400;
    throw e;
  }
  const generated = await generateArticleForWorkspace(workspaceId, { topic, wordCount, aiModel, primaryKeyword, secondaryKeywords, imageMode }, actor);
  const created = await publishArticleForWorkspace(workspaceId, blogId, generated, actor);
  return { generated, created };
}

// The Shopify hero. Images this app made are uploaded as bytes, which puts them on
// Shopify's CDN and doesn't depend on Shopify being able to reach this server.
async function shopifyHero({ src, alt }) {
  const attachment = await readHostedImage(src);
  return attachment ? { attachment, alt } : { src, alt };
}

export async function publishArticleForWorkspace(workspaceId, blogId, article, actor) {
  const creds = await stores.getDefaultStore(workspaceId);
  if (!creds) {
    const e = new Error('No Shopify store connected.');
    e.status = 400;
    throw e;
  }

  // Use the workflow's featuredImage as the Shopify article's main image when present.
  // Caller may also pass `image` directly (manual override).
  const heroImage = article.image
    ? article.image
    : article.featuredImage
    ? await shopifyHero(article.featuredImage)
    : undefined;

  const created = await shopifyService.createArticle(creds, blogId, {
    title: article.title,
    bodyHtml: withFaqSchema(stripImagePlaceholders(article.bodyHtml)),
    tags: article.tags,
    summary: article.summary,
    handle: article.handle,
    author: article.author || (creds.shopName ? `${creds.shopName} Team` : undefined),
    published: article.published !== false,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    image: heroImage,
  });
  if (actor) activity.log(actor, article.published === false ? 'save_draft' : 'publish', article.title, workspaceId);
  return created;
}
