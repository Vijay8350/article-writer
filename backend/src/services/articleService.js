import * as shopifyService from './shopify.js';
import { resolveAi } from './ai.js';
import { selectRelevantImages, pickFeaturedImage } from './imageMatcher.js';
import { planArticleImages, addAiImages, productImageLimit, stripImagePlaceholders } from './articleImages.js';
import { readHostedImage } from './igMedia.js';
import * as stores from '../repositories/stores.js';
import * as dnaRepo from '../repositories/dna.js';
import * as usage from './usage.js';
import * as activity from '../repositories/activity.js';
import { calculateSeoScore, countWords } from '../lib/seo.js';

export async function loadWorkspaceContext(workspaceId) {
  const [creds, dna] = await Promise.all([
    stores.getDefaultStore(workspaceId),
    dnaRepo.getDna(workspaceId),
  ]);
  return { creds, dna };
}

// ─── FAQ extraction + JSON-LD ───────────────────────────────────────────────
function extractFAQ(html) {
  if (!html) return [];
  const headings = [];
  const hRe = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let m;
  while ((m = hRe.exec(html)) !== null) {
    headings.push({ index: m.index, end: m.index + m[0].length, text: m[1].replace(/<[^>]+>/g, '').trim() });
  }
  const faqIdx = headings.findIndex((h) => /faq|frequently asked|q\s*&\s*a/i.test(h.text));
  if (faqIdx < 0) return [];
  const start = headings[faqIdx].end;
  const end = headings[faqIdx + 1]?.index ?? html.length;
  const section = html.slice(start, end);

  const items = [];
  const qRe = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/gi;
  let q;
  while ((q = qRe.exec(section)) !== null) {
    const question = q[1].replace(/<[^>]+>/g, '').trim();
    const answer = q[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (question && answer) items.push({ question, answer });
  }
  return items;
}

function buildBlogPostingLd({ title, summary, featuredImage, storeName, storeDomain, datePublished, author }) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description: summary || undefined,
    datePublished,
    dateModified: datePublished,
    author: { '@type': 'Person', name: author || (storeName ? `${storeName} Editorial` : 'Editorial') },
    publisher: {
      '@type': 'Organization',
      name: storeName || 'Article Writer',
      ...(storeDomain ? { logo: { '@type': 'ImageObject', url: `https://${storeDomain}/favicon.ico` } } : {}),
    },
  };
  if (featuredImage?.src) ld.image = featuredImage.src;
  return ld;
}

function buildFAQPageLd(faqs) {
  if (!faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

// ─── Core generation ────────────────────────────────────────────────────────
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
    products: dna.products,
    collections: dna.collections,
    existingArticles: dna.articles,
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
  const article = await ai.service.generateArticle(topic, businessContext, ai.apiKey, ai.model);

  await usage.incrementUsage(workspaceId);
  if (actor) activity.log(actor, 'generate', article.title, workspaceId);

  const aiImages = imagePlan.backend ? await addAiImages({ plan: imagePlan, article, topic, dna, brief }) : null;
  if (aiImages) article.bodyHtml = aiImages.bodyHtml;
  const featuredImage = aiImages?.hero || productHero;

  // Build authoritative JSON-LD server-side from the response + featured image.
  const datePublished = new Date().toISOString();
  const faqs = extractFAQ(article.bodyHtml || '');
  const jsonLd = [
    buildBlogPostingLd({
      title: article.title,
      summary: article.summary,
      featuredImage,
      storeName: dna.shop.name,
      storeDomain: dna.shop.domain,
      datePublished,
    }),
    buildFAQPageLd(faqs),
  ].filter(Boolean);

  const seoScore = calculateSeoScore({ ...article, featuredImage });
  const warnings = [
    imagePlan.warning,
    ...(aiImages?.warnings || []),
    !featuredImage && 'No image for the featured/hero slot — article will publish without a main image.',
  ].filter(Boolean);
  return {
    ...article,
    featuredImage,
    insertedImages: inlineImages,
    aiImages: aiImages?.images || [],
    imageMode: imagePlan.mode,
    jsonLd,
    faqExtracted: faqs.length,
    seoScore,
    aiModel: ai.provider,
    wordCount: countWords(article.bodyHtml),
    publishWarning: warnings.join(' ') || undefined,
  };
}

export async function enhanceArticleForWorkspace(workspaceId, { article, instructions, aiModel }) {
  const { dna } = await loadWorkspaceContext(workspaceId);
  const ctx = dna ? {
    storeName: dna.shop.name,
    products: dna.products,
    collections: dna.collections,
  } : {};

  const ai = await resolveAi(workspaceId, 'enhance', aiModel);
  const enhanced = await ai.service.enhanceArticle(
    article,
    instructions || 'Improve SEO, add internal links, make more engaging',
    ctx,
    ai.apiKey,
    ai.model
  );
  return { ...enhanced, seoScore: calculateSeoScore(enhanced), wordCount: countWords(enhanced.bodyHtml) };
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
    bodyHtml: stripImagePlaceholders(article.bodyHtml),
    tags: article.tags,
    summary: article.summary,
    handle: article.handle,
    author: article.author,
    published: article.published !== false,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    image: heroImage,
  });
  if (actor) activity.log(actor, article.published === false ? 'save_draft' : 'publish', article.title, workspaceId);
  return created;
}
