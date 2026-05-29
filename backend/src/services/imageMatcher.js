// Picks the most relevant EXISTING Shopify product images for an article topic.
// Pure in-process scoring (keyword/tag/title overlap) — no external API, cheap
// enough for the small instance. Returns products that HAVE an image.

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
    if (titleTokens.includes(t)) score += 3; // title match weighted highest
    if (typeTokens.includes(t)) score += 2;
    if (tagTokens.includes(t)) score += 1;
  }
  return score;
}

// Returns up to `max` products (with images) ranked by relevance to the topic.
// Shape: [{ title, handle, imageUrl, alt, score }]
export function selectRelevantImages(topic, products = [], { max = 4 } = {}) {
  const topicTokens = [...new Set(tokenize(topic))];
  const withImages = products.filter((p) => p.image);

  const ranked = withImages
    .map((p) => ({ product: p, score: scoreProduct(topicTokens, p) }))
    .sort((a, b) => b.score - a.score);

  // Prefer matches; if nothing scores, fall back to the first few products so
  // the article still gets real imagery rather than placeholders.
  const positives = ranked.filter((r) => r.score > 0);
  const chosen = (positives.length ? positives : ranked).slice(0, max);

  return chosen.map(({ product, score }) => ({
    title: product.title,
    handle: product.handle,
    imageUrl: product.image,
    alt: product.title,
    score,
  }));
}

export default { selectRelevantImages };
