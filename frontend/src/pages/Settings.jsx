import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Settings as SettingsIcon, Link2, Unlink, CheckCircle2, AlertCircle, Loader2, Save } from 'lucide-react';
import { getSettings, connectShopify, disconnectShopify, saveAiKeys } from '../lib/api';
import toast from 'react-hot-toast';

export default function Settings() {
  const { setConnected, setStoreName } = useOutletContext();
  const [storeUrl, setStoreUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [shopInfo, setShopInfo] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Per-user AI keys (optional overrides)
  const [geminiKey, setGeminiKey] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [keyPresence, setKeyPresence] = useState({ hasGemini: false, hasDeepseek: false });
  const [savingKeys, setSavingKeys] = useState(false);

  useEffect(() => {
    getSettings().then(res => {
      const data = res.data || {};
      setStoreUrl(data.storeUrl || '');
      setIsConnected(data.connected || false);
      setKeyPresence(data.aiKeys || { hasGemini: false, hasDeepseek: false });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

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

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>⚙️ Settings</h1>
        <p>Connect your Shopify store to get started</p>
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

        {/* Per-user AI Keys */}
        <div className="card">
          <div className="card-header"><h2>🤖 AI Configuration</h2></div>
          <div className="card-body">
            <div className="form-helper mb-16">
              Optional — add your own AI keys to use your own quota. Leave blank to use the platform's
              shared keys. Keys are encrypted before storage and never shown again.
            </div>

            <div className="form-group">
              <label className="form-label">
                Google Gemini API Key
                {keyPresence.hasGemini && (
                  <span className="badge badge-success" style={{ marginLeft: 8 }}>● Set</span>
                )}
              </label>
              <input
                className="form-input"
                type="password"
                value={geminiKey}
                onChange={e => setGeminiKey(e.target.value)}
                placeholder={keyPresence.hasGemini ? '•••••••• (enter new key to replace)' : 'AIza...'}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                DeepSeek API Key
                {keyPresence.hasDeepseek && (
                  <span className="badge badge-success" style={{ marginLeft: 8 }}>● Set</span>
                )}
              </label>
              <input
                className="form-input"
                type="password"
                value={deepseekKey}
                onChange={e => setDeepseekKey(e.target.value)}
                placeholder={keyPresence.hasDeepseek ? '•••••••• (enter new key to replace)' : 'sk-...'}
              />
            </div>

            <button className="btn btn-primary w-full" onClick={handleSaveKeys} disabled={savingKeys}>
              {savingKeys ? <><Loader2 size={16} className="spinning" /> Saving...</> : <><Save size={16} /> Save AI Keys</>}
            </button>
          </div>
        </div>
      </div>
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
