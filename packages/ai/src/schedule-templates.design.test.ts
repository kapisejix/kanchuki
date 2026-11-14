import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { finishDesignImage } from './schedule-templates.js';

const photo = () =>
  sharp({ create: { width: 600, height: 400, channels: 3, background: '#cc3366' } })
    .jpeg()
    .toBuffer();
const slide = { pricePaise: 150000, storeName: 'Test Store', festival: null, logo: null };

describe('finishDesignImage', () => {
  it('ORIGINAL with no overlay returns the same bytes', async () => {
    const p = await photo();
    expect(await finishDesignImage(p, { format: 'ORIGINAL', overlay: null, slide })).toBe(p);
  });

  it.each([
    ['SQUARE', 1080, 1080],
    ['PORTRAIT', 1080, 1350],
    ['STORY', 1080, 1920],
    ['LANDSCAPE', 1200, 628],
  ] as const)('%s is cover-cropped to %ix%i', async (format, w, h) => {
    const out = await finishDesignImage(await photo(), { format, overlay: null, slide });
    const m = await sharp(out).metadata();
    expect([m.width, m.height]).toEqual([w, h]);
  });

  it('an overlay forces 4:5 whatever the format says', async () => {
    const out = await finishDesignImage(await photo(), {
      format: 'STORY',
      overlay: 'white_price',
      slide,
    });
    const m = await sharp(out).metadata();
    expect([m.width, m.height]).toEqual([1080, 1350]);
  });
});
