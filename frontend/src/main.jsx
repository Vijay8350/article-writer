import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

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
            background: 'rgba(255, 255, 255, 0.96)',
            color: '#1d1d1f',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: '14px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
            backdropFilter: 'blur(20px)',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#1f8a3b', secondary: '#ffffff' } },
          error: { iconTheme: { primary: '#d70015', secondary: '#ffffff' } },
        }}
      />
      </AuthProvider>
    </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
