import axios from 'axios';
import config from '../config/env.js';

const GEMINI_URL = `${config.gemini.baseUrl}/models/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`;

async function callGemini(prompt, temperature = 0.8, maxTokens = 65000) {
  try {
    const response = await axios.post(
      GEMINI_URL,
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

export async function generateArticle(prompt, businessContext) {
  const fullPrompt = buildArticlePrompt(prompt, businessContext);
  const result = await callGemini(fullPrompt, 0.9, 65000);
  return parseArticleResponse(result);
}

export async function enhanceArticle(article, instructions, businessContext) {
  const prompt = buildEnhancePrompt(article, instructions, businessContext);
  const result = await callGemini(prompt, 0.7, 65000);
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

SEO STRUCTURE (follow exactly):
- Title: compelling, keyword-rich, 50-70 characters (DO NOT include H1 in the body)
- 5-8 H2 subheadings that naturally incorporate keywords
- 2-4 H3 sub-sections under relevant H2s
- Paragraphs: 2-4 sentences each (NEVER walls of text)
- Use <ul> or <ol> lists where they genuinely help (at least 3-4 lists in the article)
- <strong>Bold</strong> key phrases and important takeaways (8-15 bolded phrases throughout)
- First paragraph must hook the reader AND include the primary keyword
- Sprinkle the main keyword naturally 5-8 times across the article (no stuffing)
- Use related/LSI keywords throughout (synonyms, related terms)
- Write a compelling conclusion section with a soft CTA mentioning the store

INTERNAL LINKING (MANDATORY — this is critical for SEO):
- Link to 3-6 products using: <a href="/products/HANDLE">descriptive keyword-rich anchor text</a>
- Link to 2-4 collections using: <a href="/collections/HANDLE">descriptive anchor text</a>
- Link to 1-3 existing articles using: <a href="/blogs/BLOG_HANDLE/ARTICLE_HANDLE">anchor text</a>
- Anchor text must be descriptive keywords, NEVER "click here" or "learn more"
- Links should feel naturally woven into sentences, not forced

IMAGE PLACEHOLDERS (add 3-5):
Between sections, insert:
<div class="article-image-placeholder" data-prompt="DETAILED_IMAGE_DESCRIPTION_FOR_GENERATION">
  <p>[Image: SHORT_CAPTION]</p>
</div>

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown code fences. No explanation before or after. Just the raw JSON object:

{"title":"Your Compelling SEO Title Here (50-70 chars)","handle":"url-friendly-slug-here","bodyHtml":"<h2>First Section</h2><p>Your detailed content here with <strong>bolded phrases</strong> and <a href=\\"/products/handle\\">product links</a>...</p><h2>Second Section</h2><p>More detailed content...</p>...THE BODY MUST BE ${wordCount}+ WORDS","summary":"A compelling 2-3 sentence summary for the blog listing page that hooks readers.","tags":"primary keyword, secondary keyword, related term 1, related term 2, related term 3, brand-related tag, niche tag","seoTitle":"Primary Keyword - Compelling Benefit | ${ctx.storeName || 'Store'} (50-60 chars)","seoDescription":"A compelling 150-160 character meta description that includes the primary keyword and a clear call-to-action encouraging clicks.","imagePrompts":["detailed prompt 1","detailed prompt 2","detailed prompt 3"]}

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
