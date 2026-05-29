import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 300000 }); // 5 minutes for long article generation

const TOKEN_KEY = 'aw_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

// Attach the JWT to every request.
api.interceptors.request.use((cfg) => {
  const token = getToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// On 401, drop the token and bounce to /login (unless we're already on an auth page).
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null);
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/signup') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ───────────────────────────────────────────────────
export const register = (email, password, name) =>
  api.post('/auth/register', { email, password, name }).then(r => r.data);
export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data);
export const getMe = () => api.get('/auth/me').then(r => r.data);

// ─── Settings ───────────────────────────────────────────────
export const getSettings = () => api.get('/settings').then(r => r.data);
export const connectShopify = (storeUrl, accessToken) =>
  api.post('/settings/connect', { storeUrl, accessToken }).then(r => r.data);
export const disconnectShopify = () => api.post('/settings/disconnect').then(r => r.data);
export const saveAiKeys = (keys) => api.post('/settings/ai-keys', keys).then(r => r.data);

// ─── Business DNA ───────────────────────────────────────────
export const getBusinessDna = () => api.get('/business-dna').then(r => r.data);
export const fetchBusinessDna = () => api.post('/business-dna/fetch').then(r => r.data);
export const clearBusinessDna = () => api.delete('/business-dna').then(r => r.data);

// ─── Articles ───────────────────────────────────────────────
export const generateArticle = (data) => api.post('/articles/generate', data).then(r => r.data);
export const enhanceArticle = (data) => api.post('/articles/enhance', data).then(r => r.data);
export const publishArticle = (blogId, article) =>
  api.post('/articles/publish', { blogId, article }).then(r => r.data);
export const updateArticle = (blogId, articleId, article) =>
  api.put(`/articles/update/${blogId}/${articleId}`, { article }).then(r => r.data);
export const getExistingArticles = (blogId) =>
  api.get(`/articles/existing/${blogId}`).then(r => r.data);
export const getExistingArticle = (blogId, articleId) =>
  api.get(`/articles/existing/${blogId}/${articleId}`).then(r => r.data);
export const deleteArticle = (blogId, articleId) =>
  api.delete(`/articles/existing/${blogId}/${articleId}`).then(r => r.data);
export const getSeoScore = (article) =>
  api.post('/articles/seo-score', { article }).then(r => r.data);
export const generateAndPublish = (data) =>
  api.post('/articles/generate-and-publish', data).then(r => r.data);

// ─── Scheduled Posts ────────────────────────────────────────
export const getScheduledPosts = () => api.get('/scheduled-posts').then(r => r.data);
export const createScheduledPost = (data) => api.post('/scheduled-posts', data).then(r => r.data);
export const cancelScheduledPost = (id) => api.delete(`/scheduled-posts/${id}`).then(r => r.data);

// ─── Plan & Usage ───────────────────────────────────────────
export const getUsage = () => api.get('/settings/usage').then(r => r.data);

// ─── Admin ──────────────────────────────────────────────────
export const adminGetUsers = () => api.get('/admin/users').then(r => r.data);
export const adminGetPlans = () => api.get('/admin/plans').then(r => r.data);
export const adminSetPlan = (userId, planId) =>
  api.post(`/admin/users/${userId}/plan`, { planId }).then(r => r.data);

export default api;
