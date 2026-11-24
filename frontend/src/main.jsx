import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import './index.css'; // first, so page stylesheets imported by the app can build on it
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { watchSystemTheme } from './lib/theme';

watchSystemTheme(); // on 'System', follow the device's light/dark setting

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
    <BrowserRouter>
      <AuthProvider>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--toast-bg)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '14px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
            backdropFilter: 'blur(20px)',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: 'var(--accent-success)', secondary: 'var(--bg-card)' } },
          error: { iconTheme: { primary: 'var(--accent-danger)', secondary: 'var(--bg-card)' } },
        }}
      />
      </AuthProvider>
    </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
