import { describe, expect, it } from 'vitest';
import { DESIGN_MAX_LAYERS, type DesignFormat, parseDesignSpec } from './design-template.js';

const text = (over: Record<string, unknown> = {}) => ({
  type: 'text',
  var: 'product_name',
  x: 90,
  y: 1140,
  w: 900,
  size: 56,
  font: 'serif',
  color: '#FFFFFF',
  ...over,
});
const image = (over: Record<string, unknown> = {}) => ({
  type: 'image',
  var: 'product_image',
  x: 90,
  y: 220,
  w: 900,
  h: 900,
  ...over,
});
const spec = (...layers: unknown[]) => ({ layers });
const bad = (raw: unknown, format: DesignFormat = 'PORTRAIT_4_5', slots = 1) => {
  const r = parseDesignSpec(raw, format, slots);
  return r.ok ? null : r.error;
};

describe('parseDesignSpec', () => {
  it('accepts a valid spec and fills defaults', () => {
    const r = parseDesignSpec(spec(text(), image()), 'PORTRAIT_4_5');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec.layers[0]).toMatchObject({ align: 'left', bold: false, maxLines: 1, index: 0 });
    expect(r.spec.layers[1]).toMatchObject({ fit: 'contain', index: 0 });
  });

  it('rebuilds the spec: unknown keys never reach the renderer', () => {
    const r = parseDesignSpec(spec(text({ evil: '<script>', href: 'http://x' })), 'PORTRAIT_4_5');
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.ok ? r.spec : null)).not.toMatch(/evil|href|script/);
  });

  it.each([
    ['not an object', null],
    ['no layers array', {}],
    ['empty layers', spec()],
    ['too many layers', spec(...Array.from({ length: DESIGN_MAX_LAYERS + 1 }, () => text()))],
    ['unknown text var', spec(text({ var: 'password' }))],
    ['unknown image var', spec(image({ var: 'customer_phone' }))],
    ['bad type', spec({ type: 'script', x: 0, y: 0 })],
    ['bad colour', spec(text({ color: 'red' }))],
    ['colour with injection', spec(text({ color: '#FFF" onload="x' }))],
    ['font outside the allowlist', spec(text({ font: 'Comic Sans' }))],
    ['size too small', spec(text({ size: 5 }))],
    ['size too big', spec(text({ size: 500 }))],
    ['x outside canvas', spec(text({ x: 1080 }))],
    ['negative y', spec(text({ y: -1 }))],
    ['text box runs off the right edge', spec(text({ x: 500, w: 900 }))],
    ['image runs off the bottom', spec(image({ y: 1000, h: 900 }))],
    ['image too small', spec(image({ w: 2 }))],
    ['maxLines 7', spec(text({ maxLines: 7 }))],
    ['maxLines fractional', spec(text({ maxLines: 1.5 }))],
    ['bad align', spec(text({ align: 'justify' }))],
    ['inr on a name', spec(text({ format: 'inr' }))],
    ['unknown format', spec(text({ var: 'price', format: 'usd' }))],
    ['NaN coordinate', spec(text({ x: Number.NaN }))],
  ])('rejects: %s', (_label, raw) => {
    expect(bad(raw)).toEqual(expect.any(String));
  });

  it('accepts inr on price and mrp', () => {
    expect(
      bad(spec(text({ var: 'price', format: 'inr' }), text({ var: 'mrp', format: 'inr' }))),
    ).toBeNull();
  });

  it('product index must fit the template slots', () => {
    expect(bad(spec(text({ index: 3 })), 'PORTRAIT_4_5', 1)).toMatch(/index/);
    expect(bad(spec(text({ index: 3 })), 'PORTRAIT_4_5', 4)).toBeNull();
    expect(bad(spec(text({ index: -1 })), 'PORTRAIT_4_5', 4)).toMatch(/index/);
  });

  it('canvas bounds follow the format', () => {
    expect(bad(spec(text({ y: 1500 })), 'PORTRAIT_4_5')).toMatch(/canvas/);
    expect(bad(spec(text({ y: 1500 })), 'STORY_9_16')).toBeNull();
    expect(bad(spec(text({ y: 1100 })), 'SQUARE')).toMatch(/canvas/);
    expect(bad(spec(text({ y: 700 })), 'LANDSCAPE_1_91_1')).toMatch(/canvas/);
    expect(bad(spec(text({ y: 500 })), 'LANDSCAPE_1_91_1')).toBeNull();
  });
});

describe('rect layer', () => {
  const rect = (over: Record<string, unknown> = {}) => ({
    type: 'rect',
    x: 0,
    y: 900,
    w: 1080,
    h: 450,
    color: '#000000',
    opacity: 0.5,
    ...over,
  });
  it('accepts a rect layer and rebuilds only known fields', () => {
    const r = parseDesignSpec(spec(rect({ evil: 1, var: 'price' })), 'PORTRAIT_4_5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.layers[0]).toEqual({
        type: 'rect',
        x: 0,
        y: 900,
        w: 1080,
        h: 450,
        color: '#000000',
        opacity: 0.5,
      });
    }
  });
  it('rejects rect outside the canvas', () => {
    expect(bad(spec(rect({ w: 1081 })))).toMatch(/canvas/);
    expect(bad(spec(rect({ h: 451 })))).toMatch(/canvas/);
  });
  it('rejects rect with bad colour', () => {
    expect(bad(spec(rect({ color: 'red' })))).toMatch(/#RRGGBB/);
  });
  it('rejects opacity 1.5 and -0.1', () => {
    expect(bad(spec(rect({ opacity: 1.5 })))).toMatch(/opacity/);
    expect(bad(spec(rect({ opacity: -0.1 })))).toMatch(/opacity/);
  });
  it('rejects rect w or h below 8', () => {
    expect(bad(spec(rect({ w: 7 })))).toMatch(/≥ 8/);
    expect(bad(spec(rect({ h: 7 })))).toMatch(/≥ 8/);
  });
});
