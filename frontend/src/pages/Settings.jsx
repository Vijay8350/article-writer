import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Link2, Unlink, CheckCircle2, Loader2, Save, Trash2, PlugZap } from 'lucide-react';
import {
  getSettings, connectShopify, disconnectShopify, saveAiKeys, removeAiKey, saveAiPreferences, getDeepseekModels,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const PROVIDER_LABELS = { gemini: '🧠 Google Gemini', deepseek: '🔮 DeepSeek' };

const TASKS = [
  { key: 'article', label: 'Article writing', help: 'Default model on Generate Article, Scheduled Posts and Campaigns (campaign keyword ideas use it too).' },
  { key: 'enhance', label: 'Article enhancement', help: 'Default model for "Enhance" on Existing Articles.' },
  { key: 'businessDna', label: 'Business DNA analysis', help: 'Turns your Instagram + website into a brand profile.' },
];

const DEEPSEEK_MODEL_HINTS = {
  'deepseek-chat': 'DeepSeek\'s general chat model (the default).',
  'deepseek-reasoner': 'Thinks before answering. Slower and uses more tokens.',
};

export default function Settings() {
  const { setConnected, setStoreName } = useOutletContext();
  const { activeRole } = useAuth();
  const canManage = activeRole === 'owner' || activeRole === 'admin';

  const [storeUrl, setStoreUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [shopInfo, setShopInfo] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Per-workspace AI keys (optional overrides of the platform keys)
  const [geminiKey, setGeminiKey] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [keyPresence, setKeyPresence] = useState({ hasGemini: false, hasDeepseek: false });
  const [platformKeys, setPlatformKeys] = useState({ gemini: false, deepseek: false });
  const [savingKeys, setSavingKeys] = useState(false);

  // AI preferences: provider per task + DeepSeek model
  const [aiPrefs, setAiPrefs] = useState({ providers: {}, deepseekModel: 'deepseek-chat' });
  const [deepseekModels, setDeepseekModels] = useState([]);
  const [deepseekStatus, setDeepseekStatus] = useState(null); // { ok, text }
  const [testingDeepseek, setTestingDeepseek] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    getSettings().then(res => {
      const data = res.data || {};
      setStoreUrl(data.storeUrl || '');
      setIsConnected(data.connected || false);
      setKeyPresence(data.aiKeys || { hasGemini: false, hasDeepseek: false });
      if (data.platformKeys) setPlatformKeys(data.platformKeys);
      if (data.ai) setAiPrefs(data.ai);
      setLoading(false);
      // DeepSeek renames models over time, so offer the live list instead of guessing.
      if (data.aiKeys?.hasDeepseek || data.platformKeys?.deepseek) {
        getDeepseekModels().then(r => setDeepseekModels(r.data?.models || [])).catch(() => {});
      }
    }).catch(() => setLoading(false));
  }, []);

  const hasKey = (provider) =>
    (provider === 'gemini' ? keyPresence.hasGemini : keyPresence.hasDeepseek) || platformKeys[provider];

  const handleSaveKeys = async () => {
    if (!geminiKey.trim() && !deepseekKey.trim()) {
      return toast.error('Enter at least one API key to save');
    }
    setSavingKeys(true);
    try {
      const res = await saveAiKeys({
        geminiKey: geminiKey.trim() || undefined,
        deepseekKey: deepseekKey.trim() || undefined,
      });
      setKeyPresence(res.data || keyPresence);
      setGeminiKey('');
      setDeepseekKey('');
      toast.success('AI keys saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save keys');
    }
    setSavingKeys(false);
  };

  const handleRemoveKey = async (provider) => {
    const fallback = platformKeys[provider] ? 'the shared platform key will be used instead' : 'this provider will stop working until you add a new key';
    if (!confirm(`Remove your ${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} key? ${fallback[0].toUpperCase()}${fallback.slice(1)}.`)) return;
    try {
      const res = await removeAiKey(provider);
      setKeyPresence(res.data || keyPresence);
      if (provider === 'deepseek') { setDeepseekModels([]); setDeepseekStatus(null); }
      toast.success('Key removed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove key');
    }
  };

  const handleTestDeepseek = async () => {
    setTestingDeepseek(true);
    try {
      const res = await getDeepseekModels();
      const { models = [], keySource } = res.data || {};
      setDeepseekModels(models);
      setDeepseekStatus({ ok: true, text: `Connected using ${keySource === 'workspace' ? 'your key' : 'the platform key'}. ${models.length} model(s) available.` });
    } catch (err) {
      setDeepseekStatus({ ok: false, text: err.response?.data?.error || 'DeepSeek connection failed' });
    }
    setTestingDeepseek(false);
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      const res = await saveAiPreferences(aiPrefs);
      setAiPrefs(res.data || aiPrefs);
      toast.success('AI preferences saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save preferences');
    }
    setSavingPrefs(false);
  };

  const setTaskProvider = (task, provider) =>
    setAiPrefs(p => ({ ...p, providers: { ...p.providers, [task]: provider } }));

  const handleConnect = async () => {
    if (!storeUrl.trim() || !accessToken.trim()) {
      return toast.error('Enter both store URL and access token');
    }
    setConnecting(true);
    try {
      const res = await connectShopify(storeUrl, accessToken);
      setIsConnected(true);
      setShopInfo(res.data?.shop);
      setConnected(true);
      setStoreName(storeUrl);
      toast.success('Connected to Shopify!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Connection failed');
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    await disconnectShopify();
    setIsConnected(false);
    setShopInfo(null);
    setConnected(false);
    setStoreName('');
    setAccessToken('');
    toast.success('Disconnected');
  };

  if (loading) {
    return <div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }

  // The live list from DeepSeek, plus the saved model so it always shows (it may be an alias not listed).
  const modelOptions = [...new Set([aiPrefs.deepseekModel, ...deepseekModels].filter(Boolean))];
  const usesDeepseek = TASKS.some(t => aiPrefs.providers?.[t.key] === 'deepseek');

  const keyLabel = (provider, name) => {
    const own = provider === 'gemini' ? keyPresence.hasGemini : keyPresence.hasDeepseek;
    return (
      <label className="form-label flex items-center gap-8">
        {name}
        {own && <span className="badge badge-success">● Your key</span>}
        {!own && platformKeys[provider] && <span className="badge badge-info">Using platform key</span>}
        {!own && !platformKeys[provider] && <span className="badge badge-danger">No key</span>}
        {own && canManage && (
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => handleRemoveKey(provider)} title="Remove key">
            <Trash2 size={14} /> Remove
          </button>
        )}
      </label>
    );
  };

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>⚙️ Settings</h1>
        <p>Connect your Shopify store and choose which AI does what</p>
      </div>

      <div style={{ maxWidth: 600 }}>
        {/* Connection Status */}
        <div className="card mb-24">
          <div className="card-header">
            <h2>🔗 Shopify Connection</h2>
            <span className={`badge ${isConnected ? 'badge-success' : 'badge-danger'}`}>
              {isConnected ? '● Connected' : '● Disconnected'}
            </span>
          </div>
          <div className="card-body">
            {isConnected && shopInfo && (
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 20 }}>
                <div className="flex items-center gap-8 mb-16">
                  <CheckCircle2 size={20} style={{ color: 'var(--accent-success)' }} />
                  <span style={{ fontWeight: 600 }}>Connected to {shopInfo.name}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  <p>Domain: {shopInfo.domain}</p>
                  <p>Email: {shopInfo.email}</p>
                  <p>Country: {shopInfo.country}</p>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Store URL</label>
              <input
                className="form-input"
                value={storeUrl}
                onChange={e => setStoreUrl(e.target.value)}
                placeholder="your-store.myshopify.com"
                disabled={isConnected}
              />
              <div className="form-helper">Your Shopify store URL (e.g., my-store.myshopify.com)</div>
            </div>

            {!isConnected && (
              <div className="form-group">
                <label className="form-label">Admin API Access Token</label>
                <input
                  className="form-input"
                  type="password"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  placeholder="shpat_xxxxxxxxxxxxxxxxxxxxx"
                />
                <div className="form-helper">
                  Get this from Shopify Admin → Settings → Apps and sales channels → Develop apps → Create an app → API credentials
                </div>
              </div>
            )}

            {isConnected ? (
              <button className="btn btn-danger w-full" onClick={handleDisconnect}>
                <Unlink size={16} /> Disconnect Store
              </button>
            ) : (
              <button className="btn btn-primary w-full" onClick={handleConnect} disabled={connecting}>
                {connecting ? <><Loader2 size={16} className="spinning" /> Connecting...</> : <><Link2 size={16} /> Connect Store</>}
              </button>
            )}
          </div>
        </div>

        {/* Per-workspace AI Keys */}
        <div className="card mb-24">
          <div className="card-header"><h2>🔑 AI Keys</h2></div>
          <div className="card-body">
            <div className="form-helper mb-16">
              Optional. Add your own keys to use your own quota; without one, the platform's shared key is used
              (when available). Keys are checked with the provider, encrypted before storage, and never shown again.
            </div>

            <div className="form-group">
              {keyLabel('gemini', 'Google Gemini API Key')}
              <input
                className="form-input"
                type="password"
                value={geminiKey}
                onChange={e => setGeminiKey(e.target.value)}
                placeholder={keyPresence.hasGemini ? '•••••••• (enter new key to replace)' : 'AIza...'}
              />
            </div>

            <div className="form-group">
              {keyLabel('deepseek', 'DeepSeek API Key')}
              <input
                className="form-input"
                type="password"
                value={deepseekKey}
                onChange={e => setDeepseekKey(e.target.value)}
                placeholder={keyPresence.hasDeepseek ? '•••••••• (enter new key to replace)' : 'sk-...'}
              />
              <div className="form-helper">Create one at platform.deepseek.com → API keys.</div>
            </div>

            <button className="btn btn-primary w-full" onClick={handleSaveKeys} disabled={savingKeys || !canManage}>
              {savingKeys ? <><Loader2 size={16} className="spinning" /> Checking & saving...</> : <><Save size={16} /> Save AI Keys</>}
            </button>
          </div>
        </div>

        {/* AI preferences: which provider for each task + DeepSeek model */}
        <div className="card">
          <div className="card-header"><h2>🧭 AI Preferences</h2></div>
          <div className="card-body">
            <div className="form-helper mb-16">
              Choose which AI handles each job in this workspace. You can still switch model per article on the Generate page.
            </div>

            {TASKS.map(task => {
              const provider = aiPrefs.providers?.[task.key] || 'gemini';
              return (
                <div className="form-group" key={task.key}>
                  <label className="form-label">{task.label}</label>
                  <select
                    className="form-select"
                    value={provider}
                    onChange={e => setTaskProvider(task.key, e.target.value)}
                    disabled={!canManage}
                  >
                    {Object.entries(PROVIDER_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label}{hasKey(id) ? '' : ' (no key)'}</option>
                    ))}
                  </select>
                  <div className="form-helper">
                    {task.help}
                    {!hasKey(provider) && (
                      <span style={{ color: 'var(--accent-warning)' }}> ⚠️ No {provider === 'gemini' ? 'Gemini' : 'DeepSeek'} key available: add one above.</span>
                    )}
                  </div>
                </div>
              );
            })}

            <div style={{ borderTop: '1px solid var(--border-secondary)', margin: '8px 0 20px' }} />

            <div className="form-group">
              <label className="form-label">DeepSeek Model</label>
              <div className="flex gap-8">
                <select
                  className="form-select"
                  style={{ flex: 1 }}
                  value={aiPrefs.deepseekModel}
                  onChange={e => setAiPrefs(p => ({ ...p, deepseekModel: e.target.value }))}
                  disabled={!canManage}
                >
                  {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button className="btn btn-secondary" onClick={handleTestDeepseek} disabled={testingDeepseek || !hasKey('deepseek')}>
                  {testingDeepseek ? <Loader2 size={16} className="spinning" /> : <PlugZap size={16} />} Test & load models
                </button>
              </div>
              <div className="form-helper">
                {DEEPSEEK_MODEL_HINTS[aiPrefs.deepseekModel] || 'Used for every DeepSeek call in this workspace.'}
                {deepseekModels.length > 0 && !deepseekModels.includes(aiPrefs.deepseekModel) && ' Not in your key\'s model list; it works only if DeepSeek still accepts it as an alias.'}
                {usesDeepseek ? '' : ' (No task uses DeepSeek yet. Pick it above to use this model.)'}
              </div>
              {deepseekStatus && (
                <div className="form-helper" style={{ color: deepseekStatus.ok ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                  {deepseekStatus.ok ? '✓' : '✗'} {deepseekStatus.text}
                </div>
              )}
            </div>

            <button className="btn btn-primary w-full" onClick={handleSavePrefs} disabled={savingPrefs || !canManage}>
              {savingPrefs ? <><Loader2 size={16} className="spinning" /> Saving...</> : <><Save size={16} /> Save AI Preferences</>}
            </button>
            {!canManage && <div className="form-helper mt-16">Only workspace owners and admins can change AI settings.</div>}
          </div>
        </div>
      </div>
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
