import { describe, expect, it } from 'vitest';
import {
  COMPLEMENT_MAP,
  COMPLEMENTARY_COLORS,
  LOOK_SLOTS,
  classifyAnchor,
  complementFamilies,
  matchesSlot,
} from './my-style-look.js';
import { DEFAULT_COLOR_FAMILIES } from './color-family.js';

const p = (category: string | null, subtype: string | null = null) => ({ category, subtype });

describe('classifyAnchor', () => {
  it.each([
    [p('Ladies Suit'), 'suit'],
    [p('Kurta Sets'), 'suit'],
    [p('Saree'), 'saree'],
    [p('Lehenga'), 'lehenga'],
    [p('Dupatta'), 'dupatta'],
    [p('Blouse'), 'blouse'],
    // category says nothing -> subtype decides
    [p('Other', 'Anarkali'), 'suit'],
    // category wins over a subtype that mentions another garment
    [p('Ladies Suit', 'with dupatta'), 'suit'],
    // no mapped complement
    [p('Gown'), null],
    [p('Dresses'), null],
    [p("Men's Kurta Pajama"), null],
    [p('Kids Ethnic Wear'), null],
    [p(null, null), null],
  ])('%j -> %s', (prod, want) => {
    expect(classifyAnchor(prod)).toBe(want);
  });
  it('treats Women as ladies', () => {
    expect(classifyAnchor(p("Women's Kurti"))).toBe('suit');
  });
});

describe('matchesSlot', () => {
  it('matches category keywords', () => {
    expect(matchesSlot(p('Dupatta'), LOOK_SLOTS.dupatta)).toBe(true);
    expect(matchesSlot(p('Ladies Suit'), LOOK_SLOTS.dupatta)).toBe(false);
  });
  it('a suit whose subtype mentions a dupatta is not a dupatta', () => {
    expect(matchesSlot(p('Ladies Suit', 'kurta with dupatta'), LOOK_SLOTS.dupatta)).toBe(false);
  });
  it('bottom reads the subtype', () => {
    expect(matchesSlot(p('Other', 'Palazzo'), LOOK_SLOTS.bottom)).toBe(true);
    expect(matchesSlot(p('Ladies Suit'), LOOK_SLOTS.bottom)).toBe(false);
  });
});

describe('COMPLEMENT_MAP', () => {
  it('every anchor kind has at least one slot', () => {
    for (const slots of Object.values(COMPLEMENT_MAP)) expect(slots.length).toBeGreaterThan(0);
  });
});

describe('complementFamilies', () => {
  it('unknown or neutral anchor -> no preference', () => {
    expect(complementFamilies(null)).toEqual([]);
    expect(complementFamilies('black')).toEqual([]);
  });
  it('colour anchor -> itself, its pairs and the neutrals', () => {
    const out = complementFamilies('Red');
    expect(out).toEqual(expect.arrayContaining(['red', 'green', 'teal', 'navy', 'white', 'gold']));
  });
  it('every name in the table is a real colour family (cannot drift)', () => {
    const names = new Set(DEFAULT_COLOR_FAMILIES.map((f) => f.name));
    for (const [k, vs] of Object.entries(COMPLEMENTARY_COLORS)) {
      expect(names.has(k), k).toBe(true);
      for (const v of vs) expect(names.has(v), `${k} -> ${v}`).toBe(true);
    }
  });
});
