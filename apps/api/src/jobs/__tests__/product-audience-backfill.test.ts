// Tests for the one-off keyword audience backfill (owner runs it, dry-run first).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: { product: { findMany: mockFindMany, updateMany: mockUpdateMany } },
}));

import { classifyProduct, handleProductAudienceBackfill } from '../product-audience-backfill.js';

const row = (id: string, category: string | null, subtype: string | null = null) => ({
  id,
  retailer_id: 'r1',
  name: null,
  category,
  subtype,
});

describe('classifyProduct', () => {
  it.each([
    ['Kids Ethnic Wear', 'KIDS_UNISEX'],
    ['New Born', 'KIDS_UNISEX'],
    ['Ladies Suit', 'WOMEN'],
    ['Kurti', 'WOMEN'],
    ['Ladies', 'WOMEN'],
    ["Men's Kurta Pajama", 'MEN'],
    ['Other', null],
    ['', null],
  ])('%s -> %s', (category, expected) => {
    expect(classifyProduct({ category, subtype: null, name: null }).audience).toBe(expected);
  });
});

describe('handleProductAudienceBackfill', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  });

  const rows = [row('a', 'Ladies Suit'), row('b', "Men's Kurta Pajama"), row('c', 'Other')];

  it('dry run counts and lists the undecided, writes nothing', async () => {
    mockFindMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
    const res = await handleProductAudienceBackfill({ dryRun: true });
    expect(res.counts).toEqual({ WOMEN: 1, MEN: 1 });
    expect(res.undecided.map((u) => u.id)).toEqual(['c']);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('only ever selects live rows whose audience is still NULL', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await handleProductAudienceBackfill({ dryRun: true, retailerId: 'r9' });
    expect(mockFindMany.mock.calls[0]![0].where).toMatchObject({
      audience: null,
      deleted_at: null,
      retailer_id: 'r9',
    });
  });

  it('apply writes per audience, guarded so it never overwrites a value', async () => {
    mockFindMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
    const res = await handleProductAudienceBackfill({ dryRun: false });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] }, audience: null },
      data: { audience: 'WOMEN' },
    });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b'] }, audience: null },
      data: { audience: 'MEN' },
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2); // the undecided row is not written
    expect(res.updated).toBe(2);
  });

  it('pages by id so undecided rows (which stay NULL) cannot loop forever', async () => {
    mockFindMany
      .mockResolvedValueOnce([row('a', 'Other'), row('b', 'Other')])
      .mockResolvedValueOnce([]);
    await handleProductAudienceBackfill({ dryRun: false, batch: 2 });
    expect(mockFindMany).toHaveBeenCalledTimes(2);
    expect(mockFindMany.mock.calls[1]![0].where.id).toEqual({ gt: 'b' });
  });
});
