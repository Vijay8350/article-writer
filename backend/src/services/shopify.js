import config from '../config/env.js';
import { ensureFreshToken } from './shopifyTokens.js';
import * as stores from '../repositories/stores.js';

// Every Shopify Admin call goes through graphql() below: the GraphQL Admin API only (Shopify
// requires it of public apps). Each function takes a `creds` object from
// stores.getDefaultStore(); there is no global credential state. Results keep the REST
// shapes the rest of the app was written against: numeric ids, snake_case fields
// (body_html, published_at, image.src, comma-separated tags, ...). GIDs stay in here.

const TIMEOUT_MS = 30000;
const MAX_THROTTLE_RETRIES = 10; // THROTTLED / HTTP 429: wait as long as Shopify's bucket needs
const MAX_SERVER_RETRIES = 3; // 5xx or no answer, for reads only: a write may already have happened
const MIN_WAIT_MS = 100;
const MAX_WAIT_MS = 20000;
const MAX_PARALLEL_PER_SHOP = 2; // the rest queue, so parallel loads don't drain the bucket at once
const PUBLICATION_TTL_MS = 60 * 60 * 1000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hostOf = (creds) => String(creds.storeUrl || creds.shopDomain || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

function ensure(creds) {
  if (!creds || !(creds.storeUrl || creds.shopDomain) || !creds.accessToken) {
    const err = new Error('Shopify store not connected. Go to Settings to connect.');
    err.status = 400;
    throw err;
  }
}

// `response.status` too, because callers written for axios check err.response?.status.
function shopifyError(message, status, extra = {}) {
  return Object.assign(new Error(message), { status, response: { status } }, extra);
}

const notFound = (what) => shopifyError(`That ${what} no longer exists on Shopify.`, 404);

// ─── IDs ────────────────────────────────────────────────────
// gid://shopify/Article/123 ↔ 123. A gid passed in is used as it is.
export function toGid(type, id) {
  const s = String(id ?? '').trim();
  if (s.startsWith('gid://')) return s;
  if (!/^\d+$/.test(s)) throw shopifyError(`That ${type.toLowerCase()} id isn't valid.`, 404);
  return `gid://shopify/${type}/${s}`;
}

export function fromGid(gid) {
  const m = /^gid:\/\/shopify\/[A-Za-z]+\/(\d+)/.exec(String(gid || ''));
  if (!m) return gid ?? null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : m[1];
}

// ─── The one request helper ─────────────────────────────────
// Shopify's error answers, as errors with a status the routes can pass on.
const scopesIn = (text) => [...new Set(String(text || '').match(/\b(?:read|write)_[a-z_]+\b/g) || [])];
const permissionError = (text) => {
  const scopes = scopesIn(text);
  return shopifyError(`The app doesn't have permission for this: ${scopes.length ? scopes.join(' or ') : 'Shopify refused the request'}`, 403, { scopes });
};

function graphqlErrors(errors) {
  const list = Array.isArray(errors) ? errors : [{ message: String(errors) }];
  const message = list.map((e) => e?.message).filter(Boolean).join('; ') || 'Shopify returned an error.';
  const codes = list.map((e) => e?.extensions?.code);
  if (codes.includes('ACCESS_DENIED')) return permissionError(list.map((e) => `${e.message} ${e.extensions?.requiredAccess || ''}`).join(' '));
  if (codes.includes('MAX_COST_EXCEEDED')) return Object.assign(new Error(`Shopify refused a query as too large: ${message}`), { status: 502, code: 'MAX_COST_EXCEEDED' });
  if (/invalid (global )?id|not found/i.test(message)) return shopifyError(`Shopify couldn't find that: ${message}`, 404);
  return Object.assign(new Error(`Shopify returned an error: ${message}`), { status: 502, graphqlErrors: list });
}

// How long Shopify's leaky bucket needs to hold this query again.
function throttleWait(body, attempt) {
  const cost = body?.extensions?.cost;
  const status = cost?.throttleStatus;
  if (status?.restoreRate) {
    const missing = Math.max((cost.requestedQueryCost || 0) - (status.currentlyAvailable || 0), 0);
    return Math.min(Math.max(Math.ceil((missing / status.restoreRate) * 1000) + 50, MIN_WAIT_MS), MAX_WAIT_MS);
  }
  return Math.min(1000 * attempt, MAX_WAIT_MS);
}

const lanes = new Map(); // shop host → { active, queue }
async function inLane(host, fn) {
  let lane = lanes.get(host);
  if (!lane) lanes.set(host, (lane = { active: 0, queue: [] }));
  if (lane.active < MAX_PARALLEL_PER_SHOP) lane.active++;
  else await new Promise((resolve) => lane.queue.push(resolve)); // a finished request hands over its slot
  try {
    return await fn();
  } finally {
    const next = lane.queue.shift();
    if (next) next();
    else if (--lane.active === 0) lanes.delete(host);
  }
}

// Every Admin API request: a fresh token first, then one POST to graphql.json, with
// Shopify's throttling waited out. Returns `data`; any error or refusal throws.
export async function graphql(creds, queryText, variables = {}) {
  ensure(creds);
  const host = hostOf(creds);
  const isMutation = /^\s*mutation\b/.test(queryText);
  return inLane(host, async () => {
    let throttled = 0;
    let failures = 0;
    for (;;) {
      await ensureFreshToken(creds);
      let res;
      try {
        res = await fetch(`https://${host}/admin/api/${config.shopify.apiVersion}/graphql.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': creds.accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: queryText, variables }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        if (!isMutation && ++failures < MAX_SERVER_RETRIES) { await pause(1000 * failures); continue; }
        const code = err.name === 'TimeoutError' ? 'ETIMEDOUT' : err.cause?.code || err.code;
        throw Object.assign(new Error(`Couldn't reach Shopify${code ? ` (${code})` : ''}. Check the store address and try again.`), { status: 502, code });
      }

      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* not JSON */ }

      // Shopify refused the token (revoked, app removed). Not our sign-in failing, so not a 401
      // to the browser (that would sign the user out): 409 + SHOPIFY_RECONNECT, and Settings shows Reconnect.
      if (res.status === 401) {
        if (creds?.id) await stores.markNeedsReconnect(creds.id).catch(() => {});
        throw Object.assign(new Error('Shopify refused access to your store. Reconnect it in Settings.'), { status: 409, code: 'SHOPIFY_RECONNECT', response: { status: 401 } });
      }
      if (res.status === 403) throw permissionError(typeof body?.errors === 'string' ? body.errors : text);
      // 402 (frozen, unpaid) and 423 (locked) become 503: our own 402 means "plan limit reached".
      if (res.status === 402 || res.status === 423) {
        throw Object.assign(new Error("Shopify says this store is frozen or locked, so it isn't answering."), { status: 503, code: 'SHOPIFY_STORE_UNAVAILABLE', response: { status: res.status } });
      }
      if (res.status === 404) throw shopifyError('Store not found on Shopify. Check the store address.', 404);
      if (res.status === 429 && ++throttled <= MAX_THROTTLE_RETRIES) {
        await pause(Math.min(Number(res.headers.get('retry-after')) * 1000 || 1000 * throttled, MAX_WAIT_MS));
        continue;
      }
      if (!body || res.status >= 500 || res.status === 429 || (res.status >= 400 && !body.errors)) {
        if (!isMutation && res.status >= 500 && ++failures < MAX_SERVER_RETRIES) { await pause(1000 * failures); continue; }
        throw Object.assign(new Error(`Shopify didn't answer properly (HTTP ${res.status}). Try again in a moment.`), { status: 502 });
      }

      if (body.errors) {
        const list = Array.isArray(body.errors) ? body.errors : [];
        if (list.some((e) => e?.extensions?.code === 'THROTTLED') && ++throttled <= MAX_THROTTLE_RETRIES) {
          await pause(throttleWait(body, throttled));
          continue;
        }
        throw graphqlErrors(body.errors);
      }
      return body.data;
    }
  });
}

// A mutation, with its userErrors turned into one clear error (422).
async function mutate(creds, queryText, variables, field) {
  const data = await graphql(creds, queryText, variables);
  const payload = data?.[field];
  if (!payload) throw Object.assign(new Error(`Shopify returned no result for ${field}.`), { status: 502 });
  const errors = payload.userErrors || [];
  if (errors.length) {
    const message = errors.map((e) => e.message).filter(Boolean).join('; ');
    throw Object.assign(new Error(`Shopify refused the change: ${message || 'no reason given'}`), { status: 422, userErrors: errors });
  }
  return payload;
}

// Every page of a connection. The query takes $first and $after; `pick` finds the
// connection in the result. A page Shopify calls too costly is asked for again, smaller.
async function allNodes(creds, queryText, pick, { first = 250, variables = {}, after = null } = {}) {
  const nodes = [];
  let size = first;
  let cursor = after;
  for (;;) {
    let data;
    try {
      data = await graphql(creds, queryText, { ...variables, first: size, after: cursor });
    } catch (err) {
      if (err.code === 'MAX_COST_EXCEEDED' && size > 1) { size = Math.max(1, Math.floor(size / 2)); continue; }
      throw err;
    }
    const connection = pick(data);
    nodes.push(...(connection?.nodes || []));
    if (!connection?.pageInfo?.hasNextPage) return nodes;
    cursor = connection.pageInfo.endCursor;
  }
}

// ─── Shapes (GraphQL → the REST-style objects callers use) ──
const tagString = (tags) => (Array.isArray(tags) ? tags.join(', ') : tags || '');
const tagList = (tags) => (Array.isArray(tags) ? tags : String(tags || '').split(',')).map((t) => String(t).trim()).filter(Boolean);
const lower = (value) => (value ? String(value).toLowerCase() : value);
const imageOf = (img) => (img ? { src: img.url, alt: img.altText ?? null, width: img.width ?? null, height: img.height ?? null } : null);

function toArticle(a, blogId) {
  return {
    id: fromGid(a.id),
    blog_id: a.blog?.id ? fromGid(a.blog.id) : fromGid(blogId),
    title: a.title,
    handle: a.handle,
    body_html: a.body ?? '',
    summary_html: a.summary ?? null,
    tags: tagString(a.tags),
    author: a.author?.name ?? null,
    published: Boolean(a.isPublished),
    published_at: a.isPublished ? a.publishedAt : null, // a hidden or scheduled article isn't live yet
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    template_suffix: a.templateSuffix ?? null,
    image: imageOf(a.image),
    admin_graphql_api_id: a.id,
  };
}

function toImage(node, index, productId) {
  return {
    id: fromGid(node.id),
    product_id: productId,
    position: index + 1,
    alt: node.alt ?? null,
    src: node.image?.url ?? null,
    width: node.image?.width ?? null,
    height: node.image?.height ?? null,
    admin_graphql_api_id: node.id,
  };
}

function toVariant(v, productId) {
  return {
    id: fromGid(v.id),
    product_id: productId,
    title: v.title,
    sku: v.sku ?? null,
    position: v.position,
    price: v.price ?? null,
    compare_at_price: v.compareAtPrice ?? null,
    inventory_policy: lower(v.inventoryPolicy), // 'deny' | 'continue'
    inventory_quantity: v.inventoryQuantity ?? 0,
    inventory_management: v.inventoryItem?.tracked ? 'shopify' : null,
    admin_graphql_api_id: v.id,
  };
}

// ─── Shop info ──────────────────────────────────────────────
export async function getShopInfo(creds) {
  const { shop } = await graphql(creds, `query ShopInfo { shop {
    id name email description myshopifyDomain currencyCode ianaTimezone timezoneOffset shopOwnerName
    primaryDomain { host } shopAddress { country countryCodeV2 } } }`);
  return {
    id: fromGid(shop.id),
    name: shop.name,
    email: shop.email,
    description: shop.description || '',
    domain: shop.primaryDomain?.host || shop.myshopifyDomain,
    myshopify_domain: shop.myshopifyDomain,
    country_name: shop.shopAddress?.country ?? null,
    country_code: shop.shopAddress?.countryCodeV2 ?? null,
    currency: shop.currencyCode,
    timezone: shop.ianaTimezone,
    iana_timezone: shop.ianaTimezone,
    timezone_offset: shop.timezoneOffset,
    shop_owner: shop.shopOwnerName,
    admin_graphql_api_id: shop.id,
  };
}

// ─── Blogs ──────────────────────────────────────────────────
export async function getBlogs(creds) {
  const nodes = await allNodes(creds, `query Blogs($first: Int!, $after: String) {
    blogs(first: $first, after: $after) { nodes { id title handle tags templateSuffix createdAt updatedAt }
    pageInfo { hasNextPage endCursor } } }`, (d) => d.blogs);
  return nodes.map((b) => ({
    id: fromGid(b.id), title: b.title, handle: b.handle, tags: tagString(b.tags), template_suffix: b.templateSuffix ?? null,
    created_at: b.createdAt, updated_at: b.updatedAt, admin_graphql_api_id: b.id,
  }));
}

// ─── Articles ───────────────────────────────────────────────
const ARTICLE_FIELDS = `id title handle body summary tags isPublished publishedAt createdAt updatedAt templateSuffix
  author { name } blog { id } image { url altText width height }`;

export async function getArticles(creds, blogId, limit = 250) {
  const blog = toGid('Blog', blogId);
  const nodes = await allNodes(creds, `query BlogArticles($blog: ID!, $first: Int!, $after: String) {
    blog(id: $blog) { articles(first: $first, after: $after) { nodes { ${ARTICLE_FIELDS} } pageInfo { hasNextPage endCursor } } } }`,
  (d) => { if (!d.blog) throw notFound('blog'); return d.blog.articles; },
  { first: Math.max(1, Math.min(Number(limit) || 100, 100)), variables: { blog } });
  return nodes.map((a) => toArticle(a, blog));
}

export async function getArticle(creds, blogId, articleId) {
  const { article } = await graphql(creds, `query Article($id: ID!) { article(id: $id) { ${ARTICLE_FIELDS} } }`, { id: toGid('Article', articleId) });
  if (!article) throw notFound('article');
  return toArticle(article, blogId);
}

// Images this app made arrive as bytes (`attachment`, base64). GraphQL takes only a URL,
// so the bytes go to Shopify's staged upload, become a file, and its CDN URL is used.
const FILE_READY_POLLS = 15;
const FILE_READY_PAUSE_MS = 1000;

function sniffImage(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { mimeType: 'image/png', ext: 'png' };
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return { mimeType: 'image/gif', ext: 'gif' };
  if (bytes.slice(8, 12).toString('ascii') === 'WEBP') return { mimeType: 'image/webp', ext: 'webp' };
  return { mimeType: 'image/jpeg', ext: 'jpg' };
}

async function uploadImageBytes(creds, base64, alt) {
  const bytes = Buffer.from(String(base64), 'base64');
  const { mimeType, ext } = sniffImage(bytes);
  const filename = `article-image-${Date.now()}.${ext}`;
  const staged = await mutate(creds, `mutation StageImage($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }`,
  { input: [{ resource: 'IMAGE', filename, mimeType, httpMethod: 'POST', fileSize: String(bytes.length) }] }, 'stagedUploadsCreate');
  const target = staged.stagedTargets?.[0];
  if (!target?.url || !target.resourceUrl) throw Object.assign(new Error('Shopify gave no place to upload the image.'), { status: 502 });

  const form = new FormData();
  for (const { name, value } of target.parameters || []) form.append(name, value);
  form.append('file', new Blob([bytes], { type: mimeType }), filename);
  const upload = await fetch(target.url, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
  if (!upload.ok) throw Object.assign(new Error(`Shopify's image upload failed (HTTP ${upload.status}).`), { status: 502 });

  const created = await mutate(creds, `mutation CreateImageFile($files: [FileCreateInput!]!) { fileCreate(files: $files) {
    files { id fileStatus ... on MediaImage { image { url } } } userErrors { field message } } }`,
  { files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE', alt: alt || '' }] }, 'fileCreate');
  const file = created.files?.[0];
  if (file?.fileStatus === 'READY' && file.image?.url) return file.image.url;
  if (!file?.id) throw Object.assign(new Error('Shopify did not create the image file.'), { status: 502 });

  for (let poll = 1; poll <= FILE_READY_POLLS; poll++) {
    const { node } = await graphql(creds, `query ImageFile($id: ID!) { node(id: $id) {
      ... on MediaImage { id fileStatus fileErrors { message } image { url } } } }`, { id: file.id });
    if (node?.fileStatus === 'READY' && node.image?.url) return node.image.url;
    if (node?.fileStatus === 'FAILED') {
      throw Object.assign(new Error(`Shopify couldn't process the image: ${node.fileErrors?.map((e) => e.message).join('; ') || 'unknown reason'}`), { status: 502 });
    }
    if (poll < FILE_READY_POLLS) await pause(FILE_READY_PAUSE_MS);
  }
  throw Object.assign(new Error('Shopify is still processing the image.'), { status: 504 });
}

// { src, alt } or { attachment, alt } → ArticleImageInput. An image that can't be uploaded
// leaves the article without one (as a missing hero already does) rather than failing it.
async function articleImage(creds, image) {
  if (!image) return undefined;
  if (image.src || image.url) return { url: image.src || image.url, altText: image.alt ?? image.altText ?? undefined };
  if (!image.attachment) return undefined;
  try {
    return { url: await uploadImageBytes(creds, image.attachment, image.alt), altText: image.alt ?? undefined };
  } catch (err) {
    console.warn(`Article image not uploaded to Shopify: ${err.message}`);
    return undefined;
  }
}

const SEO_KEYS = { seoTitle: 'title_tag', seoDescription: 'description_tag' };
const seoEntries = (ownerId, seo) => Object.entries(SEO_KEYS).filter(([field]) => seo?.[field])
  .map(([field, key]) => ({ ownerId, namespace: 'global', key, type: 'single_line_text_field', value: String(seo[field]) }));

const METAFIELDS_SET = `mutation SetMetafields($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) {
  metafields { id key } userErrors { field message code } } }`;

// SEO fields after an article write. Like the REST version, a failure here is only logged.
async function setArticleSeoQuietly(creds, articleGid, articleData) {
  const metafields = seoEntries(articleGid, articleData);
  if (!metafields.length) return;
  try {
    await mutate(creds, METAFIELDS_SET, { metafields }, 'metafieldsSet');
  } catch (e) {
    console.warn('Failed to set SEO title/description metafields:', e.message);
  }
}

export async function createArticle(creds, blogId, articleData) {
  const article = {
    blogId: toGid('Blog', blogId),
    title: articleData.title,
    body: articleData.bodyHtml,
    author: { name: articleData.author || 'Admin' },
    tags: tagList(articleData.tags),
    isPublished: articleData.published !== false,
  };
  if (articleData.summary) article.summary = articleData.summary;
  if (articleData.handle) article.handle = articleData.handle;
  const image = await articleImage(creds, articleData.image);
  if (image) article.image = image;

  const payload = await mutate(creds, `mutation CreateArticle($article: ArticleCreateInput!) { articleCreate(article: $article) {
    article { ${ARTICLE_FIELDS} } userErrors { field message code } } }`, { article }, 'articleCreate');
  if (!payload.article) throw Object.assign(new Error('Shopify did not create the article.'), { status: 502 });
  await setArticleSeoQuietly(creds, payload.article.id, articleData);
  return toArticle(payload.article, blogId);
}

// Only what's passed changes, so an update never unpublishes, publishes or blanks anything by accident.
export async function updateArticle(creds, blogId, articleId, articleData) {
  const id = toGid('Article', articleId);
  const article = {};
  if (articleData.title !== undefined) article.title = articleData.title;
  if (articleData.bodyHtml !== undefined) article.body = articleData.bodyHtml;
  if (articleData.tags) article.tags = tagList(articleData.tags);
  if (articleData.summary) article.summary = articleData.summary;
  if (articleData.published !== undefined) article.isPublished = articleData.published;
  const image = await articleImage(creds, articleData.image);
  if (image) article.image = image;

  const payload = await mutate(creds, `mutation UpdateArticle($id: ID!, $article: ArticleUpdateInput!) { articleUpdate(id: $id, article: $article) {
    article { ${ARTICLE_FIELDS} } userErrors { field message code } } }`, { id, article }, 'articleUpdate');
  if (!payload.article) throw notFound('article');
  await setArticleSeoQuietly(creds, id, articleData);
  return toArticle(payload.article, blogId);
}

export async function deleteArticle(creds, blogId, articleId) {
  await mutate(creds, `mutation DeleteArticle($id: ID!) { articleDelete(id: $id) { deletedArticleId userErrors { field message code } } }`,
    { id: toGid('Article', articleId) }, 'articleDelete');
  return true;
}

// ─── SEO fields ─────────────────────────────────────────────
// Meta titles and descriptions are the global.title_tag / global.description_tag metafields,
// the same way for every kind of page (Shopify's documented route; Page and Article have
// no `seo` field in the Admin API).
const SEO_OWNER_TYPES = { product: 'Product', collection: 'Collection', page: 'Page', article: 'Article', blog: 'Blog' };

function seoOwner(type, id) {
  const gidType = SEO_OWNER_TYPES[String(type).toLowerCase()];
  if (!gidType) throw Object.assign(new Error(`Unknown page type "${type}".`), { status: 400 });
  return toGid(gidType, id);
}

export async function getResourceSeo(creds, type, id) {
  const { node } = await graphql(creds, `query ResourceSeo($id: ID!) { node(id: $id) { id ... on HasMetafields {
    seoTitle: metafield(namespace: "global", key: "title_tag") { value }
    seoDescription: metafield(namespace: "global", key: "description_tag") { value } } } }`, { id: seoOwner(type, id) });
  if (!node) throw notFound(type);
  return { seoTitle: node.seoTitle?.value || '', seoDescription: node.seoDescription?.value || '' };
}

export const getArticleSeo = (creds, articleId) => getResourceSeo(creds, 'article', articleId);

// Creates each field given or replaces its value; fields left empty aren't touched.
export async function setResourceSeo(creds, type, id, seo) {
  const metafields = seoEntries(seoOwner(type, id), seo);
  if (!metafields.length) return;
  await mutate(creds, METAFIELDS_SET, { metafields }, 'metafieldsSet');
}

// Puts SEO fields back as they were, removing any that didn't exist before.
export async function restoreResourceSeo(creds, type, id, before) {
  const ownerId = seoOwner(type, id);
  await setResourceSeo(creds, type, id, before || {});
  const metafields = Object.entries(SEO_KEYS).filter(([field]) => !before?.[field]).map(([, key]) => ({ ownerId, namespace: 'global', key }));
  if (!metafields.length) return;
  await mutate(creds, `mutation DeleteMetafields($metafields: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $metafields) {
    deletedMetafields { key namespace ownerId } userErrors { field message } } }`, { metafields }, 'metafieldsDelete');
}

export async function setProductBody(creds, productId, bodyHtml) {
  await mutate(creds, `mutation SetProductBody($product: ProductUpdateInput!) { productUpdate(product: $product) {
    product { id } userErrors { field message } } }`, { product: { id: toGid('Product', productId), descriptionHtml: bodyHtml } }, 'productUpdate');
}

// The image id is the MediaImage id getProducts returns. Ids saved before the move to
// GraphQL (REST ProductImage ids) are found through the product's own media.
const FILE_UPDATE = `mutation SetImageAlt($files: [FileUpdateInput!]!) { fileUpdate(files: $files) {
  files { id alt } userErrors { field message code } } }`;

export async function setImageAlt(creds, productId, imageId, alt) {
  const direct = toGid('MediaImage', imageId);
  try {
    await mutate(creds, FILE_UPDATE, { files: [{ id: direct, alt: alt ?? '' }] }, 'fileUpdate');
    return;
  } catch (err) {
    if (![404, 422, 502].includes(err.status)) throw err;
    const media = await allNodes(creds, `query ProductImageIds($id: ID!, $first: Int!, $after: String) { product(id: $id) {
      media(first: $first, after: $after, query: "media_type:IMAGE") { nodes { id ... on MediaImage { image { id } } } pageInfo { hasNextPage endCursor } } } }`,
    (d) => { if (!d.product) throw notFound('product'); return d.product.media; }, { variables: { id: toGid('Product', productId) } });
    const match = media.find((m) => String(fromGid(m.id)) === String(imageId) || String(fromGid(m.image?.id)) === String(imageId));
    if (!match || match.id === direct) throw err;
    await mutate(creds, FILE_UPDATE, { files: [{ id: match.id, alt: alt ?? '' }] }, 'fileUpdate');
  }
}

// ─── Products ───────────────────────────────────────────────
// REST returned every status; the GraphQL products query defaults to active ones.
const ALL_PRODUCT_STATUSES = 'status:active,draft,archived,unlisted';
const PRODUCT_PAGE = 25; // with the nested images and variants this stays under Shopify's 1000-point query limit
const NESTED_IMAGES = 8;
const NESTED_VARIANTS = 5;
const IMAGE_FIELDS = 'id alt image { url width height }';
const VARIANT_FIELDS = 'id title sku position price compareAtPrice inventoryPolicy inventoryQuantity inventoryItem { tracked }';

export async function getProducts(creds, limit = 250) {
  const nodes = await allNodes(creds, `query Products($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      nodes {
        id title handle productType tags vendor descriptionHtml status publishedAt createdAt updatedAt templateSuffix
        media(first: ${NESTED_IMAGES}, query: "media_type:IMAGE") { nodes { ... on MediaImage { ${IMAGE_FIELDS} } } pageInfo { hasNextPage endCursor } }
        variants(first: ${NESTED_VARIANTS}) { nodes { ${VARIANT_FIELDS} } pageInfo { hasNextPage } }
      }
      pageInfo { hasNextPage endCursor } } }`,
  (d) => d.products, { first: Math.max(1, Math.min(Number(limit) || PRODUCT_PAGE, PRODUCT_PAGE)), variables: { query: ALL_PRODUCT_STATUSES } });

  // Products with more images than fit in one page: the rest of each one's media.
  const images = new Map(nodes.map((p) => [p.id, (p.media?.nodes || []).filter((m) => m?.id)]));
  for (const p of nodes.filter((n) => n.media?.pageInfo?.hasNextPage)) {
    const rest = await allNodes(creds, `query ProductImages($id: ID!, $first: Int!, $after: String) { product(id: $id) {
      media(first: $first, after: $after, query: "media_type:IMAGE") { nodes { ... on MediaImage { ${IMAGE_FIELDS} } } pageInfo { hasNextPage endCursor } } } }`,
    (d) => d.product?.media, { first: 100, variables: { id: p.id }, after: p.media.pageInfo.endCursor });
    images.get(p.id).push(...rest.filter((m) => m?.id));
  }

  // Products with more variants: all of theirs, 250 at a time, 50 products per search.
  const variants = new Map(nodes.map((p) => [p.id, p.variants?.nodes || []]));
  const many = nodes.filter((n) => n.variants?.pageInfo?.hasNextPage).map((n) => n.id);
  for (let i = 0; i < many.length; i += 50) {
    const chunk = many.slice(i, i + 50);
    for (const id of chunk) variants.set(id, []);
    const found = await allNodes(creds, `query MoreVariants($first: Int!, $after: String, $query: String) {
      productVariants(first: $first, after: $after, query: $query) { nodes { ${VARIANT_FIELDS} product { id } } pageInfo { hasNextPage endCursor } } }`,
    (d) => d.productVariants, { variables: { query: `product_ids:${chunk.map(fromGid).join(',')}` } });
    for (const v of found) variants.get(v.product?.id)?.push(v);
  }

  return nodes.map((p) => {
    const id = fromGid(p.id);
    const imgs = images.get(p.id).map((m, i) => toImage(m, i, id));
    return {
      id,
      title: p.title,
      handle: p.handle,
      product_type: p.productType,
      vendor: p.vendor,
      tags: tagString(p.tags),
      body_html: p.descriptionHtml,
      status: lower(p.status), // 'active' | 'draft' | 'archived' | 'unlisted'
      published_at: p.publishedAt, // when it went on the online store; null when it isn't there
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      template_suffix: p.templateSuffix ?? null,
      images: imgs,
      image: imgs[0] || null,
      variants: [...variants.get(p.id)].sort((a, b) => (a.position || 0) - (b.position || 0)).map((v) => toVariant(v, id)),
      admin_graphql_api_id: p.id,
    };
  });
}

// ─── Collections ────────────────────────────────────────────
// Since 2026-07 a collection is made of sources rather than being "custom" or "smart";
// `type` keeps the old label: smart when its products come from conditions or other collections.
const isSmart = (c) => (c.sources || []).some((s) => s.__typename === 'CollectionSubCollectionsSource'
  || (s.__typename === 'CollectionConditionsSource' && s.inclusion?.conditions?.length > 0));

// A full DNA build carries on without a list it can't read. `strict` makes a failure
// throw instead, so a sync can't mistake an error for an empty store.
export async function getCollections(creds, { strict = false } = {}) {
  try {
    const [all, published] = await Promise.all([
      allNodes(creds, `query Collections($first: Int!, $after: String) { collections(first: $first, after: $after) {
        nodes { id title handle sources { __typename ... on CollectionConditionsSource { inclusion { conditions { __typename } } } } }
        pageInfo { hasNextPage endCursor } } }`, (d) => d.collections, { first: 100 }),
      allNodes(creds, `query PublishedCollections($first: Int!, $after: String) {
        collections(first: $first, after: $after, query: "published_status:published") { nodes { id } pageInfo { hasNextPage endCursor } } }`,
      (d) => d.collections),
    ]);
    const live = new Set(published.map((c) => c.id));
    const shaped = all.map((c) => ({ id: fromGid(c.id), title: c.title, handle: c.handle, type: isSmart(c) ? 'smart' : 'custom', published: live.has(c.id) }));
    return [...shaped.filter((c) => c.type === 'custom'), ...shaped.filter((c) => c.type === 'smart')];
  } catch (err) {
    if (strict) throw err;
    return [];
  }
}

// How many products each collection holds.
export async function getCollectionProductCounts(creds) {
  const nodes = await allNodes(creds, `query CollectionCounts($first: Int!, $after: String) { collections(first: $first, after: $after) {
    nodes { legacyResourceId productsCount { count } } pageInfo { hasNextPage endCursor } } }`, (d) => d.collections);
  return new Map(nodes.map((c) => [String(c.legacyResourceId), c.productsCount?.count ?? 0]));
}

// Each product's Google description and review count (Shopify's reviews.rating_count, which
// review apps such as Judge.me keep up to date).
export async function getProductSeoAndReviews(creds) {
  const nodes = await allNodes(creds, `query ProductSeoReviews($first: Int!, $after: String) { products(first: $first, after: $after) {
    nodes { legacyResourceId handle status seo { description } reviews: metafield(namespace: "reviews", key: "rating_count") { value } }
    pageInfo { hasNextPage endCursor } } }`, (d) => d.products);
  return new Map(nodes.map((p) => [String(p.legacyResourceId), {
    handle: p.handle, active: p.status === 'ACTIVE', seoDescription: p.seo?.description || '', reviewCount: Number(p.reviews?.value) || 0,
  }]));
}

// The Online Store sales channel's publication, which "published" means everywhere here.
const publicationCache = new Map(); // shop host → { id, at }
const isOnlineStore = (channel) => ['online_store', 'online-store'].includes(channel?.handle)
  || ['online_store', 'online-store'].includes(channel?.app?.handle) || /^online store$/i.test(channel?.name || '');

async function onlineStorePublicationId(creds) {
  const host = hostOf(creds);
  const cached = publicationCache.get(host);
  if (cached && Date.now() - cached.at < PUBLICATION_TTL_MS) return cached.id;
  const publications = await allNodes(creds, `query Publications($first: Int!, $after: String) { publications(first: $first, after: $after) {
    nodes { id channels(first: 5) { nodes { handle name app { handle } } } } pageInfo { hasNextPage endCursor } } }`,
  (d) => d.publications, { first: 50 });
  const found = publications.find((p) => (p.channels?.nodes || []).some(isOnlineStore));
  if (!found) throw Object.assign(new Error("This store's Online Store sales channel wasn't found, so the collection's visibility can't change."), { status: 422 });
  publicationCache.set(host, { id: found.id, at: Date.now() });
  return found.id;
}

// Shows or hides a collection on the Online Store. `collectionType` (custom/smart) no longer
// matters: one mutation handles every collection.
export async function setCollectionPublished(creds, collectionType, id, published) {
  const publicationId = await onlineStorePublicationId(creds);
  const field = published ? 'publishablePublish' : 'publishableUnpublish';
  await mutate(creds, `mutation SetCollectionPublished($id: ID!, $input: [PublicationInput!]!) { ${field}(id: $id, input: $input) {
    userErrors { field message } } }`, { id: toGid('Collection', id), input: [{ publicationId }] }, field);
}

// The names of a few products in a collection, which say what the page really holds.
export async function getCollectionProductTitles(creds, collectionId, limit = 12) {
  const { collection } = await graphql(creds, `query CollectionProductTitles($id: ID!, $first: Int!) { collection(id: $id) {
    products(first: $first) { nodes { title } } } }`, { id: toGid('Collection', collectionId), first: Math.max(1, Math.min(Number(limit) || 12, 250)) });
  if (!collection) throw notFound('collection');
  return collection.products.nodes.map((p) => p.title);
}

// ─── Pages ──────────────────────────────────────────────────
export async function getPages(creds) {
  const nodes = await allNodes(creds, `query Pages($first: Int!, $after: String) { pages(first: $first, after: $after) {
    nodes { id title handle body isPublished publishedAt createdAt updatedAt templateSuffix } pageInfo { hasNextPage endCursor } } }`, (d) => d.pages);
  return nodes.map((p) => ({
    id: fromGid(p.id), title: p.title, handle: p.handle, body_html: p.body ?? '',
    published_at: p.isPublished ? p.publishedAt : null, created_at: p.createdAt, updated_at: p.updatedAt,
    template_suffix: p.templateSuffix ?? null, admin_graphql_api_id: p.id,
  }));
}

// ─── Theme files (read_themes; writing needs write_themes) ──
export async function getAccessScopes(creds) {
  const { currentAppInstallation } = await graphql(creds, 'query AccessScopes { currentAppInstallation { accessScopes { handle } } }');
  return (currentAppInstallation?.accessScopes || []).map((s) => s.handle);
}

const grantedScopes = (creds) => (Array.isArray(creds?.scopes) ? creds.scopes : String(creds?.scopes || '').split(/[\s,]+/)).map((s) => s.trim()).filter(Boolean);

// Whether theme files can be written. A pasted token's scopes aren't recorded, so it gets
// the benefit of the doubt (seoTheme checks them live); the public app has to have been
// granted write_themes.
export function canWriteThemes(creds) {
  const scopes = grantedScopes(creds);
  return scopes.length === 0 || scopes.includes('write_themes');
}

export const THEME_WRITE_UNAVAILABLE_MESSAGE = "Review stars need theme access, which the Shopify app doesn't have yet.";

function assertCanWriteThemes(creds) {
  if (!canWriteThemes(creds)) throw Object.assign(new Error(THEME_WRITE_UNAVAILABLE_MESSAGE), { status: 403, code: 'THEME_WRITE_UNAVAILABLE' });
}

const toTheme = (t) => ({
  id: fromGid(t.id), name: t.name, role: lower(t.role), theme_store_id: t.themeStoreId ?? null, processing: t.processing,
  created_at: t.createdAt, updated_at: t.updatedAt, admin_graphql_api_id: t.id,
});

export async function getMainTheme(creds) {
  const { themes } = await graphql(creds, `query MainTheme { themes(first: 1, roles: [MAIN]) {
    nodes { id name role themeStoreId processing createdAt updatedAt } } }`);
  const theme = themes?.nodes?.[0];
  return theme ? toTheme(theme) : null;
}

export async function listThemeAssetKeys(creds, themeId) {
  const files = await allNodes(creds, `query ThemeFileNames($id: ID!, $first: Int!, $after: String) { theme(id: $id) {
    files(first: $first, after: $after) { nodes { filename } pageInfo { hasNextPage endCursor } } } }`,
  (d) => { if (!d.theme) throw notFound('theme'); return d.theme.files; }, { variables: { id: toGid('OnlineStoreTheme', themeId) } });
  return files.map((f) => f.filename);
}

export async function getThemeAsset(creds, themeId, key) {
  const { theme } = await graphql(creds, `query ThemeFile($id: ID!, $filenames: [String!]) { theme(id: $id) {
    files(filenames: $filenames, first: 1) {
      nodes { filename contentType checksumMd5 size createdAt updatedAt body {
        __typename ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } ... on OnlineStoreThemeFileBodyUrl { url } } } } } }`,
  { id: toGid('OnlineStoreTheme', themeId), filenames: [key] });
  if (!theme) throw notFound('theme');
  const file = theme.files?.nodes?.find((f) => f.filename === key);
  if (!file) return null;
  return {
    key: file.filename,
    value: file.body?.content,
    attachment: file.body?.contentBase64,
    public_url: file.body?.url ?? null,
    content_type: file.contentType,
    checksum: file.checksumMd5 ?? null,
    size: file.size != null ? Number(file.size) : null,
    created_at: file.createdAt,
    updated_at: file.updatedAt,
    theme_id: fromGid(themeId),
  };
}

// Theme writes finish in a background job; waiting keeps a later write (or the live-page
// check) from running ahead of an earlier one.
const JOB_POLLS = 20;
const JOB_POLL_MS = 500;
async function waitForJob(creds, job) {
  if (!job?.id || job.done) return;
  for (let poll = 0; poll < JOB_POLLS; poll++) {
    await pause(JOB_POLL_MS);
    const data = await graphql(creds, 'query ThemeJob($id: ID!) { job(id: $id) { id done } }', { id: job.id }).catch(() => null);
    if (!data || data.job?.done !== false) return;
  }
}

export async function putThemeAsset(creds, themeId, key, value) {
  assertCanWriteThemes(creds);
  const payload = await mutate(creds, `mutation PutThemeFile($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename checksumMd5 size updatedAt } job { id done } userErrors { field filename code message } } }`,
  { themeId: toGid('OnlineStoreTheme', themeId), files: [{ filename: key, body: { type: 'TEXT', value } }] }, 'themeFilesUpsert');
  await waitForJob(creds, payload.job);
  const file = payload.upsertedThemeFiles?.[0];
  return { key, checksum: file?.checksumMd5 ?? null, size: file?.size != null ? Number(file.size) : null, updated_at: file?.updatedAt ?? null, theme_id: fromGid(themeId) };
}

export async function deleteThemeAsset(creds, themeId, key) {
  assertCanWriteThemes(creds);
  await mutate(creds, `mutation DeleteThemeFile($themeId: ID!, $files: [String!]!) { themeFilesDelete(themeId: $themeId, files: $files) {
    deletedThemeFiles { filename } userErrors { field filename code message } } }`,
  { themeId: toGid('OnlineStoreTheme', themeId), files: [key] }, 'themeFilesDelete');
}
