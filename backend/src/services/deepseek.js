import axios from 'axios';
import config from '../config/env.js';

const DEEPSEEK_URL = config.deepseek.baseUrl;
const DEEPSEEK_KEY = config.deepseek.apiKey;

async function callDeepSeek(messages, temperature = 0.7, maxTokens = 16000) {
  const response = await axios.post(
    `${DEEPSEEK_URL}/chat/completions`,
    { model: 'deepseek-chat', messages, temperature, max_tokens: maxTokens },
    {
      headers: { Authorization: `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' },
      timeout: 300000, // 5 minutes for long articles
    }
  );
  return response.data.choices[0].message.content;
}

export async function generateArticle(prompt, ctx) {
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
  ], 0.9, 16000);
  return parseResponse(result);
}

export async function enhanceArticle(article, instructions, ctx) {
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
  ], 0.7, 16000);
  return parseResponse(result);
}

export async function generateSeoMeta(article) {
  const prompt = `Generate SEO meta for:\nTitle: ${article.title}\nContent: ${(article.bodyHtml || '').substring(0, 800)}\n\nReturn ONLY JSON: {"seoTitle":"(50-60 chars)","seoDescription":"(150-160 chars)"}`;
  const result = await callDeepSeek([{ role: 'system', content: 'SEO expert. Return only JSON.' }, { role: 'user', content: prompt }], 0.3, 500);
  try {
    return JSON.parse(result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch { return { seoTitle: article.title?.substring(0, 60) || '', seoDescription: '' }; }
}

function buildPrompt(userPrompt, ctx) {
  const wordCount = ctx.wordCount || 1500;
  const products = ctx.products?.slice(0, 30).map(p => `- "${p.title}" → /products/${p.handle}`).join('\n') || 'None';
  const collections = ctx.collections?.slice(0, 15).map(c => `- "${c.title}" → /collections/${c.handle}`).join('\n') || 'None';
  const articles = ctx.existingArticles?.slice(0, 20).map(a => `- "${a.title}" → /blogs/${a.blogHandle || 'news'}/${a.handle}`).join('\n') || 'None';

  return `████████████████████████████████████████
██  WRITE EXACTLY ${wordCount} WORDS.         ██
██  NOT 500. NOT 800. FULL ${wordCount}.       ██
██  EACH H2 = 200-400 WORDS MINIMUM.   ██
████████████████████████████████████████

Store: ${ctx.storeName || 'N/A'} (${ctx.niche || 'e-commerce'}) — ${ctx.storeDomain || ''}
Audience: ${ctx.targetAudience || 'General shoppers'}

PRODUCTS (link to 3-6 in article):
${products}

COLLECTIONS (link to 2-4 in article):
${collections}

EXISTING ARTICLES (link to 1-3):
${articles}

TOPIC: ${userPrompt}

STRUCTURE REQUIRED:
- 5-8 <h2> sections (each 200-400 words, with keyword in heading)
- 2-4 <h3> sub-sections
- <strong>Bold</strong> 8-15 key phrases throughout
- 3-5 <ul> or <ol> lists
- 3-5 image placeholders: <div class="article-image-placeholder" data-prompt="DETAIL"><p>[Image: CAPTION]</p></div>
- Opening paragraph: hook + primary keyword (no H1 in body)
- Closing section: soft CTA mentioning ${ctx.storeName || 'the store'}

WRITING STYLE:
- Contractions: you'll, it's, don't, we've, that's
- Personal opinions: "Honestly...", "Here's what most people miss...", "What I've found is..."
- Rhetorical questions: "But does that actually work?", "Sound familiar?"
- Mix short sentences (3-5 words) with longer detailed ones
- Transitions: "That said,", "Look,", "The reality is,", "Here's why:"

Return ONLY valid JSON (no markdown fences):
{"title":"Compelling SEO Title (50-70 chars)","handle":"url-slug","bodyHtml":"<h2>...</h2><p>${wordCount}+ WORDS of rich, detailed content with links and bold...</p>","summary":"2-3 sentence hook","tags":"keyword1, keyword2, keyword3, keyword4, keyword5, keyword6, keyword7","seoTitle":"Primary Keyword - Benefit | ${ctx.storeName || 'Store'} (50-60 chars)","seoDescription":"Compelling 150-160 char description with keyword and CTA","imagePrompts":["prompt1","prompt2","prompt3"]}`;
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
      imagePrompts: p.imagePrompts || []
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
          imagePrompts: p.imagePrompts || []
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
