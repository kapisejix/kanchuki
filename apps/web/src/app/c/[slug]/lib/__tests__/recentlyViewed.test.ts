import { beforeEach, describe, expect, it } from 'vitest';
import {
  type RecentlyViewedProduct,
  loadRecentlyViewed,
  trackRecentlyViewed,
} from '../recentlyViewed';

// The storefront carousel reads this store, so its contract is: newest first,
// de-duplicated by product, capped, per-store, and forgiving of a corrupted or
// older entry. It had no test at all while the row sat built-but-unmounted —
// which is exactly how a writer/reader shape drift would have gone unnoticed.
const KEY = 'kanchuki_recent_meera';

const track = (id: string, extra: Partial<Parameters<typeof trackRecentlyViewed>[1]> = {}): void =>
  trackRecentlyViewed('meera', {
    id,
    name: `Product ${id}`,
    category: 'Saree',
    primary_color: 'Maroon',
    price_min: 100_000,
    price_max: 200_000,
    primary_photo_url: `https://cdn.test/${id}.jpg`,
    ...extra,
  });

beforeEach(() => localStorage.clear());

describe('trackRecentlyViewed / loadRecentlyViewed', () => {
  it('returns nothing until something has actually been viewed', () => {
    expect(loadRecentlyViewed('meera')).toEqual([]);
  });

  it("maps the sheet's primary_photo_url onto the stored photo_url", () => {
    // The writer is handed `primary_photo_url` (what ProductDetailSheet has) and
    // the reader gets `photo_url` (what the carousel renders). One rename on
    // either side and every thumbnail silently becomes the ✨ placeholder with
    // nothing failing.
    track('p1');
    const [item] = loadRecentlyViewed('meera');
    expect(item.photo_url).toBe('https://cdn.test/p1.jpg');
  });

  it('carries subtype through, so a re-opened product keeps its badge', () => {
    track('p1', { subtype: 'Unstitched' });
    expect(loadRecentlyViewed('meera')[0].subtype).toBe('Unstitched');
  });

  it('keeps the newest view first and moves a repeat view back to the top', () => {
    track('p1');
    track('p2');
    expect(loadRecentlyViewed('meera').map((p) => p.id)).toEqual(['p2', 'p1']);

    // Re-viewing p1 must not duplicate it — it moves to the front.
    track('p1');
    expect(loadRecentlyViewed('meera').map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('caps the list and drops the oldest', () => {
    for (let i = 0; i < 25; i++) track(`p${i}`);
    const items = loadRecentlyViewed('meera');
    expect(items).toHaveLength(20);
    expect(items[0].id).toBe('p24');
    expect(items.map((p) => p.id)).not.toContain('p0');
  });

  it('scopes storage per store', () => {
    track('p1');
    expect(loadRecentlyViewed('meera')).toHaveLength(1);
    expect(loadRecentlyViewed('another-store')).toEqual([]);
  });

  it('survives a corrupted entry instead of throwing mid-render', () => {
    localStorage.setItem(KEY, 'not json');
    expect(loadRecentlyViewed('meera')).toEqual([]);
  });

  it('reads a record written before subtype existed', () => {
    // Entries already sitting in shoppers' localStorage have no `subtype` key.
    // The reader has to treat that as absent rather than fail or invent one.
    const legacy: RecentlyViewedProduct = {
      id: 'old',
      name: 'Old',
      category: 'Saree',
      primary_color: 'Maroon',
      price_min: 100_000,
      price_max: 200_000,
      photo_url: null,
      viewed_at: 1,
    };
    localStorage.setItem(KEY, JSON.stringify([legacy]));
    expect(loadRecentlyViewed('meera')[0].subtype).toBeUndefined();
  });
});
