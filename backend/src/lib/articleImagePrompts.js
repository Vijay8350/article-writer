// Prompts for the AI images inside blog articles: what the article writer is told
// to leave room for, what the image model is asked to draw, and how it's checked.

// Added to the article prompt when ChatGPT images are on. The placeholders it asks
// for are swapped for real <figure>s by services/articleImages.js.
export function aiImageInstructions(slots) {
  return `AI-GENERATED IMAGES — also insert exactly ${slots} image placeholder(s), each directly after a section's last paragraph, spread evenly through the article. Never in the intro, never inside the FAQ, never next to another image. Use EXACTLY this pattern:
<div class="article-image-placeholder" data-prompt="SCENE" data-alt="ALT"><p>[Image: CAPTION]</p></div>
- SCENE: 25-50 words describing a concrete photograph tied to the section above it: subject, setting, light, mood. Never ask for text, labels, logos, charts, infographics or screenshots.
- ALT: 8-14 words of descriptive SEO alt text; use the primary keyword at most once.
- CAPTION: one short, natural sentence shown under the image.
- Do not use double quotes inside SCENE or ALT.
Also make the FIRST item of imagePrompts a SCENE for the article's main hero image, following the same rules.`;
}

export function buildArticleImagePrompt({ scene, storeName, niche, withProduct = false, instructions }) {
  return [
    `Create a landscape editorial photograph for a blog post${storeName ? ` by ${storeName}` : ''}${niche ? `, an online store in the ${niche} niche` : ''}.`,
    `Scene: ${scene}`,
    withProduct ? 'The attached photo shows a real product from the store. Feature that exact product naturally in the scene, keeping its shape, colours and details unchanged.' : '',
    instructions ? `Campaign instructions (follow these first): ${instructions}` : '',
    'Style: photorealistic, natural light, shallow depth of field, magazine quality, believable people and objects.',
    'Do NOT include any text, letters, numbers, captions, logos, watermarks or brand names anywhere in the image.',
  ].filter(Boolean).join('\n');
}

// A campaign article's hero: a designed banner with the headline on it.
export function buildArticleBannerPrompt({ headline, scene, storeName, niche, withProduct = false, instructions }) {
  return [
    `Design an attractive landscape marketing banner for a blog article${storeName ? ` by ${storeName}` : ''}${niche ? `, an online store in the ${niche} niche` : ''}.`,
    'Make it look like a professional campaign banner from a premium brand: one clear focal image, a clean area for the headline, a bold hierarchy, a limited colour palette and generous margins.',
    `Visual: ${scene}`,
    withProduct ? 'The attached photo shows a real product from the store. Feature that exact product, keeping its shape, colours and details unchanged.' : '',
    instructions ? `Campaign instructions (follow these first): ${instructions}` : '',
    `Render this headline once, large and high-contrast, spelled EXACTLY as written: "${headline}"`,
    'Add no other words, no fake logos and no watermarks unless the instructions ask for them.',
  ].filter(Boolean).join('\n');
}

export function buildArticleVisionPrompt(scene) {
  return `You are a strict quality inspector for images on a published blog. Inspect the FIRST attached image. If a second image is attached, it is the real product photo and the first image must show that product faithfully.

Intended scene:
"""
${scene}
"""

Evaluate, in order of importance:
1. NO TEXT: fail on any visible text, letters, numbers, logos or watermarks (text printed on the real product itself is fine).
2. REALISM: fail on distorted hands, faces or objects, impossible geometry, or obvious AI artifacts.
3. RELEVANCE: it plausibly shows the intended scene.
4. SAFETY: no NSFW, offensive or nonsensical content.

Be conservative: when uncertain, FAIL. Respond ONLY with JSON:
{ "pass": boolean, "score": number (0-100), "reasons": string[], "rendered_text": string }`;
}
