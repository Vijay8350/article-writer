// Scene posts: the image model designs the whole post (backdrop, a set or frame built
// around the product, props, light and text) fresh every time, around the store's REAL
// product, whose pixels are laid back afterwards (services/productScene.js). Pure: where
// the product stands on the 4:5 canvas (stages), what the model builds around it (sets)
// and the prompt wording for both. postDesigns.pickDesign chooses among them.

const W = 1080; const H = 1350; // the post (postDesigns.CANVAS)

// True when the owner's notes name something `re` matches and don't rule it out in the
// same clause ("no Diwali theme", "avoid wedding vibes", "not a Diwali post").
const NEGATION_RE = /\b(no|not|nothing|without|avoid|avoiding|don'?t|never|skip|non|instead of)\b/i;
export function namedNotNegated(notes, re) {
  const text = String(notes || '');
  for (const m of text.matchAll(new RegExp(re.source, 'gi'))) {
    const clause = text.slice(0, m.index).split(/[.,;:!?\n]/).pop();
    if (!NEGATION_RE.test(clause.trim().split(/\s+/).slice(-4).join(' '))) return true;
  }
  return false;
}

// ─── Sets: what the model builds around the product, drawn new each time ────
// support 'rest': the product stands or lies on it; 'behind': a frame or backdrop
// element only (fine for a product hanging from the top edge too).
export const SETS = [
  {
    key: 'arch-niche', label: 'Glowing arch', support: 'behind', moods: ['luxe', 'editorial', 'soft', 'festive'],
    text: 'a tall arched niche softly lit from within stands behind the product, edged with a fine line in the accent colour',
  },
  {
    key: 'plinth', label: 'Stone plinth', support: 'rest', moods: ['luxe', 'editorial', 'bold'],
    text: 'the product stands on a low round plinth of polished stone in a deeper shade of the palette, with a soft glow on the wall behind it',
  },
  {
    key: 'travertine', label: 'Travertine blocks', support: 'rest', moods: ['editorial', 'soft'],
    text: 'the product rests on two stacked blocks of honed travertine, with a soft window-light shadow falling across the wall behind',
  },
  {
    key: 'moon', label: 'Moon disc', support: 'behind', moods: ['soft', 'luxe', 'editorial'],
    text: 'a large soft-edged disc of light glows on the backdrop right behind the product, like a rising moon',
  },
  {
    key: 'silk-wave', label: 'Silk wave', support: 'rest', moods: ['soft', 'luxe'],
    text: 'the product rests on a smooth wave of silk that rises gently from the bottom of the post, in a shade of the palette',
  },
  {
    key: 'mirror-tray', label: 'Mirror tray', support: 'rest', moods: ['luxe', 'editorial'],
    text: 'the product sits on a round mirrored vanity tray with a slim metal rim, its reflection faintly visible in the mirror',
  },
  {
    key: 'botanical', label: 'Botanical arch', support: 'behind', moods: ['soft', 'editorial', 'playful'],
    text: 'an arch of delicate dried flowers and grasses curves around the product from behind, never in front of it',
  },
  {
    key: 'pedestals', label: 'Pedestal trio', support: 'rest', moods: ['playful', 'bold', 'editorial'],
    text: 'three matte cylinder pedestals of different heights in tones of the palette, the product on the middle and tallest one',
  },
  {
    key: 'bauhaus', label: 'Bauhaus shapes', support: 'behind', moods: ['bold', 'playful'],
    text: 'a bold geometric arch and an overlapping circle in contrasting palette colours stand behind the product, like a modern art poster',
  },
  {
    key: 'water', label: 'Still water', support: 'rest', moods: ['soft', 'luxe'],
    text: 'the product rests on a smooth, glossy wet stone at the edge of still water, with soft concentric ripples and a gentle reflection',
  },
  {
    key: 'dunes', label: 'Sand dunes', support: 'rest', moods: ['editorial', 'soft'],
    text: 'the product rests on smooth sculpted sand dunes with long, soft late-afternoon shadows',
  },
  {
    key: 'jharokha', label: 'Jharokha window', support: 'behind', moods: ['luxe', 'festive'],
    text: 'an ornate carved Indian jharokha window frame in soft relief stands behind the product, in tones of the palette',
  },
  {
    key: 'ledge', label: 'Stone ledge', support: 'rest', moods: ['editorial', 'luxe', 'soft'],
    text: 'the product rests on the edge of a thick stone ledge, with a softly blurred vase of flowers far in the background',
  },
  {
    key: 'paper', label: 'Paper layers', support: 'behind', moods: ['playful', 'soft'],
    text: 'layered paper-cut shapes in palette colours form a stage around and behind the product, with soft depth shadows between the layers',
  },
  {
    key: 'spotlight', label: 'Spotlight', support: 'rest', moods: ['luxe', 'bold'],
    text: 'a single soft spotlight pools on a smooth surface where the product rests, the rest of the scene falling into gentle shadow',
  },
  {
    key: 'gift-box', label: 'Gift box', support: 'rest', moods: ['festive', 'soft', 'luxe'],
    text: 'the product sits on the open lid of an elegant gift box tied with a satin ribbon, in palette colours',
  },
  {
    key: 'velvet-drape', label: 'Velvet drape', support: 'behind', moods: ['luxe', 'festive', 'bold'],
    text: 'rich velvet fabric falls in soft folds behind the product, with a gentle pool of light on it',
  },
  {
    key: 'frame-outline', label: 'Floating frame', support: 'behind', moods: ['editorial', 'bold', 'playful'],
    text: 'a slim metal picture-frame outline, larger than the product, floats behind it slightly off-centre, in the accent colour',
  },
  {
    key: 'pebbles', label: 'Pebbles and shell', support: 'rest', moods: ['soft', 'playful'],
    text: 'the product rests on smooth pale pebbles beside a large open seashell, in soft daylight',
  },
  {
    key: 'diya', label: 'Diya glow', support: 'rest', moods: ['festive'], festiveOnly: true,
    // Diwali-family lamps: only when the owner's instructions name such a festival
    only: /\b(diwali|deepavali|dhanteras|bhai dooj|karva chauth|navratri|navaratri|dussehra|durga puja|ganesh|ganpati|weddings?)\b/i,
    text: 'the product rests on a low brass plate, with a few softly glowing diyas and marigold petals around it, never touching it',
  },
];
const SET_BY_KEY = Object.fromEntries(SETS.map((s) => [s.key, s]));
export const setOf = (key) => SET_BY_KEY[key] || SETS[0];

// A text-free style keeps to sets that suit its setting.
const STYLE_SETS = {
  lifestyle: ['ledge', 'travertine', 'mirror-tray', 'silk-wave', 'pebbles', 'dunes', 'botanical', 'moon'],
  studio: ['plinth', 'arch-niche', 'moon', 'spotlight', 'pedestals', 'frame-outline', 'travertine'],
  flatlay: ['mirror-tray', 'silk-wave', 'ledge', 'travertine', 'pebbles', 'botanical'],
  minimal: ['moon', 'plinth', 'arch-niche', 'travertine', 'frame-outline'],
  bold: ['bauhaus', 'pedestals', 'spotlight', 'paper', 'frame-outline', 'plinth'],
  festive: ['diya', 'gift-box', 'jharokha', 'velvet-drape', 'arch-niche'],
};

// The sets a post may use: the look's moods, the style's setting, and the stage's needs
// (a product entering from the top or bottom edge rests on nothing). Festive notes favour
// festive sets, but never narrow the choice to fewer than MIN_POOL, and a style whose
// own sets don't suit the stage borrows from the rest, so posts keep changing.
const MIN_POOL = 3;
export function setsFor({ style, moods, festive, support, notes = '' }) {
  const allowed = (s) => (festive || !s.festiveOnly) && (!s.only || namedNotNegated(notes, s.only)) && (support !== 'behind' || s.support === 'behind');
  const byMood = SETS.filter((s) => allowed(s) && s.moods.some((m) => moods.includes(m)));
  let pool = STYLE_SETS[style] ? byMood.filter((s) => STYLE_SETS[style].includes(s.key)) : byMood;
  if (pool.length < 2) pool = byMood;
  if (festive) {
    const rich = pool.filter((s) => s.moods.includes('festive'));
    if (rich.length >= MIN_POOL) pool = rich;
    else if (rich.length) pool = [...rich, ...pool.filter((s) => !rich.includes(s))];
  }
  return pool.length ? pool : SETS.filter((s) => !s.festiveOnly && !s.only && (support !== 'behind' || s.support === 'behind'));
}

// ─── Stages: where the product stands, and where the words go ───────────────
// region: the box the product is fitted into (promo posts); solo: the same for a post
// without words. cuts: the sides a product the photographer cut off may enter from (it
// then sits flush on that edge of the post); needs: a cut the stage is only for (a
// necklace hanging from the top edge). maxAspect: the widest product (width / height)
// that still shows large enough there. text: zones in canvas px for the wording.
export const STAGES = {
  center: {
    region: { x: 150, y: 330, w: 780, h: 620 }, solo: { x: 110, y: 210, w: 860, h: 800 }, cuts: [],
    text: { kind: 'top-bottom', top: 290, bottom: 1180 },
  },
  low: {
    region: { x: 120, y: 500, w: 840, h: 600 }, solo: { x: 100, y: 380, w: 880, h: 780 }, cuts: [],
    text: { kind: 'top', top: 440 },
  },
  high: {
    region: { x: 150, y: 80, w: 780, h: 620 }, solo: { x: 110, y: 90, w: 860, h: 800 }, cuts: [],
    text: { kind: 'below', bottom: 900 },
  },
  left: {
    region: { x: 40, y: 280, w: 560, h: 760 }, solo: { x: 60, y: 200, w: 720, h: 900 }, cuts: ['left'], maxAspect: 1.15,
    text: { kind: 'side', side: 'right', column: 38 },
  },
  right: {
    region: { x: 480, y: 280, w: 560, h: 760 }, solo: { x: 300, y: 200, w: 720, h: 900 }, cuts: ['right'], maxAspect: 1.15,
    text: { kind: 'side', side: 'left', column: 38 },
  },
  hero: {
    region: { x: 90, y: 60, w: 900, h: 840 }, solo: { x: 60, y: 60, w: 960, h: 1000 }, cuts: [],
    text: { kind: 'band', bottom: 1000 },
  },
  hang: {
    region: { x: 60, y: 0, w: 960, h: 880 }, solo: { x: 40, y: 0, w: 1000, h: 1060 }, cuts: ['top'], needs: 'top', support: 'behind',
    text: { kind: 'below', bottom: 940 },
  },
  rise: {
    region: { x: 60, y: 470, w: 960, h: 880 }, solo: { x: 40, y: 290, w: 1000, h: 1060 }, cuts: ['bottom'], needs: 'bottom', support: 'behind',
    text: { kind: 'top', top: 420 },
  },
};

const MIN_SHARE = 0.08;  // the product covers at least 8% of the post...
const MAX_SCALE = 1.6;   // ...without enlarging its photo more than this (it would go soft)

// The product of a plain-backdrop photo (`info` from postCompositor.analysePhoto) fitted
// into a stage → { stage, place: { s, x, y, w, h, box }, support } in canvas px, or
// { error }. A side the photographer cut sits flush on that edge of the post.
export function planStage(info, stageKey, { promo = true, lenient = false } = {}) {
  const stage = STAGES[stageKey];
  if (!stage) return { error: `unknown stage ${stageKey}` };
  if (!info?.plain || !info.box) return { error: 'a scene needs a photo on a plain background' };
  const cut = Object.keys(info.edges).filter((side) => info.edges[side]);
  if (cut.some((side) => !stage.cuts.includes(side))) return { error: 'the product is cut off at a side this stage can\'t take' };
  if (stage.needs && !info.edges[stage.needs]) return { error: 'this stage is for a product that enters from the edge' };
  const region = promo ? stage.region : stage.solo;
  const { box } = info;
  const bw = box.right - box.left; const bh = box.bottom - box.top;
  if (stage.maxAspect && bw / bh > stage.maxAspect) return { error: 'the product is too wide for this stage' };
  let s = Math.min(region.w / bw, region.h / bh);
  if (s > MAX_SCALE) {
    if (!lenient) return { error: 'the product photo is too small for this stage' };
    s = MAX_SCALE;
  }
  let x = region.x + region.w / 2 - (box.left + bw / 2) * s;
  let y = region.y + region.h / 2 - (box.top + bh / 2) * s;
  if (info.edges.top) y = 0;
  if (info.edges.bottom) y = H - info.height * s;
  if (info.edges.left) x = 0;
  if (info.edges.right) x = W - info.width * s;
  const place = { s, x: Math.round(x), y: Math.round(y), w: Math.round(info.width * s), h: Math.round(info.height * s) };
  place.box = { left: place.x + box.left * s, top: place.y + box.top * s, right: place.x + box.right * s, bottom: place.y + box.bottom * s };
  // Flush placement may push the product past its region on the other sides: it must
  // still leave the words their room.
  const pad = 2; const e = info.edges;
  if ((!e.left && place.box.left < region.x - pad) || (!e.right && place.box.right > region.x + region.w + pad)
    || (!e.top && place.box.top < region.y - pad) || (!e.bottom && place.box.bottom > region.y + region.h + pad)) {
    return { error: 'the product doesn\'t fit this stage' };
  }
  const share = ((place.box.right - place.box.left) * (place.box.bottom - place.box.top)) / (W * H);
  if (!lenient && share < MIN_SHARE) return { error: 'the product is small in its photo' };
  return { stage: stageKey, place, support: stage.support || 'any', text: promo ? stage.text : null, hanging: Boolean(info.edges.top), enters: cut };
}

// ─── Words ──────────────────────────────────────────────────────────────────
// `frame` is what the engine draws: '4:5' is the post; '2:3' loses dark bands at the top
// and bottom afterwards, so the zones are given between them.
export function sceneLayoutSentence(plan, { discount = false, frame = '4:5' } = {}) {
  const t = plan?.text;
  if (!t) return '';
  const tall = frame === '2:3';
  const down = (y) => Math.round(((128 + (y * 1280) / H) / 1536) * 100); // % down a 1024×1536 engine image
  const top = (to) => (tall ? `the strip from ${down(0) + 1}% to ${down(to) - 1}% of the way down the image` : `the top ${Math.floor((to / H) * 100) - 1}% of the image`);
  const bottom = (from) => (tall ? `the strip from ${down(from) + 1}% to ${down(H) - 1}% of the way down the image` : `the bottom ${Math.floor(((H - from) / H) * 100) - 1}% of the image`);
  const tag = discount ? ' with the discount tag beside it' : '';
  const sentence = {
    'top-bottom': `Put a small brand name and then the headline (one or two lines, centred) in ${top(t.top)}. Put the price badge${tag} and the call to action side by side, centred, in ${bottom(t.bottom)}.`,
    top: `Put every word in ${top(t.top)}, above the product, centred: a small brand name, the headline (one or two lines), then the price badge${tag} and the call to action side by side.`,
    below: `Put every word in ${bottom(t.bottom)}, below the product, centred: a small brand name, the headline (one or two lines), then the price badge${tag} and the call to action side by side.`,
    side: `Put every word in the ${t.side} ${t.column}% of the image, ${t.side}-aligned with generous margins: the brand name near the top, the headline large in the upper half (up to three short lines), then the price badge${tag} and the call to action lower down.`,
    band: `Put every word in ${bottom(t.bottom)}, below the product: the brand name and the headline (one or two lines) on the left, the price badge${tag} and the call to action on the right.`,
  }[t.kind];
  return tall ? `${sentence} No words in the dark bands.` : sentence;
}
