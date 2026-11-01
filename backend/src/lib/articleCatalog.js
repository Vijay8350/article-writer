import { rankProducts, tokenize } from '../services/imageMatcher.js';
import { formatPrice } from '../services/storefront.js';

// The part of a store's catalogue an article should know about. The writer used to get
// the first 30 products alphabetically; it now gets the ones relevant to the topic, with
// real prices and details, so it can recommend accurately and link a wider range.

const MAX_PRODUCTS = 24;
const MAX_COLLECTIONS = 10;
const MAX_ARTICLES = 12;
const MAX_LINKS_PER_PAGE = 2;

// Creator collections and the like: real pages, but nothing a reader should be sent to.
const INTERNAL_COLLECTION_RE = /\bugc\b|^home\s?page$|^all\s?products$/i;

function byRelevance(items, topic, text) {
  const tokens = new Set(tokenize(topic));
  const score = (item) => tokenize(text(item)).filter((t) => tokens.has(t)).length;
  return items.map((item) => ({ item, score: score(item), tie: Math.random() }))
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .map((r) => r.item);
}

function productFacts(p, currency) {
  const price = p.price != null ? formatPrice(p.price, currency) : null;
  const was = Number(p.compareAtPrice) > Number(p.price) ? formatPrice(p.compareAtPrice, currency) : null;
  return [
    price && `${price}${was ? ` (was ${was})` : ''}`,
    p.productType,
    p.description,
  ].filter(Boolean).join(' | ');
}

export function relevantCatalog(topic, dna) {
  const currency = dna.shop?.currency;
  return {
    products: rankProducts(topic, dna.products || [], MAX_PRODUCTS).map((p) => ({ ...p, facts: productFacts(p, currency) })),
    collections: byRelevance((dna.collections || []).filter((c) => !INTERNAL_COLLECTION_RE.test(c.title)), topic, (c) => c.title).slice(0, MAX_COLLECTIONS),
    existingArticles: byRelevance(dna.articles || [], topic, (a) => `${a.title} ${a.tags || ''}`).slice(0, MAX_ARTICLES),
  };
}

// Links a model wrote can point at nothing, or send a reader to something unavailable.
// Those lose the link and keep their words, and no page is linked more than twice.
export function repairLinks(html, dna) {
  const live = (list, usable = () => true) => new Set((list || []).filter(usable).map((x) => x.handle));
  const products = live(dna.products, (p) => p.available !== false);
  const collections = live(dna.collections);
  const articles = live(dna.articles);
  const seen = new Map();

  return String(html || '').replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (full, href, label) => {
    const product = href.match(/\/products\/([^/?#"]+)/)?.[1];
    const collection = href.match(/\/collections\/([^/?#"]+)/)?.[1];
    const article = href.match(/\/blogs\/[^/]+\/([^/?#"]+)/)?.[1];
    if (!product && !collection && !article) return full;
    const known = product ? products.has(product) : collection ? collections.has(collection) : articles.has(article);
    const uses = (seen.get(href) || 0) + 1;
    seen.set(href, uses);
    return known && uses <= MAX_LINKS_PER_PAGE ? full : label;
  });
}
