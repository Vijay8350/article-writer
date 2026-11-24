import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Two pages: the website (index.html) and the app inside the Shopify admin
      // (shopify.html, served by the backend at /shopify with a per-shop framing rule).
      input: {
        main: resolve(__dirname, 'index.html'),
        shopify: resolve(__dirname, 'shopify.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        timeout: 300000, // 5 min for long AI generation
      },
    },
  },
});
