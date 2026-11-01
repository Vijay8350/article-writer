import axios from 'axios';
import config from '../config/env.js';
import { aiImageInstructions } from '../lib/articleImagePrompts.js';
import { answerEngineRules, ENHANCE_RULES } from '../lib/articleStructure.js';
import { escapeControlChars, unreadableArticle } from '../lib/articleJson.js';
import { WRITING_RULES, EDITOR_SYSTEM, buildEditPrompt } from '../lib/articleCraft.js';

const DEEPSEEK_URL = config.deepseek.baseUrl;

// Used when a workspace hasn't picked a model in Settings → AI Preferences.
export const DEFAULT_MODEL = 'deepseek-chat';

async function callDeepSeek(messages, temperature = 0.7, maxTokens = 16000, apiKey, model = DEFAULT_MODEL) {
  const key = apiKey || config.deepseek.apiKey;
  // Current models spend max_tokens on their chain of thought as well as the answer, so
  // a small budget ends mid-thought with no reply at all. This only caps the reply: a
  // shorter one costs no more.
  const budget = Math.max(maxTokens, /reasoner|-pro\b/i.test(model) ? 32000 : 6000);
  const response = await axios.post(
    `${DEEPSEEK_URL}/chat/completions`,
    { model, messages, temperature, max_tokens: budget },
    {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 300000, // 5 minutes for long articles
    }
  );
  return response.data.choices[0].message.content;
}

// Generic single-shot completion (used by keyword ideation, etc.)
export async function complete(prompt, apiKey, { temperature = 0.7, maxTokens = 2000, model } = {}) {
  return callDeepSeek([{ role: 'user', content: prompt }], temperature, maxTokens, apiKey, model);
}

// Cheap live check that a key is accepted (falls back to the platform key); no tokens spent.
// Resolves to the model ids the key can use.
export async function verifyKey(apiKey) {
  try {
    const { data } = await axios.get(`${DEEPSEEK_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey || config.deepseek.apiKey}` },
      timeout: 30000,
    });
    return (data?.data || []).map((m) => m.id).filter(Boolean);
  } catch (error) {
    throw new Error(`DeepSeek rejected the key: ${error.response?.data?.error?.message || error.message}`);
  }
}

export async function generateArticle(prompt, ctx, apiKey, model) {
  const wordCount = ctx.wordCount || 1500;
  const sys = `You are a senior ecommerce content writer. You write genuinely helpful articles for shoppers, in the store's voice, around ${wordCount} words long (within 10%). Use 5-8 H2 sections with H3 sub-points where they help, lists, and internal links: 3-6 product links and 2-4 collection links using <a href="/products/HANDLE">descriptive anchor</a>.

You return ONLY valid JSON. Never markdown code blocks. Never explanations.`;

  const userPrompt = buildPrompt(prompt, ctx);
  const result = await callDeepSeek([
    { role: 'system', content: sys },
    { role: 'user', content: userPrompt }
  ], 0.7, 16000, apiKey, model);
  return parseResponse(result);
}

// The second pass: an editor tightens the draft without touching its structure.
export async function editArticle(article, ctx, apiKey, model) {
  const result = await callDeepSeek([
    { role: 'system', content: EDITOR_SYSTEM },
    { role: 'user', content: buildEditPrompt(article, ctx) },
  ], 0.4, 16000, apiKey, model);
  return parseResponse(result);
}

export async function enhanceArticle(article, instructions, ctx, apiKey, model) {
  const sys = `You are an expert blog editor. Enhance articles to be more human-sounding, better optimized for search engines and AI answer engines, and longer. Keep content AT LEAST as long as the original. Remove AI phrases. Add internal links. Return ONLY valid JSON.`;

  const prompt = `Enhance this article:

Title: ${article.title}
Body: ${article.bodyHtml || article.body_html || ''}
Tags: ${article.tags || ''}

Store: ${ctx?.storeName || 'N/A'}
Products: ${ctx?.products?.slice(0, 20).map(p => `"${p.title}" → /products/${p.handle}`).join(', ') || 'N/A'}
Collections: ${ctx?.collections?.slice(0, 10).map(c => `"${c.title}" → /collections/${c.handle}`).join(', ') || 'N/A'}

Instructions: ${instructions}

Requirements:
- Keep or INCREASE the word count
${WRITING_RULES}
- Remove AI phrases ("In today's world", "Let's dive in", etc.)
- Add 3-5 product/collection links: <a href="/products/HANDLE">keyword anchor</a>
- Add <strong> to key phrases
${ENHANCE_RULES}
${answerEngineRules(ctx?.storeName)}
- Ensure 5+ H2 headings

Return ONLY JSON: {"title":"","handle":"","bodyHtml":"KEEP IT LONG","summary":"","tags":"tag1, tag2, tag3, tag4, tag5, tag6","seoTitle":"(50-60 chars)","seoDescription":"(150-160 chars)","imagePrompts":[]}`;

  const result = await callDeepSeek([
    { role: 'system', content: sys },
    { role: 'user', content: prompt }
  ], 0.7, 16000, apiKey, model);
  return parseResponse(result);
}

export async function generateSeoMeta(article) {
  const prompt = `Generate SEO meta for:\nTitle: ${article.title}\nContent: ${(article.bodyHtml || '').substring(0, 800)}\n\nReturn ONLY JSON: {"seoTitle":"(50-60 chars)","seoDescription":"(150-160 chars)"}`;
  const result = await callDeepSeek([{ role: 'system', content: 'SEO expert. Return only JSON.' }, { role: 'user', content: prompt }], 0.3, 500);
  try {
    return JSON.parse(result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch { return { seoTitle: article.title?.substring(0, 60) || '', seoDescription: '' }; }
}

// Brand profile from an Instagram + website Business DNA (empty for Shopify-only DNA).
function brandLines(ctx) {
  return [
    ctx.brandSummary && `About the brand: ${ctx.brandSummary}`,
    ctx.brandVoice && `Brand voice (write in this tone): ${ctx.brandVoice}`,
    ctx.brandKeywords?.length && `Brand keywords: ${ctx.brandKeywords.join(', ')}`,
  ].filter(Boolean).join('\n');
}

function buildPrompt(userPrompt, ctx) {
  const wordCount = ctx.wordCount || 1500;
  const products = ctx.products?.slice(0, 30).map(p => `- "${p.title}" → /products/${p.handle}${p.facts ? ` | ${p.facts}` : ''}`).join('\n') || 'None';
  const collections = ctx.collections?.slice(0, 15).map(c => `- "${c.title}" → /collections/${c.handle}`).join('\n') || 'None';
  const articles = ctx.existingArticles?.slice(0, 20).map(a => `- "${a.title}" → /blogs/${a.blogHandle || 'news'}/${a.handle}`).join('\n') || 'None';

  const imgs = ctx.inlineImages || ctx.selectedImages || [];
  const featured = ctx.featuredImage || null;
  const featuredBlock = featured
    ? `FEATURED IMAGE (hero — set as the Shopify article image; DO NOT embed inline):\n- URL: ${featured.src}\n- PRODUCT: "${featured.productTitle}" → /products/${featured.productHandle}\n- Never reuse this URL in the body.`
    : `FEATURED IMAGE: none available.`;
  const imageBlock = imgs.length
    ? `INLINE IMAGES — embed EACH below using EXACTLY:
<figure><img src="IMG_URL" alt="ALT" loading="lazy" width="800" height="800"><figcaption><a href="/products/HANDLE">TITLE</a></figcaption></figure>
Use the exact IMG_URL (never invent URLs). Always non-empty alt. Place at natural section breaks (not in the intro, never two in a row).
${imgs.map(i => `- IMG_URL: ${i.src || i.imageUrl} | PRODUCT: "${i.title}" → /products/${i.handle} | ALT: ${i.alt}`).join('\n')}`
    : ctx.aiImageSlots
      ? 'INLINE PRODUCT IMAGES: none to embed.'
      : `INLINE IMAGES — none available; add 2-3 placeholders: <div class="article-image-placeholder" data-prompt="DETAIL"><p>[Image: CAPTION]</p></div>`;

  const primaryKeyword = ctx.primaryKeyword || userPrompt;
  const secondary = Array.isArray(ctx.secondaryKeywords) && ctx.secondaryKeywords.length
    ? ctx.secondaryKeywords.join(', ')
    : '(pick 4-6 related terms)';

  return `TARGET LENGTH: about ${wordCount} words.

Store: ${ctx.storeName || 'N/A'} (${ctx.niche || 'e-commerce'}) — ${ctx.storeDomain || ''}
Audience: ${ctx.targetAudience || 'General shoppers'}
${brandLines(ctx)}
PRODUCTS (recommend 3-6 of these, using only the details shown):
${products}

COLLECTIONS (link to 2-4 in article):
${collections}

EXISTING ARTICLES (link to 1-3):
${articles}

TOPIC: ${userPrompt}
PRIMARY KEYWORD: "${primaryKeyword}" — must appear in: the title, the first 100 words, ONE H2, and the meta description. ~0.5-1.5% density.
SECONDARY KEYWORDS: ${secondary} — sprinkle naturally.

STRUCTURE REQUIRED (in this exact order, no H1 in body):
1) INTRO: 2-3 sentences. BLUF. Primary keyword in the first 100 words.
${wordCount >= 1200 ? `2) KEY TAKEAWAYS: <h2>Key Takeaways</h2> with a <ul> of 3-5 one-sentence facts that answer the topic on their own.
3) 4-7 <h2> sections (150-300 words each), <h3> sub-points where useful. At least one <ul>/<ol>. Where relevant, ONE comparison <table>. Bold 8-15 key phrases.
4) Final <h2>Frequently Asked Questions</h2> with 3-5 <h3>question / <p>answer pairs.
5) Conclusion + soft CTA mentioning ${ctx.storeName || 'the store'} (link to a product or collection).
` : `2) 4-7 <h2> sections (150-300 words each), <h3> sub-points where useful. At least one <ul>/<ol>. Bold 8-15 key phrases.
3) Final <h2>Frequently Asked Questions</h2> with 3-5 <h3>question / <p>answer pairs.
4) Conclusion + soft CTA mentioning ${ctx.storeName || 'the store'} (link to a product or collection).`}

${featuredBlock}

${imageBlock}
${ctx.aiImageSlots ? `\n${aiImageInstructions(ctx.aiImageSlots)}\n` : ''}
${ctx.campaignInstructions ? `CAMPAIGN INSTRUCTIONS (follow these first): ${ctx.campaignInstructions}\n` : ''}
${answerEngineRules(ctx.storeName)}

${WRITING_RULES}

Return ONLY valid JSON (no markdown fences):
{"title":"SEO title 50-70 chars, primary keyword near the front","handle":"keyword-slug","primaryKeyword":"${primaryKeyword}","bodyHtml":"<p>BLUF intro with primary keyword in first 100 words ...</p>...${wordCount}+ words total","summary":"1-2 sentence excerpt including the primary keyword","tags":"primary kw, secondary 1, secondary 2, secondary 3, niche tag, brand tag","seoTitle":"Primary Keyword - Benefit | ${ctx.storeName || 'Store'} (50-60 chars)","seoDescription":"150-160 char meta description with primary keyword + CTA","imagePrompts":["fallback 1","fallback 2"]}`;
}

function parseResponse(raw) {
  try {
    let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Extract JSON if there's text around it
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart > 0 || jsonEnd < cleaned.length - 1) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }

    const p = JSON.parse(cleaned);
    return {
      title: p.title || 'Untitled',
      handle: p.handle || '',
      bodyHtml: p.bodyHtml || p.body_html || '',
      summary: p.summary || '',
      tags: p.tags || '',
      seoTitle: p.seoTitle || p.title || '',
      seoDescription: p.seoDescription || '',
      imagePrompts: p.imagePrompts || [],
      primaryKeyword: p.primaryKeyword || ''
    };
  } catch (e) {
    console.error('Failed to parse DeepSeek response:', e.message);

    // Try to extract JSON
    try {
      const jsonMatch = raw.match(/\{[\s\S]*"bodyHtml"[\s\S]*\}/);
      const p = jsonMatch ? JSON.parse(escapeControlChars(jsonMatch[0])) : null;
      if (p?.title && p.bodyHtml) {
        return {
          title: p.title,
          handle: p.handle || '',
          bodyHtml: p.bodyHtml,
          summary: p.summary || '',
          tags: p.tags || '',
          seoTitle: p.seoTitle || p.title,
          seoDescription: p.seoDescription || '',
          imagePrompts: p.imagePrompts || [],
          primaryKeyword: p.primaryKeyword || ''
        };
      }
    } catch { /* unreadable: handled below */ }

    throw unreadableArticle('DeepSeek');
  }
}

export default { generateArticle, enhanceArticle, generateSeoMeta };
