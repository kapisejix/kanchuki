// Renders an admin-made design template (docs/tasks/pending/admin-social-design-templates.md §4.3).
//
// Pure sharp: background Buffer + spec + already-loaded variable values in, JPEG Buffer out. No
// network, no DB, no cost — callers fetch the photos/logo and hand the bytes in, so this file can
// never be pointed at a URL (SSRF) or at another retailer's data.
//
// Rules:
//   • A layer whose variable has no value (no logo, no MRP, product slot not supplied) is skipped,
//     never drawn as a broken box.
//   • Every text value is XML-escaped; SVG is rasterised by sharp and never served (RC-040/077).
//   • Every decode passes `limitInputPixels` (RC-141).
//   • Text is fitted by estimate (sharp cannot measure): wrap → shrink to 60% → ellipsis. Estimates
//     lean wide so text errs toward smaller, not toward spilling out of the box.
//   • Fonts are only `serif` (Marcellus) and `sans` (DejaVu). Devanagari needs a bundled Indic font
//     that the API image does not have yet — Hindi text renders as boxes until it does.
import {
  DESIGN_CUSTOM_MAX_LEN,
  DESIGN_CUSTOM_TEXT_VARS,
  DESIGN_FORMATS,
  DESIGN_MAX_PRODUCT_SLOTS,
  DESIGN_PRODUCT_TEXT_VARS,
  DESIGN_SHOP_TEXT_VARS,
  type DesignCustomTextVar,
  type DesignFont,
  type DesignFormat,
  type DesignProductTextVar,
  type DesignShopTextVar,
  type DesignSpec,
  type DesignTextLayer,
  MAX_IMAGE_PIXELS,
  parseDesignSpec,
} from '@kanchuki/shared';
import sharp, { type OverlayOptions } from 'sharp';
import { formatRupees } from './schedule-templates.js';

const IN = { limitInputPixels: MAX_IMAGE_PIXELS };

export interface DesignProductVars {
  texts: Partial<Record<DesignProductTextVar, string>>;
  image: Buffer | null;
}

export interface DesignRenderInput {
  format: DesignFormat;
  spec: DesignSpec;
  /** Template background art; null = plain white. */
  background: Buffer | null;
  shop: { texts: Partial<Record<DesignShopTextVar, string>>; logo: Buffer | null };
  custom: Partial<Record<DesignCustomTextVar, string>>;
  products: DesignProductVars[];
}

const FONT_STACK: Record<DesignFont, string> = {
  serif: 'Marcellus, Noto Sans Devanagari, DejaVu Serif, serif',
  sans: 'DejaVu Sans, Noto Sans Devanagari, Noto Sans, Arial, Helvetica, sans-serif',
};

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Drop control characters (invalid in XML 1.0, sharp would throw), collapse whitespace.
export function clean(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// ── text fitting ───────────────────────────────────────────────

const glyphW = (size: number, bold: boolean) => size * (bold ? 0.62 : 0.58);

function wrap(text: string, size: number, boxW: number, bold: boolean): string[] {
  const perLine = Math.max(1, Math.floor(boxW / glyphW(size, bold)));
  const lines: string[] = [];
  let line = '';
  for (let word of text.split(' ')) {
    while (word.length > perLine) {
      // one word wider than the box: hard-break it
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, perLine));
      word = word.slice(perLine);
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length <= perLine) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Wrap → shrink (down to 60%) → ellipsis. Exported for tests. */
export function fitText(
  text: string,
  size: number,
  boxW: number,
  maxLines: number,
  bold: boolean,
): { lines: string[]; size: number } {
  const floor = Math.max(12, Math.floor(size * 0.6));
  for (let s = size; s >= floor; s -= 2) {
    const lines = wrap(text, s, boxW, bold);
    if (lines.length <= maxLines) return { lines, size: s };
  }
  const lines = wrap(text, floor, boxW, bold).slice(0, maxLines);
  const perLine = Math.max(2, Math.floor(boxW / glyphW(floor, bold)));
  const last = lines[lines.length - 1] ?? '';
  lines[lines.length - 1] = `${last.slice(0, perLine - 1).trimEnd()}…`;
  return { lines, size: floor };
}

// ── variable resolution ────────────────────────────────────────

const isIn = <T extends string>(list: readonly T[], v: string): v is T =>
  (list as readonly string[]).includes(v);

function textValue(layer: DesignTextLayer, input: DesignRenderInput): string | null {
  let raw: string | undefined;
  if (isIn(DESIGN_PRODUCT_TEXT_VARS, layer.var)) {
    raw = input.products[layer.index ?? 0]?.texts[layer.var];
  } else if (isIn(DESIGN_SHOP_TEXT_VARS, layer.var)) {
    raw = input.shop.texts[layer.var];
  } else if (isIn(DESIGN_CUSTOM_TEXT_VARS, layer.var)) {
    raw = input.custom[layer.var]?.slice(0, DESIGN_CUSTOM_MAX_LEN);
  }
  if (raw == null) return null;
  let value = clean(raw);
  if (layer.format === 'inr') {
    const paise = Number(value);
    if (!Number.isFinite(paise) || paise <= 0) return null;
    value = formatRupees(paise);
  }
  return value || null;
}

function textSvgFragment(layer: DesignTextLayer, value: string, canvasW: number): string {
  const boxW = layer.w ?? canvasW - layer.x;
  const bold = layer.bold === true;
  const { lines, size } = fitText(value, layer.size, boxW, layer.maxLines ?? 1, bold);
  const align = layer.align ?? 'left';
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const x = align === 'center' ? layer.x + boxW / 2 : align === 'right' ? layer.x + boxW : layer.x;
  return lines
    .map(
      (line, n) =>
        `<text x="${x}" y="${Math.round(layer.y + size * 0.85 + n * size * 1.2)}" ` +
        `font-family="${FONT_STACK[layer.font]}" font-size="${size}" ` +
        `font-weight="${bold ? 700 : 400}" fill="${layer.color}" text-anchor="${anchor}">${esc(line)}</text>`,
    )
    .join('');
}

// ── render ─────────────────────────────────────────────────────

/** Flat tan rectangle standing in for a product photo in admin previews. */
export function samplePhoto(): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 1000, channels: 3, background: '#c9b8a6' } })
    .jpeg()
    .toBuffer();
}

export async function renderDesign(input: DesignRenderInput): Promise<Buffer> {
  const { w: cw, h: ch } = DESIGN_FORMATS[input.format];
  // The spec comes from a DB row: re-validate rather than trust it, and use the rebuilt copy.
  const parsed = parseDesignSpec(input.spec, input.format, DESIGN_MAX_PRODUCT_SLOTS);
  if (!parsed.ok) throw new Error(`Invalid design spec: ${parsed.error}`);

  const base = input.background
    ? sharp(input.background, IN).rotate().resize(cw, ch, { fit: 'cover', position: 'attention' })
    : sharp({ create: { width: cw, height: ch, channels: 3, background: '#ffffff' } });

  const composites: OverlayOptions[] = [];
  let pendingText = '';
  const flushText = () => {
    if (!pendingText) return;
    composites.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">${pendingText}</svg>`,
      ),
    });
    pendingText = '';
  };

  for (const layer of parsed.spec.layers) {
    if (layer.type === 'text') {
      const value = textValue(layer, input);
      if (value) pendingText += textSvgFragment(layer, value, cw);
      continue;
    }
    if (layer.type === 'rect') {
      // SVG fragment joins pendingText so layer order is kept (same flush rules as text).
      pendingText += `<rect x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" fill="${layer.color}" fill-opacity="${layer.opacity}"/>`;
      continue;
    }
    const src =
      layer.var === 'shop_logo' ? input.shop.logo : input.products[layer.index ?? 0]?.image;
    if (!src) continue;
    flushText(); // keep layer order: text added before this image must sit under it
    composites.push({
      input: await sharp(src, IN)
        .rotate()
        .resize(layer.w, layer.h, {
          fit: layer.fit ?? 'contain',
          // 'attention' is a cover-only strategy; contain just centres.
          position: layer.fit === 'cover' ? 'attention' : 'centre',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
      left: layer.x,
      top: layer.y,
    });
  }
  flushText();

  return base.composite(composites).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
