import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 300000 }); // 5 minutes for long article generation

// ─── Settings ───────────────────────────────────────────────
export const getSettings = () => api.get('/settings').then(r => r.data);
export const connectShopify = (storeUrl, accessToken) =>
  api.post('/settings/connect', { storeUrl, accessToken }).then(r => r.data);
export const disconnectShopify = () => api.post('/settings/disconnect').then(r => r.data);

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

export default api;
