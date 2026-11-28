import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { istParts, istRange } from './ist.js';

// RC-201 — GST months/FYs follow IST. Run under a UTC process TZ (the Railway
// default) so a server-local implementation cannot pass by accident.
const prevTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'UTC';
});
afterAll(() => {
  process.env.TZ = prevTz;
});

describe('istParts', () => {
  it('02:00 IST 1 Apr 2026 is April in IST', () => {
    expect(istParts(new Date('2026-03-31T20:30:00Z'))).toEqual({ year: 2026, month: 3 });
  });
  it('23:30 IST 31 Mar 2026 is still March', () => {
    expect(istParts(new Date('2026-03-31T18:00:00Z'))).toEqual({ year: 2026, month: 2 });
  });
  it('00:30 IST 1 Jan 2027 is the new year', () => {
    expect(istParts(new Date('2026-12-31T19:00:00Z'))).toEqual({ year: 2027, month: 0 });
  });
});

describe('istRange', () => {
  it('April 2026 = IST midnight 1 Apr to IST midnight 1 May', () => {
    expect(istRange(2026, 4)).toEqual({
      gte: new Date('2026-03-31T18:30:00Z'),
      lt: new Date('2026-04-30T18:30:00Z'),
    });
  });
  it('December rolls into January of the next year', () => {
    expect(istRange(2026, 12).lt).toEqual(new Date('2026-12-31T18:30:00Z'));
  });
  it('no month = the IST calendar year', () => {
    expect(istRange(2026)).toEqual({
      gte: new Date('2025-12-31T18:30:00Z'),
      lt: new Date('2026-12-31T18:30:00Z'),
    });
  });
});
