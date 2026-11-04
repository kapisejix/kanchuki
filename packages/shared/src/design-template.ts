// Admin-managed social design templates (docs/tasks/pending/admin-social-design-templates.md §4.1).
//
// A design = background image + ordered layers. Each layer names a *variable* from a closed list;
// the server fills it from the retailer's shop / product (never from the client), so a template can
// only ever reach data the retailer owns. This file is the one definition of that list and of what a
// stored spec may contain — the admin API (T3), the renderer (packages/ai/design-render.ts) and the
// editor all import it, so they cannot drift (RC-041 shape).

export const DESIGN_FORMATS = {
  SQUARE: { w: 1080, h: 1080 },
  PORTRAIT_4_5: { w: 1080, h: 1350 },
  STORY_9_16: { w: 1080, h: 1920 },
} as const;
export type DesignFormat = keyof typeof DESIGN_FORMATS;
export const DESIGN_FORMAT_KEYS = Object.keys(DESIGN_FORMATS) as DesignFormat[];

/** Filled per product slot (a layer's `index` picks the slot). */
export const DESIGN_PRODUCT_TEXT_VARS = [
  'product_name',
  'price',
  'mrp',
  'discount_pct',
  'sku',
  'fabric',
] as const;
/** Filled once per post from the retailer row. */
export const DESIGN_SHOP_TEXT_VARS = ['shop_name', 'shop_phone', 'shop_city', 'store_url'] as const;
/** Typed by the retailer in the app; length-capped by `DESIGN_CUSTOM_MAX_LEN`. */
export const DESIGN_CUSTOM_TEXT_VARS = ['custom_text', 'offer_text'] as const;
export const DESIGN_IMAGE_VARS = ['product_image', 'shop_logo'] as const;

export type DesignProductTextVar = (typeof DESIGN_PRODUCT_TEXT_VARS)[number];
export type DesignShopTextVar = (typeof DESIGN_SHOP_TEXT_VARS)[number];
export type DesignCustomTextVar = (typeof DESIGN_CUSTOM_TEXT_VARS)[number];
export type DesignTextVar = DesignProductTextVar | DesignShopTextVar | DesignCustomTextVar;
export type DesignImageVar = (typeof DESIGN_IMAGE_VARS)[number];

export const DESIGN_TEXT_VARS: readonly DesignTextVar[] = [
  ...DESIGN_PRODUCT_TEXT_VARS,
  ...DESIGN_SHOP_TEXT_VARS,
  ...DESIGN_CUSTOM_TEXT_VARS,
];

/** `serif` = Marcellus (brand heading font), `sans` = DejaVu Sans. A template can name nothing else. */
export const DESIGN_FONTS = ['serif', 'sans'] as const;
export type DesignFont = (typeof DESIGN_FONTS)[number];

export const DESIGN_MAX_LAYERS = 20;
export const DESIGN_MAX_PRODUCT_SLOTS = 6;
export const DESIGN_CUSTOM_MAX_LEN = 80;

export interface DesignTextLayer {
  type: 'text';
  var: DesignTextVar;
  x: number;
  y: number;
  /** Wrap width. Omitted = from x to the right edge. */
  w?: number;
  size: number;
  font: DesignFont;
  /** `#RRGGBB` */
  color: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  /** Default 1. Text that still does not fit after shrinking is cut with an ellipsis. */
  maxLines?: number;
  /** `inr`: the value is paise, shown as ₹1,500. Only valid on price / mrp. */
  format?: 'inr';
  /** Product slot (0-based) for product vars. Default 0. */
  index?: number;
}

export interface DesignImageLayer {
  type: 'image';
  var: DesignImageVar;
  x: number;
  y: number;
  w: number;
  h: number;
  fit?: 'contain' | 'cover';
  index?: number;
}

export type DesignLayer = DesignTextLayer | DesignImageLayer;

export interface DesignSpec {
  layers: DesignLayer[];
}

export type DesignSpecResult = { ok: true; spec: DesignSpec } | { ok: false; error: string };

const HEX = /^#[0-9a-fA-F]{6}$/;
// Untrusted input: every key we read is declared (as `unknown`) so access stays dot-style under
// noPropertyAccessFromIndexSignature, and anything not declared here is never read.
interface Raw {
  layers?: unknown;
  type?: unknown;
  var?: unknown;
  x?: unknown;
  y?: unknown;
  w?: unknown;
  h?: unknown;
  size?: unknown;
  font?: unknown;
  color?: unknown;
  align?: unknown;
  bold?: unknown;
  maxLines?: unknown;
  format?: unknown;
  index?: unknown;
  fit?: unknown;
}
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const has = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/**
 * Validates an untrusted spec (admin upload, DB row) and returns a *rebuilt* copy that carries only
 * known fields, so extra keys never reach the renderer. Coordinates must sit inside the canvas.
 */
export function parseDesignSpec(
  raw: unknown,
  format: DesignFormat,
  productSlots = 1,
): DesignSpecResult {
  const fail = (error: string): DesignSpecResult => ({ ok: false, error });
  const { w: cw, h: ch } = DESIGN_FORMATS[format];
  if (!isObj(raw) || !Array.isArray(raw.layers)) return fail('spec.layers must be an array');
  if (raw.layers.length === 0) return fail('A design needs at least one layer');
  if (raw.layers.length > DESIGN_MAX_LAYERS) {
    return fail(`At most ${DESIGN_MAX_LAYERS} layers`);
  }

  const layers: DesignLayer[] = [];
  for (const [n, l] of (raw.layers as unknown[]).entries()) {
    const at = `layer ${n + 1}`;
    if (!isObj(l)) return fail(`${at}: not an object`);
    if (!isNum(l.x) || !isNum(l.y)) return fail(`${at}: x and y are required numbers`);
    if (l.x < 0 || l.x >= cw || l.y < 0 || l.y >= ch) {
      return fail(`${at}: x/y must be inside the ${cw}×${ch} canvas`);
    }
    const index = l.index === undefined ? 0 : l.index;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= productSlots) {
      return fail(`${at}: index must be 0–${productSlots - 1}`);
    }

    if (l.type === 'image') {
      if (!has(DESIGN_IMAGE_VARS, l.var)) return fail(`${at}: unknown image variable`);
      if (!isNum(l.w) || !isNum(l.h) || l.w < 8 || l.h < 8) {
        return fail(`${at}: w and h must be numbers ≥ 8`);
      }
      if (l.x + l.w > cw || l.y + l.h > ch) {
        return fail(`${at}: image runs outside the canvas`);
      }
      if (l.fit !== undefined && l.fit !== 'contain' && l.fit !== 'cover') {
        return fail(`${at}: fit must be contain or cover`);
      }
      layers.push({
        type: 'image',
        var: l.var,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        fit: l.fit === 'cover' ? 'cover' : 'contain',
        index: index as number,
      });
      continue;
    }

    if (l.type !== 'text') return fail(`${at}: type must be text or image`);
    if (!has(DESIGN_TEXT_VARS, l.var)) return fail(`${at}: unknown text variable`);
    if (!isNum(l.size) || l.size < 12 || l.size > 200) {
      return fail(`${at}: size must be 12–200`);
    }
    if (!has(DESIGN_FONTS, l.font)) {
      return fail(`${at}: font must be ${DESIGN_FONTS.join(' or ')}`);
    }
    if (typeof l.color !== 'string' || !HEX.test(l.color)) {
      return fail(`${at}: color must be #RRGGBB`);
    }
    if (l.w !== undefined && (!isNum(l.w) || l.w < 40 || l.x + l.w > cw)) {
      return fail(`${at}: w must be ≥ 40 and stay inside the canvas`);
    }
    if (
      l.align !== undefined &&
      l.align !== 'left' &&
      l.align !== 'center' &&
      l.align !== 'right'
    ) {
      return fail(`${at}: align must be left, center or right`);
    }
    if (
      l.maxLines !== undefined &&
      (!Number.isInteger(l.maxLines) || (l.maxLines as number) < 1 || (l.maxLines as number) > 6)
    ) {
      return fail(`${at}: maxLines must be 1–6`);
    }
    if (l.format !== undefined) {
      if (l.format !== 'inr') return fail(`${at}: format must be inr`);
      if (l.var !== 'price' && l.var !== 'mrp') {
        return fail(`${at}: inr works on price / mrp only`);
      }
    }
    layers.push({
      type: 'text',
      var: l.var,
      x: l.x,
      y: l.y,
      ...(l.w !== undefined ? { w: l.w as number } : {}),
      size: l.size,
      font: l.font,
      color: l.color,
      align: (l.align as DesignTextLayer['align']) ?? 'left',
      bold: l.bold === true,
      maxLines: (l.maxLines as number | undefined) ?? 1,
      ...(l.format === 'inr' ? { format: 'inr' as const } : {}),
      index: index as number,
    });
  }
  return { ok: true, spec: { layers } };
}
