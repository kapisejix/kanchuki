// My Style adult / kids split. A stored audience decides; the keyword rule on category + subtype
// applies only to rows whose audience is NULL. The where clauses are evaluated with SQL
// semantics (NOT / IN over NULL is NULL, not a match) by the shared test helper.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@kanchuki/db', () => ({ prisma: {} }));

import { evalCond } from '../routes/public/__tests__/where-eval.js';
import { adultsWhere, kidsWhere } from './my-style-candidates.js';

type Audience = 'WOMEN' | 'MEN' | 'BOYS' | 'GIRLS' | 'KIDS_UNISEX' | null;
const row = (audience: Audience, category: string | null, subtype: string | null = null) => ({
  audience,
  category,
  subtype,
});
const inAdult = (r: ReturnType<typeof row>) =>
  evalCond(r as Record<string, unknown>, adultsWhere()) === true;
const inKids = (r: ReturnType<typeof row>, who?: 'Girl' | 'Boy') =>
  evalCond(r as Record<string, unknown>, kidsWhere(who)) === true;

describe('adult feed', () => {
  it('keeps a NULL-audience adult product, even with no category or subtype (NOT-over-NULL trap)', () => {
    expect(inAdult(row(null, 'Saree', null))).toBe(true);
    expect(inAdult(row(null, null, null))).toBe(true);
  });
  it('keeps WOMEN and MEN, whatever the category text says (a stored value beats the keyword)', () => {
    expect(inAdult(row('WOMEN', 'Kids Ethnic Wear'))).toBe(true);
    expect(inAdult(row('MEN', "Men's Kurta Pajama"))).toBe(true);
  });
  it('drops kids audiences, whatever the category text says', () => {
    expect(inAdult(row('BOYS', 'Ladies'))).toBe(false);
    expect(inAdult(row('GIRLS', 'Saree'))).toBe(false);
    expect(inAdult(row('KIDS_UNISEX', null))).toBe(false);
  });
  it('falls back to the keyword rule only for NULL audience', () => {
    expect(inAdult(row(null, 'Kids'))).toBe(false);
    expect(inAdult(row(null, 'Ladies', 'Girls Frock'))).toBe(false);
    expect(inAdult(row(null, 'New Born'))).toBe(false);
  });
});

describe('kids feed ("For my child")', () => {
  it('keeps the three kids audiences and drops adults, whatever the category text says', () => {
    expect(inKids(row('BOYS', 'Ladies'))).toBe(true);
    expect(inKids(row('GIRLS', null))).toBe(true);
    expect(inKids(row('KIDS_UNISEX', 'Saree'))).toBe(true);
    expect(inKids(row('WOMEN', 'Kids Ethnic Wear'))).toBe(false);
    expect(inKids(row('MEN', 'Kids'))).toBe(false);
  });
  it('falls back to the keyword rule only for NULL audience', () => {
    expect(inKids(row(null, 'Kids Ethnic Wear'))).toBe(true);
    expect(inKids(row(null, 'Saree'))).toBe(false);
    expect(inKids(row(null, null))).toBe(false);
  });
  it('a Girl pick drops BOYS but keeps GIRLS and KIDS_UNISEX', () => {
    expect(inKids(row('BOYS', null), 'Girl')).toBe(false);
    expect(inKids(row('GIRLS', null), 'Girl')).toBe(true);
    expect(inKids(row('KIDS_UNISEX', null), 'Girl')).toBe(true);
  });
  it('a Boy pick drops GIRLS but keeps BOYS and KIDS_UNISEX', () => {
    expect(inKids(row('GIRLS', null), 'Boy')).toBe(false);
    expect(inKids(row('BOYS', null), 'Boy')).toBe(true);
    expect(inKids(row('KIDS_UNISEX', null), 'Boy')).toBe(true);
  });
  it('a Girl or Boy pick still lets NULL-audience kids-keyword rows through', () => {
    expect(inKids(row(null, 'Kids Ethnic Wear'), 'Girl')).toBe(true);
    expect(inKids(row(null, 'Kids Ethnic Wear'), 'Boy')).toBe(true);
  });
});

describe('adult feed by saved gender (D6)', () => {
  const inFor = (r: ReturnType<typeof row>, g: 'FEMALE' | 'MALE' | null) =>
    evalCond(r as Record<string, unknown>, adultsWhere(g)) === true;

  it('FEMALE keeps WOMEN and NULL-audience adult wear, drops MEN', () => {
    expect(inFor(row('WOMEN', 'Saree'), 'FEMALE')).toBe(true);
    expect(inFor(row(null, 'Saree'), 'FEMALE')).toBe(true);
    expect(inFor(row('MEN', 'Kurta'), 'FEMALE')).toBe(false);
  });
  it('MALE keeps MEN and NULL-audience adult wear, drops WOMEN', () => {
    expect(inFor(row('MEN', 'Kurta'), 'MALE')).toBe(true);
    expect(inFor(row(null, null), 'MALE')).toBe(true);
    expect(inFor(row('WOMEN', 'Saree'), 'MALE')).toBe(false);
  });
  it('null (Both / never chosen) keeps both, kids still out', () => {
    expect(inFor(row('WOMEN', 'Saree'), null)).toBe(true);
    expect(inFor(row('MEN', 'Kurta'), null)).toBe(true);
    expect(inFor(row('GIRLS', 'Frock'), 'FEMALE')).toBe(false);
    expect(inFor(row(null, 'Kids'), 'FEMALE')).toBe(false);
  });
});
