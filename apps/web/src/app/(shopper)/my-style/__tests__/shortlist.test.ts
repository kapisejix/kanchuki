// F-045 PR-5b: the shortlist is a per-store grouped structure (spec §5 seam 3) kept on the
// device. Bad stored data must never break the page.
import { beforeEach, describe, expect, it } from 'vitest';
import type { FeedCard } from '../lib';
import {
  MAX_PER_STORE,
  groupByStore,
  loadShortlist,
  saveShortlist,
  toShortItem,
} from '../shortlist';

const card = (id: string, slug: string | null = 'shree', over: Partial<FeedCard> = {}): FeedCard => ({
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
