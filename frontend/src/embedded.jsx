import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { setToken, setActiveWorkspaceId } from './lib/api';
import { startShopifySession, EMBEDDED_BASE } from './lib/embedded';

// The app inside the Shopify admin: sign in with Shopify's session token, then run the
// same app under /shopify with the admin's own navigation (Layout renders <ui-nav-menu>).
document.documentElement.dataset.theme = 'light'; // the Shopify admin is light

const root = ReactDOM.createRoot(document.getElementById('root'));

function Centered({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>{children}</div>
    </div>
  );
}

async function boot() {
  root.render(<Centered><div className="spinner spinner-lg" style={{ margin: '0 auto 16px' }} /><p style={{ color: 'var(--text-muted)' }}>Opening Glowquill…</p></Centered>);
  try {
    const session = await startShopifySession();
    setToken(session.token);
    setActiveWorkspaceId(session.workspaceId);
    sessionStorage.removeItem('aw_embedded_reload');
    root.render(
      <React.StrictMode>
        <HelmetProvider>
          <BrowserRouter basename={EMBEDDED_BASE}>
            <AuthProvider>
              <App />
              <Toaster position="top-center" toastOptions={{ style: { background: 'var(--toast-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: '14px', fontSize: '14px' } }} />
            </AuthProvider>
          </BrowserRouter>
        </HelmetProvider>
      </React.StrictMode>
    );
  } catch (err) {
    root.render(
      <Centered>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Glowquill couldn't open</h1>
        <p style={{ color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto 20px' }}>{err.message}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
      </Centered>
    );
  }
}

boot();
