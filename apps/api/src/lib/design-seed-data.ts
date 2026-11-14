// Starter social design catalogue for the owner-run seed script (T3 placeholders + T6 starter pack).
// Pure data + SVG strings: no sharp, no DB, no R2, so it is unit-testable. The script rasterises
// the SVG with sharp. Every motif is drawn here in code (original art, D7); nothing is copied from
// Canva / Visme. Backgrounds carry NO retailer text; all words come from layers.
import { DESIGN_FORMATS, type DesignFormat, type DesignLayer } from '@kanchuki/shared';

export interface Palette {
  from: string;
  to: string;
  border: string;
  ink: string;
}
const CREAM: Palette = { from: '#fffaf0', to: '#f3e6cf', border: '#b8860b', ink: '#2b2118' };
const MAROON: Palette = { from: '#7a1226', to: '#3d0a14', border: '#e6c36a', ink: '#fff4d6' };
const EMERALD: Palette = { from: '#0f5a46', to: '#06281f', border: '#e6c36a', ink: '#f6f0dc' };
const ROSE: Palette = { from: '#fde4ea', to: '#f7b9c8', border: '#a3324f', ink: '#3b1220' };
const NAVY: Palette = { from: '#1c2a52', to: '#0b1226', border: '#d9b45a', ink: '#f4efe0' };

const text = (
  v: string,
  y: number,
  size: number,
  ink: string,
  o: Record<string, unknown> = {},
): DesignLayer =>
  ({
    type: 'text',
    var: v,
    x: 60,
    y,
    w: 960,
    size: Math.round(size),
    font: 'sans',
    color: ink,
    align: 'center',
    ...o,
  }) as DesignLayer;

const image = (x: number, y: number, w: number, h: number, index = 0): DesignLayer => ({
  type: 'image',
  var: 'product_image',
  x,
  y,
  w,
  h,
  fit: 'contain',
  index,
});

function single(format: DesignFormat, ink: string, withOffer: boolean): DesignLayer[] {
  // [shopY, imgY, imgH, nameY, priceY, offerY, phoneY]
  const L: Record<DesignFormat, number[]> = {
    SQUARE: [40, 120, 640, 800, 870, 960, 1020],
    PORTRAIT_4_5: [70, 150, 800, 990, 1090, 1190, 1270],
    STORY_9_16: [110, 260, 1100, 1420, 1520, 1650, 1780],
  };
  const [shop, imgY, imgH, name, price, offer, phone] = L[format] as number[];
  const k = format === 'STORY_9_16' ? 1.3 : 1;
  return [
    text('shop_name', shop as number, 54 * k, ink, { font: 'serif' }),
    image(90, imgY as number, 900, imgH as number),
    text('product_name', name as number, 46 * k, ink, { maxLines: 2 }),
    text('price', price as number, 72 * k, ink, { font: 'serif', bold: true, format: 'inr' }),
    ...(withOffer ? [text('offer_text', offer as number, 40 * k, ink)] : []),
    text('shop_phone', phone as number, 34 * k, ink),
  ];
}

function duo(ink: string): DesignLayer[] {
  return [
    text('shop_name', 60, 54, ink, { font: 'serif' }),
    ...[60, 560].flatMap((x, i) => [
      image(x, 170, 460, 640, i),
      text('product_name', 830, 38, ink, { x, w: 460, maxLines: 2, index: i }),
      text('price', 930, 56, ink, {
        x,
        w: 460,
        font: 'serif',
        bold: true,
        format: 'inr',
        index: i,
      }),
    ]),
    text('offer_text', 1130, 44, ink),
    text('shop_phone', 1270, 34, ink),
  ];
}

export type SeedDesign = {
  name: string;
  occasion: string;
  format: DesignFormat;
  slots: number;
  palette: Palette;
  layers: (p: Palette) => DesignLayer[];
  /** Extra SVG art drawn over the gradient + border (w, h = canvas). */
  art?: (w: number, h: number, p: Palette) => string;
};

const PLACEHOLDERS: SeedDesign[] = [
  {
    name: 'Classic Cream',
    occasion: 'General',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: CREAM,
    layers: (p) => single('PORTRAIT_4_5', p.ink, true),
  },
  {
    name: 'Diwali Gold',
    occasion: 'Diwali',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: MAROON,
    layers: (p) => single('PORTRAIT_4_5', p.ink, true),
  },
  {
    name: 'Wedding Rose',
    occasion: 'Wedding',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: ROSE,
    layers: (p) => single('PORTRAIT_4_5', p.ink, true),
  },
  {
    name: 'Festive Emerald',
    occasion: 'Festive',
    format: 'SQUARE',
    slots: 1,
    palette: EMERALD,
    layers: (p) => single('SQUARE', p.ink, true),
  },
  {
    name: 'New Arrival Navy',
    occasion: 'New Arrival',
    format: 'SQUARE',
    slots: 1,
    palette: NAVY,
    layers: (p) => single('SQUARE', p.ink, false),
  },
  {
    name: 'Story Maroon',
    occasion: 'General',
    format: 'STORY_9_16',
    slots: 1,
    palette: MAROON,
    layers: (p) => single('STORY_9_16', p.ink, true),
  },
  {
    name: 'Story Cream',
    occasion: 'General',
    format: 'STORY_9_16',
    slots: 1,
    palette: CREAM,
    layers: (p) => single('STORY_9_16', p.ink, true),
  },
  {
    name: 'Duo Rose',
    occasion: 'General',
    format: 'PORTRAIT_4_5',
    slots: 2,
    palette: ROSE,
    layers: (p) => duo(p.ink),
  },
  {
    name: 'Duo Navy',
    occasion: 'Festive',
    format: 'PORTRAIT_4_5',
    slots: 2,
    palette: NAVY,
    layers: (p) => duo(p.ink),
  },
];

// ─── T6 starter pack: original code-drawn art ────────────────────────────────────

const MARIGOLD: Palette = { from: '#8a1c1c', to: '#3a0a0a', border: '#f2b632', ink: '#fff2cf' };
const GARBA: Palette = { from: '#ff9f1c', to: '#c2185b', border: '#fff1c1', ink: '#fffdf5' };
const MOON: Palette = { from: '#2a1646', to: '#0c0820', border: '#e8d9a8', ink: '#f6efdc' };
const IVORY: Palette = { from: '#fffdf6', to: '#f4ead2', border: '#c8a24a', ink: '#33261a' };
const HOLI: Palette = { from: '#ffffff', to: '#fff3fa', border: '#7b2cbf', ink: '#2a1a3d' };
const TRICOLOUR: Palette = { from: '#ffffff', to: '#f7f7f2', border: '#138808', ink: '#14213d' };
const SALE_RED: Palette = { from: '#fff6ee', to: '#ffe0cc', border: '#c1121f', ink: '#2b1111' };
const SLATE: Palette = { from: '#243b55', to: '#101c2c', border: '#e6c36a', ink: '#f4efe0' };

const f = (n: number) => Math.round(n * 10) / 10;

/** A small oil lamp: gold bowl + orange flame, centred on (cx, cy), width ~2s. */
function diya(cx: number, cy: number, s: number): string {
  return [
    `<path d="M${f(cx - s)} ${f(cy)} Q${f(cx)} ${f(cy + s * 1.1)} ${f(cx + s)} ${f(cy)} Z" fill="#e6b34a"/>`,
    `<path d="M${f(cx - s * 0.6)} ${f(cy)} h${f(s * 1.2)}" stroke="#b9852a" stroke-width="${f(s * 0.12)}"/>`,
    `<path d="M${f(cx)} ${f(cy - s * 1.25)} Q${f(cx + s * 0.5)} ${f(cy - s * 0.5)} ${f(cx)} ${f(cy - s * 0.1)} Q${f(cx - s * 0.5)} ${f(cy - s * 0.5)} ${f(cx)} ${f(cy - s * 1.25)} Z" fill="#ff8a1f"/>`,
    `<path d="M${f(cx)} ${f(cy - s * 0.85)} Q${f(cx + s * 0.2)} ${f(cy - s * 0.45)} ${f(cx)} ${f(cy - s * 0.25)} Q${f(cx - s * 0.2)} ${f(cy - s * 0.45)} ${f(cx)} ${f(cy - s * 0.85)} Z" fill="#ffe27a"/>`,
  ].join('');
}

/** n-point star polygon. */
function star(cx: number, cy: number, r: number, n: number, inner = 0.45, fill = '#fff'): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(`${f(cx + rr * Math.cos(a))},${f(cy + rr * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

/** Crescent = a disc with a bite taken out (mask), so no path arithmetic. */
function crescent(id: string, cx: number, cy: number, r: number, fill: string): string {
  return [
    `<mask id="${id}"><rect x="${f(cx - r * 2)}" y="${f(cy - r * 2)}" width="${f(r * 4)}" height="${f(r * 4)}" fill="#fff"/>`,
    `<circle cx="${f(cx + r * 0.42)}" cy="${f(cy - r * 0.08)}" r="${f(r * 0.86)}" fill="#000"/></mask>`,
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" mask="url(#${id})"/>`,
  ].join('');
}

/** Ring of petals around a point: a mandala-ish corner motif. */
function mandala(cx: number, cy: number, r: number, color: string): string {
  const petals = Array.from({ length: 12 }, (_, i) => {
    const a = (360 / 12) * i;
    return `<ellipse cx="${f(cx)}" cy="${f(cy - r * 0.62)}" rx="${f(r * 0.13)}" ry="${f(r * 0.34)}" transform="rotate(${a} ${f(cx)} ${f(cy)})" fill="none" stroke="${color}" stroke-width="3"/>`;
  }).join('');
  return `${petals}<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.28)}" fill="none" stroke="${color}" stroke-width="3"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${color}" stroke-width="3"/>`;
}

/** n evenly spaced items across [x0, x1]. */
const row = (n: number, x0: number, x1: number, draw: (x: number, i: number) => string) =>
  Array.from({ length: n }, (_, i) => draw(x0 + ((x1 - x0) * i) / (n - 1), i)).join('');

/**
 * Single-product layout that leaves `top` px above and `bottom` px below free for art, so the
 * motif never sits behind text. Gaps follow the existing `single()` rhythm.
 */
function framed(format: DesignFormat, ink: string, top: number, bottom: number): DesignLayer[] {
  const h = DESIGN_FORMATS[format].h;
  const k = format === 'STORY_9_16' ? 1.3 : 1;
  const tail = (40 + 100 + 100 + 80 + 40) * k;
  const imgY = top + 90 * k;
  const imgH = Math.max(300, h - bottom - imgY - tail);
  const nameY = imgY + imgH + 40 * k;
  const priceY = nameY + 100 * k;
  const offerY = priceY + 100 * k;
  const phoneY = offerY + 80 * k;
  return [
    text('shop_name', top + 10 * k, 50 * k, ink, { font: 'serif' }),
    image(90, imgY, 900, imgH),
    text('product_name', nameY, 46 * k, ink, { maxLines: 2 }),
    text('price', priceY, 72 * k, ink, { font: 'serif', bold: true, format: 'inr' }),
    text('offer_text', offerY, 40 * k, ink),
    text('shop_phone', phoneY, 34 * k, ink),
  ];
}

function collage4(ink: string): DesignLayer[] {
  const cell = (x: number, y: number, i: number): DesignLayer[] => [
    image(x, y, 460, 400, i),
    text('price', y + 410, 52, ink, {
      x,
      w: 460,
      font: 'serif',
      bold: true,
      format: 'inr',
      index: i,
    }),
  ];
  return [
    text('custom_text', 60, 84, ink, { font: 'serif' }),
    ...cell(60, 200, 0),
    ...cell(560, 200, 1),
    ...cell(60, 700, 2),
    ...cell(560, 700, 3),
    text('shop_name', 1220, 46, ink, { font: 'serif' }),
    text('shop_phone', 1285, 34, ink),
  ];
}

function visitUs(ink: string): DesignLayer[] {
  return [
    { type: 'image', var: 'shop_logo', x: 340, y: 130, w: 400, h: 280, fit: 'contain' },
    text('shop_name', 470, 72, ink, { font: 'serif', maxLines: 2 }),
    text('custom_text', 640, 44, ink, { maxLines: 2 }),
    text('shop_city', 770, 46, ink, { font: 'serif' }),
    text('shop_phone', 850, 40, ink),
    text('store_url', 930, 32, ink),
  ];
}

/** Baked-in English pill (same precedent as the SALE starburst); the retailer's words stay in layers. */
const banner = (w: number, label: string, fill: string, ink = '#fff'): string =>
  `<rect x="${f(w / 2 - 270)}" y="44" width="540" height="58" rx="29" fill="${fill}"/><text x="${f(w / 2)}" y="85" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" font-weight="700" fill="${ink}" text-anchor="middle">${label}</text>`;

/** Rakhi: a red thread across the top with a flower-shaped rakhi in the middle. */
function rakhi(w: number): string {
  const cx = f(w / 2);
  const petals = Array.from(
    { length: 8 },
    (_, i) =>
      `<ellipse cx="${cx}" cy="90" rx="16" ry="30" transform="rotate(${45 * i} ${cx} 120)" fill="#e63946"/>`,
  ).join('');
  return `<path d="M40 70 Q${f(w / 4)} 130 ${cx} 120 T${w - 40} 70" fill="none" stroke="#c1121f" stroke-width="5"/>${petals}<circle cx="${cx}" cy="120" r="20" fill="#f2b632"/><circle cx="${cx}" cy="120" r="8" fill="#fff2cf"/>`;
}

/** Two products under a baked heading: image pair, name + price each, shared offer + phone. */
function lookOfDay(ink: string): DesignLayer[] {
  return [
    text('shop_name', 150, 40, ink, { font: 'serif' }),
    ...[60, 560].flatMap((x, i) => [
      image(x, 230, 460, 600, i),
      text('product_name', 850, 36, ink, { x, w: 460, maxLines: 2, index: i }),
      text('price', 940, 52, ink, {
        x,
        w: 460,
        font: 'serif',
        bold: true,
        format: 'inr',
        index: i,
      }),
    ]),
    text('offer_text', 1130, 44, ink),
    text('shop_phone', 1270, 34, ink),
  ];
}

function storeIntro(ink: string): DesignLayer[] {
  return [
    { type: 'image', var: 'shop_logo', x: 340, y: 260, w: 400, h: 280, fit: 'contain' },
    text('shop_name', 620, 90, ink, { font: 'serif', maxLines: 2 }),
    text('custom_text', 860, 52, ink, { maxLines: 3 }),
    text('shop_city', 1080, 58, ink, { font: 'serif' }),
    text('shop_phone', 1170, 48, ink),
    text('store_url', 1250, 38, ink),
  ];
}

const RAKHI: Palette = { from: '#fff0d6', to: '#ffc27a', border: '#b3261e', ink: '#3a1408' };
const IVORY_GOLD: Palette = { from: '#fffdf6', to: '#f1e2bd', border: '#b8860b', ink: '#33261a' };

const STARTER: SeedDesign[] = [
  {
    name: 'Diwali Diyas',
    occasion: 'Diwali',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: MARIGOLD,
    layers: (p) => framed('PORTRAIT_4_5', p.ink, 170, 70),
    art: (w, _h, p) =>
      `<line x1="40" y1="70" x2="${w - 40}" y2="70" stroke="${p.border}" stroke-width="3"/>${row(7, 110, w - 110, (x) => diya(x, 120, 34))}`,
  },
  {
    name: 'Navratri Garba',
    occasion: 'Navratri',
    format: 'SQUARE',
    slots: 1,
    palette: GARBA,
    layers: (p) => framed('SQUARE', p.ink, 110, 100),
    art: (w, h) =>
      [
        ...[0, 1, 2].map(
          (i) =>
            `<circle cx="0" cy="0" r="${150 - i * 38}" fill="none" stroke="#fff" stroke-opacity="${0.9 - i * 0.2}" stroke-width="10"/><circle cx="${w}" cy="${h}" r="${150 - i * 38}" fill="none" stroke="#fff" stroke-opacity="${0.9 - i * 0.2}" stroke-width="10"/>`,
        ),
        row(12, 70, w - 70, (x, i) =>
          star(x, h - 50, 22, 4, 0.4, ['#fff1c1', '#7bd389', '#5ec8f2', '#fff'][i % 4] as string),
        ),
      ].join(''),
  },
  {
    name: 'Eid Mubarak',
    occasion: 'Eid',
    format: 'STORY_9_16',
    slots: 1,
    palette: EMERALD,
    layers: (p) => framed('STORY_9_16', p.ink, 390, 120),
    art: (w, h, p) =>
      [
        crescent('eid', w / 2, 210, 120, '#f6e7a8'),
        star(w / 2 + 200, 150, 34, 5, 0.42, '#f6e7a8'),
        star(w / 2 - 230, 280, 22, 5, 0.42, '#f6e7a8'),
        star(w / 2 + 280, 300, 16, 5, 0.42, '#f6e7a8'),
        `<line x1="120" y1="${h - 70}" x2="${w - 120}" y2="${h - 70}" stroke="${p.border}" stroke-width="3"/>`,
      ].join(''),
  },
  {
    name: 'Karwa Chauth Moon',
    occasion: 'Karwa Chauth',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: MOON,
    layers: (p) => framed('PORTRAIT_4_5', p.ink, 260, 70),
    art: (w) =>
      [
        '<defs><radialGradient id="glow"><stop offset="0" stop-color="#fff6d0"/><stop offset="1" stop-color="#fff6d0" stop-opacity="0"/></radialGradient></defs>',
        `<circle cx="${w / 2}" cy="125" r="130" fill="url(#glow)"/>`,
        `<circle cx="${w / 2}" cy="125" r="70" fill="#fff3c4"/>`,
        star(180, 80, 12, 4, 0.4, '#fff'),
        star(w - 190, 160, 10, 4, 0.4, '#fff'),
        star(300, 200, 8, 4, 0.4, '#fff'),
        star(w - 320, 70, 8, 4, 0.4, '#fff'),
      ].join(''),
  },
  {
    name: 'Wedding Season',
    occasion: 'Wedding',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: IVORY,
    layers: (p) => framed('PORTRAIT_4_5', p.ink, 130, 60),
    art: (w, h, p) =>
      [
        mandala(70, 70, 70, p.border),
        mandala(w - 70, 70, 70, p.border),
        mandala(70, h - 70, 70, p.border),
        mandala(w - 70, h - 70, 70, p.border),
        `<rect x="48" y="48" width="${w - 96}" height="${h - 96}" fill="none" stroke="${p.border}" stroke-width="2"/>`,
      ].join(''),
  },
  {
    name: 'Holi Colours',
    occasion: 'Holi',
    format: 'SQUARE',
    slots: 1,
    palette: HOLI,
    layers: (p) => framed('SQUARE', p.ink, 120, 120),
    art: (w, h) =>
      (
        [
          ['#ff2e93', 90, 80, 120],
          ['#ffd60a', 250, 40, 70],
          ['#3a86ff', w - 90, 90, 110],
          ['#06d6a0', w - 260, 50, 60],
          ['#ff7b00', 80, h - 90, 110],
          ['#9d4edd', 260, h - 50, 70],
          ['#ef476f', w - 90, h - 80, 120],
          ['#118ab2', w - 270, h - 40, 60],
        ] as [string, number, number, number][]
      )
        .map(
          ([c, x, y, r]) =>
            `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity="0.75"/>`,
        )
        .join(''),
  },
  {
    name: 'Independence Day',
    occasion: 'Independence Day',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: TRICOLOUR,
    layers: (p) => framed('PORTRAIT_4_5', p.ink, 230, 120),
    art: (w, h) => {
      const spokes = Array.from({ length: 24 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 24;
        return `<line x1="${f(w / 2)}" y1="150" x2="${f(w / 2 + 44 * Math.cos(a))}" y2="${f(150 + 44 * Math.sin(a))}" stroke="#1a3a8a" stroke-width="2"/>`;
      }).join('');
      return `<rect x="0" y="0" width="${w}" height="100" fill="#ff9933"/><rect x="0" y="${h - 100}" width="${w}" height="100" fill="#138808"/><circle cx="${w / 2}" cy="150" r="46" fill="none" stroke="#1a3a8a" stroke-width="4"/>${spokes}`;
    },
  },
  {
    name: 'Sale Starburst',
    occasion: 'Sale',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: SALE_RED,
    layers: (p) => framed('PORTRAIT_4_5', p.ink, 170, 70),
    // The word is baked in (English, DejaVu); the discount itself is the retailer's offer_text.
    art: (w) =>
      `${star(w - 160, 130, 95, 20, 0.82, '#c1121f')}<text x="${w - 160}" y="150" font-family="DejaVu Sans, Arial, sans-serif" font-size="48" font-weight="700" fill="#fff" text-anchor="middle">SALE</text>`,
  },
  {
    name: 'Under Price Collage',
    occasion: 'Offer',
    format: 'PORTRAIT_4_5',
    slots: 4,
    palette: SLATE,
    // The retailer types the headline ("Under ₹999") as custom_text.
    layers: (p) => collage4(p.ink),
  },
  {
    name: 'Visit Us Card',
    occasion: 'Store',
    format: 'SQUARE',
    slots: 1,
    palette: NAVY,
    layers: (p) => visitUs(p.ink),
    art: (w, h, p) =>
      `<line x1="200" y1="${h - 60}" x2="${w - 200}" y2="${h - 60}" stroke="${p.border}" stroke-width="3"/>${star(w / 2, h - 60, 14, 4, 0.4, p.border)}`,
  },
  {
    name: 'Rakhi Thread',
    occasion: 'Rakhi',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: RAKHI,
    layers: (p) => framed('PORTRAIT_4_5', p.ink, 190, 70),
    art: (w) => rakhi(w),
  },
  {
    name: 'Limited Stock',
    occasion: 'Limited Stock',
    format: 'SQUARE',
    slots: 1,
    palette: SLATE,
    layers: (p) => framed('SQUARE', p.ink, 110, 100),
    art: (w) => banner(w, 'LIMITED STOCK', '#c1121f'),
  },
  {
    name: 'Back In Stock',
    occasion: 'Back in Stock',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: EMERALD,
    layers: (p) => framed('PORTRAIT_4_5', p.ink, 110, 70),
    art: (w) => banner(w, 'BACK IN STOCK', '#e6c36a', '#06281f'),
  },
  {
    name: 'Look of the Day',
    occasion: 'Look of the Day',
    format: 'PORTRAIT_4_5',
    slots: 2,
    palette: IVORY_GOLD,
    layers: (p) => lookOfDay(p.ink),
    art: (w, _h, p) =>
      `<text x="${f(w / 2)}" y="112" font-family="DejaVu Serif, Georgia, serif" font-size="58" font-weight="700" fill="${p.border}" text-anchor="middle">LOOK OF THE DAY</text>`,
  },
  {
    name: 'Meet Our Store',
    occasion: 'Store',
    format: 'STORY_9_16',
    slots: 1,
    palette: MAROON,
    layers: (p) => storeIntro(p.ink),
    art: (w, h, p) => mandala(w / 2, h - 260, 130, p.border),
  },
];

export const DESIGNS: SeedDesign[] = [...PLACEHOLDERS, ...STARTER];

/** Gradient + inner border + the design's own art, as one SVG string (the script rasterises it). */
export function backgroundSvg(d: SeedDesign): string {
  const { w, h } = DESIGN_FORMATS[d.format];
  const p = d.palette;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`,
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">',
    `<stop offset="0" stop-color="${p.from}"/><stop offset="1" stop-color="${p.to}"/>`,
    `</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>`,
    `<rect x="24" y="24" width="${w - 48}" height="${h - 48}" fill="none" stroke="${p.border}" stroke-width="6"/>`,
    d.art?.(w, h, p) ?? '',
    '</svg>',
  ].join('');
}
