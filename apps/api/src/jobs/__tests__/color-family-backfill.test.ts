// Tests for the F-045 colour-family backfill sweep.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindProducts = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());
const mockFindFamilies = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findMany: mockFindProducts, updateMany: mockUpdateMany },
    colorFamily: { findMany: mockFindFamilies },
  },
}));

import { clearColorFamilyCache } from '../../lib/color-families.js';
import { handleColorFamilyBackfill } from '../color-family-backfill.js';

const FAMILIES = [
  { name: 'yellow', aliases: ['mustard'] },
  { name: 'pink', aliases: ['gulabi'] },
];

beforeEach(() => {
  vi.clearAllMocks();
  clearColorFamilyCache();
  mockFindFamilies.mockResolvedValue(FAMILIES);
  mockUpdateMany.mockImplementation(async ({ where }) => ({ count: where.id.in.length }));
});

describe('handleColorFamilyBackfill', () => {
  it('selects only unfilled rows that have a colour', async () => {
    mockFindProducts.mockResolvedValueOnce([]);
    await handleColorFamilyBackfill();
    expect(mockFindProducts.mock.calls[0]?.[0].where).toMatchObject({
      color_family: null,
      primary_color: { not: null },
      deleted_at: null,
    });
  });

  it('groups a batch by family and reports counts, leaving unmapped rows alone', async () => {
    mockFindProducts
      .mockResolvedValueOnce([
        { id: 'p1', primary_color: 'Mustard' },
        { id: 'p2', primary_color: 'Gulabi' },
        { id: 'p3', primary_color: 'light mustard print' },
        { id: 'p4', primary_color: 'Chartreuse' },
      ])
      .mockResolvedValueOnce([]);

    const result = await handleColorFamilyBackfill();

    expect(result).toEqual({ scanned: 4, updated: 3, unmapped: 1 });
    expect(mockUpdateMany).toHaveBeenCalledTimes(3); // one write per (colour, family)
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1'] }, color_family: null, primary_color: 'Mustard' },
      data: { color_family: 'yellow' },
    });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p3'] }, color_family: null, primary_color: 'light mustard print' },
      data: { color_family: 'yellow' },
    });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p2'] }, color_family: null, primary_color: 'Gulabi' },
      data: { color_family: 'pink' },
    });
  });

  it('only writes where color_family is still null (idempotent; never clobbers a concurrent tag)', async () => {
    mockFindProducts
      .mockResolvedValueOnce([{ id: 'p1', primary_color: 'Mustard' }])
      .mockResolvedValueOnce([]);
    mockUpdateMany.mockResolvedValue({ count: 0 }); // tagging got there first

    const result = await handleColorFamilyBackfill();

    expect(result.updated).toBe(0);
    expect(mockUpdateMany.mock.calls[0]?.[0].where.color_family).toBeNull();
  });

  it('only stamps a family while primary_color is still the colour it was computed from', async () => {
    mockFindProducts
      .mockResolvedValueOnce([{ id: 'p1', primary_color: 'Mustard' }])
      .mockResolvedValueOnce([]);
    await handleColorFamilyBackfill();
    expect(mockUpdateMany.mock.calls[0]?.[0].where.primary_color).toBe('Mustard');
  });

  it('pages by id cursor so unmapped rows cannot loop forever', async () => {
    mockFindProducts
      .mockResolvedValueOnce(
        Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, primary_color: 'Chartreuse' })),
      )
      .mockResolvedValueOnce([{ id: 'p999', primary_color: 'Chartreuse' }])
      .mockResolvedValueOnce([]);

    const result = await handleColorFamilyBackfill();

    expect(result).toEqual({ scanned: 201, updated: 0, unmapped: 201 });
    expect(mockFindProducts.mock.calls[1]?.[0].where.id).toEqual({ gt: 'p199' });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('fails loudly when there are no active families (all-unmapped would look like success)', async () => {
    mockFindFamilies.mockResolvedValue([]);
    await expect(handleColorFamilyBackfill()).rejects.toThrow(/no active colou?r families/i);
    expect(mockFindProducts).not.toHaveBeenCalled();
  });

  it('fails loudly when the family lookup fails (no silent skip)', async () => {
    mockFindFamilies.mockRejectedValue(new Error('db down'));
    await expect(handleColorFamilyBackfill()).rejects.toThrow('db down');
  });
});

// RC-062: BullMQ `repeat.limit` is the TOTAL repetition count — the cron would run once per
// API boot and stop. Pin the registration, comments stripped first (RC-043).
describe('cron registration', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '../index.ts'), 'utf8')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

  it('registers color-family-backfill as a repeating job without repeat.limit', () => {
    const block = src.match(/add\(\s*'color-family-backfill',[\s\S]*?\n {2}\);/)?.[0] ?? '';
    expect(block, 'cron must be registered').not.toBe('');
    expect(block).toMatch(/repeat:\s*\{\s*pattern:/);
    expect(block).not.toMatch(/limit/);
  });

  it('routes the job name to the handler', () => {
    expect(src).toMatch(/case 'color-family-backfill':\s*return handleColorFamilyBackfill\(\)/);
  });
});
