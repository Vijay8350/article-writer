import * as deepseek from './deepseek.js';
import * as storefront from './storefront.js';

// The Instagram caption for a store product, used by the daily jobs and by the
// AI product images page. `context` needs site_url, and optionally site_name,
// currency, hashtags and caption_instructions.

const MAX_CAPTION = 2200; // Instagram limits
const MAX_HASHTAGS = 30;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

// Case-insensitive de-dupe that keeps the first spelling seen.
function uniqueTags(tags) {
  const seen = new Map();
  for (const t of tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()];
}

export async function buildCaption(context, product, { apiKey, model } = {}) {
  const storeName = context.site_name || new URL(context.site_url).hostname;
  const price = storefront.formatPrice(product.price, context.currency);
  const onSale = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.price);
  const priceLine = onSale
    ? `${price} (was ${storefront.formatPrice(product.compareAtPrice, context.currency)}, ${Math.round((1 - product.price / product.compareAtPrice) * 100)}% off)`
    : price;
  const fixedTags = context.hashtags?.match(HASHTAG_RE) || [];

  const prompt = `You write Instagram captions for "${storeName}", an online store.

PRODUCT
Title: ${product.title}
Price: ${priceLine || 'n/a'}
Type: ${product.productType || 'n/a'}
Tags: ${product.tags || 'n/a'}
Description: ${product.description || 'n/a'}
${context.caption_instructions ? `\nSTORE OWNER'S INSTRUCTIONS (follow these): ${context.caption_instructions}\n` : ''}
Write the caption:
- A scroll-stopping hook as the first line (it's all people see before "more")
- 2–4 short lines on why this product is great, using only the details above — never invent specs
- Mention the price
- End with a call to action to shop now
- Emojis welcome; keep it under 900 characters
- Do NOT put any URL or hashtags in the caption — they are added separately

Also suggest up to ${Math.max(5, 20 - fixedTags.length)} relevant, popular hashtags.

Return ONLY valid JSON, no markdown: {"caption": "...", "hashtags": ["#tag", "..."]}`;

  const raw = await deepseek.complete(prompt, apiKey, { temperature: 0.8, maxTokens: 1200, model });
  let body;
  let aiTags = [];
  try {
    const parsed = JSON.parse(raw.replace(/```json\s*|```/g, '').trim());
    body = String(parsed.caption || '').trim();
    aiTags = (Array.isArray(parsed.hashtags) ? parsed.hashtags.join(' ') : '').match(HASHTAG_RE) || [];
  } catch {
    body = raw.trim(); // model ignored the JSON format — use its text as-is
  }
  if (!body) throw new Error('DeepSeek returned an empty caption');

  const tagRoom = Math.max(0, MAX_HASHTAGS - (body.match(HASHTAG_RE) || []).length);
  const hashtags = uniqueTags([...fixedTags, ...aiTags]).slice(0, tagRoom).join(' ');
  const tail = `\n\n🛒 Shop now: ${product.url}${hashtags ? `\n\n${hashtags}` : ''}`;
  return body.slice(0, MAX_CAPTION - tail.length) + tail;
}
