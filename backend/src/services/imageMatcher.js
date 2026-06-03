// Picks the most relevant EXISTING Shopify product images for an article.
// Pure in-process scoring (keyword/tag/title overlap) — no external API.

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'for', 'to', 'of', 'in', 'on', 'with',
  'how', 'what', 'why', 'best', 'top', 'guide', 'your', 'you', 'is', 'are',
  'this', 'that', 'from', 'about', 'into', 'tips', 'ways', 'using', 'use',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function scoreProduct(topicTokens, product) {
  const titleTokens = tokenize(product.title);
  const typeTokens = tokenize(product.productType);
  const tagTokens = tokenize(product.tags);
  let score = 0;
  for (const t of topicTokens) {
    if (titleTokens.includes(t)) score += 3;
    if (typeTokens.includes(t)) score += 2;
    if (tagTokens.includes(t)) score += 1;
  }
  return score;
}

function shapeImage(product, topic) {
  return {
    src: product.image,
    imageUrl: product.image, // legacy alias used by the UI
    alt: `${product.title}${topic ? ` — ${topic}` : ''}`,
    productHandle: product.handle,
    productTitle: product.title,
    handle: product.handle,
    title: product.title,
  };
}

// Returns the SINGLE most relevant product image as the article's featured/hero image.
// Returns null if no products have an image (caller can fall back to a brand logo).
export function pickFeaturedImage(topic, products = []) {
  const topicTokens = [...new Set(tokenize(topic))];
  const withImages = products.filter((p) => p.image);
  if (withImages.length === 0) return null;

  const ranked = withImages
    .map((p) => ({ product: p, score: scoreProduct(topicTokens, p) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  return shapeImage(top.product, topic);
}

// Inline images for the body. Pass `excludeHandles` to keep the featured product out.
export function selectRelevantImages(topic, products = [], { max = 4, excludeHandles = [] } = {}) {
  const exclude = new Set(excludeHandles.filter(Boolean));
  const topicTokens = [...new Set(tokenize(topic))];
  const withImages = products.filter((p) => p.image && !exclude.has(p.handle));

  const ranked = withImages
    .map((p) => ({ product: p, score: scoreProduct(topicTokens, p) }))
    .sort((a, b) => b.score - a.score);

  const positives = ranked.filter((r) => r.score > 0);
  const chosen = (positives.length ? positives : ranked).slice(0, max);

  return chosen.map(({ product }) => shapeImage(product, topic));
}

export default { pickFeaturedImage, selectRelevantImages };
