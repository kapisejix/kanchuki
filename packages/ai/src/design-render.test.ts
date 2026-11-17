import { DESIGN_FORMATS, type DesignFormat } from '@kanchuki/shared';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { type DesignRenderInput, clean, fitText, renderDesign } from './design-render.js';

const solid = (w: number, h: number, c: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: c } })
    .jpeg()
    .toBuffer();

const RED = { r: 220, g: 20, b: 20 };

const base = async (over: Partial<DesignRenderInput> = {}): Promise<DesignRenderInput> => ({
  format: 'PORTRAIT_4_5',
  background: null,
  shop: { texts: { shop_name: 'Anita & Sons <Boutique>' }, logo: null },
  custom: { custom_text: 'Diwali Sale' },
  products: [
    {
      texts: { product_name: 'Red Silk Saree', price: '150000' },
      image: await solid(400, 300, RED),
    },
  ],
  spec: {
    layers: [
      { type: 'image', var: 'product_image', x: 100, y: 100, w: 400, h: 400, fit: 'contain' },
      // y values stay inside the smallest canvas (SQUARE, 1080) so every format validates
      {
        type: 'text',
        var: 'product_name',
        x: 90,
        y: 900,
        w: 900,
        size: 56,
        font: 'serif',
        color: '#000000',
      },
      {
        type: 'text',
        var: 'price',
        x: 90,
        y: 970,
        size: 64,
        font: 'sans',
        color: '#000000',
        format: 'inr',
      },
      { type: 'text', var: 'shop_name', x: 90, y: 60, size: 40, font: 'sans', color: '#000000' },
      { type: 'image', var: 'shop_logo', x: 900, y: 40, w: 140, h: 140 },
      {
        type: 'text',
        var: 'mrp',
        x: 90,
        y: 1040,
        size: 30,
        font: 'sans',
        color: '#000000',
        format: 'inr',
      },
    ],
  },
  ...over,
});

const pixel = async (img: Buffer, left: number, top: number) => {
  const raw = await sharp(img).extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
  return [raw[0], raw[1], raw[2]] as [number, number, number];
};
/** Darkest grey value in a region — black text on white pulls this well below 255. */
const darkest = async (img: Buffer, left: number, top: number, width: number, height: number) => {
  const raw = await sharp(img).extract({ left, top, width, height }).greyscale().raw().toBuffer();
  return Math.min(...raw);
};

describe('clean', () => {
  it('turns control characters into spaces and collapses whitespace', () => {
    expect(clean('a\u0000b\u0007c\u007Fd\n\te   f')).toBe('a b c d e f');
  });

  it('keeps Devanagari and the rupee sign untouched', () => {
    expect(clean('  साड़ी ₹1,500 ')).toBe('साड़ी ₹1,500');
  });
});

describe('fitText', () => {
  it('leaves short text at full size on one line', () => {
    expect(fitText('Saree', 56, 900, 1, false)).toEqual({ lines: ['Saree'], size: 56 });
  });

  it('wraps onto more lines when allowed', () => {
    const r = fitText('Red Silk Banarasi Saree With Gold Zari Border', 56, 400, 3, false);
    expect(r.lines.length).toBeGreaterThan(1);
    expect(r.lines.length).toBeLessThanOrEqual(3);
  });

  it('shrinks before it truncates', () => {
    // 23 chars: too wide at 80px in 700px, fits once shrunk (floor 48px holds 25 chars)
    const r = fitText('Red Silk Banarasi Saree', 80, 700, 1, false);
    expect(r.size).toBeLessThan(80);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).not.toContain('…');
  });

  it('ends with an ellipsis and respects maxLines when nothing fits', () => {
    const r = fitText('word '.repeat(80), 56, 300, 2, false);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1]).toMatch(/…$/);
    expect(r.size).toBeGreaterThanOrEqual(Math.floor(56 * 0.6));
  });

  it('hard-breaks a single word wider than the box', () => {
    const r = fitText('A'.repeat(200), 40, 300, 6, false);
    expect(r.lines.length).toBeGreaterThan(1);
  });
});

describe('renderDesign', () => {
  it.each(Object.keys(DESIGN_FORMATS) as DesignFormat[])(
    '%s renders a JPEG at the format size',
    async (format) => {
      // One layer near the top: the shared fixture's y values do not fit the 628px landscape canvas.
      const spec = {
        layers: [
          {
            type: 'text',
            var: 'shop_name',
            x: 90,
            y: 60,
            size: 40,
            font: 'sans',
            color: '#000000',
          },
        ],
      } as DesignRenderInput['spec'];
      const out = await renderDesign(await base({ format, spec }));
      const meta = await sharp(out).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual([
        'jpeg',
        DESIGN_FORMATS[format].w,
        DESIGN_FORMATS[format].h,
      ]);
    },
    30_000, // first SVG text render pays libvips/fontconfig cold start
  );

  it('draws the product image where the layer says, contained', async () => {
    const out = await renderDesign(await base());
    // 400x300 photo contained in a 400x400 box at (100,100): middle is red, the letterbox rows are not.
    const [r, g, b] = await pixel(out, 300, 300);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(80);
    const [lr, lg, lb] = await pixel(out, 300, 110);
    expect(lr + lg + lb).toBeGreaterThan(600); // transparent letterbox -> white background
  }, 30_000);

  it('draws text, and text is absent when its variable is missing', async () => {
    const withShop = await renderDesign(await base());
    expect(await darkest(withShop, 90, 60, 500, 50)).toBeLessThan(128);

    const input = await base();
    input.shop.texts = {};
    const without = await renderDesign(input);
    expect(await darkest(without, 90, 60, 500, 50)).toBeGreaterThan(240);
  }, 30_000);

  it('skips layers with no value instead of throwing (no logo, no MRP, bad price)', async () => {
    const input = await base();
    input.products[0] = { texts: { product_name: 'x', price: 'not-a-number' }, image: null };
    const out = await renderDesign(input);
    expect((await sharp(out).metadata()).width).toBe(1080);
  }, 30_000);

  it('survives XML-special text, control characters and a hostile custom_text', async () => {
    const input = await base();
    input.custom = {
      custom_text: `<svg onload="x">&amp;\u0000\u0007\u0008\u000B\u001F${'z'.repeat(500)}`,
    };
    input.products[0] = {
      texts: { product_name: 'Saree </text><script>alert(1)</script> & "co"' },
      image: input.products[0]?.image ?? null,
    };
    input.spec = {
      layers: [
        {
          type: 'text',
          var: 'custom_text',
          x: 10,
          y: 10,
          size: 40,
          font: 'sans',
          color: '#000000',
          maxLines: 2,
        },
        {
          type: 'text',
          var: 'product_name',
          x: 10,
          y: 200,
          w: 800,
          size: 40,
          font: 'serif',
          color: '#000000',
        },
      ],
    };
    const out = await renderDesign(input);
    expect((await sharp(out).metadata()).format).toBe('jpeg');
  }, 30_000);

  it('uses the supplied background art', async () => {
    const out = await renderDesign(
      await base({ background: await solid(300, 300, { r: 10, g: 10, b: 200 }) }),
    );
    const [r, , b] = await pixel(out, 900, 700);
    expect(b).toBeGreaterThan(150);
    expect(r).toBeLessThan(60);
  }, 30_000);

  it('rejects a spec that fails validation instead of rendering it', async () => {
    const input = await base();
    input.spec = {
      layers: [
        { type: 'text', var: 'price', x: 5000, y: 0, size: 40, font: 'sans', color: '#000000' },
      ],
    };
    await expect(renderDesign(input)).rejects.toThrow(/Invalid design spec/);
    input.spec = JSON.parse(
      '{"layers":[{"type":"text","var":"secret","x":0,"y":0,"size":40,"font":"sans","color":"#000000"}]}',
    );
    await expect(renderDesign(input)).rejects.toThrow(/Invalid design spec/);
  });

  it('multi-product: index picks the slot, a missing slot is skipped', async () => {
    const input = await base();
    input.products = [
      { texts: {}, image: await solid(100, 100, RED) },
      { texts: {}, image: await solid(100, 100, { r: 0, g: 200, b: 0 }) },
    ];
    input.spec = {
      layers: [
        { type: 'image', var: 'product_image', x: 0, y: 0, w: 200, h: 200, fit: 'cover', index: 0 },
        {
          type: 'image',
          var: 'product_image',
          x: 300,
          y: 0,
          w: 200,
          h: 200,
          fit: 'cover',
          index: 1,
        },
        {
          type: 'image',
          var: 'product_image',
          x: 600,
          y: 0,
          w: 200,
          h: 200,
          fit: 'cover',
          index: 2,
        },
      ],
    };
    const out = await renderDesign(input);
    const [r0] = await pixel(out, 100, 100);
    const [, g1] = await pixel(out, 400, 100);
    const [r2, g2, b2] = await pixel(out, 700, 100);
    expect(r0).toBeGreaterThan(180);
    expect(g1).toBeGreaterThan(150);
    expect(r2 + g2 + b2).toBeGreaterThan(700); // slot 2 not supplied -> still white
  }, 30_000);

  it('rect layer darkens the pixels under it and text stays on top', async () => {
    const input = await base();
    input.spec = {
      layers: [
        { type: 'rect', x: 0, y: 0, w: 400, h: 400, color: '#000000', opacity: 0.5 },
        { type: 'text', var: 'shop_name', x: 20, y: 20, size: 80, font: 'sans', color: '#ffffff' },
      ],
    };
    const out = await renderDesign(input);
    const [r, g, b] = await pixel(out, 380, 380);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
    expect(g).toBeLessThan(160);
    expect(b).toBeLessThan(160);
    const [ro, go, bo] = await pixel(out, 600, 600);
    expect(ro + go + bo).toBeGreaterThan(740); // outside the rect: still white
    // white text over the gray band is lighter than the band
    const lightest = Math.max(
      ...(await sharp(out)
        .extract({ left: 20, top: 20, width: 380, height: 80 })
        .greyscale()
        .raw()
        .toBuffer()),
    );
    expect(lightest).toBeGreaterThan(220);
  });
});
