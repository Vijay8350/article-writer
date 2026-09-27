import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 300000 }); // 5 minutes for long article generation

const TOKEN_KEY = 'aw_token';
const WS_KEY = 'aw_workspace_id';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export const getActiveWorkspaceId = () => localStorage.getItem(WS_KEY);
export const setActiveWorkspaceId = (id) => {
  if (id) localStorage.setItem(WS_KEY, id);
  else localStorage.removeItem(WS_KEY);
};

// Attach JWT + active workspace to every request.
api.interceptors.request.use((cfg) => {
  const token = getToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  const ws = getActiveWorkspaceId();
  if (ws) cfg.headers['X-Workspace-Id'] = ws;
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
export const register = (email, password, name, workspaceName) =>
  api.post('/auth/register', { email, password, name, workspaceName }).then(r => r.data);
export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data);
export const getMe = () => api.get('/auth/me').then(r => r.data);
export const changeMyPassword = (currentPassword, newPassword) =>
  api.post('/auth/change-password', { currentPassword, newPassword }).then(r => r.data);

// ─── Workspaces / Members / Invitations ─────────────────────
export const getMyWorkspaces = () => api.get('/workspaces').then(r => r.data);
export const createWorkspace = (name) => api.post('/workspaces', { name }).then(r => r.data);
export const renameWorkspace = (name) => api.patch('/workspaces/current', { name }).then(r => r.data);
export const getMembers = () => api.get('/members').then(r => r.data);
export const setMemberRole = (userId, role) => api.patch(`/members/${userId}/role`, { role }).then(r => r.data);
export const removeMember = (userId) => api.delete(`/members/${userId}`).then(r => r.data);
export const resetMemberPassword = (userId) => api.post(`/members/${userId}/reset-password`).then(r => r.data);
export const getInvitations = () => api.get('/invitations').then(r => r.data);
export const createInvitation = (email, role) => api.post('/invitations', { email, role }).then(r => r.data);
export const revokeInvitation = (id) => api.delete(`/invitations/${id}`).then(r => r.data);
export const acceptInvitation = (token) => api.post('/invitations/accept', { token }).then(r => r.data);

// ─── Settings ───────────────────────────────────────────────
export const getSettings = () => api.get('/settings').then(r => r.data);
export const connectShopify = (storeUrl, accessToken) =>
  api.post('/settings/connect', { storeUrl, accessToken }).then(r => r.data);
export const disconnectShopify = () => api.post('/settings/disconnect').then(r => r.data);
export const saveAiKeys = (keys) => api.post('/settings/ai-keys', keys).then(r => r.data);
export const removeAiKey = (provider) => api.delete(`/settings/ai-keys/${provider}`).then(r => r.data);
export const saveAiPreferences = (prefs) => api.put('/settings/ai-preferences', prefs).then(r => r.data);
export const getDeepseekModels = () => api.get('/settings/deepseek-models').then(r => r.data);

// ─── Business DNA ───────────────────────────────────────────
export const getBusinessDna = () => api.get('/business-dna').then(r => r.data);
export const fetchBusinessDna = () => api.post('/business-dna/fetch').then(r => r.data);
export const clearBusinessDna = () => api.delete('/business-dna').then(r => r.data);
export const fetchSocialBusinessDna = (data) => api.post('/business-dna/fetch-social', data).then(r => r.data);

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

// ─── Campaigns ──────────────────────────────────────────────
export const getCampaigns = () => api.get('/campaigns').then(r => r.data);
export const createCampaign = (data) => api.post('/campaigns', data).then(r => r.data);
export const setCampaignStatus = (id, status) => api.patch(`/campaigns/${id}`, { status }).then(r => r.data);
export const deleteCampaign = (id) => api.delete(`/campaigns/${id}`).then(r => r.data);
export const runCampaignNow = (id) => api.post(`/campaigns/${id}/run-now`).then(r => r.data);
export const getCampaignArticles = (id) => api.get(`/campaigns/${id}/articles`).then(r => r.data);

// ─── Instagram autopost ─────────────────────────────────────
export const getInstagramAccounts = () => api.get('/instagram/accounts').then(r => r.data);
export const connectInstagramAccount = (accessToken, igUserId) =>
  api.post('/instagram/accounts', { accessToken, igUserId }).then(r => r.data);
export const disconnectInstagramAccount = (id) => api.delete(`/instagram/accounts/${id}`).then(r => r.data);
export const setDefaultInstagramAccount = (id) => api.post(`/instagram/accounts/${id}/default`).then(r => r.data);
export const getInstagramAccountStatus = (id) => api.get(`/instagram/accounts/${id}/status`).then(r => r.data);
export const getInstagramAutomations = () => api.get('/instagram/automations').then(r => r.data);
export const createInstagramAutomation = (data) => api.post('/instagram/automations', data).then(r => r.data);
export const updateInstagramAutomation = (id, data) => api.patch(`/instagram/automations/${id}`, data).then(r => r.data);
export const deleteInstagramAutomation = (id) => api.delete(`/instagram/automations/${id}`).then(r => r.data);
export const previewInstagramPost = (id) => api.post(`/instagram/automations/${id}/preview`).then(r => r.data);
export const postInstagramNow = (id) => api.post(`/instagram/automations/${id}/post-now`).then(r => r.data);
export const getInstagramPosts = (id) => api.get(`/instagram/automations/${id}/posts`).then(r => r.data);

// ─── Plan & Usage ───────────────────────────────────────────
export const getUsage = () => api.get('/settings/usage').then(r => r.data);

// ─── Upgrade requests (user) ────────────────────────────────
export const getUpgradePlans = () => api.get('/upgrade-requests/plans').then(r => r.data);
export const getMyUpgradeRequests = () => api.get('/upgrade-requests/mine').then(r => r.data);
export const requestUpgrade = (requestedPlan, note) =>
  api.post('/upgrade-requests', { requestedPlan, note }).then(r => r.data);

// ─── Admin console ──────────────────────────────────────────
export const adminGetUsers = () => api.get('/admin/users').then(r => r.data);
export const adminGetUser = (id) => api.get(`/admin/users/${id}`).then(r => r.data);
export const adminGetPlans = () => api.get('/admin/plans').then(r => r.data);
export const adminCreateUser = (data) => api.post('/admin/users', data).then(r => r.data);
export const adminSetRole = (userId, role) =>
  api.post(`/admin/users/${userId}/role`, { role }).then(r => r.data);
export const adminApproveUser = (userId) => api.post(`/admin/users/${userId}/approve`).then(r => r.data);
export const adminSuspendUser = (userId) => api.post(`/admin/users/${userId}/suspend`).then(r => r.data);
export const adminReactivateUser = (userId) => api.post(`/admin/users/${userId}/reactivate`).then(r => r.data);
// Workspaces (plans/usage/suspend are at the WORKSPACE level now)
export const adminGetWorkspaces = () => api.get('/admin/workspaces').then(r => r.data);
export const adminSetWorkspacePlan = (wsId, planId) =>
  api.post(`/admin/workspaces/${wsId}/plan`, { planId }).then(r => r.data);
export const adminSuspendWorkspace = (wsId) => api.post(`/admin/workspaces/${wsId}/suspend`).then(r => r.data);
export const adminReactivateWorkspace = (wsId) => api.post(`/admin/workspaces/${wsId}/reactivate`).then(r => r.data);
export const adminGetActivity = () => api.get('/admin/activity').then(r => r.data);
export const adminGetUpgradeRequests = () => api.get('/admin/upgrade-requests').then(r => r.data);
export const adminApproveUpgrade = (id) => api.post(`/admin/upgrade-requests/${id}/approve`).then(r => r.data);
export const adminRejectUpgrade = (id) => api.post(`/admin/upgrade-requests/${id}/reject`).then(r => r.data);

export default api;
