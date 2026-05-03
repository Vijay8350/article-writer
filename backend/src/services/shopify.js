import axios from 'axios';
import config from '../config/env.js';

// Runtime credentials that can be updated from the UI
let runtimeCredentials = {
  storeUrl: config.shopify.storeUrl,
  accessToken: config.shopify.accessToken,
};

export function setShopifyCredentials(storeUrl, accessToken) {
  runtimeCredentials = { storeUrl, accessToken };
}

export function getShopifyCredentials() {
  return { ...runtimeCredentials };
}

function getHeaders() {
  return {
    'X-Shopify-Access-Token': runtimeCredentials.accessToken,
    'Content-Type': 'application/json',
  };
}

function getBaseUrl() {
  const url = runtimeCredentials.storeUrl.replace(/\/$/, '').replace(/^https?:\/\//, '');
  return `https://${url}/admin/api/${config.shopify.apiVersion}`;
}

function ensureConnected() {
  if (!runtimeCredentials.storeUrl || !runtimeCredentials.accessToken) {
    const err = new Error('Shopify store not connected. Go to Settings to connect.');
    err.status = 400;
    throw err;
  }
}

// ─── Shop Info ──────────────────────────────────────────────
export async function getShopInfo() {
  ensureConnected();
  const { data } = await axios.get(`${getBaseUrl()}/shop.json`, {
    headers: getHeaders(),
    timeout: 15000,
  });
  return data.shop;
}

// ─── Blogs ──────────────────────────────────────────────────
export async function getBlogs() {
  ensureConnected();
  const { data } = await axios.get(`${getBaseUrl()}/blogs.json`, {
    headers: getHeaders(),
    timeout: 15000,
  });
  return data.blogs || [];
}

// ─── Articles ───────────────────────────────────────────────
export async function getArticles(blogId, limit = 250) {
  ensureConnected();
  let allArticles = [];
  let pageInfo = null;

  do {
    let url = `${getBaseUrl()}/blogs/${blogId}/articles.json?limit=${Math.min(limit, 250)}`;
    if (pageInfo) url += `&page_info=${pageInfo}`;

    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 30000,
    });

    allArticles = allArticles.concat(response.data.articles || []);

    const linkHeader = response.headers.link;
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/<[^>]*page_info=([^>&]*)[^>]*>;\s*rel="next"/);
      pageInfo = match ? match[1] : null;
    } else {
      pageInfo = null;
    }
  } while (pageInfo);

  return allArticles;
}

export async function getArticle(blogId, articleId) {
  ensureConnected();
  const { data } = await axios.get(
    `${getBaseUrl()}/blogs/${blogId}/articles/${articleId}.json`,
    { headers: getHeaders(), timeout: 15000 }
  );
  return data.article;
}

export async function createArticle(blogId, articleData) {
  ensureConnected();
  const payload = {
    article: {
      title: articleData.title,
      body_html: articleData.bodyHtml,
      author: articleData.author || 'Admin',
      tags: articleData.tags || '',
      published: articleData.published !== false,
      summary_html: articleData.summary || '',
      handle: articleData.handle || undefined,
      metafields: [],
    },
  };

  // Add featured image if provided
  if (articleData.image) {
    payload.article.image = articleData.image;
  }

  // Add SEO metafields
  if (articleData.seoTitle) {
    payload.article.metafields.push({
      namespace: 'global',
      key: 'title_tag',
      value: articleData.seoTitle,
      type: 'single_line_text_field',
    });
  }
  if (articleData.seoDescription) {
    payload.article.metafields.push({
      namespace: 'global',
      key: 'description_tag',
      value: articleData.seoDescription,
      type: 'single_line_text_field',
    });
  }

  if (payload.article.metafields.length === 0) {
    delete payload.article.metafields;
  }

  const { data } = await axios.post(
    `${getBaseUrl()}/blogs/${blogId}/articles.json`,
    payload,
    { headers: getHeaders(), timeout: 30000 }
  );
  return data.article;
}

export async function updateArticle(blogId, articleId, articleData) {
  ensureConnected();
  const payload = {
    article: {
      id: articleId,
      title: articleData.title,
      body_html: articleData.bodyHtml,
      tags: articleData.tags || '',
      published: articleData.published !== false,
      summary_html: articleData.summary || '',
    },
  };

  if (articleData.image) {
    payload.article.image = articleData.image;
  }

  const { data } = await axios.put(
    `${getBaseUrl()}/blogs/${blogId}/articles/${articleId}.json`,
    payload,
    { headers: getHeaders(), timeout: 30000 }
  );

  // Update SEO metafields separately
  if (articleData.seoTitle) {
    try {
      await axios.post(
        `${getBaseUrl()}/articles/${articleId}/metafields.json`,
        {
          metafield: {
            namespace: 'global',
            key: 'title_tag',
            value: articleData.seoTitle,
            type: 'single_line_text_field',
          },
        },
        { headers: getHeaders(), timeout: 15000 }
      );
    } catch (e) {
      console.warn('Failed to set SEO title metafield:', e.message);
    }
  }

  if (articleData.seoDescription) {
    try {
      await axios.post(
        `${getBaseUrl()}/articles/${articleId}/metafields.json`,
        {
          metafield: {
            namespace: 'global',
            key: 'description_tag',
            value: articleData.seoDescription,
            type: 'single_line_text_field',
          },
        },
        { headers: getHeaders(), timeout: 15000 }
      );
    } catch (e) {
      console.warn('Failed to set SEO description metafield:', e.message);
    }
  }

  return data.article;
}

export async function deleteArticle(blogId, articleId) {
  ensureConnected();
  await axios.delete(
    `${getBaseUrl()}/blogs/${blogId}/articles/${articleId}.json`,
    { headers: getHeaders(), timeout: 15000 }
  );
  return true;
}

// ─── Products ───────────────────────────────────────────────
export async function getProducts(limit = 250) {
  ensureConnected();
  let allProducts = [];
  let pageInfo = null;

  do {
    let url = `${getBaseUrl()}/products.json?limit=${Math.min(limit, 250)}&fields=id,title,handle,product_type,tags,images,vendor,body_html`;
    if (pageInfo) url = `${getBaseUrl()}/products.json?limit=250&page_info=${pageInfo}`;

    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 30000,
    });

    allProducts = allProducts.concat(response.data.products || []);

    const linkHeader = response.headers.link;
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/<[^>]*page_info=([^>&]*)[^>]*>;\s*rel="next"/);
      pageInfo = match ? match[1] : null;
    } else {
      pageInfo = null;
    }
  } while (pageInfo);

  return allProducts;
}

// ─── Collections ────────────────────────────────────────────
export async function getCollections() {
  ensureConnected();

  // Fetch both custom and smart collections
  const [customRes, smartRes] = await Promise.all([
    axios.get(`${getBaseUrl()}/custom_collections.json?limit=250`, {
      headers: getHeaders(),
      timeout: 15000,
    }).catch(() => ({ data: { custom_collections: [] } })),
    axios.get(`${getBaseUrl()}/smart_collections.json?limit=250`, {
      headers: getHeaders(),
      timeout: 15000,
    }).catch(() => ({ data: { smart_collections: [] } })),
  ]);

  const custom = (customRes.data.custom_collections || []).map(c => ({
    id: c.id,
    title: c.title,
    handle: c.handle,
    type: 'custom',
  }));

  const smart = (smartRes.data.smart_collections || []).map(c => ({
    id: c.id,
    title: c.title,
    handle: c.handle,
    type: 'smart',
  }));

  return [...custom, ...smart];
}

// ─── Pages ──────────────────────────────────────────────────
export async function getPages() {
  ensureConnected();
  const { data } = await axios.get(`${getBaseUrl()}/pages.json?limit=250`, {
    headers: getHeaders(),
    timeout: 15000,
  });
  return data.pages || [];
}
