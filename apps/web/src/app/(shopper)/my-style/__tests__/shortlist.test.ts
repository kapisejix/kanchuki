// F-045 PR-5b: the shortlist is a per-store grouped structure (spec §5 seam 3) kept on the
// device. Bad stored data must never break the page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedCard } from '../lib';
import {
  MAX_PER_STORE,
  addShort,
  fetchShortlist,
  groupByStore,
  loadShortlist,
  moveDeviceShortlist,
  removeShort,
  saveShortlist,
  toShortItem,
} from '../shortlist';

const card = (
  id: string,
  slug: string | null = 'shree',
  over: Partial<FeedCard> = {},
): FeedCard => ({
  id,
  name: `Name ${id}`,
  price_min: 210000,
  price_max: 210000,
  primary_photo_url: 'https://img.test/x.jpg',
  distance_km: null,
  retailer: { shop_name: 'Shree', slug, city: 'Surat' },
  ...over,
});

beforeEach(() => localStorage.clear());

describe('shortlist', () => {
  it('a card with no store slug cannot be shortlisted', () => {
    expect(toShortItem(card('a', null))).toBeNull();
    expect(toShortItem(card('a'))).toMatchObject({ id: 'a', slug: 'shree', price_min: 210000 });
  });

  it('groups by store in first-added order', () => {
    const items = [
      toShortItem(card('a', 's1')),
      toShortItem(card('b', 's2')),
      toShortItem(card('c', 's1')),
    ].flatMap((i) => (i ? [i] : []));
    const groups = groupByStore(items);
    expect(groups.map((g) => [g.slug, g.items.map((i) => i.id)])).toEqual([
      ['s1', ['a', 'c']],
      ['s2', ['b']],
    ]);
  });

  it('round-trips through storage; garbage or bad entries load as empty / are dropped', () => {
    const item = toShortItem(card('a'));
    if (!item) throw new Error('item');
    saveShortlist([item]);
    expect(loadShortlist()).toEqual([item]);

    localStorage.setItem('my-style:shortlist', '{not json');
    expect(loadShortlist()).toEqual([]);
    localStorage.setItem('my-style:shortlist', JSON.stringify([{ id: 1 }, null, item]));
    expect(loadShortlist()).toEqual([item]);
  });

  it('per-store cap matches the API limit', () => {
    expect(MAX_PER_STORE).toBe(20);
  });
});

// Phase 3: the account wishlist is the shortlist; the device copy is moved up once.
describe('account-synced shortlist', () => {
  const fetchMock = vi.fn();
  const res = (status: number, body: unknown = { ok: true }) =>
    new Response(JSON.stringify(body), { status });
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('maps wishlist rows to shortlist items and drops rows without a store link', async () => {
    fetchMock.mockResolvedValue(
      res(200, {
        items: [
          {
            product: {
              id: 'p1',
              name: 'Silk saree',
              price_min: 210000,
              price_max: 250000,
              photo_url: 'https://img.test/p1.jpg',
              retailer: { id: 'r1', shop_name: 'Shree', public_slug: 'shree' },
            },
          },
          {
            product: {
              id: 'p2',
              name: null,
              price_min: null,
              price_max: null,
              photo_url: null,
              retailer: { id: 'r2', shop_name: 'Hidden', public_slug: null },
            },
          },
        ],
      }),
    );
    expect(await fetchShortlist()).toEqual([
      {
        id: 'p1',
        name: 'Silk saree',
        price_min: 210000,
        price_max: 250000,
        photo: 'https://img.test/p1.jpg',
        shop_name: 'Shree',
        slug: 'shree',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/api/passport/wishlist', { credentials: 'include' });
  });

  it('answers null when signed out, error when the wishlist cannot be read', async () => {
    fetchMock.mockResolvedValue(res(401));
    expect(await fetchShortlist()).toBeNull();
    fetchMock.mockResolvedValue(res(500));
    expect(await fetchShortlist()).toBe('error');
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await fetchShortlist()).toBe('error');
  });

  it('add POSTs and remove DELETEs the product id; failure answers false', async () => {
    fetchMock.mockResolvedValue(res(200));
    expect(await addShort('p1')).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/passport/wishlist', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: 'p1' }),
    });
    expect(await removeShort('p1')).toBe(true);
    expect(fetchMock.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'DELETE' });
    fetchMock.mockResolvedValue(res(500));
    expect(await removeShort('p1')).toBe(false);
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await addShort('p1')).toBe(false);
  });

  const deviceItems = () => {
    const a = toShortItem(card('a'));
    const b = toShortItem(card('b'));
    if (!a || !b) throw new Error('items');
    saveShortlist([a, b]);
  };

  it('moves the device shortlist up and clears it once every item is saved', async () => {
    deviceItems();
    fetchMock.mockResolvedValue(res(200));
    await moveDeviceShortlist();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('my-style:shortlist')).toBeNull();
  });

  it('a product that is gone (404) does not block clearing', async () => {
    deviceItems();
    fetchMock.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(200));
    await moveDeviceShortlist();
    expect(localStorage.getItem('my-style:shortlist')).toBeNull();
  });

  it('keeps the device copy when any save fails, to retry next load', async () => {
    deviceItems();
    fetchMock.mockResolvedValueOnce(res(200)).mockRejectedValueOnce(new Error('offline'));
    await moveDeviceShortlist();
    expect(loadShortlist()).toHaveLength(2);
  });

  it('does nothing with an empty device copy', async () => {
    await moveDeviceShortlist();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
