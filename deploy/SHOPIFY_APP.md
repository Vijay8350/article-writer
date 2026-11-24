# Article Writer on the Shopify App Store — setup

The same site serves two kinds of customer:

- **Website visitors** sign up at app.jsyxi.com and connect their store from **Settings → Connect with Shopify**.
- **Shopify merchants** install the app from the Shopify App Store. It opens inside their Shopify admin, makes them a workspace automatically, and bills plans on their Shopify invoice.

Both use **one public Shopify app**. These steps create it. Everything in the code is already in place; the app just needs its Client ID and secret.

## 1. Create the app (once)

1. Sign in to the **Shopify Dev Dashboard** with your Partner account (create a free Partner account at partners.shopify.com if you don't have one).
2. **Apps → Create app → Start from Dev Dashboard.** Name it **Article Writer**.
3. Open the app's configuration (create a new **version**) and set:

| Setting | Value |
|---|---|
| App URL | `https://app.jsyxi.com/shopify` |
| Embed app in Shopify admin | **On** |
| Use legacy install flow | **Off** (Shopify-managed installation) |
| Access scopes | `read_products, write_products, read_content, write_content, write_files, read_themes, read_publications, write_publications` |
| Allowed redirect URL | `https://app.jsyxi.com/api/shopify/callback` |
| Webhooks API version | `2026-10` |
| Webhook: `app/uninstalled`, `app/scopes_update`, `app_subscriptions/update` | `https://app.jsyxi.com/api/shopify/webhooks` |
| Compliance webhooks: customer data request, customer redact, shop redact | `https://app.jsyxi.com/api/shopify/webhooks` (all three) |

   Then **Release** the version.
   *(Same thing from a terminal: put the Client ID in `shopify.app.toml`, then `shopify app deploy` with Shopify CLI.)*

4. Copy the **Client ID** and **Client secret** (app **Settings**). The secret is a password: don't paste it anywhere except the server's `.env`.

## 2. Put the credentials on the server

SSH to the server and add to `/home/ubuntu/Article_Writer/.env`:

```
SHOPIFY_CLIENT_ID=<Client ID>
SHOPIFY_CLIENT_SECRET=<Client secret>
SHOPIFY_APP_HANDLE=article-writer          # the part after /apps/ in your app's admin URL
SHOPIFY_BILLING_TEST=true                  # test charges until Shopify approves the app
```

Then: `pm2 reload article-writer-backend --update-env`

Check: `https://app.jsyxi.com/api/shopify/status` should say `"configured": true`.

## 3. Prices for Shopify Billing

**Admin → Plans → "Price on Shopify ($ / month)"** for Pro and Business, then Save. Stores billed in rupees pay the ₹ price; everyone else pays the $ price (Shopify shows them an estimate in their own currency).

## 4. Test on a development store

1. Dev Dashboard → **Stores → Create a development store**.
2. On the app's page, **Install** it on that store.
3. In the store's admin, open **Apps → Article Writer**: the app opens with its menu in Shopify's sidebar. Settings shows "Connected with: The Article Writer app in Shopify".
4. Build Business DNA, write an article, publish it.
5. **Plan & billing → Choose Pro**, approve the (test) charge: you come back on Pro.

Website side: sign up on app.jsyxi.com, **Settings → Connect with Shopify** with the development store's address.
Before the App Store approves the app, Shopify only lets it install on development stores, so real merchants can connect after approval.

## 5. Publish on the App Store

1. Dev Dashboard → **Distribution → Public distribution** (this can't be changed later).
2. Create the listing: name, short description, icon (1200 × 1200), at least 3 screenshots, a short demo video, plans and prices, support email, privacy policy `https://app.jsyxi.com/privacy`.
3. Submit for review. Shopify tests installing, the app inside the admin, billing (test mode), and the privacy webhooks.
4. After approval, set `SHOPIFY_BILLING_TEST=false` and reload.

## Notes

- Tokens: the app gets expiring tokens (an hour) with refresh tokens, as Shopify requires for public apps; the server renews them by itself.
- Review stars (an SEO fix that edits the theme) stays available for stores connected with a pasted token only. The App Store app doesn't ask for theme-editing access; it needs a theme app extension first.
- Uninstalling the app removes its access at once; 48 hours later Shopify asks us to delete the shop's data and we do (`shop/redact`).
