import { describe, expect, it } from 'vitest';
import { allowedStudioStyleIds, productProfile, studioStyleBlock } from './studio-gating.js';

const MODEL = ['MI-01', 'MI-02', 'MI-04', 'MI-05', 'MI-08', 'MI-10', 'MO-01', 'MO-06', 'MO-07'];
const SURFACE = ['PS-05', 'PS-07', 'PS-09', 'PS-11', 'PS-13', 'PS-16'];

const ids = (name: string, o = {}) => allowedStudioStyleIds(productProfile({ name, ...o }));
const hasModel = (name: string, o = {}) => ids(name, o).some((id) => id.startsWith('M'));

describe('studio gating (option matrix §5)', () => {
  it.each([
    ['Georgette Anarkali Suit', { category: 'Ladies Suit' }],
    ['Silk Lehenga', { category: 'Lehenga' }],
    ['Kanjivaram Saree', { category: 'Saree' }],
    ['Cotton Kurti', { category: 'Kurti' }],
    ['Salwar Suit Set', { category: 'Ladies Suit' }],
    ['Men Kurta Pajama', { category: "Men's Kurta Pajama" }],
  ])('%s gets model + all product styles', (name, o) => {
    const got = ids(name, o);
    for (const id of [...MODEL, 'PS-03', 'PS-04', ...SURFACE]) expect(got, id).toContain(id);
  });

  it.each([
    ['Cotton Palazzo', {}],
    ['Cigarette Pants', { category: 'Bottoms' }],
    ['Plain Churidar', {}],
    ['Unstitched Cotton Suit Piece', { category: 'Ladies Suit' }],
    ['Dress Material 3pc', {}],
    ['Printed Suit', { product_type: 'Unstitched' }],
    ['Printed Suit', { is_unstitched: true }],
    ['Kids Ethnic Frock', { category: 'Kids Ethnic Wear' }],
  ])('%s gets no model styles', (name, o) => {
    expect(hasModel(name, o)).toBe(false);
  });

  it('unstitched and bottoms keep surface/hanging styles but not the torso form', () => {
    for (const [name, o] of [
      ['Cotton Palazzo', {}],
      ['Fabric', { is_unstitched: true }],
    ] as const) {
      const got = ids(name, o);
      expect(got, name).not.toContain('PS-03');
      expect(got, name).not.toContain('PS-04');
      for (const id of SURFACE) expect(got, `${name} ${id}`).toContain(id);
    }
  });

  it('semi-stitched keeps the dress-form styles', () => {
    expect(ids('Lehenga Set', { product_type: 'Semi-Stitched' })).toContain('PS-03');
  });

  it('a bottom word inside a set is not a bottoms-only product', () => {
    expect(productProfile({ name: 'Salwar Suit' }).bottomsOnly).toBe(false);
    expect(productProfile({ name: 'Kurta Pajama' }).bottomsOnly).toBe(false);
    expect(productProfile({ name: 'Palazzo' }).bottomsOnly).toBe(true);
  });

  it('teens lose Poolside, adults keep it', () => {
    const teen = productProfile({ name: 'Teen Girl Anarkali' });
    expect(teen.demographic).toBe('teen_girl');
    expect(studioStyleBlock('MO-06', teen)).toMatch(/teen/);
    expect(studioStyleBlock('MO-05', teen)).toBeNull();
    expect(studioStyleBlock('MO-06', productProfile({ name: 'Anarkali' }))).toBeNull();
  });

  it('slug-cased ids work (seeded slugs are lower-case)', () => {
    expect(studioStyleBlock('ps-03', productProfile({ name: 'Palazzo' }))).toBeTruthy();
    expect(studioStyleBlock('mi-01', productProfile({ name: 'Palazzo' }))).toBeTruthy();
  });
});
