import axios from 'axios';
import { safeAxiosConfig } from '../lib/safeHttp.js';
import { isPasswordPage } from '../lib/seoRules.js';

// The SEO check's reads of the store's public pages, fetched the way a shopper or Google
// would see them (HTML, not the JSON that services/storefront.js reads).

const ATTEMPTS = 3;
const RETRY_PAUSE_MS = 4000;
const http = axios.create({
  ...safeAxiosConfig, timeout: 20000, maxContentLength: 6 * 1024 * 1024, responseType: 'text', validateStatus: () => true,
  headers: { 'User-Agent': 'ArticleWriter-SeoAudit/1.0' },
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A busy or failing store gets a few tries. Status 0 means no response at all.
export async function fetchPage(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await http.get(url).catch(() => ({ status: 0 }));
    const temporary = res.status === 0 || res.status === 429 || res.status >= 500;
    if (!temporary || attempt === ATTEMPTS) return res;
    await pause(RETRY_PAUSE_MS * attempt);
  }
}

// Whether a response is Shopify's password page instead of the page asked for. Redirects
// are followed, so it's told by where the request ended up (axios keeps that on the
// response's request) or by the password form in the page.
export function showsPasswordPage(res, url) {
  if (!res?.status) return false;
  return isPasswordPage(res.request?.res?.responseUrl || url, typeof res.data === 'string' ? res.data : '');
}

// Whether the store's password is on, from its home page: the password covers the whole store.
export async function passwordProtected(base) {
  const url = `${base}/`;
  return showsPasswordPage(await fetchPage(url), url);
}
