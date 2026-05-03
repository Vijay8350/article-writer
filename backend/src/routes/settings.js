import { Router } from 'express';
import { getShopInfo, setShopifyCredentials, getShopifyCredentials } from '../services/shopify.js';
import config from '../config/env.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../../.env');
const router = Router();

// Get current settings
router.get('/', (req, res) => {
  const creds = getShopifyCredentials();
  res.json({
    success: true,
    data: {
      storeUrl: creds.storeUrl || '',
      connected: !!(creds.storeUrl && creds.accessToken),
      hasAccessToken: !!creds.accessToken,
    },
  });
});

// Test & save Shopify connection
router.post('/connect', async (req, res, next) => {
  try {
    const { storeUrl, accessToken } = req.body;
    if (!storeUrl || !accessToken) {
      return res.status(400).json({ success: false, error: 'Store URL and access token are required' });
    }

    const cleanUrl = storeUrl.trim().replace(/\/$/, '').replace(/^https?:\/\//, '');

    // Set credentials temporarily to test
    setShopifyCredentials(cleanUrl, accessToken);

    // Test connection
    const shop = await getShopInfo();

    // Update .env file
    try {
      let envContent = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
      envContent = envContent.replace(/^SHOPIFY_STORE_URL=.*/m, `SHOPIFY_STORE_URL=${cleanUrl}`);
      envContent = envContent.replace(/^SHOPIFY_ACCESS_TOKEN=.*/m, `SHOPIFY_ACCESS_TOKEN=${accessToken}`);
      writeFileSync(envPath, envContent);
    } catch (e) {
      console.warn('Could not update .env file:', e.message);
    }

    res.json({
      success: true,
      message: 'Connected successfully!',
      data: {
        shop: { name: shop.name, domain: shop.domain, email: shop.email, country: shop.country_name },
      },
    });
  } catch (error) {
    // Reset credentials on failure
    setShopifyCredentials('', '');
    const msg = error.response?.status === 401 ? 'Invalid access token' :
      error.response?.status === 404 ? 'Store not found' :
        error.code === 'ENOTFOUND' ? 'Store URL not found' :
          `Connection failed: ${error.message}`;
    res.status(400).json({ success: false, error: msg });
  }
});

// Disconnect
router.post('/disconnect', (req, res) => {
  setShopifyCredentials('', '');
  try {
    let envContent = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
    envContent = envContent.replace(/^SHOPIFY_STORE_URL=.*/m, 'SHOPIFY_STORE_URL=');
    envContent = envContent.replace(/^SHOPIFY_ACCESS_TOKEN=.*/m, 'SHOPIFY_ACCESS_TOKEN=');
    writeFileSync(envPath, envContent);
  } catch (e) { /* ignore */ }
  res.json({ success: true, message: 'Disconnected' });
});

export default router;
