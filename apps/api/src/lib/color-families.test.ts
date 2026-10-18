import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());
vi.mock('@kanchuki/db', () => ({ prisma: { colorFamily: { findMany: mockFindMany } } }));

const { clearColorFamilyCache, getActiveColorFamilies, resolveColorFamily } = await import(
  './color-families.js'
);

const ROWS = [
  { name: 'yellow', aliases: ['mustard'] },
  { name: 'teal', aliases: ['peacock blue'] },
];

beforeEach(() => {
  mockFindMany.mockReset().mockResolvedValue(ROWS);
  clearColorFamilyCache();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('getActiveColorFamilies', () => {
  it('reads only active families, then serves the cache inside the TTL', async () => {
    await getActiveColorFamilies(1_000);
    await getActiveColorFamilies(1_000 + 59_000);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { is_active: true },
      select: { name: true, aliases: true },
      orderBy: { name: 'asc' },
    });
  });

  it('refetches after the TTL', async () => {
    await getActiveColorFamilies(1_000);
    await getActiveColorFamilies(1_000 + 61_000);
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  it('clearColorFamilyCache forces a refetch (admin edit)', async () => {
    await getActiveColorFamilies(1_000);
    clearColorFamilyCache();
    await getActiveColorFamilies(1_000);
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  it('a clear during an in-flight read is not overwritten by the stale rows', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockFindMany.mockReturnValueOnce(
      new Promise((r) => {
        release = r;
      }),
    );
    const inflight = getActiveColorFamilies(1_000);
    clearColorFamilyCache(); // admin edit lands mid-read
    release([{ name: 'old', aliases: [] }]);
    await inflight;
    expect(await getActiveColorFamilies(1_001)).toEqual(ROWS); // refetched, not the stale 'old'
  });

  it('does not cache a failure', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('db down'));
    await expect(getActiveColorFamilies(1_000)).rejects.toThrow('db down');
    await expect(getActiveColorFamilies(1_001)).resolves.toEqual(ROWS);
  });
});

describe('resolveColorFamily', () => {
  it('maps primary_color through the active families', async () => {
    expect(await resolveColorFamily('Peacock Blue')).toBe('teal');
    expect(await resolveColorFamily('light mustard print')).toBe('yellow');
  });

  it('unmapped -> null', async () => {
    expect(await resolveColorFamily('Chartreuse')).toBeNull();
  });

  it('empty input -> null without touching the DB', async () => {
    expect(await resolveColorFamily(null)).toBeNull();
    expect(await resolveColorFamily('  ')).toBeNull();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('lookup failure -> undefined (not null: caller keeps the old value), and it is logged, not swallowed silently (RC-059)', async () => {
    mockFindMany.mockRejectedValue(new Error('db down'));
    expect(await resolveColorFamily('Mustard')).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
