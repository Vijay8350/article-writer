import axios from 'axios';
import config from '../config/env.js';

// Google Search Console: sign-in with Google, then the store's real search performance.
// A workspace's refresh token is stored encrypted; access tokens are fetched per run.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const API = 'https://www.googleapis.com/webmasters/v3';
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const SCOPES = ['https://www.googleapis.com/auth/webmasters', 'openid', 'email'];

const PAGE_ROWS = 1000;
const TOP_ROWS = 20;
export const INSPECTIONS_PER_RUN = 50;
const PERIOD_DAYS = 28;
const DATA_DELAY_DAYS = 3; // Google's figures for the last few days are incomplete

export const isConfigured = () => Boolean(config.google.clientId && config.google.clientSecret);
export const redirectUri = () => `${config.publicBaseUrl}/api/seo/google/callback`;

export function authUrl(state) {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', config.google.clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline'); // a refresh token, for the daily run
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

const tokenRequest = (params) => axios.post(TOKEN_URL, new URLSearchParams({
  client_id: config.google.clientId, client_secret: config.google.clientSecret, ...params,
}).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 });

export async function exchangeCode(code) {
  const { data } = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  const info = await axios.get(USERINFO_URL, { headers: { Authorization: `Bearer ${data.access_token}` }, timeout: 15000 }).catch(() => null);
  return { refreshToken: data.refresh_token, email: info?.data?.email || null };
}

export async function accessToken(refreshToken) {
  const { data } = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  return data.access_token;
}

const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` }, timeout: 30000 });
const encodeSite = (site) => encodeURIComponent(site);

export async function listSites(token) {
  const { data } = await axios.get(`${API}/sites`, auth(token));
  return (data.siteEntry || []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser').map((s) => s.siteUrl);
}

// The property for a store: its domain property if there is one, else its URL prefix.
export function matchSite(sites, domain) {
  const bare = String(domain || '').replace(/^www\./, '');
  return sites.find((s) => s === `sc-domain:${bare}`)
    || sites.find((s) => s.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') === bare)
    || null;
}

const isoDay = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);

async function query(token, site, body) {
  const { data } = await axios.post(`${API}/sites/${encodeSite(site)}/searchAnalytics/query`, body, auth(token));
  return data.rows || [];
}

const period = (offset) => ({ startDate: isoDay(DATA_DELAY_DAYS + offset + PERIOD_DAYS - 1), endDate: isoDay(DATA_DELAY_DAYS + offset) });

function totals(rows) {
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  const position = impressions ? rows.reduce((n, r) => n + r.position * r.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: Math.round(position * 10) / 10 };
}

const compactRow = (r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: Math.round(r.position * 10) / 10 });

// Search performance for the last four weeks against the four before, plus what people
// typed to reach each page, which is what the metadata writer aims at.
export async function fetchPerformance(token, site) {
  const [pages, queries, previous] = await Promise.all([
    query(token, site, { ...period(0), dimensions: ['page'], rowLimit: PAGE_ROWS }),
    query(token, site, { ...period(0), dimensions: ['query'], rowLimit: TOP_ROWS }),
    query(token, site, { ...period(PERIOD_DAYS), dimensions: ['page'], rowLimit: PAGE_ROWS }),
  ]);
  const pagesByUrl = new Map(pages.map((r) => [r.keys[0], { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }]));
  return {
    pages: pagesByUrl,
    summary: {
      current: totals(pages),
      previous: totals(previous),
      topQueries: queries.map(compactRow),
      topPages: pages.slice().sort((a, b) => b.clicks - a.clicks).slice(0, TOP_ROWS).map(compactRow),
    },
  };
}

export async function pageQueries(token, site, url) {
  const rows = await query(token, site, {
    ...period(0), dimensions: ['query'], rowLimit: 5,
    dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: url }] }],
  });
  return rows.map((r) => r.keys[0]);
}

// Makes sure Google has the sitemap. Returns what was found and whether it was added.
export async function ensureSitemap(token, site, sitemapUrl) {
  const { data } = await axios.get(`${API}/sites/${encodeSite(site)}/sitemaps`, auth(token));
  const list = data.sitemap || [];
  if (list.some((s) => s.path === sitemapUrl)) return { sitemaps: list.length, submitted: false };
  await axios.put(`${API}/sites/${encodeSite(site)}/sitemaps/${encodeURIComponent(sitemapUrl)}`, null, auth(token));
  return { sitemaps: list.length + 1, submitted: true };
}

// Which of these pages Google hasn't indexed. Google limits these calls, so each run
// inspects only a sample.
export async function findNotIndexed(token, site, urls) {
  const missing = new Map();
  for (const url of urls.slice(0, INSPECTIONS_PER_RUN)) {
    try {
      const { data } = await axios.post(INSPECT_URL, { inspectionUrl: url, siteUrl: site }, auth(token));
      const status = data.inspectionResult?.indexStatusResult;
      if (status && status.verdict !== 'PASS') missing.set(url, status.coverageState || 'Google has not indexed this page.');
    } catch (err) {
      if (err.response?.status === 429) break; // out of quota for today
    }
  }
  return missing;
}
