import axios from 'axios';
import config from '../config/env.js';

// Multi-tenant: every function takes a `creds` object { storeUrl, accessToken }.
// There is no global credential state — callers load the current user's store
// from the DB and pass it in per request.

function headers(creds) {
  return {
    'X-Shopify-Access-Token': creds.accessToken,
    'Content-Type': 'application/json',
  };
}

function baseUrl(creds) {
  const url = String(creds.storeUrl || '').replace(/\/$/, '').replace(/^https?:\/\//, '');
  return `https://${url}/admin/api/${config.shopify.apiVersion}`;
}

function ensure(creds) {
  if (!creds || !creds.storeUrl || !creds.accessToken) {
    const err = new Error('Shopify store not connected. Go to Settings to connect.');
    err.status = 400;
    throw err;
  }
}

// ─── Shop Info ──────────────────────────────────────────────
export async function getShopInfo(creds) {
  ensure(creds);
  const { data } = await axios.get(`${baseUrl(creds)}/shop.json`, {
    headers: headers(creds),
    timeout: 15000,
  });
  return data.shop;
}

// ─── Blogs ──────────────────────────────────────────────────
export async function getBlogs(creds) {
  ensure(creds);
  const { data } = await axios.get(`${baseUrl(creds)}/blogs.json`, {
    headers: headers(creds),
    timeout: 15000,
  });
  return data.blogs || [];
}

// ─── Articles ───────────────────────────────────────────────
export async function getArticles(creds, blogId, limit = 250) {
  ensure(creds);
  let allArticles = [];
  let pageInfo = null;

  do {
    let url = `${baseUrl(creds)}/blogs/${blogId}/articles.json?limit=${Math.min(limit, 250)}`;
    if (pageInfo) url += `&page_info=${pageInfo}`;

    const response = await axios.get(url, {
      headers: headers(creds),
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

export async function getArticle(creds, blogId, articleId) {
  ensure(creds);
  const { data } = await axios.get(
    `${baseUrl(creds)}/blogs/${blogId}/articles/${articleId}.json`,
    { headers: headers(creds), timeout: 15000 }
  );
  return data.article;
}

export async function createArticle(creds, blogId, articleData) {
  ensure(creds);
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

  if (articleData.image) {
    payload.article.image = articleData.image;
  }

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
    `${baseUrl(creds)}/blogs/${blogId}/articles.json`,
    payload,
    { headers: headers(creds), timeout: 30000 }
  );
  return data.article;
}

export async function updateArticle(creds, blogId, articleId, articleData) {
  ensure(creds);
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
    `${baseUrl(creds)}/blogs/${blogId}/articles/${articleId}.json`,
    payload,
    { headers: headers(creds), timeout: 30000 }
  );

  if (articleData.seoTitle) {
    try {
      await axios.post(
        `${baseUrl(creds)}/articles/${articleId}/metafields.json`,
        {
          metafield: {
            namespace: 'global',
            key: 'title_tag',
            value: articleData.seoTitle,
            type: 'single_line_text_field',
          },
        },
        { headers: headers(creds), timeout: 15000 }
      );
    } catch (e) {
      console.warn('Failed to set SEO title metafield:', e.message);
    }
  }

  if (articleData.seoDescription) {
    try {
      await axios.post(
        `${baseUrl(creds)}/articles/${articleId}/metafields.json`,
        {
          metafield: {
            namespace: 'global',
            key: 'description_tag',
            value: articleData.seoDescription,
            type: 'single_line_text_field',
          },
        },
        { headers: headers(creds), timeout: 15000 }
      );
    } catch (e) {
      console.warn('Failed to set SEO description metafield:', e.message);
    }
  }

  return data.article;
}

export async function deleteArticle(creds, blogId, articleId) {
  ensure(creds);
  await axios.delete(
    `${baseUrl(creds)}/blogs/${blogId}/articles/${articleId}.json`,
    { headers: headers(creds), timeout: 15000 }
  );
  return true;
}

// ─── Products ───────────────────────────────────────────────
export async function getProducts(creds, limit = 250) {
  ensure(creds);
  let allProducts = [];
  let pageInfo = null;

  do {
    let url = `${baseUrl(creds)}/products.json?limit=${Math.min(limit, 250)}&fields=id,title,handle,product_type,tags,images,vendor,body_html`;
    if (pageInfo) url = `${baseUrl(creds)}/products.json?limit=250&page_info=${pageInfo}`;

    const response = await axios.get(url, {
      headers: headers(creds),
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
export async function getCollections(creds) {
  ensure(creds);

  const [customRes, smartRes] = await Promise.all([
    axios.get(`${baseUrl(creds)}/custom_collections.json?limit=250`, {
      headers: headers(creds),
      timeout: 15000,
    }).catch(() => ({ data: { custom_collections: [] } })),
    axios.get(`${baseUrl(creds)}/smart_collections.json?limit=250`, {
      headers: headers(creds),
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
export async function getPages(creds) {
  ensure(creds);
  const { data } = await axios.get(`${baseUrl(creds)}/pages.json?limit=250`, {
    headers: headers(creds),
    timeout: 15000,
  });
  return data.pages || [];
}
