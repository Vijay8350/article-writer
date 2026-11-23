// The look and the format of each AI product post, on Instagram's 4:5 portrait canvas.
//   look   = art direction: backdrop, light, palette, typography (what the model paints)
//   format = where and how the store's real photo sits: its window shape, frame and the
//            text arrangement around it (what the compositor draws)
// Each post takes the look and the format its account hasn't used for longest, so
// consecutive days never repeat either. Pure: geometry and choices only, no pixels.

import { freshest, CTAS, PRICE_FORMS } from './imageVariety.js';
import { STAGES, planStage, setsFor, setOf, namedNotNegated } from './postScenes.js';

export const CANVAS = { w: 1080, h: 1350 };

// ─── Window shapes ──────────────────────────────────────────────────────────
// path(w, h, r) draws the shape in a w×h box. `flat` lists the straight sides a product
// the photographer already cut may sit against. inside(x, y, w, h, margins, r) tests a
// point in the box's own pixels.
const POINTED_R = 0.62; // jharokha arch: each arc's radius as a share of the width
const roundRect = (w, h, r) => `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
const pointedRise = (w) => { const R = POINTED_R * w; return Math.sqrt(R * R - (R - w / 2) ** 2); };

export const SHAPES = {
  rect: {
    flat: ['top', 'right', 'bottom', 'left'],
    path: (w, h, r = 0) => (r ? roundRect(w, h, r) : `M0,0 H${w} V${h} H0 Z`),
    inside: (x, y, w, h, m, r = 0) => {
      if (x < m.l || x > w - m.r || y < m.t || y > h - m.b) return false;
      if (!r) return true;
      const cx = x < r ? r : x > w - r ? w - r : null;
      const cy = y < r ? r : y > h - r ? h - r : null;
      return cx === null || cy === null || Math.hypot(x - cx, y - cy) <= r;
    },
  },
  arch: { // round top, flat bottom
    flat: ['bottom'],
    path: (w, h) => { const r = w / 2; return `M0,${h} V${r} A${r},${r} 0 0 1 ${w},${r} V${h} Z`; },
    inside: (x, y, w, h, m) => {
      const r = w / 2;
      if (x < m.l || x > w - m.r || y > h - m.b) return false;
      return y >= r ? y >= m.t : Math.hypot(x - r, y - r) <= r - Math.max(m.l, m.t);
    },
  },
  drop: { // flat top on the canvas edge, round bottom: a necklace hangs into it
    flat: ['top'],
    path: (w, h) => { const r = w / 2; return `M0,0 H${w} V${h - r} A${r},${r} 0 0 1 0,${h - r} Z`; },
    inside: (x, y, w, h, m) => {
      const r = w / 2;
      if (x < m.l || x > w - m.r || y < m.t) return false;
      return y <= h - r ? y <= h - m.b : Math.hypot(x - r, y - (h - r)) <= r - Math.max(m.l, m.b);
    },
  },
  pointed: { // jharokha: the pointed arch of an Indian palace window
    flat: ['bottom'],
    path: (w, h) => { const R = POINTED_R * w; const rise = pointedRise(w); return `M0,${h} V${rise} A${R},${R} 0 0 1 ${w / 2},0 A${R},${R} 0 0 1 ${w},${rise} V${h} Z`; },
    inside: (x, y, w, h, m) => {
      const R = POINTED_R * w; const rise = pointedRise(w); const mm = Math.max(m.l, m.t);
      if (x < m.l || x > w - m.r || y > h - m.b) return false;
      if (y >= rise) return y >= m.t;
      return Math.hypot(x - R, y - rise) <= R - mm && Math.hypot(x - (w - R), y - rise) <= R - mm;
    },
  },
  circle: {
    flat: [],
    path: (w, h) => { const r = Math.min(w, h) / 2; return `M${w / 2 - r},${h / 2} A${r},${r} 0 1 1 ${w / 2 + r},${h / 2} A${r},${r} 0 1 1 ${w / 2 - r},${h / 2} Z`; },
    inside: (x, y, w, h, m) => Math.hypot(x - w / 2, y - h / 2) <= Math.min(w, h) / 2 - Math.max(m.l, m.t),
  },
};

// The same window grown by d on every side (hairlines, rings, the guide's footprint).
export const grow = (win, d) => ({ ...win, x: win.x - d, y: win.y - d, w: win.w + 2 * d, h: win.h + 2 * d, r: win.r ? win.r + d : win.r });

// ─── Formats ────────────────────────────────────────────────────────────────
// window: where the cover photo goes (canvas px). frame: a picture frame whose inner
// window is sized to the photo. extra: more windows for the store's other photos.
// fit 'extend': a plain-background photo is contained in the window and its own
//   backdrop colour fills the rest, so the window can take any shape.
// fit 'aspect': the window takes the photo's proportions (empty backdrop may be cropped
//   from a plain photo, never the product).
// busy (a photo with a real-world background): 'no' = never (curved masks would cut
//   it), 'fit' = the window shrinks to the photo's proportions, 'exact' = only when the
//   photo already has the window's proportions.
// text: how the words are arranged around the photo (TEXT_LAYOUTS).
// moods: which looks it suits. decor: its decorations, in words, for the quality gate.
const ALL_MOODS = ['luxe', 'editorial', 'soft', 'playful', 'bold', 'festive'];
export const OFFSET = 34; // how far the offset outline sits from the photo

export const FORMATS = {
  arch: {
    label: 'Arch window', fit: 'extend', busy: 'no', moods: ['luxe', 'editorial', 'soft', 'festive'],
    window: { shape: 'arch', x: 180, y: 330, w: 720, h: 850 }, trims: ['shadow', 'hairline'], text: 'top-bottom',
    decor: 'a thin outline around the arch-shaped photo',
  },
  drop: {
    label: 'Hanging arch', fit: 'extend', busy: 'no', moods: ['luxe', 'editorial', 'soft', 'festive'],
    window: { shape: 'drop', x: 200, y: 0, w: 680, h: 900 }, trims: ['shadow', 'hairline'], text: 'below',
    decor: 'a thin outline around the photo that hangs from the top edge',
  },
  medallion: {
    label: 'Medallion', fit: 'extend', busy: 'no', moods: ALL_MOODS,
    window: { shape: 'circle', x: 160, y: 330, w: 760, h: 760 }, trims: ['shadow', 'ring'], text: 'top-bottom',
    decor: 'a thin double ring around the round photo',
  },
  jharokha: {
    label: 'Jharokha arch', fit: 'extend', busy: 'no', moods: ['luxe', 'festive'],
    window: { shape: 'pointed', x: 190, y: 330, w: 700, h: 850 }, trims: ['shadow', 'gilded'], text: 'top-bottom',
    decor: 'a double outline around the pointed-arch photo',
  },
  split: {
    label: 'Split screen', fit: 'extend', busy: 'exact', moods: ALL_MOODS,
    window: { shape: 'rect', x: 0, y: 0, w: 620, h: 1350 }, trims: ['seam'], mirror: true, text: 'side',
    decor: 'a thin coloured rule along the edge of the photo panel',
  },
  hero: {
    label: 'Hero photo', fit: 'extend', busy: 'exact', moods: ALL_MOODS,
    window: { shape: 'rect', x: 0, y: 0, w: 1080, h: 1080 }, trims: ['seam'], text: 'band',
    decor: 'a thin coloured rule where the photo meets the band below it',
  },
  mat: {
    label: 'Gallery frame', fit: 'aspect', busy: 'fit', moods: ['luxe', 'editorial', 'soft'],
    frame: { x: 150, y: 300, w: 780, h: 880, moulding: 16, mat: [64, 64, 88, 64] }, trims: ['shadow', 'mat'], text: 'top-bottom',
    decor: 'a picture frame with a light mat around the photo',
  },
  collage: {
    label: 'Lookbook trio', fit: 'extend', busy: 'fit', minPhotos: 3, moods: ['editorial', 'soft', 'playful'],
    window: { shape: 'rect', x: 60, y: 310, w: 620, h: 780, r: 6 },
    extra: [{ shape: 'rect', x: 710, y: 310, w: 310, h: 370, r: 6 }, { shape: 'rect', x: 710, y: 720, w: 310, h: 370, r: 6 }],
    trims: ['shadow'], mirror: true, text: 'top-bottom-side',
    decor: 'three photo tiles with soft shadows',
  },
  offset: {
    label: 'Offset frame', fit: 'aspect', busy: 'fit', moods: ['editorial', 'playful', 'bold', 'soft'],
    window: { shape: 'rect', x: 110, y: 310, w: 760, h: 820 }, trims: ['offset'], mirror: true, text: 'top-bottom-side',
    decor: 'a thin outline frame offset behind the photo',
  },
  stack: {
    label: 'Stacked prints', fit: 'aspect', busy: 'fit', moods: ['playful', 'soft', 'editorial'],
    window: { shape: 'rect', x: 210, y: 340, w: 660, h: 760, r: 4 }, trims: ['stack', 'shadow'], text: 'top-bottom',
    decor: 'two plain paper prints stacked at angles behind the photo',
  },
};

// A carousel's later slides carry no words, so their photo sits centred.
export const SLIDE_FORMATS = {
  print: {
    label: 'Framed print', fit: 'aspect', busy: 'fit',
    frame: { x: 110, y: 150, w: 860, h: 1050, moulding: 0, mat: [34, 34, 34, 34] }, trims: ['shadow', 'mat'],
    decor: 'a light mat around the photo',
  },
  offset: {
    label: 'Offset frame', fit: 'aspect', busy: 'fit',
    window: { shape: 'rect', x: 130, y: 190, w: 780, h: 940 }, trims: ['offset'],
    decor: 'a thin outline frame offset behind the photo',
  },
  plate: {
    label: 'Photo plate', fit: 'extend', busy: 'exact',
    window: { shape: 'rect', x: 0, y: 0, w: 1080, h: 1080 }, trims: ['seam'],
    decor: 'a thin coloured rule where the photo meets the band below it',
  },
  stack: {
    label: 'Stacked prints', fit: 'aspect', busy: 'fit',
    window: { shape: 'rect', x: 150, y: 205, w: 780, h: 940, r: 4 }, trims: ['stack', 'shadow'],
    decor: 'two plain paper prints stacked at angles behind the photo',
  },
  arch: {
    label: 'Arch window', fit: 'extend', busy: 'no',
    window: { shape: 'arch', x: 150, y: 175, w: 780, h: 1000 }, trims: ['shadow', 'hairline'],
    decor: 'a thin outline around the arch-shaped photo',
  },
};
const SLIDE_ORDER = ['print', 'offset', 'plate', 'stack', 'arch'];

// ─── Looks ──────────────────────────────────────────────────────────────────
// scene/type: exact prompt wording for promo posts. palette: the colours a text-free
// style borrows (its own scene stays). accent/mat/frame/paper colour the compositor's
// trims; tone sets shadow strength; light is where the light comes from.
export const LOOKS = [
  {
    key: 'ivory-editorial', label: 'Ivory editorial', moods: ['editorial', 'soft', 'luxe'], tone: 'light', light: 'top-left',
    accent: '#9a7b4f', mat: '#f7f2e9', frame: '#2b2420', paper: ['#efe6da', '#e3d6c4'],
    scene: 'a warm ivory paper backdrop with a fine, subtle grain and soft diffused daylight from the upper left, like a page of a luxury fashion magazine',
    palette: 'warm ivory, soft sand, espresso brown and antique gold',
    type: 'the headline in an elegant high-contrast serif (like Didot or Bodoni) in deep espresso brown; the brand name in small, widely letter-spaced capitals; the price in a slim espresso-brown pill with ivory text; the call to action as a thin outlined pill',
  },
  {
    key: 'noir-gold', label: 'Noir & gold', moods: ['luxe', 'bold', 'festive'], tone: 'dark', light: 'top',
    accent: '#c9a45c', mat: '#f3ece0', frame: '#c9a45c', paper: ['#2a2724', '#1f1d1b'],
    scene: 'a deep charcoal-black velvet backdrop with a soft warm spotlight glowing behind the centre and a few faint gold specks, quiet and luxurious',
    palette: 'charcoal black, warm gold and ivory',
    type: 'the headline in a refined gold serif with a subtle foil sheen; the brand name in small, widely letter-spaced ivory capitals; the price in a gold pill with black text; the call to action as a thin gold outlined pill',
  },
  {
    key: 'emerald-gold', label: 'Emerald & gold', moods: ['luxe', 'festive', 'bold'], tone: 'dark', light: 'top-left',
    accent: '#d4af37', mat: '#f4efe4', frame: '#d4af37', paper: ['#1f4a3c', '#173a2f'],
    scene: 'a rich deep emerald-green backdrop with a soft glowing gradient and fine gold line details near the edges, opulent but uncluttered',
    palette: 'deep emerald, gold and cream',
    type: 'the headline in an elegant cream serif; the brand name in small gold letter-spaced capitals; the price in a gold pill with dark green text; the call to action as a thin cream outlined pill',
  },
  {
    key: 'sage-linen', label: 'Sage linen', moods: ['soft', 'editorial'], tone: 'light', light: 'top-left',
    accent: '#5f6f52', mat: '#f4f1e8', frame: '#3e4a36', paper: ['#e7eadf', '#d9ded0'],
    scene: 'a soft sage-green linen backdrop with a gentle woven texture and calm natural window light',
    palette: 'sage green, oat, cream and deep olive',
    type: 'the headline in a graceful serif in deep olive green; the brand name in small letter-spaced capitals; the price in a deep olive pill with cream text; the call to action as a thin olive outlined pill',
  },
  {
    key: 'terracotta-sun', label: 'Terracotta sun', moods: ['editorial', 'bold', 'playful'], tone: 'mid', light: 'top-right',
    accent: '#f6e7d4', mat: '#f6ede1', frame: '#7a3b22', paper: ['#f2e2cf', '#e6cfb5'],
    scene: 'a sun-warmed terracotta plaster wall with soft dappled shadows of palm leaves falling across it, in warm afternoon light',
    palette: 'terracotta, sand, warm cream and deep rust',
    type: 'the headline in a confident cream serif; the brand name in small cream letter-spaced capitals; the price in a cream pill with rust-brown text; the call to action as a thin cream outlined pill',
  },
  {
    key: 'blush-silk', label: 'Blush silk', moods: ['soft', 'playful', 'luxe'], tone: 'light', light: 'top-left',
    accent: '#b76e79', mat: '#fbf3f1', frame: '#8c4a55', paper: ['#f6e3e3', '#ecd0d2'],
    scene: 'softly draped blush-pink silk with gentle flowing folds and a pearly sheen, dreamy and feminine',
    palette: 'blush pink, rose gold, pearl white and deep rose',
    type: 'the headline in a delicate serif in deep rose; the brand name in small letter-spaced capitals; the price in a deep-rose pill with white text; the call to action as a thin rose outlined pill',
  },
  {
    key: 'marble-mono', label: 'Marble monochrome', moods: ['luxe', 'editorial'], tone: 'light', light: 'top',
    accent: '#1c1c1c', mat: '#ffffff', frame: '#1c1c1c', paper: ['#f4f4f2', '#e6e6e3'],
    scene: 'polished white Carrara marble with soft grey veining, bright, clean and minimal, with plenty of calm space',
    palette: 'marble white, soft grey and jet black',
    type: 'the headline in a crisp modern serif in jet black; the brand name in small letter-spaced black capitals; the price in a black pill with white text; the call to action as a thin black outlined pill',
  },
  {
    key: 'pop-cobalt', label: 'Cobalt pop', moods: ['bold', 'playful'], tone: 'dark', light: 'top-left',
    accent: '#ff8a3d', mat: '#fff8ec', frame: '#111111', paper: ['#ffd23f', '#ff8a3d'],
    scene: 'a flat cobalt-blue backdrop with a few bold tangerine and sunflower-yellow geometric shapes (a large circle, a diagonal block) near the edges, like a modern Bauhaus poster',
    palette: 'cobalt blue, tangerine, sunflower yellow and white',
    type: 'the headline in a bold geometric sans-serif in white; the brand name in small white letter-spaced capitals; the price in a tangerine pill with white text; the call to action as a thin white outlined pill',
  },
  {
    key: 'lavender-haze', label: 'Lavender haze', moods: ['soft', 'playful'], tone: 'light', light: 'top',
    accent: '#7a6a9a', mat: '#fbf8ff', frame: '#4b3f66', paper: ['#ece6f7', '#e0d6f0'],
    scene: 'a dreamy soft gradient from lavender to warm peach with a gentle luminous glow, airy and modern',
    palette: 'lavender, peach, soft white and deep plum',
    type: 'the headline in a soft rounded modern sans-serif in deep plum; the brand name in small letter-spaced capitals; the price in a deep-plum pill with white text; the call to action as a thin plum outlined pill',
  },
  {
    key: 'midnight-velvet', label: 'Midnight velvet', moods: ['luxe', 'bold'], tone: 'dark', light: 'top',
    accent: '#c0c6d4', mat: '#f2f3f6', frame: '#c0c6d4', paper: ['#1d2440', '#151a30'],
    scene: 'deep midnight-blue velvet with a soft silver sheen and a gentle pool of light at the centre, elegant and calm',
    palette: 'midnight blue, silver and soft white',
    type: 'the headline in an elegant silver-white serif; the brand name in small letter-spaced silver capitals; the price in a silver pill with midnight-blue text; the call to action as a thin silver outlined pill',
  },
  {
    key: 'golden-hour', label: 'Golden hour', moods: ['editorial', 'soft'], tone: 'light', light: 'top-right',
    accent: '#8a5a2b', mat: '#fbf4ea', frame: '#5a3a1e', paper: ['#f3e6d3', '#e9d6bd'],
    scene: 'a warm beige wall in golden-hour sunlight, with long soft window-frame shadows falling diagonally across it',
    palette: 'warm beige, honey, caramel and dark brown',
    type: 'the headline in a warm classic serif in dark brown; the brand name in small letter-spaced capitals; the price in a dark-brown pill with cream text; the call to action as a thin brown outlined pill',
  },
  {
    key: 'festive-maroon', label: 'Festive maroon', moods: ['festive', 'luxe'], tone: 'dark', light: 'top', festiveOnly: true,
    accent: '#e0b04a', mat: '#f6eedc', frame: '#e0b04a', paper: ['#5c1424', '#4a0f1c'],
    scene: 'a deep maroon backdrop with fine gold ornamental line art near the edges and soft warm festive bokeh, rich but uncluttered (any festival motifs follow the store owner\'s instructions)',
    palette: 'deep maroon, marigold gold and cream',
    type: 'the headline in an ornate but easily readable gold serif; the brand name in small cream letter-spaced capitals; the price in a gold pill with maroon text; the call to action as a thin gold outlined pill',
  },
];
const LOOK_BY_KEY = Object.fromEntries(LOOKS.map((l) => [l.key, l]));
export const lookOf = (key) => LOOK_BY_KEY[key] || LOOKS[0];

// A text-free style keeps its own scene and borrows only these looks' palettes.
const STYLE_LOOKS = {
  lifestyle: ['golden-hour', 'terracotta-sun', 'sage-linen', 'blush-silk'],
  studio: ['ivory-editorial', 'marble-mono', 'sage-linen', 'lavender-haze', 'blush-silk'],
  flatlay: ['marble-mono', 'blush-silk', 'ivory-editorial', 'sage-linen'],
  minimal: ['ivory-editorial', 'sage-linen', 'marble-mono', 'lavender-haze'],
  bold: ['pop-cobalt', 'emerald-gold', 'noir-gold', 'terracotta-sun', 'midnight-velvet'],
  festive: ['festive-maroon', 'emerald-gold', 'noir-gold'],
};
// 'auto' mixes promo posts with the editorial styles, in turn (Festive only on request).
export const AUTO_STYLES = ['banner', 'lifestyle', 'studio', 'flatlay', 'minimal', 'bold'];
// Owner instructions that ask for a festival unlock the festive looks.
const FESTIVE_RE = /\b(diwali|deepavali|dhanteras|festive|festival|navratri|navaratri|dussehra|durga puja|holi|rakhi|raksha bandhan|karva chauth|bhai dooj|eid|ramadan|christmas|xmas|new year|wedding|onam|pongal|lohri|ganesh|ganpati|janmashtami|valentine)\b/i;

// ─── Placement: a store photo in a window, never cutting the product ─────────
const MIN_SHARE = 0.10;       // the cover's product covers at least 10% of the post
const MIN_WINDOW_FILL = 0.2;  // ...and at least 20% of its window
const MIN_HANG = 0.5;         // a product cut at the top reaches at least halfway down
const TIGHT = [0.8, 1.25];    // proportions a plain photo's backdrop-only crop may take
const MAX_SCALE = 1.5;        // never enlarge a photo more than this (it would go soft)

// Finds scale s and offset (x, y) in window pixels so every product point of a plain
// photo lies inside the window's shape, with a margin. A side the photographer already
// cut (the product touches the photo's edge) must sit flush on a straight side of the
// window; if the shape has none there, it can't hold this photo (null).
export function placePlain(info, win, { fill = 0.9, margin = 0.07 } = {}) {
  const shape = SHAPES[win.shape];
  const { box, edges, points, cell } = info;
  if (!box || !points?.length) return null;
  if (Object.keys(edges).some((side) => edges[side] && !shape.flat.includes(side))) return null;
  const { w, h } = win; const r = win.r || 0;
  const mm = margin * Math.min(w, h);
  const m = { t: edges.top ? 0 : mm, r: edges.right ? 0 : mm, b: edges.bottom ? 0 : mm, l: edges.left ? 0 : mm };
  const bw = box.right - box.left; const bh = box.bottom - box.top;
  const place = (s, anchor) => {
    let x = w / 2 - (box.left + bw / 2) * s;
    if (edges.left) x = 0; else if (edges.right) x = w - info.width * s;
    let y = h * anchor - (box.top + bh / 2) * s;
    if (edges.top) y = 0; else if (edges.bottom) y = h - info.height * s;
    return { s, x, y };
  };
  const pad = cell * 0.5; // each point stands for one analysis cell: test its corners
  const fits = ({ s, x, y }) => {
    const d = pad * s;
    for (const [px, py] of points) {
      const onLeft = edges.left && px <= box.left + cell; const onRight = edges.right && px >= box.right - cell;
      const onTop = edges.top && py <= box.top + cell; const onBottom = edges.bottom && py >= box.bottom - cell;
      const X = px * s + x; const Y = py * s + y;
      const qx = onLeft ? Math.max(X, m.l) : onRight ? Math.min(X, w - m.r) : X;
      const qy = onTop ? Math.max(Y, m.t) : onBottom ? Math.min(Y, h - m.b) : Y;
      for (const [ox, oy] of [[-d, -d], [d, -d], [-d, d], [d, d]]) {
        const tx = (onLeft && ox < 0) || (onRight && ox > 0) ? qx : qx + ox;
        const ty = (onTop && oy < 0) || (onBottom && oy > 0) ? qy : qy + oy;
        if (!shape.inside(tx, ty, w, h, m, r)) return false;
      }
    }
    return true;
  };
  // A product cut on two opposite sides fills that axis exactly: no freedom left.
  const fixed = edges.left && edges.right ? w / info.width : edges.top && edges.bottom ? h / info.height : null;
  // Every side the photographer cut must land exactly on the window's edge, or the
  // photo's own cut would show inside the window.
  const flush = ({ s, x, y }) => (!edges.left || Math.abs(x) <= 1.5) && (!edges.right || Math.abs(x + info.width * s - w) <= 1.5)
    && (!edges.top || Math.abs(y) <= 1.5) && (!edges.bottom || Math.abs(y + info.height * s - h) <= 1.5);
  let best = null;
  for (const anchor of [0.5, 0.54, 0.58, 0.62, 0.66, 0.46]) {
    if (fixed) {
      const p = place(fixed, anchor);
      if (fixed <= MAX_SCALE && flush(p) && fits(p)) { best = { s: fixed, anchor }; break; }
      continue;
    }
    let lo = 0.02; let hi = MAX_SCALE / fill;
    if (!fits(place(lo, anchor))) continue;
    if (fits(place(hi, anchor))) lo = hi;
    else for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(place(mid, anchor))) lo = mid; else hi = mid; }
    if (!best || lo > best.s) best = { s: lo, anchor };
  }
  if (!best) return null;
  const p = place(fixed ? best.s : best.s * fill, best.anchor);
  if (!flush(p)) return null;
  return {
    ...p, w: info.width * p.s, h: info.height * p.s,
    box: { left: p.x + box.left * p.s, top: p.y + box.top * p.s, right: p.x + box.right * p.s, bottom: p.y + box.bottom * p.s },
  };
}

// The independent check after placing: how many of the product's actual pixels (from
// the full-detail mask, not the solver's grid) fall outside the window's shape. A pixel
// on a cut side sits on the window's edge on purpose. Must be 0.
export function verifyPlacement(info, win, place) {
  const shape = SHAPES[win.shape]; const zero = { t: 0, r: 0, b: 0, l: 0 };
  const { w: mw, h: mh, scale, bits } = info.mask;
  let outside = 0;
  for (let my = 0; my < mh; my++) {
    for (let mx = 0; mx < mw; mx++) {
      if (!bits[my * mw + mx]) continue;
      const px = (mx + 0.5) * scale; const py = (my + 0.5) * scale;
      let X = px * place.s + place.x; let Y = py * place.s + place.y;
      if (info.edges.top && py <= info.cell) Y = Math.max(Y, 0.5);
      if (info.edges.left && px <= info.cell) X = Math.max(X, 0.5);
      if (info.edges.right && px >= info.width - info.cell) X = Math.min(X, win.w - 0.5);
      if (info.edges.bottom && py >= info.height - info.cell) Y = Math.min(Y, win.h - 0.5);
      if (!shape.inside(X, Y, win.w, win.h, zero, win.r || 0)) outside++;
    }
  }
  return outside;
}

// True when every product pixel lies inside a crop of the photo.
function cropKeepsProduct(info, crop) {
  const { w: mw, h: mh, scale, bits } = info.mask;
  for (let my = 0; my < mh; my++) {
    for (let mx = 0; mx < mw; mx++) {
      if (!bits[my * mw + mx]) continue;
      const px = (mx + 0.5) * scale; const py = (my + 0.5) * scale;
      if (px < crop.left || px > crop.left + crop.width || py < crop.top || py > crop.top + crop.height) return false;
    }
  }
  return true;
}

// A plain photo cropped to its product plus 8% of empty backdrop. A side the product
// already touches stays on the photo's edge; the crop only ever widens, towards TIGHT.
export function tightCrop(info) {
  const { box, edges, width: W, height: H } = info;
  const pad = 0.08 * Math.max(box.right - box.left, box.bottom - box.top);
  let l = edges.left ? 0 : Math.max(0, box.left - pad); let r = edges.right ? W : Math.min(W, box.right + pad);
  let t = edges.top ? 0 : Math.max(0, box.top - pad); let b = edges.bottom ? H : Math.min(H, box.bottom + pad);
  const widen = (lo, hi, need, max, lockLo, lockHi) => {
    let a = need / 2; let c = need / 2;
    if (lockLo && !lockHi) { a = 0; c = need; }
    if (lockHi && !lockLo) { a = need; c = 0; }
    let nlo = lockLo ? lo : lo - a; let nhi = lockHi ? hi : hi + c;
    if (nlo < 0) { nhi = Math.min(max, nhi - nlo); nlo = 0; }
    if (nhi > max) { nlo = Math.max(0, nlo - (nhi - max)); nhi = max; }
    return [nlo, nhi];
  };
  const aspect = (r - l) / (b - t);
  if (aspect < TIGHT[0]) [l, r] = widen(l, r, TIGHT[0] * (b - t) - (r - l), W, edges.left, edges.right);
  else if (aspect > TIGHT[1]) [t, b] = widen(t, b, (r - l) / TIGHT[1] - (b - t), H, edges.top, edges.bottom);
  return { left: Math.round(l), top: Math.round(t), width: Math.max(1, Math.round(r - l)), height: Math.max(1, Math.round(b - t)) };
}

function fitAspect(box, aspect, align = 'center') {
  let w = box.w; let h = Math.round(w / aspect);
  if (h > box.h) { h = box.h; w = Math.round(h * aspect); }
  const x = Math.round(box.x + (box.w - w) / 2);
  const y = align === 'top' ? box.y : Math.round(box.y + (box.h - h) / 2);
  return { ...box, x, y, w, h };
}

const metricsOf = (pbox, win) => {
  const area = (pbox.right - pbox.left) * (pbox.bottom - pbox.top);
  return { share: area / (CANVAS.w * CANVAS.h), windowFill: area / (win.w * win.h), hang: (pbox.bottom - win.y) / win.h };
};

// One photo in one window → { win, mode, place | crop } or { error }. `lenient` drops
// the "looks good" size limits (never the cut checks), as a last resort for a product
// that's small in its photo.
function planWindow(info, box, { fit, busy, align }, isCover, lenient = false) {
  if (!info) return { error: 'no photo' };
  if (!info.plain || !info.box) {
    if (busy === 'no') return { error: 'this window needs a photo on a plain background' };
    // A busy photo is never cropped: a panel takes it only at (almost) its own proportions.
    if (busy === 'exact' && Math.abs(box.w / box.h / info.aspect - 1) > 0.005) return { error: "the photo's proportions don't match this panel" };
    const win = busy === 'exact' ? box : fitAspect(box, info.aspect, align);
    return { win, mode: 'busy' };
  }
  if (fit === 'aspect') {
    let crop = tightCrop(info);
    let win = fitAspect(box, crop.width / crop.height, align);
    if (win.w / crop.width > MAX_SCALE && lenient) { // show the whole photo rather than enlarge
      crop = { left: 0, top: 0, width: info.width, height: info.height };
      win = fitAspect(box, info.aspect, align);
    }
    const k = win.w / crop.width;
    if (k > MAX_SCALE) return { error: 'the product photo is too small for this frame' };
    if (!cropKeepsProduct(info, crop)) return { error: 'the crop check failed' };
    const pbox = {
      left: win.x + (info.box.left - crop.left) * k, right: win.x + (info.box.right - crop.left) * k,
      top: win.y + (info.box.top - crop.top) * k, bottom: win.y + (info.box.bottom - crop.top) * k,
    };
    if (isCover && !lenient && metricsOf(pbox, win).share < MIN_SHARE) return { error: 'the product is small in its photo' };
    return { win, mode: 'aspect', crop };
  }
  const place = placePlain(info, box, { fill: 0.9 });
  if (!place) return { error: `a ${box.shape} window would cut the product` };
  if (verifyPlacement(info, box, place)) return { error: 'the crop check failed' };
  const local = place.box;
  const metrics = metricsOf({ left: box.x + local.left, right: box.x + local.right, top: box.y + local.top, bottom: box.y + local.bottom }, box);
  if (isCover && !lenient) {
    if (metrics.share < MIN_SHARE) return { error: 'the product is small in its photo' };
    if (metrics.windowFill < MIN_WINDOW_FILL) return { error: 'the window would look empty' };
    if (info.edges.top && (local.bottom / box.h) < MIN_HANG) return { error: 'the hanging product would look too short' };
  }
  return { win: box, mode: 'extend', place };
}

const mirrorBox = (b) => ({ ...b, x: CANVAS.w - b.x - b.w });
const frameWindow = (f) => {
  const [mt, mr, mb, ml] = f.mat; const t = f.moulding;
  return { shape: 'rect', x: f.x + t + ml, y: f.y + t + mt, w: f.w - 2 * t - ml - mr, h: f.h - 2 * t - mt - mb };
};
// The frame resized around its photo's window, centred where the frame was.
const frameAround = (win, f) => {
  const [mt, mr, mb, ml] = f.mat; const t = f.moulding;
  const w = win.w + 2 * t + ml + mr; const h = win.h + 2 * t + mt + mb;
  const frame = { ...f, x: Math.round(f.x + (f.w - w) / 2), y: Math.round(f.y + (f.h - h) / 2), w, h };
  return { frame, window: { ...win, x: frame.x + t + ml, y: frame.y + t + mt } };
};

// A format laid out for these photos (analyses[0] is the cover) → plan, or { error }.
export function planLayout(formatKey, analyses, { mirror = false, slide = false, lenient = false } = {}) {
  const fmt = (slide ? SLIDE_FORMATS : FORMATS)[formatKey];
  if (!fmt) return { error: `unknown format ${formatKey}` };
  if ((fmt.minPhotos || 1) > analyses.length) return { error: `needs ${fmt.minPhotos} photos` };
  const flip = Boolean(mirror && fmt.mirror);
  const m = (b) => (flip ? mirrorBox(b) : { ...b });
  const frame0 = fmt.frame ? m(fmt.frame) : null;
  const box0 = fmt.window ? m(fmt.window) : frameWindow(frame0);
  const cover = planWindow(analyses[0], box0, { fit: fmt.fit, busy: fmt.busy, align: formatKey === 'collage' ? 'top' : 'center' }, !slide, lenient);
  if (cover.error) return { error: cover.error };
  let frame = null; let window = cover.win;
  if (frame0) ({ frame, window } = frameAround(cover.win, frame0));
  const extras = (fmt.extra || []).map((b, i) => planWindow(analyses[i + 1], m(b), { fit: 'aspect', busy: 'fit', align: 'top' }, false));
  const bad = extras.find((e) => e.error);
  if (bad) return { error: `extra photo: ${bad.error}` };
  return {
    format: formatKey, slide, mirror: flip, frame, window, extra: extras.map((e) => e.win),
    trims: fmt.trims || [], text: fmt.text || null, decor: fmt.decor,
    plans: [{ ...cover, win: window }, ...extras],
  };
}

// ─── What the guide marks and where the words go ────────────────────────────
const TRIM_REACH = { hairline: 20, ring: 32, gilded: 30 };
const STACK_REACH = 50;

// Everything the compositor draws, as boxes: the zones the model must leave empty.
export function footprintOf(plan) {
  const reach = Math.max(0, ...plan.trims.map((t) => TRIM_REACH[t] || 0));
  const boxes = [plan.frame ? { shape: 'rect', ...plan.frame } : (reach ? grow(plan.window, reach) : { ...plan.window })];
  if (plan.trims.includes('offset')) boxes.push({ ...plan.window, x: plan.window.x + OFFSET, y: plan.window.y + OFFSET });
  if (plan.trims.includes('stack')) boxes.push({ ...grow(plan.window, STACK_REACH), shape: 'rect', r: 0 });
  boxes.push(...plan.extra);
  return boxes;
}

// Exact prompt wording per text arrangement. {discount} becomes the discount tag when
// the product is on sale; {top}, {bottom}, {below} and {band} become zones measured
// from the format's real footprint.
const TEXT_LAYOUTS = {
  'top-bottom': 'Put a small brand name and then the headline (one or two lines, centred) in {top}, above the clear zone. Put the price badge{discount} and the call to action side by side, centred, in {bottom}.',
  'top-bottom-side': 'Put a small brand name and then the headline (one or two lines), {side}-aligned, in {top}, above the clear zone. Put the price badge{discount} and the call to action side by side, {side}-aligned, in {bottom}.',
  below: 'Put every word in {below}, below the clear zone, centred: a small brand name, the headline (one or two lines), then the price badge{discount} and the call to action side by side.',
  side: 'Put every word in the {side} {column}% of the image, {side}-aligned with generous margins: the brand name near the top, the headline large in the upper half (up to three short lines), then the price badge{discount} and the call to action lower down.',
  band: 'Put every word in the band across {band}, below the clear zone: the brand name and the headline (one or two lines) on the left, the price badge{discount} and the call to action on the right.',
};

// `frame` is what the engine draws: '4:5' is the post itself; '2:3' is taller and loses
// its dark top and bottom bands afterwards, so zones are given between those bands.
export function layoutSentence(plan, { discount = false, frame = '4:5' } = {}) {
  if (!plan.text) return '';
  const boxes = footprintOf(plan);
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const tall = frame === '2:3';
  const H = CANVAS.h;
  const down = (y) => Math.round(((128 + (y * 1280) / H) / 1536) * 100); // % down a 1024×1536 engine image
  const zone = (from, to, edge) => {
    if (!tall) return `the ${edge} ${Math.max(5, Math.floor(((edge === 'top' ? to : H - from) / H) * 100) - 1)}% of the image`;
    return `the strip from ${down(from) + 1}% to ${down(to) - 1}% of the way down the image`;
  };
  const photoLeft = left < CANVAS.w - right; // the photo hugs the left edge
  const sentence = TEXT_LAYOUTS[plan.text]
    .replace('{top}', zone(0, top - 20, 'top'))
    .replace('{bottom}', zone(bottom + 20, H, 'bottom'))
    .replace('{below}', zone(bottom + 30, H, 'bottom'))
    .replace('{band}', zone(bottom, H, 'bottom'))
    .replace('{column}', Math.floor(((CANVAS.w - (right - left)) / CANVAS.w) * 100) - 1)
    .replace(/\{side\}/g, plan.text === 'side' ? (photoLeft ? 'right' : 'left') : (plan.mirror ? 'right' : 'left'))
    .replace('{discount}', discount ? ' with the discount tag beside it' : '');
  return tall ? `${sentence} No words in the dark bands.` : sentence;
}

// ─── Choosing the next design ───────────────────────────────────────────────
const ageOf = (recent, field, key) => {
  const at = recent.findIndex((v) => v?.[field] === key);
  return at < 0 ? Infinity : at;
};
// Options in the order they should be tried: least recently used first, ties shuffled.
function byFreshness(options, recent, field) {
  return options
    .map((key) => ({ key, age: ageOf(recent, field, key), tie: Math.random() }))
    .sort((a, b) => (b.age - a.age) || (a.tie - b.tie))
    .map((o) => o.key);
}

// A festival named in the owner's instructions, unless it's ruled out ("nothing festive",
// "no Diwali theme", "avoid wedding vibes").
export function isFestive(style, notes) {
  return style === 'festive' || namedNotNegated(notes, FESTIVE_RE);
}

// The looks a post may take: festive ones only when asked for; a text-free style keeps
// to looks whose palettes suit its scene (its festive ones, if it has any).
export function looksFor(style, notes) {
  const festive = isFestive(style, notes);
  let pool = LOOKS.filter((l) => festive || !l.festiveOnly);
  if (STYLE_LOOKS[style]) pool = pool.filter((l) => STYLE_LOOKS[style].includes(l.key));
  if (festive) {
    const rich = pool.filter((l) => l.moods.includes('festive'));
    if (rich.length) pool = rich;
  }
  return pool.length ? pool : LOOKS.filter((l) => !l.festiveOnly);
}

// A scene post (lib/postScenes.js): the model designs everything around the product of
// the first plain-backdrop photo. Look, stage and set each the least recently used; the
// fresh pass also avoids the last post's. → design, or { error }.
function pickScene(recent, { style, notes, analyses, looks, last }) {
  const photo = analyses.findIndex((a) => a?.plain && a.box);
  if (photo < 0) return { error: 'no photo on a plain background' };
  const info = analyses[photo];
  const promo = style === 'banner';
  const festive = isFestive(style, notes);
  const stages = byFreshness(Object.keys(STAGES), recent, 'stage');
  const reasons = [];
  for (const pass of [{ fresh: true }, { fresh: false }, { lenient: true }]) {
    for (const lookKey of looks) {
      if (pass.fresh && lookKey === last.look) continue;
      const look = lookOf(lookKey);
      for (const stage of stages) {
        if (pass.fresh && stage === last.stage) continue;
        const plan = planStage(info, stage, { promo, lenient: Boolean(pass.lenient) });
        if (plan.error) { reasons.push(plan.error); continue; }
        const sets = byFreshness(setsFor({ style, moods: look.moods, festive, support: plan.support, notes }).map((s) => s.key), recent, 'set');
        const set = sets.find((k) => !pass.fresh || k !== last.set);
        if (!set) continue;
        return {
          mode: 'scene', style, look: lookKey, set, stage, photo, plan,
          cta: freshest(CTAS, recent, 'cta'), price: freshest(Object.keys(PRICE_FORMS), recent, 'price'),
        };
      }
    }
  }
  const counts = reasons.reduce((m, r) => m.set(r, (m.get(r) || 0) + 1), new Map());
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { error: top ? top[0] : 'no stage fits this photo' };
}

// The next post's design for an account: its style (for 'auto', the next in turn),
// look and wording, each the one used least recently, and how the product is shown:
// a scene designed around the real product when a photo has a plain backdrop, else the
// photo in a format's frame. `analyses` describe the store's photos, cover first;
// formats that can't show them safely are skipped. `recent` is the account's newest-first
// design history. Tries, in turn: a look and a format both different from the last
// post's; then any; then without the size limits (a product that's small in its photo).
// → design, or { error } saying why none fits.
export function pickDesign(recent = [], { style, notes, analyses, allowCollage = true, scenes = true } = {}) {
  const resolved = style === 'auto' ? freshest(AUTO_STYLES, recent, 'style') : (style || 'banner');
  const looks = byFreshness(looksFor(resolved, notes).map((l) => l.key), recent, 'look');
  const last = recent.find((v) => v?.look || v?.format) || {};
  if (scenes) {
    const scene = pickScene(recent, { style: resolved, notes, analyses, looks, last });
    if (!scene.error) return scene;
  }
  const plans = new Map();
  const planOf = (format, mirror, lenient) => {
    const key = `${format}:${mirror}:${lenient}`;
    if (!plans.has(key)) plans.set(key, planLayout(format, analyses, { mirror, lenient }));
    return plans.get(key);
  };
  const reasons = [];
  for (const pass of [{ fresh: true }, { fresh: false }, { lenient: true }]) {
    for (const lookKey of looks) {
      if (pass.fresh && lookKey === last.look) continue;
      const look = lookOf(lookKey);
      const formats = byFreshness(
        Object.keys(FORMATS).filter((k) => (allowCollage || k !== 'collage') && FORMATS[k].moods.some((md) => look.moods.includes(md))),
        recent, 'format',
      );
      for (const format of formats) {
        if (pass.fresh && format === last.format) continue;
        const prev = recent.find((v) => v?.format === format);
        for (const mirror of FORMATS[format].mirror ? [!prev?.mirror, Boolean(prev?.mirror)] : [false]) {
          const plan = planOf(format, mirror, Boolean(pass.lenient));
          if (plan.error) { reasons.push(plan.error); continue; }
          return {
            style: resolved, look: lookKey, format, mirror: plan.mirror, plan,
            cta: freshest(CTAS, recent, 'cta'), price: freshest(Object.keys(PRICE_FORMS), recent, 'price'),
          };
        }
      }
    }
  }
  const counts = reasons.reduce((m, r) => m.set(r, (m.get(r) || 0) + 1), new Map());
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { error: top ? top[0] : 'no layout fits this photo' };
}

// What gets stored on the row (variant jsonb): enough to label it and to steer the next.
// `at` is when the design was chosen: a regenerated post's new design counts as the newest.
export const variantOf = (d) => (d.mode === 'scene' ? {
  canvas: 'portrait', mode: 'scene', style: d.style, look: d.look, set: d.set, stage: d.stage, photo: d.photo, cta: d.cta, price: d.price, at: new Date().toISOString(),
} : {
  canvas: 'portrait', style: d.style, look: d.look, format: d.format, mirror: d.mirror, cta: d.cta, price: d.price, at: new Date().toISOString(),
});

// The later slides of a carousel: photo i+1 each (cycling), each slide a different
// format that can show that photo.
export function planSlides(analyses, count) {
  const slides = [];
  for (let i = 0; i < count; i++) {
    const photo = analyses.length > 1 ? 1 + (i % (analyses.length - 1)) : 0;
    const order = SLIDE_ORDER.map((_, j) => SLIDE_ORDER[(i + j) % SLIDE_ORDER.length]);
    for (const key of order) {
      const plan = planLayout(key, [analyses[photo]], { slide: true });
      if (!plan.error) { slides.push({ photo, plan }); break; }
    }
  }
  return slides;
}

// The slides after a scene cover: the store's other photos (cycling). Up to SCENE_SLIDES
// plain-backdrop ones get a scene of their own (the cover's look; a set the cover and the
// earlier slides didn't use, freshest first; slides carry no words); any other photo is
// framed like planSlides does (quicker, and the carousel stays within its time).
// → [{ photo, scene, set } | { photo, plan }].
export const SCENE_SLIDES = 2;
const SLIDE_STAGES = ['center', 'high', 'low', 'hero', 'hang', 'rise'];
export function planSceneSlides(analyses, count, { cover, notes, recent = [] }) {
  const others = analyses.map((_, i) => i).filter((i) => i !== cover.photo);
  const order = others.length ? others : [cover.photo];
  const festive = isFestive(cover.style, notes);
  const look = lookOf(cover.look);
  const stages = byFreshness(SLIDE_STAGES, recent, 'stage');
  const used = new Set([cover.set]);
  const slides = [];
  let scenes = 0;
  for (let i = 0; i < count; i++) {
    const photo = order[i % order.length];
    const info = analyses[photo];
    let scene = null;
    if (scenes < SCENE_SLIDES) {
      for (const lenient of [false, true]) {
        for (let j = 0; j < stages.length && !scene; j++) {
          const plan = planStage(info, stages[(i + j) % stages.length], { promo: false, lenient });
          if (!plan.error) scene = plan;
        }
        if (scene) break;
      }
    }
    if (scene) {
      const pool = byFreshness(setsFor({ style: cover.style, moods: look.moods, festive, support: scene.support, notes }).map((s) => s.key), recent, 'set');
      const set = pool.find((k) => !used.has(k)) || pool.find((k) => k !== cover.set) || pool[0];
      used.add(set); scenes++;
      slides.push({ photo, scene, set });
      continue;
    }
    const plan = framedSlidePlan(info, i);
    if (plan) slides.push({ photo, plan });
  }
  return slides;
}

// The first slide format, starting at the i-th, that shows this photo safely (or null).
export function framedSlidePlan(info, i = 0) {
  for (let j = 0; j < SLIDE_ORDER.length; j++) {
    const plan = planLayout(SLIDE_ORDER[(i + j) % SLIDE_ORDER.length], [info], { slide: true });
    if (!plan.error) return plan;
  }
  return null;
}

// A short label for the UI, e.g. "Noir & gold · Arch window" or "Noir & gold · Stone plinth".
export function describeDesign(variant) {
  const look = LOOK_BY_KEY[variant?.look];
  if (!look) return null;
  if (variant.mode === 'scene') return variant.set ? `${look.label} · ${setOf(variant.set).label}` : null;
  const format = FORMATS[variant.format];
  return format ? `${look.label} · ${format.label}` : null;
}

// ─── The text check (code, not a model) ─────────────────────────────────────
// The gate's model reports the text it read; every promised line must be in it, spelled
// exactly, word for word. Case, punctuation, line breaks and thousands commas don't
// count; letters (with their accents and vowel signs), digits, a decimal point, % and
// the currency sign do, and a sign or % stays with its number.
// A / - or . between two letters or digits splits words the same way on both sides
// ("18K/22K" and "18K / 22K", "No.5" and "No. 5", "₹12.99" and "₹12. 99").
function textWords(s) {
  return String(s || '')
    .replace(/[™®©]/g, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/(\p{Sc})\s+(?=\d)/gu, '$1')
    .replace(/(\d)\s+%/g, '$1%')
    .replace(/%(?=\p{L})/gu, '% ')
    .replace(/([\p{L}\p{N}])\s*[/.\-–]+\s*(?=[\p{L}\p{N}])/gu, '$1 ')
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{M}\p{N}%\p{Sc}]/gu, ''))
    .filter(Boolean);
}

const runAt = (got, words, i) => words.every((t, j) => got[i + j] === t);

// The transcript without the brand line (once), so a headline word can't be "found" in
// the brand name. The brand may be letter-spaced ("G L O W F I N C H").
function withoutBrand(got, brand) {
  const words = textWords(brand);
  if (!words.length) return got;
  for (let i = 0; i + words.length <= got.length; i++) if (runAt(got, words, i)) return [...got.slice(0, i), ...got.slice(i + words.length)];
  const spelled = words.join('');
  for (let i = 0; i < got.length; i++) {
    let s = ''; let j = i;
    while (j < got.length && got[j].length === 1 && s.length < spelled.length) s += got[j++];
    if (s === spelled) return [...got.slice(0, i), ...got.slice(j)];
  }
  return got;
}

// A line passes when its words appear together, in order; or in order with only words of
// the other promised lines between them (a two-column layout read across). A line
// without digits may also match with its letters spaced out, as letter-spacing is a style.
export function textProblems(rendered, lines, { brand } = {}) {
  const want = lines.filter(Boolean);
  if (!want.length) return [];
  const read = textWords(rendered);
  if (!read.length) return ['The checker did not report the text it read on the image.'];
  const got = withoutBrand(read, brand);
  const promised = new Set(want.flatMap(textWords));
  const together = (words) => got.some((_, i) => i + words.length <= got.length && runAt(got, words, i));
  const acrossColumns = (words) => got.some((word, start) => {
    if (word !== words[0]) return false;
    let i = 1; let k = start + 1;
    while (i < words.length && k < got.length) {
      if (got[k] === words[i]) { i++; k++; } else if (promised.has(got[k])) k++; else break;
    }
    return i === words.length;
  });
  const joined = got.join('');
  return want
    .filter((line) => {
      const words = textWords(line);
      if (together(words) || acrossColumns(words)) return false;
      return /\d/.test(line) || !joined.includes(words.join(''));
    })
    .map((line) => `"${line}" is not on the image exactly as written.`);
}
