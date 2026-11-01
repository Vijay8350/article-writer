// The design choices behind an Instagram image, so a feed never looks like one template
// repeated. Each post takes whichever option in every category that account hasn't used
// for longest, so the same look can't come round twice in a row.

export const SQUARE_LAYOUTS = [
  {
    key: 'corner-right', card: { left: 392, top: 392, size: 648 }, zone: 'top third',
    text: 'Put the headline across the top third, and stack the price badge and call to action in the left column below it.',
  },
  {
    key: 'corner-left', card: { left: 40, top: 392, size: 648 }, zone: 'top third',
    text: 'Put the headline across the top third, and stack the price badge and call to action in the right column below it.',
  },
  {
    key: 'top-right', card: { left: 392, top: 40, size: 648 }, zone: 'bottom third',
    text: 'Put the headline across the bottom third, and stack the price badge and brand name in the left column above it, with the call to action beside the headline.',
  },
  {
    key: 'top-left', card: { left: 40, top: 40, size: 648 }, zone: 'bottom third',
    text: 'Put the headline across the bottom third, and stack the price badge and brand name in the right column above it, with the call to action beside the headline.',
  },
  {
    key: 'center-low', card: { left: 240, top: 310, size: 590 }, zone: 'top quarter',
    text: 'Centre the headline across the top, and set the price badge and call to action side by side along the bottom edge.',
  },
  {
    key: 'center-high', card: { left: 240, top: 50, size: 590 }, zone: 'bottom third',
    text: 'Centre the headline below the photo zone, then set the price badge and call to action side by side along the bottom edge.',
  },
];

const LANDSCAPE_LAYOUT = { key: 'landscape', width: 1200, height: 800, card: { left: 560, top: 100, size: 600 } };

export const cardLayout = (key) => (key === 'landscape'
  ? LANDSCAPE_LAYOUT
  : { width: 1080, height: 1080, ...(SQUARE_LAYOUTS.find((l) => l.key === key) || SQUARE_LAYOUTS[0]) });

// Art direction. None of these draw a product: only type, colour and backdrop.
const CONCEPTS = [
  { key: 'luxe-dark', direction: 'a luxurious dark backdrop with elegant high-contrast serif type and fine metallic details' },
  { key: 'fresh-light', direction: 'a fresh, bright, airy backdrop in soft cream or blush with clean modern sans-serif type' },
  { key: 'colour-block', direction: 'bold flat colour blocks in two complementary colours with large geometric sans-serif type, like a modern fashion poster' },
  { key: 'magazine', direction: 'a minimal fashion-magazine cover with refined typography and plenty of empty space' },
  { key: 'sale-poster', direction: 'a loud, energetic retail sale poster with a huge price, bold condensed type and one vivid accent colour' },
  { key: 'soft-pastel', direction: 'a dreamy pastel gradient with rounded friendly type and a soft glow' },
  { key: 'geometric', direction: 'a dynamic diagonal split with arches and geometric shapes, and confident modern type' },
  { key: 'textured', direction: 'a rich tactile backdrop such as silk, marble or velvet with classic refined type' },
  { key: 'jewel-glow', direction: 'a deep jewel-tone gradient with luminous light accents and sleek modern type' },
];

// Where text sits on an image with no product photo.
const COMPOSITIONS = [
  { key: 'centered', direction: 'text centred, with even space around it' },
  { key: 'left', direction: 'text left-aligned in a strong column' },
  { key: 'lower', direction: 'text in the lower third, with the visual above it' },
  { key: 'upper', direction: 'text in the upper third, with the visual below it' },
  { key: 'oversized', direction: 'oversized type that fills the frame edge to edge' },
];

const FRAMES = [
  { key: 'soft', radius: 32 },
  { key: 'round', radius: 72 },
  { key: 'crisp', radius: 8 },
  { key: 'outlined', radius: 24, outline: true },
];

const CTAS = ['Shop now', 'Buy now', 'Order now', 'Grab yours', 'Get yours today'];

const PRICE_FORMS = {
  plain: (price) => price,
  only: (price) => `Only ${price}`,
  just: (price) => `Just ${price}`,
  now: (price) => `Now ${price}`,
};

const keysOf = (list) => list.map((item) => item.key);

// The option not seen for longest in `recent` (newest first). Ties are broken at random.
function freshest(options, recent, field) {
  const age = (key) => {
    const at = recent.findIndex((v) => v?.[field] === key);
    return at < 0 ? Infinity : at;
  };
  const oldest = Math.max(...options.map(age));
  const pool = options.filter((key) => age(key) === oldest);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickVariant(recent = []) {
  return {
    layout: freshest(keysOf(SQUARE_LAYOUTS), recent, 'layout'),
    concept: freshest(keysOf(CONCEPTS), recent, 'concept'),
    composition: freshest(keysOf(COMPOSITIONS), recent, 'composition'),
    frame: freshest(keysOf(FRAMES), recent, 'frame'),
    cta: freshest(CTAS, recent, 'cta'),
    price: freshest(Object.keys(PRICE_FORMS), recent, 'price'),
  };
}

// A stored variant's keys turned back into what the prompts and the compositor need.
export function describeVariant(variant = {}) {
  const pick = (list, key) => list.find((item) => item.key === key) || list[0];
  return {
    layout: cardLayout(variant.layout),
    concept: pick(CONCEPTS, variant.concept),
    composition: pick(COMPOSITIONS, variant.composition),
    frame: pick(FRAMES, variant.frame),
    cta: variant.cta || CTAS[0],
    priceText: PRICE_FORMS[variant.price] || PRICE_FORMS.plain,
  };
}

// The next layouts after the cover's, so a carousel's slides differ from each other.
export function layoutsAfter(key, count) {
  const keys = keysOf(SQUARE_LAYOUTS);
  const start = keys.indexOf(key);
  return Array.from({ length: count }, (_, i) => keys[(start + 1 + i) % keys.length]);
}
