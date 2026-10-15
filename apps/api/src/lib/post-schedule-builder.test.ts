import { describe, expect, it } from 'vitest';
import {
  MAX_SLIDES,
  addDays,
  buildSchedule,
  istDateString,
  istToUtc,
} from './post-schedule-builder.js';

const prods = (n: number, cat = (i: number) => (i % 2 === 0 ? 'Sarees' : 'Kurtis')) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, category: cat(i) }));

// 2026-10-19 is a Monday.
const base = {
  weekdays: [1, 2],
  ranges: { 1: { min: 4, max: 5 }, 2: { min: 7, max: 8 } },
  post_time: '19:30',
  starts_on: '2026-10-19',
  horizon_days: 7,
};

describe('IST helpers', () => {
  it('19:30 IST is 14:00 UTC the same day', () => {
    expect(istToUtc(2026, 9, 19, '19:30').toISOString()).toBe('2026-10-19T14:00:00.000Z');
  });
  it('00:10 IST rolls back to the previous UTC day', () => {
    expect(istToUtc(2026, 9, 19, '00:10').toISOString()).toBe('2026-10-18T18:40:00.000Z');
  });
  it('istDateString uses the IST calendar day, not UTC', () => {
    // 20:00 UTC on the 19th is 01:30 IST on the 20th.
    expect(istDateString(new Date('2026-10-19T20:00:00Z'))).toBe('2026-10-20');
  });
  it('addDays crosses month ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });
});

describe('buildSchedule', () => {
  it('posts only on selected IST weekdays, at post_time', () => {
    const out = buildSchedule({ ...base, products: prods(40) });
    expect(out).toHaveLength(2); // Mon + Tue inside the 7-day horizon
    expect(out[0]?.scheduled_at.toISOString()).toBe('2026-10-19T14:00:00.000Z');
    expect(out[1]?.scheduled_at.toISOString()).toBe('2026-10-20T14:00:00.000Z');
  });

  it('uses the weekday range max when the pool is big enough', () => {
    const out = buildSchedule({ ...base, products: prods(40) });
    expect(out[0]?.product_ids).toHaveLength(5);
    expect(out[1]?.product_ids).toHaveLength(8);
  });

  it('never exceeds 10 slides even if the range says more', () => {
    const out = buildSchedule({
      ...base,
      ranges: { 1: { min: 12, max: 15 }, 2: { min: 1, max: 2 } },
      products: prods(40),
    });
    expect(out[0]?.product_ids).toHaveLength(MAX_SLIDES);
  });

  it('groups by the lead product category first', () => {
    const out = buildSchedule({ ...base, products: prods(40) });
    // lead p0 = Sarees; 5 slides = 5 Sarees (p0,p2,p4,p6,p8)
    expect(out[0]?.product_ids).toEqual(['p0', 'p2', 'p4', 'p6', 'p8']);
  });

  it('fills from other categories when the lead category runs short', () => {
    const out = buildSchedule({
      ...base,
      products: [
        { id: 'a', category: 'Sarees' },
        { id: 'b', category: 'Kurtis' },
        { id: 'c', category: 'Sarees' },
        { id: 'd', category: 'Kurtis' },
      ],
      ranges: { 1: { min: 4, max: 4 }, 2: { min: 1, max: 1 } },
    });
    expect(out[0]?.product_ids).toEqual(['a', 'c', 'b', 'd']);
  });

  it('never repeats a product across the plan', () => {
    const out = buildSchedule({ ...base, horizon_days: 28, products: prods(40) });
    const ids = out.flatMap((p) => p.product_ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a short pool yields a short day, then stops when empty', () => {
    const out = buildSchedule({ ...base, horizon_days: 14, products: prods(7) });
    expect(out.map((p) => p.product_ids.length)).toEqual([5, 2]);
  });

  it('single mode takes one product per post', () => {
    const out = buildSchedule({ ...base, single: true, products: prods(10) });
    expect(out.every((p) => p.product_ids.length === 1)).toBe(true);
  });

  it('empty pool → no posts', () => {
    expect(buildSchedule({ ...base, products: [] })).toEqual([]);
  });

  it('weekday with no range is skipped, not crashed', () => {
    const out = buildSchedule({ ...base, weekdays: [3], products: prods(10) });
    expect(out).toEqual([]);
  });
});
