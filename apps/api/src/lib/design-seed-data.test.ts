import { DESIGN_FORMATS, parseDesignSpec } from '@kanchuki/shared';
import { describe, expect, it } from 'vitest';
import { DESIGNS, backgroundSvg } from './design-seed-data.js';

describe('design seed catalogue (T3 placeholders + T6 starter pack)', () => {
  it('has unique names (the seed script is idempotent by name)', () => {
    const names = DESIGNS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(DESIGNS.map((d) => [d.name, d] as const))(
    '%s: spec parses for its format and slots',
    (_n, d) => {
      const parsed = parseDesignSpec({ layers: d.layers(d.palette) }, d.format, d.slots);
      expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    },
  );

  it.each(DESIGNS.map((d) => [d.name, d] as const))(
    '%s: background is an SVG of the format size',
    (_n, d) => {
      const { w, h } = DESIGN_FORMATS[d.format];
      const svg = backgroundSvg(d);
      expect(
        svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`),
      ).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
      // ids (gradient, mask, glow) must be unique inside one SVG
      const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it('covers every festival in the spec starter list and all three formats', () => {
    const occasions = new Set(DESIGNS.map((d) => d.occasion));
    for (const o of [
      'Diwali',
      'Navratri',
      'Eid',
      'Karwa Chauth',
      'Wedding',
      'Holi',
      'Independence Day',
      'Sale',
      'Rakhi',
      'Limited Stock',
      'Back in Stock',
      'Look of the Day',
    ]) {
      expect(occasions.has(o), o).toBe(true);
    }
    expect(new Set(DESIGNS.map((d) => d.format))).toEqual(
      new Set(['SQUARE', 'PORTRAIT_4_5', 'STORY_9_16']),
    );
  });

  it('starter pack includes a multi-product collage and a store card', () => {
    expect(DESIGNS.some((d) => d.slots >= 4)).toBe(true);
    expect(
      DESIGNS.some((d) =>
        d.layers(d.palette).some((l) => l.type === 'image' && l.var === 'shop_logo'),
      ),
    ).toBe(true);
  });
});
