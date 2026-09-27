import axios from 'axios';
import config from '../config/env.js';

function geminiUrl(apiKey) {
  const key = apiKey || config.gemini.apiKey;
  return `${config.gemini.baseUrl}/models/${config.gemini.model}:generateContent?key=${key}`;
}

async function callGemini(prompt, temperature = 0.8, maxTokens = 65000, apiKey) {
  try {
    const response = await axios.post(
      geminiUrl(apiKey),
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.95,
          topK: 40,
        },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000, // 5 minutes for long articles
      }
    );

    const candidate = response.data.candidates?.[0];
    if (!candidate?.content?.parts?.[0]?.text) {
      throw new Error('No content returned from Gemini');
    }
    return candidate.content.parts[0].text;
  } catch (error) {
    if (error.response?.data) {
      console.error('Gemini API error:', JSON.stringify(error.response.data));
      throw new Error(`Gemini API error: ${error.response.data.error?.message || 'Unknown error'}`);
    }
    throw error;
  }
}

// Generic single-shot completion (used by keyword ideation, etc.)
export async function complete(prompt, apiKey, { temperature = 0.8, maxTokens = 2000 } = {}) {
  return callGemini(prompt, temperature, maxTokens, apiKey);
}

// Cheap live check that a key can call generateContent on the configured model
// (falls back to the platform key). Throws a user-facing message if Google refuses.
export async function verifyKey(apiKey) {
  try {
    await axios.post(
      geminiUrl(apiKey),
      { contents: [{ parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 8 } },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
  } catch (error) {
    const err = error.response?.data?.error;
    if (err?.details?.some(d => d.reason === 'API_KEY_SERVICE_BLOCKED')) {
      throw new Error('Gemini key is not allowed to use the Gemini API — add "Generative Language API" to the key\'s API restrictions in Google Cloud');
    }
    throw new Error(`Gemini rejected the key: ${err?.message || error.message}`);
  }
}

export async function generateArticle(prompt, businessContext, apiKey) {
  const fullPrompt = buildArticlePrompt(prompt, businessContext);
  const result = await callGemini(fullPrompt, 0.9, 65000, apiKey);
  return parseArticleResponse(result);
}

export async function enhanceArticle(article, instructions, businessContext, apiKey) {
  const prompt = buildEnhancePrompt(article, instructions, businessContext);
  const result = await callGemini(prompt, 0.7, 65000, apiKey);
  return parseArticleResponse(result);
}

export async function generateSeoMeta(article) {
  const prompt = `You are an SEO expert. Generate optimized meta tags for this blog article.

Article Title: ${article.title}
Article Content Summary: ${(article.bodyHtml || '').substring(0, 1000)}
Tags: ${article.tags || 'none'}

Return ONLY valid JSON with:
{
  "seoTitle": "SEO optimized title (50-60 characters, include primary keyword)",
  "seoDescription": "Compelling meta description (150-160 characters, include CTA and keyword)"
}

CRITICAL: Return ONLY the JSON, no markdown, no explanation.`;

  const result = await callGemini(prompt, 0.3, 1000);
  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return { seoTitle: article.title.substring(0, 60), seoDescription: '' };
  }
}

function buildArticlePrompt(userPrompt, ctx) {
  const wordCount = ctx.wordCount || 1500;
  const minWords = Math.round(wordCount * 0.9);
  const maxWords = Math.round(wordCount * 1.1);

  const productsSection = ctx.products?.slice(0, 30).map(p => `- "${p.title}" → /products/${p.handle}`).join('\n') || 'No products available';
  const collectionsSection = ctx.collections?.slice(0, 15).map(c => `- "${c.title}" → /collections/${c.handle}`).join('\n') || 'No collections available';
  const articlesSection = ctx.existingArticles?.slice(0, 20).map(a => `- "${a.title}" → /blogs/${a.blogHandle || 'news'}/${a.handle}`).join('\n') || 'No existing articles';

  const inlineImages = ctx.inlineImages || ctx.selectedImages || [];
  const featured = ctx.featuredImage || null;
  const inlineSection = inlineImages.length
    ? inlineImages.map(img => `- IMG_URL: ${img.src || img.imageUrl}\n  PRODUCT: "${img.title}" → /products/${img.handle}\n  ALT: ${img.alt}`).join('\n')
    : '';

  const primaryKeyword = ctx.primaryKeyword || userPrompt;
  const secondaryKeywords = Array.isArray(ctx.secondaryKeywords) ? ctx.secondaryKeywords : [];
  const secondaryList = secondaryKeywords.length ? secondaryKeywords.join(', ') : '(none specified — pick 4-6 natural related terms)';

  return `You are a senior content strategist and professional blog writer who has written for major publications. You write like a real human — opinionated, thoughtful, and with genuine expertise. You NEVER sound like AI.

I need you to write a LONG, DETAILED, IN-DEPTH blog article. This is the MOST IMPORTANT instruction:

████████████████████████████████████████████████████
██  MANDATORY WORD COUNT: EXACTLY ${wordCount} WORDS    ██
██  MINIMUM: ${minWords} words  |  MAXIMUM: ${maxWords} words   ██
██  COUNT YOUR WORDS. DO NOT WRITE LESS.            ██
██  THE ARTICLE BODY MUST BE ${wordCount}+ WORDS LONG.   ██
████████████████████████████████████████████████████

If I ask for ${wordCount} words and you write only 500-800 words, that is a FAILURE. You MUST write the full ${wordCount} words. Each H2 section should be 200-400 words minimum. Expand every point with details, examples, stories, and expert insights.

=== ABOUT THE BUSINESS ===
Store: ${ctx.storeName || 'N/A'} (${ctx.storeDomain || ''})
Industry/Niche: ${ctx.niche || 'E-commerce'}
Audience: ${ctx.targetAudience || 'General online shoppers'}
${[
    ctx.brandSummary && `About the brand: ${ctx.brandSummary}`,
    ctx.brandVoice && `Brand voice (write in this tone): ${ctx.brandVoice}`,
    ctx.brandKeywords?.length && `Brand keywords: ${ctx.brandKeywords.join(', ')}`,
  ].filter(Boolean).join('\n')}

=== PRODUCTS TO LINK (use 3-6 naturally in the article) ===
${productsSection}

=== COLLECTIONS TO LINK (use 2-4 naturally) ===
${collectionsSection}

=== EXISTING ARTICLES (link to 1-3, avoid duplicating their topics) ===
${articlesSection}

=== ARTICLE TOPIC ===
${userPrompt}

=== WRITING STYLE REQUIREMENTS ===

HUMAN TONE (CRITICAL — readers must NOT detect AI):
- Write like a real person talking to a friend who asked for advice
- Use contractions: "you'll", "it's", "don't", "we've", "that's"
- Include personal-sounding opinions: "Honestly, I think...", "What most people get wrong is...", "Here's the thing nobody tells you..."
- Add rhetorical questions: "But does that actually work?", "Sound familiar?", "So what's the catch?"
- Vary sentence lengths dramatically: some 4-word sentences. Then a longer, more complex sentence that weaves in details and nuance. Then something short again.
- Use transitional phrases real writers use: "That said,", "Look,", "The reality is,", "Here's why this matters:", "On the flip side,"
- NEVER use these AI phrases: "In today's fast-paced world", "In this comprehensive guide", "Let's dive in", "Without further ado", "In the realm of", "It's important to note", "Whether you're a beginner or expert", "In conclusion", "To sum up", "Unlock the power", "Navigate the world of", "Embark on a journey", "Elevate your", "Supercharge your", "Game-changer", "Revolutionize", "Cutting-edge"
- Write as if you've personally used or experienced what you're discussing
- Include 1-2 slightly opinionated takes that a real expert would have

KEYWORDS (target these):
- PRIMARY keyword: "${primaryKeyword}" — use in: the title, first 100 words of the intro, exactly one H2, and the meta description. Density ~0.5–1.5% (no stuffing).
- SECONDARY/related keywords: ${secondaryList}. Sprinkle naturally across H2/H3 headings and body.

ARTICLE STRUCTURE (CRITICAL — follow this order exactly, no H1 in body):
1. INTRO: 2-3 sentences. State the value up front (BLUF). Include the primary keyword naturally in the FIRST 100 words.
${wordCount >= 1200 ? `2. TOC: a short "In this article" block with anchor links to each H2 section (use slug-style #anchor ids), e.g. <p><strong>In this article:</strong> <a href="#section-one">Title</a> · <a href="#section-two">Title</a> ...</p>. Add matching id="..." attributes on the H2s.
` : ''}${wordCount >= 1200 ? '3' : '2'}. 4-7 <h2> sections (150-300 words each), with <h3> sub-points where useful. At least one <ul>/<ol> list. Where genuinely useful (comparison/options/specs), include ONE <table> with <thead><tbody>. Bold 8-15 key phrases with <strong>.
${wordCount >= 1200 ? '4' : '3'}. FAQ section: a final <h2>Frequently Asked Questions</h2> with 3-5 <h3> question/answer pairs. Each Q is an <h3>; the answer follows as 1-2 <p> tags. (We extract these for FAQPage schema — match the structure exactly.)
${wordCount >= 1200 ? '5' : '4'}. CONCLUSION + CTA: a short closing paragraph that includes the primary keyword and a soft CTA linking to a relevant product or collection.

INTERNAL LINKING (MANDATORY):
- 3-6 product links: <a href="/products/HANDLE">descriptive keyword-rich anchor</a>
- 2-4 collection links: <a href="/collections/HANDLE">descriptive anchor</a>
- 1-3 existing-article links: <a href="/blogs/BLOG_HANDLE/ARTICLE_HANDLE">anchor</a>
- Anchor text = real keywords, NEVER "click here"/"learn more".

${featured ? `FEATURED IMAGE (the article's hero/thumbnail — DO NOT embed inline; we set it separately):
- URL: ${featured.src}
- PRODUCT: "${featured.productTitle}" → /products/${featured.productHandle}
- This is the Shopify article's main image. NEVER repeat this same URL in the body.
` : `FEATURED IMAGE: none available — we'll publish without a main image.
`}
INLINE IMAGES (place each in the body at natural breaks, NEVER two in a row, NEVER in the intro):
${inlineSection
    ? `Embed EACH of these images ONCE in the body using EXACTLY this pattern (use the exact IMG_URL — never invent URLs). Place near text where the product is genuinely relevant.
<figure>
  <img src="IMG_URL" alt="ALT" loading="lazy" width="800" height="800">
  <figcaption><a href="/products/HANDLE">PRODUCT TITLE</a></figcaption>
</figure>
Always include the contextual product link in the figcaption. Always include non-empty alt text.

AVAILABLE INLINE IMAGES:
${inlineSection}`
    : `No matching product images available. Insert 2-3 placeholders between sections instead:
<div class="article-image-placeholder" data-prompt="DETAILED_IMAGE_DESCRIPTION"><p>[Image: SHORT_CAPTION]</p></div>`}

=== OUTPUT FORMAT ===
Return ONLY valid JSON (no markdown fences, no preamble):

{"title":"SEO title 50-70 chars with primary keyword near the front","handle":"keyword-slug-short","primaryKeyword":"${primaryKeyword}","bodyHtml":"<p>BLUF intro (2-3 sentences) with primary keyword in the first 100 words ...</p>...${wordCount}+ words total","summary":"1-2 sentence excerpt that hooks readers and includes the primary keyword.","tags":"primary keyword, secondary 1, secondary 2, secondary 3, niche tag, brand tag","seoTitle":"Primary Keyword - Benefit | ${ctx.storeName || 'Store'} (50-60 chars)","seoDescription":"Compelling 150-160 char meta description including the primary keyword and a clear CTA.","imagePrompts":["fallback prompt 1","fallback prompt 2"]}

REMEMBER: The bodyHtml field MUST contain ${wordCount}+ words of rich, detailed, expert-level content. Count your words. Each section must be substantial — 200-400 words minimum per H2 section.`;
}

function buildEnhancePrompt(article, instructions, ctx) {
  return `You are an expert blog editor and SEO specialist. Enhance the following article based on the instructions while keeping the same approximate length or making it longer.

=== CURRENT ARTICLE ===
Title: ${article.title}
Body HTML:
${article.bodyHtml || article.body_html || ''}
Tags: ${article.tags || 'none'}
SEO Title: ${article.seoTitle || 'none'}
SEO Description: ${article.seoDescription || 'none'}

=== BUSINESS CONTEXT ===
Store: ${ctx?.storeName || 'N/A'}
Products: ${ctx?.products?.slice(0, 20).map(p => `"${p.title}" → /products/${p.handle}`).join(', ') || 'N/A'}
Collections: ${ctx?.collections?.slice(0, 10).map(c => `"${c.title}" → /collections/${c.handle}`).join(', ') || 'N/A'}

=== ENHANCEMENT INSTRUCTIONS ===
${instructions}

=== REQUIREMENTS ===
- Keep the article AT LEAST as long as the original — add more content, not less
- Make the tone genuinely human: contractions, opinions, rhetorical questions, varied sentence lengths
- Remove any AI-sounding phrases like "In today's world", "Let's dive in", "Without further ado"
- Improve SEO: add internal links to products/collections, optimize headings with keywords
- Add <strong> tags around key phrases for scannability
- Add image placeholders if missing: <div class="article-image-placeholder" data-prompt="DESC"><p>[Image: CAPTION]</p></div>
- Ensure 5-8 H2 headings and at least 2-3 H3 sub-headings
- Fix any grammar or readability issues
- Add bullet/numbered lists where helpful

=== OUTPUT FORMAT ===
Return ONLY valid JSON (no markdown, no explanation):
{"title":"Enhanced title","handle":"url-slug","bodyHtml":"Enhanced full HTML body (KEEP IT LONG)","summary":"Updated summary","tags":"updated, tags, with, more, relevant, tags","seoTitle":"Enhanced SEO title (50-60 chars)","seoDescription":"Enhanced meta description (150-160 chars)","imagePrompts":["prompt descriptions"]}`;
}

function parseArticleResponse(rawText) {
  try {
    // Clean up common issues
    let cleaned = rawText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Handle case where response starts with text before JSON
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart > 0 || jsonEnd < cleaned.length - 1) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }

    const parsed = JSON.parse(cleaned);
    return {
      title: parsed.title || 'Untitled Article',
      handle: parsed.handle || '',
      bodyHtml: parsed.bodyHtml || parsed.body_html || '',
      summary: parsed.summary || '',
      tags: parsed.tags || '',
      seoTitle: parsed.seoTitle || parsed.title || '',
      seoDescription: parsed.seoDescription || '',
      imagePrompts: parsed.imagePrompts || [],
      primaryKeyword: parsed.primaryKeyword || '',
    };
  } catch (e) {
    console.error('Failed to parse Gemini response:', e.message);
    console.error('Raw response (first 500 chars):', rawText.substring(0, 500));

    // Try to extract JSON from the response
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*"bodyHtml"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || 'Generated Article',
          handle: parsed.handle || '',
          bodyHtml: parsed.bodyHtml || '',
          summary: parsed.summary || '',
          tags: parsed.tags || '',
          seoTitle: parsed.seoTitle || '',
          seoDescription: parsed.seoDescription || '',
          imagePrompts: parsed.imagePrompts || [],
          primaryKeyword: parsed.primaryKeyword || '',
        };
      }
    } catch (e2) { /* fallback below */ }

    return {
      title: 'Generated Article',
      handle: 'generated-article',
      bodyHtml: rawText,
      summary: '',
      tags: '',
      seoTitle: '',
      seoDescription: '',
      imagePrompts: [],
    };
  }
}

export default { generateArticle, enhanceArticle, generateSeoMeta };
