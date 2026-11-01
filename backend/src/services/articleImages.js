import * as aiKeys from '../repositories/aiKeys.js';
import { withDefaults } from './ai.js';
import { bestProductMatch } from './imageMatcher.js';
import {
  imageBackend, generateUntilPassed, loadReferenceImages, saveImage, publicImageUrl, mapLimit, layoutTemplate, placeRealPhoto,
} from './igMedia.js';
import { buildArticleImagePrompt, buildArticleBannerPrompt, buildArticleVisionPrompt } from '../lib/articleImagePrompts.js';
import { buildBannerVisionPrompt } from '../lib/igPrompts.js';

// ChatGPT images inside articles. The writer leaves placeholders with a scene
// description; each becomes a real image here, plus one hero. An image that can't
// be made or fails its check is simply left out: a missing picture never costs the
// article, which has already been written and counted.

const INLINE_SLOTS = { mixed: 2, ai: 3 }; // AI images in the body, on top of the hero
const PRODUCT_IMAGES = { products: 4, mixed: 2, ai: 0 }; // store photos the writer may embed
const PARALLEL = 3; // keeps the whole step inside one web request
const ATTEMPTS = 2;
const BANNER_ATTEMPTS = 3; // exact text and layout take more tries than a plain photo

const PLACEHOLDER_RE = /<div[^>]*class=["'][^"']*article-image-placeholder[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
const NO_IMAGE_SECTION_RE = /faq|frequently asked|conclusion|final thoughts|wrapping up/i;

const escapeAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stripTags = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const attr = (tag, name) => tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1]?.trim() || '';

// Removes unfilled placeholders so "[Image: …]" never reaches a live article.
export const stripImagePlaceholders = (html) => String(html || '').replace(PLACEHOLDER_RE, '');

export const productImageLimit = (mode) => PRODUCT_IMAGES[mode] ?? PRODUCT_IMAGES.products;

// How this article gets its images. Falls back to store photos when no image
// engine is working, so generation never fails because of it. A campaign's
// `imageCount` is the total: the hero plus that many minus one inline.
export async function planArticleImages(workspaceId, requested, { imageCount } = {}) {
  const { articleImages } = withDefaults(await aiKeys.getSettings(workspaceId));
  const mode = PRODUCT_IMAGES[requested] !== undefined ? requested : articleImages;
  if (mode === 'products') return { mode, backend: null, slots: 0 };
  const backend = await imageBackend(workspaceId);
  const check = await backend.check();
  if (!check.ok) return { mode: 'products', backend: null, slots: 0, warning: `ChatGPT images were skipped: ${check.detail}` };
  return { mode, backend, slots: imageCount ? imageCount - 1 : INLINE_SLOTS[mode] };
}

function findSlots(html) {
  return [...html.matchAll(PLACEHOLDER_RE)].map((m) => ({
    raw: m[0],
    scene: attr(m[0], 'data-prompt'),
    alt: attr(m[0], 'data-alt'),
    caption: stripTags(m[0]).replace(/^\[Image:\s*/i, '').replace(/\]$/, ''),
  })).filter((s) => s.scene);
}

// The writer doesn't always leave enough room, so top up under evenly spaced headings.
function addMissingSlots(html, missing) {
  const sections = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => ({ end: m.index + m[0].length, text: stripTags(m[1]) }))
    .slice(1)
    .filter((h) => !NO_IMAGE_SECTION_RE.test(h.text));
  const step = sections.length / missing;
  const picks = Array.from({ length: Math.min(missing, sections.length) }, (_, i) => sections[Math.floor(i * step)]);
  return picks.reverse().reduce((out, { end, text }) => {
    const slot = `<div class="article-image-placeholder" data-prompt="${escapeAttr(`A photograph illustrating: ${text}`)}" data-alt="${escapeAttr(text)}"><p>[Image: ${escapeAttr(text)}]</p></div>`;
    return out.slice(0, end) + slot + out.slice(end);
  }, html);
}

const figure = ({ url, alt, caption }) =>
  `<figure><img src="${url}" alt="${escapeAttr(alt)}" loading="lazy" width="1200" height="800" style="max-width:100%;height:auto">${caption ? `<figcaption>${escapeAttr(caption)}</figcaption>` : ''}</figure>`;

// A short headline for a banner: the title before any subtitle.
const bannerHeadline = (title) => String(title || '').split(/\s[-–|]\s|:\s/)[0].trim();

// Draws the hero and inline images and returns the finished body. A campaign's
// `brief` turns the hero into a designed banner and steers every image.
export async function addAiImages({ plan, article, topic, dna, brief }) {
  let html = article.bodyHtml || '';
  const found = findSlots(html);
  if (found.length < plan.slots) html = addMissingSlots(html, plan.slots - found.length);
  const inline = findSlots(html).slice(0, plan.slots);

  // The model never draws a product. The hero puts the matching product's real photo on
  // a card, and every other image shows only the setting around it.
  const match = bestProductMatch(topic, dna.products || []);
  const [realPhoto] = match ? await loadReferenceImages([match.image], { maxSize: 1024 }) : [];
  const template = realPhoto ? await layoutTemplate('landscape') : null;
  const jobs = [
    {
      hero: true,
      scene: article.imagePrompts?.[0] || `A hero image for a blog article titled "${article.title}"`,
      alt: article.title,
    },
    ...inline,
  ];

  const storeName = dna.shop?.name;
  const niche = dna.analysis?.niche;
  const instructions = brief?.instructions;
  const headline = bannerHeadline(article.title);
  const results = await mapLimit(jobs, PARALLEL, async (job) => {
    const banner = job.hero && brief;
    const hasCard = Boolean(job.hero && realPhoto);
    const { jpeg, verdict } = await generateUntilPassed(plan.backend, {
      prompt: banner
        ? buildArticleBannerPrompt({ headline, scene: job.scene, storeName, niche, hasCard, instructions })
        : buildArticleImagePrompt({ scene: job.scene, storeName, niche, hasCard, instructions }),
      gatePrompt: banner
        ? buildBannerVisionPrompt({ texts: [headline], brief: instructions, hasCard })
        : buildArticleVisionPrompt(job.scene, { hasCard }),
      references: hasCard ? [template] : [],
      compareTo: [],
      finish: hasCard ? (art) => placeRealPhoto(art, realPhoto, 'landscape') : null,
      format: 'landscape',
      attempts: banner ? BANNER_ATTEMPTS : ATTEMPTS,
    });
    if (!verdict.pass) throw new Error(`failed the quality check (${verdict.reasons.join('; ') || `score ${verdict.score}`})`);
    return { url: publicImageUrl(await saveImage(jpeg)) };
  });

  const images = [];
  const problems = [];
  let hero = null;
  jobs.forEach((job, i) => {
    const { url, error } = results[i];
    if (error) {
      problems.push(error.message);
      return;
    }
    const alt = job.alt || job.caption || article.title;
    images.push({ src: url, imageUrl: url, alt, title: job.hero ? 'Hero image' : job.caption });
    if (job.hero) hero = { src: url, imageUrl: url, alt, source: 'ai' };
    else html = html.replace(job.raw, () => figure({ url, alt, caption: job.caption }));
  });

  const warnings = problems.length
    ? [`${problems.length} of ${jobs.length} ChatGPT images could not be added: ${problems.join(' ')}`.slice(0, 500)]
    : [];
  return { bodyHtml: stripImagePlaceholders(html), hero, images, warnings };
}
