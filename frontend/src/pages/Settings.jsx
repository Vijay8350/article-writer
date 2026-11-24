import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Link2, Unlink, CheckCircle2, XCircle, Loader2, Save, Trash2, PlugZap, Info } from 'lucide-react';
import {
  getSettings, connectShopify, disconnectShopify, saveAiKeys, removeAiKey, saveAiPreferences, getDeepseekModels,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { PageHeader, Section, SettingRow } from '../components/ui';
import '../styles/workspace.css';

const PROVIDER_LABELS = { gemini: 'Google Gemini', deepseek: 'DeepSeek' };

const TASKS = [
  { key: 'article', label: 'Article writing', help: 'Default for Generate Article, Scheduled Posts and Campaigns (campaign keyword ideas too).' },
  { key: 'enhance', label: 'Article enhancement', help: 'Default for "Enhance" on Existing Articles.' },
  { key: 'businessDna', label: 'Business DNA analysis', help: 'Turns your Instagram and website into a brand profile.' },
];

const DEEPSEEK_MODEL_HINTS = {
  'deepseek-chat': 'DeepSeek\'s general chat model (the default).',
  'deepseek-reasoner': 'Thinks before answering. Slower and uses more tokens.',
  'deepseek-v4-pro': 'The strongest model on your key, and the best choice for article quality. Slower and costs more per article.',
  'deepseek-flash': 'Fast and low cost. Good for captions and quick jobs.',
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
      toast.success('Connected to Shopify');
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

  const confirmDisconnect = () => {
    if (window.confirm('Disconnect this Shopify store?\n\nArticles can\'t be published until you connect it again with an access token.')) handleDisconnect();
  };

  if (loading) {
    return <div className="page-container page-container--narrow fade-in"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }

  // The live list from DeepSeek, plus the saved model so it always shows (it may be an alias not listed).
  const modelOptions = [...new Set([aiPrefs.deepseekModel, ...deepseekModels].filter(Boolean))];
  const usesDeepseek = TASKS.some(t => aiPrefs.providers?.[t.key] === 'deepseek');

  // One key field: label, where the key comes from, Remove, input.
  const keyField = ({ provider, name, id, value, onChange, placeholder, helper }) => {
    const own = provider === 'gemini' ? keyPresence.hasGemini : keyPresence.hasDeepseek;
    const short = provider === 'gemini' ? 'Gemini' : 'DeepSeek';
    return (
      <div className="settings-key">
        <div className="settings-key__head">
          <label className="form-label" htmlFor={id}>{name}</label>
          {own && <span className="status status--on">Your key</span>}
          {!own && platformKeys[provider] && <span className="status">Using the shared key</span>}
          {!own && !platformKeys[provider] && <span className="status status--warn">No key</span>}
          {own && canManage && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRemoveKey(provider)} aria-label={`Remove your ${short} key`} title="Remove key">
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
        <input
          id={id}
          className="form-input"
          type="password"
          autoComplete="off"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {helper && <div className="form-helper">{helper}</div>}
      </div>
    );
  };

  return (
    <div className="page-container page-container--narrow fade-in wk-page">
      <PageHeader title="Settings" subtitle="Connect your Shopify store and choose which AI does each job." />

      <div className="stack">
        {!canManage && (
          <div className="callout callout--info">
            <Info size={18} />
            <span>Only workspace owners and admins can change AI keys and preferences.</span>
          </div>
        )}

        {/* Shopify connection */}
        <Section
          title="Shopify store"
          description="Articles are published to this store's blog, and Business DNA reads its products."
          actions={(
            <span className={`status ${isConnected ? 'status--on' : 'status--off'}`}>
              {isConnected ? 'Connected' : 'Not connected'}
            </span>
          )}
        >
          {isConnected ? (
            <>
              <dl className="kv">
                <dt>Store URL</dt><dd>{storeUrl || '—'}</dd>
                {shopInfo && (
                  <>
                    <dt>Store name</dt><dd>{shopInfo.name}</dd>
                    <dt>Domain</dt><dd>{shopInfo.domain}</dd>
                    <dt>Email</dt><dd>{shopInfo.email}</dd>
                    <dt>Country</dt><dd>{shopInfo.country}</dd>
                  </>
                )}
              </dl>
              <div className="form-actions wk-actions">
                <button type="button" className="btn btn-danger" onClick={confirmDisconnect}>
                  <Unlink size={16} /> Disconnect store
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="shop-url">Store URL</label>
                <input
                  id="shop-url"
                  className="form-input"
                  value={storeUrl}
                  onChange={e => setStoreUrl(e.target.value)}
                  placeholder="your-store.myshopify.com"
                />
                <div className="form-helper">Your store's myshopify.com address.</div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="shop-token">Admin API access token</label>
                <input
                  id="shop-token"
                  className="form-input"
                  type="password"
                  autoComplete="off"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  placeholder="shpat_xxxxxxxxxxxxxxxxxxxxx"
                />
                <div className="form-helper">Starts with shpat_. It's stored encrypted.</div>
              </div>

              <div className="callout settings-howto">
                <Info size={16} />
                <div className="wk-callout-body">
                  <div className="wk-callout-title">Where to find the token</div>
                  <ol className="steps-list wk-steps">
                    <li><span>In Shopify admin, open <strong>Settings → Apps and sales channels → Develop apps</strong>.</span></li>
                    <li><span>Select <strong>Create an app</strong>, then open <strong>API credentials</strong>.</span></li>
                    <li><span>Copy the Admin API access token and paste it above.</span></li>
                  </ol>
                </div>
              </div>

              <div className="form-actions wk-actions">
                <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
                  {connecting ? <><Loader2 size={16} className="spinning" /> Connecting…</> : <><Link2 size={16} /> Connect store</>}
                </button>
              </div>
            </>
          )}
        </Section>

        {/* Per-workspace AI keys */}
        <Section
          title="AI keys"
          description="Optional. Add your own key to use your own quota. Without one, the shared key is used when there is one."
        >
          {keyField({
            provider: 'gemini',
            name: 'Google Gemini API key',
            id: 'key-gemini',
            value: geminiKey,
            onChange: setGeminiKey,
            placeholder: keyPresence.hasGemini ? '•••••••• (enter a new key to replace it)' : 'AIza...',
          })}
          {keyField({
            provider: 'deepseek',
            name: 'DeepSeek API key',
            id: 'key-deepseek',
            value: deepseekKey,
            onChange: setDeepseekKey,
            placeholder: keyPresence.hasDeepseek ? '•••••••• (enter a new key to replace it)' : 'sk-...',
            helper: 'Create one at platform.deepseek.com → API keys.',
          })}

          <div className="form-actions wk-actions">
            <p className="form-helper wk-actions__note">Keys are checked with the provider, stored encrypted and never shown again.</p>
            <button type="button" className="btn btn-primary" onClick={handleSaveKeys} disabled={savingKeys || !canManage}>
              {savingKeys ? <><Loader2 size={16} className="spinning" /> Checking and saving…</> : <><Save size={16} /> Save keys</>}
            </button>
          </div>
        </Section>

        {/* AI preferences: which provider for each task + DeepSeek model */}
        <Section
          title="AI preferences"
          description="Choose which AI does each job in this workspace. You can still switch per article on the Generate page."
        >
          <div className="form-section">
            <div className="form-section__title">Jobs</div>
            <div className="form-section__desc">The AI used for each kind of work.</div>
            <div>
              {TASKS.map(task => {
                const provider = aiPrefs.providers?.[task.key] || 'gemini';
                return (
                  <SettingRow
                    key={task.key}
                    title={task.label}
                    htmlFor={`ai-task-${task.key}`}
                    description={(
                      <>
                        {task.help}
                        {!hasKey(provider) && (
                          <span className="wk-note-warn">No {provider === 'gemini' ? 'Gemini' : 'DeepSeek'} key yet. Add one under AI keys.</span>
                        )}
                      </>
                    )}
                  >
                    <select
                      id={`ai-task-${task.key}`}
                      className="form-select"
                      value={provider}
                      onChange={e => setTaskProvider(task.key, e.target.value)}
                      disabled={!canManage}
                    >
                      {Object.entries(PROVIDER_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>{label}{hasKey(id) ? '' : ' (no key)'}</option>
                      ))}
                    </select>
                  </SettingRow>
                );
              })}

              <SettingRow
                title="Article images"
                htmlFor="ai-article-images"
                description="Used for every article, including scheduled posts and campaigns. You can still change it per article on the Generate page."
              >
                <select
                  id="ai-article-images"
                  className="form-select"
                  value={aiPrefs.articleImages || 'mixed'}
                  onChange={e => setAiPrefs(p => ({ ...p, articleImages: e.target.value }))}
                  disabled={!canManage}
                >
                  <option value="mixed">ChatGPT images + store photos</option>
                  <option value="ai">ChatGPT images only</option>
                  <option value="products">Store photos only</option>
                </select>
              </SettingRow>
            </div>
          </div>

          <div className="form-section">
            <label className="form-section__title" htmlFor="ai-deepseek-model">DeepSeek model</label>
            <div className="form-section__desc">Used for every DeepSeek call in this workspace.</div>
            <div className="settings-model">
              <select
                id="ai-deepseek-model"
                className="form-select"
                value={aiPrefs.deepseekModel}
                onChange={e => setAiPrefs(p => ({ ...p, deepseekModel: e.target.value }))}
                disabled={!canManage}
              >
                {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button type="button" className="btn btn-secondary" onClick={handleTestDeepseek} disabled={testingDeepseek || !hasKey('deepseek')}>
                {testingDeepseek ? <Loader2 size={16} className="spinning" /> : <PlugZap size={16} />} Test and load models
              </button>
            </div>
            <div className="form-helper">
              {DEEPSEEK_MODEL_HINTS[aiPrefs.deepseekModel] || ''}
              {deepseekModels.length > 0 && !deepseekModels.includes(aiPrefs.deepseekModel) && ' Not in your key\'s model list; it works only if DeepSeek still accepts it as an alias.'}
              {usesDeepseek ? '' : ' No job uses DeepSeek yet. Pick it above to use this model.'}
            </div>
            {deepseekStatus && (
              <div className={`callout ${deepseekStatus.ok ? 'callout--success' : 'callout--danger'} settings-test`} role="status">
                {deepseekStatus.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>{deepseekStatus.text}</span>
              </div>
            )}
          </div>

          <div className="form-actions wk-actions">
            <button type="button" className="btn btn-primary" onClick={handleSavePrefs} disabled={savingPrefs || !canManage}>
              {savingPrefs ? <><Loader2 size={16} className="spinning" /> Saving…</> : <><Save size={16} /> Save preferences</>}
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
