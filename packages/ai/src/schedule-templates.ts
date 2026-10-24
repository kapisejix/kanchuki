// F-043 Task 4 — free image templates for scheduled posts (spec §3, D3, D5).
//
// Pure sharp renderers: image Buffer(s) in, 1080×1350 (4:5) JPEG Buffer out. No
// network, no DB, no cost. The registry is code, not a table (owner decision:
// add an admin catalog when a template needs retiring or per-plan gating).
//
// Text is drawn through an SVG overlay. The font stack falls back to whatever
// sans the host has; price is digits + ₹ only so no Indic shaping is needed.
import { SCHEDULE_COVER_STYLES, SCHEDULE_SLIDE_TEMPLATES } from '@kanchuki/shared';
import sharp from 'sharp';

export const SLIDE_TEMPLATES = SCHEDULE_SLIDE_TEMPLATES;
export const COVER_STYLES = SCHEDULE_COVER_STYLES;

export type SlideTemplate = (typeof SLIDE_TEMPLATES)[number];
export type CoverStyle = (typeof COVER_STYLES)[number];

export const TEMPLATE_LABELS: Record<SlideTemplate | CoverStyle, string> = {
  white_price: 'White + price',
  new_arrival: 'New Arrival badge',
  festival_frame: 'Festival frame',
  logo_corner: 'Store logo',
  collage_cover: 'Collage cover',
};

export const isSlideTemplate = (v: unknown): v is SlideTemplate =>
  typeof v === 'string' && (SLIDE_TEMPLATES as readonly string[]).includes(v);
export const isCoverStyle = (v: unknown): v is CoverStyle =>
  typeof v === 'string' && (COVER_STYLES as readonly string[]).includes(v);

const W = 1080;
const H = 1350;
// Marcellus = the mobile app's heading font (apps/api/fonts, installed by apps/api/Dockerfile).
// DejaVu stays as the fallback for glyphs Marcellus lacks (e.g. the rupee sign) and for hosts without it.
const FONT = 'font-family="Marcellus, DejaVu Sans, Noto Sans, Arial, Helvetica, sans-serif"';
const INK = '#231F48';
const GOLD = '#C9A24B';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "₹1,500" — paise in, Indian grouping, no decimals. */
export function formatRupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

const svg = (body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`);

const jpeg = (img: ReturnType<typeof sharp>) => img.jpeg({ quality: 88, mozjpeg: true }).toBuffer();

/** Center-crop any photo to the carousel's one aspect ratio (IG: first slide sets it). */
export async function normalizePhoto(photo: Buffer): Promise<Buffer> {
  return jpeg(sharp(photo).rotate().resize(W, H, { fit: 'cover', position: 'attention' }));
}

export interface SlideInput {
  photo: Buffer;
  pricePaise: number | null;
  storeName: string;
  /** Nearest festival name, or null → generic "Festive" frame. */
  festival: string | null;
  /** Retailer logo bytes, or null → store-name pill instead. */
  logo: Buffer | null;
}

export async function renderSlide(template: SlideTemplate, i: SlideInput): Promise<Buffer> {
  const cover = () =>
    sharp(i.photo).rotate().resize(W, H, { fit: 'cover', position: 'attention' }).toBuffer();

  switch (template) {
    case 'white_price': {
      // Photo contained on white, price strip across the bottom.
      const stripH = 170;
      const photo = await sharp(i.photo)
        .rotate()
        .resize(W - 80, H - stripH - 60, { fit: 'inside' })
        .toBuffer();
      const price = i.pricePaise != null ? formatRupees(i.pricePaise) : '';
      const strip = svg(
        `<rect x="0" y="${H - stripH}" width="${W}" height="${stripH}" fill="${INK}"/>
         <text x="${W / 2}" y="${H - stripH / 2 + 24}" ${FONT} font-size="76" font-weight="700" fill="#fff" text-anchor="middle">${esc(price || i.storeName)}</text>`,
      );
      return jpeg(
        sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite([
          { input: photo, gravity: 'north', top: 30, left: 40 },
          { input: strip },
        ]),
      );
    }
    case 'new_arrival': {
      const badge = svg(
        `<rect x="40" y="40" rx="22" ry="22" width="420" height="104" fill="${GOLD}"/>
         <text x="250" y="110" ${FONT} font-size="48" font-weight="700" fill="${INK}" text-anchor="middle">NEW ARRIVAL</text>`,
      );
      return jpeg(sharp(await cover()).composite([{ input: badge }]));
    }
    case 'festival_frame': {
      const name = (i.festival ?? 'Festive Collection').toUpperCase();
      const inner = await sharp(i.photo)
        .rotate()
        .resize(W - 120, H - 260, { fit: 'cover', position: 'attention' })
        .toBuffer();
      const frame = svg(
        `<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${GOLD}" stroke-width="10"/>
         <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${GOLD}" stroke-width="3"/>
         <text x="${W / 2}" y="125" ${FONT} font-size="56" font-weight="700" fill="${GOLD}" text-anchor="middle">${esc(name.slice(0, 28))}</text>
         <text x="${W / 2}" y="${H - 70}" ${FONT} font-size="40" fill="${GOLD}" text-anchor="middle">${esc(i.storeName.slice(0, 40))}</text>`,
      );
      return jpeg(
        sharp({ create: { width: W, height: H, channels: 3, background: INK } }).composite([
          { input: inner, top: 170, left: 60 },
          { input: frame },
        ]),
      );
    }
    case 'logo_corner': {
      const base = await cover();
      if (i.logo) {
        const logo = await sharp(i.logo).resize({ width: 190, fit: 'inside' }).png().toBuffer();
        const meta = await sharp(logo).metadata();
        const lw = meta.width ?? 190;
        const lh = meta.height ?? 190;
        const plate = svg(
          `<rect x="${W - lw - 80}" y="${H - lh - 80}" rx="20" ry="20" width="${lw + 40}" height="${lh + 40}" fill="#ffffff" fill-opacity="0.9"/>`,
        );
        return jpeg(
          sharp(base).composite([
            { input: plate },
            { input: logo, left: W - lw - 60, top: H - lh - 60 },
          ]),
        );
      }
      const name = i.storeName.slice(0, 26);
      const w = Math.min(W - 80, 60 + name.length * 26);
      const pill = svg(
        `<rect x="${W - w - 40}" y="${H - 150}" rx="30" ry="30" width="${w}" height="90" fill="${INK}" fill-opacity="0.85"/>
         <text x="${W - w / 2 - 40}" y="${H - 90}" ${FONT} font-size="40" font-weight="700" fill="#fff" text-anchor="middle">${esc(name)}</text>`,
      );
      return jpeg(sharp(base).composite([{ input: pill }]));
    }
  }
}

/** Collage cover slide from up to 4 product photos (D6: optional, first slide). */
export async function renderCollage(photos: Buffer[], storeName: string): Promise<Buffer> {
  const picks = photos.slice(0, 4);
  const bandH = 150;
  const areaH = H - bandH;
  const cols = picks.length === 1 ? 1 : 2;
  const rows = Math.ceil(picks.length / cols);
  const cw = Math.floor(W / cols);
  const ch = Math.floor(areaH / rows);
  const tiles = await Promise.all(
    picks.map(async (p, n) => ({
      input: await sharp(p)
        .rotate()
        .resize(cw, ch, { fit: 'cover', position: 'attention' })
        .toBuffer(),
      left: (n % cols) * cw,
      top: Math.floor(n / cols) * ch,
    })),
  );
  const band = svg(
    `<rect x="0" y="${areaH}" width="${W}" height="${bandH}" fill="${INK}"/>
     <text x="${W / 2}" y="${areaH + 92}" ${FONT} font-size="54" font-weight="700" fill="#fff" text-anchor="middle">${esc(storeName.slice(0, 30))} · New Arrivals</text>`,
  );
  return jpeg(
    sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite([
      ...tiles,
      { input: band },
    ]),
  );
}
