import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  COVER_STYLES,
  SLIDE_TEMPLATES,
  formatRupees,
  isCoverStyle,
  isSlideTemplate,
  normalizePhoto,
  renderCollage,
  renderSlide,
} from './schedule-templates.js';

// A 400×300 landscape "garment photo" — wrong ratio on purpose.
const photo = () =>
  sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 60, b: 90 } },
  })
    .jpeg()
    .toBuffer();
const logo = () =>
  sharp({
    create: { width: 120, height: 60, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();

const input = async (over: Record<string, unknown> = {}) => ({
  photo: await photo(),
  pricePaise: 150000 as number | null,
  storeName: 'Anita & Sons <Boutique>',
  festival: null as string | null,
  logo: null as Buffer | null,
  ...over,
});

describe('schedule templates', () => {
  it.each(SLIDE_TEMPLATES)(
    '%s renders a 1080×1350 JPEG from a wrong-ratio photo',
    async (t) => {
      const out = await renderSlide(
        t,
        await input({ logo: t === 'logo_corner' ? await logo() : null }),
      );
      const meta = await sharp(out).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1080, 1350]);
      // first SVG text render in a process pays libvips/fontconfig cold start (~5 s)
    },
    30_000,
  );

  it('survives XML-special store names and a missing price / logo / festival', async () => {
    for (const t of SLIDE_TEMPLATES) {
      const out = await renderSlide(t, await input({ pricePaise: null }));
      expect((await sharp(out).metadata()).height).toBe(1350);
    }
  });

  it('collage cover works for 1–4 photos and ignores extras', async () => {
    for (const n of [1, 2, 3, 4, 6]) {
      const out = await renderCollage(await Promise.all(Array.from({ length: n }, photo)), 'Anita');
      const meta = await sharp(out).metadata();
      expect([meta.width, meta.height]).toEqual([1080, 1350]);
    }
  });

  it('normalizePhoto crops any ratio to 4:5', async () => {
    const meta = await sharp(await normalizePhoto(await photo())).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
  });

  it('formats rupees with Indian grouping', () => {
    expect(formatRupees(150000)).toBe('₹1,500');
    expect(formatRupees(12345600)).toBe('₹1,23,456');
  });

  it('registry guards', () => {
    expect(isSlideTemplate('new_arrival')).toBe(true);
    expect(isSlideTemplate('collage_cover')).toBe(false);
    expect(isCoverStyle('collage_cover')).toBe(true);
    expect(isCoverStyle('white_price')).toBe(false);
    expect(COVER_STYLES).toEqual(['collage_cover']);
  });
});
