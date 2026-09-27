import axios from 'axios';
import config from '../config/env.js';

const DEEPSEEK_URL = config.deepseek.baseUrl;

// Used when a workspace hasn't picked a model in Settings → AI Preferences.
export const DEFAULT_MODEL = 'deepseek-chat';

async function callDeepSeek(messages, temperature = 0.7, maxTokens = 16000, apiKey, model = DEFAULT_MODEL) {
  const key = apiKey || config.deepseek.apiKey;
  // Reasoner models spend max_tokens on their chain of thought as well as the
  // answer, so a small budget would end mid-thought with no JSON at all.
  const budget = /reasoner/i.test(model) ? Math.max(maxTokens, 32000) : maxTokens;
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
  const minWords = Math.round(wordCount * 0.9);

  const sys = `You are a senior content strategist who has written for major publications for 15+ years. You write like a REAL HUMAN — opinionated, conversational, authentic. You NEVER sound robotic or AI-generated.

CRITICAL RULES:
1. WORD COUNT: You MUST write EXACTLY ${wordCount} words (minimum ${minWords}). If the user asks for ${wordCount} words, you write ${wordCount} words. NOT 500, NOT 800. FULL ${wordCount} WORDS. Each H2 section = 200-400 words.
2. HUMAN VOICE: Use contractions (you'll, it's, don't). Include opinions ("Honestly, I think...", "Here's what most people miss..."). Use rhetorical questions. Vary sentences from 3 words to 25 words.
3. BANNED PHRASES (NEVER use these): "In today's fast-paced world", "Let's dive in", "Without further ado", "In the realm of", "It's important to note", "In conclusion", "Unlock the power", "Navigate the world", "Game-changer", "Cutting-edge", "Embark on", "Elevate your", "Comprehensive guide"
4. SEO: 5-8 H2s with keywords, 2-4 H3s, bold key phrases, bullet lists, internal links
5. LINKS: You MUST include 3-6 product links and 2-4 collection links using <a href="/products/HANDLE">keyword anchor</a>

You return ONLY valid JSON. Never markdown code blocks. Never explanations.`;

  const userPrompt = buildPrompt(prompt, ctx);
  const result = await callDeepSeek([
    { role: 'system', content: sys },
    { role: 'user', content: userPrompt }
  ], 0.9, 16000, apiKey, model);
  return parseResponse(result);
}

export async function enhanceArticle(article, instructions, ctx, apiKey, model) {
  const sys = `You are an expert blog editor. Enhance articles to be more human-sounding, better SEO-optimized, and longer. Keep content AT LEAST as long as the original. Remove AI phrases. Add internal links. Return ONLY valid JSON.`;

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
- Make tone human: contractions, opinions, questions, varied sentences
- Remove AI phrases ("In today's world", "Let's dive in", etc.)
- Add 3-5 product/collection links: <a href="/products/HANDLE">keyword anchor</a>
- Add <strong> to key phrases
- Add image placeholders if missing
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
  const products = ctx.products?.slice(0, 30).map(p => `- "${p.title}" → /products/${p.handle}`).join('\n') || 'None';
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
    : `INLINE IMAGES — none available; add 2-3 placeholders: <div class="article-image-placeholder" data-prompt="DETAIL"><p>[Image: CAPTION]</p></div>`;

  const primaryKeyword = ctx.primaryKeyword || userPrompt;
  const secondary = Array.isArray(ctx.secondaryKeywords) && ctx.secondaryKeywords.length
    ? ctx.secondaryKeywords.join(', ')
    : '(pick 4-6 related terms)';

  return `████████████████████████████████████████
██  WRITE EXACTLY ${wordCount} WORDS.         ██
██  NOT 500. NOT 800. FULL ${wordCount}.       ██
██  EACH H2 = 200-400 WORDS MINIMUM.   ██
████████████████████████████████████████

Store: ${ctx.storeName || 'N/A'} (${ctx.niche || 'e-commerce'}) — ${ctx.storeDomain || ''}
Audience: ${ctx.targetAudience || 'General shoppers'}
${brandLines(ctx)}
PRODUCTS (link to 3-6 in article):
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
${wordCount >= 1200 ? `2) "In this article" TOC with anchor links to each H2 (slug ids on the H2s).
3) 4-7 <h2> sections (150-300 words each), <h3> sub-points where useful. At least one <ul>/<ol>. Where relevant, ONE comparison <table>. Bold 8-15 key phrases.
4) Final <h2>Frequently Asked Questions</h2> with 3-5 <h3>question / <p>answer pairs.
5) Conclusion + soft CTA mentioning ${ctx.storeName || 'the store'} (link to a product or collection).
` : `2) 4-7 <h2> sections (150-300 words each), <h3> sub-points where useful. At least one <ul>/<ol>. Bold 8-15 key phrases.
3) Final <h2>Frequently Asked Questions</h2> with 3-5 <h3>question / <p>answer pairs.
4) Conclusion + soft CTA mentioning ${ctx.storeName || 'the store'} (link to a product or collection).`}

${featuredBlock}

${imageBlock}

WRITING STYLE:
- Contractions: you'll, it's, don't, we've, that's
- Personal opinions: "Honestly...", "Here's what most people miss...", "What I've found is..."
- Rhetorical questions: "But does that actually work?", "Sound familiar?"
- Mix short sentences (3-5 words) with longer detailed ones
- Transitions: "That said,", "Look,", "The reality is,", "Here's why:"

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
      if (jsonMatch) {
        const p = JSON.parse(jsonMatch[0]);
        return {
          title: p.title || 'Generated Article',
          handle: p.handle || '',
          bodyHtml: p.bodyHtml || '',
          summary: p.summary || '',
          tags: p.tags || '',
          seoTitle: p.seoTitle || '',
          seoDescription: p.seoDescription || '',
          imagePrompts: p.imagePrompts || [],
          primaryKeyword: p.primaryKeyword || ''
        };
      }
    } catch { /* fallback below */ }

    return {
      title: 'Generated Article',
      handle: '',
      bodyHtml: raw,
      summary: '',
      tags: '',
      seoTitle: '',
      seoDescription: '',
      imagePrompts: []
    };
  }
}

export default { generateArticle, enhanceArticle, generateSeoMeta };
