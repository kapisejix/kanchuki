// F-036 Phase A (Task 1): data-mapping logic behind the /my-stores list.
//
// Two properties matter here and nowhere else in the page:
//   1. The mapper is a pure function of ONE api response. It must never
//      accumulate rows across calls, and it must never invent a store that
//      wasn't in the payload — the API is what scopes the list to the
//      signed-in passport, so anything this layer adds would be a leak that
//      bypasses that scoping entirely.
//   2. Each row must end up with a usable storefront link (the catalog route
//      keys on the store slug), or an explicit null when the store has none.
import { describe, expect, it } from 'vitest';
import { formatLastVisit, mapStoreVisits } from '../lib';

const PAYLOAD = {
  stores: [
    {
      retailer: {
        id: 'ret_1',
        shop_name: 'Meena Bazaar',
        city: 'Jaipur',
        logo_url: 'https://r2.example.com/meena.png',
        public_slug: 'meena-bazaar',
      },
      first_visited_at: '2026-08-01T10:00:00.000Z',
      last_visited_at: '2026-09-10T10:00:00.000Z',
      visit_count: 3,
      is_muted: false,
      contact_shared: true,
    },
    {
      retailer: {
        id: 'ret_2',
        shop_name: 'Shree Sarees',
        city: 'Surat',
        logo_url: null,
        public_slug: 'shree-sarees',
      },
      first_visited_at: '2026-09-01T10:00:00.000Z',
      last_visited_at: '2026-09-15T10:00:00.000Z',
      visit_count: 1,
      is_muted: true,
      contact_shared: false,
    },
  ],
};

describe('mapStoreVisits', () => {
  it('maps a store list response to rows carrying name, logo, city and visit date', () => {
    const rows = mapStoreVisits(PAYLOAD);

    expect(rows).toHaveLength(2);
    const meena = rows.find((r) => r.retailer_id === 'ret_1');
    expect(meena).toMatchObject({
      shop_name: 'Meena Bazaar',
      city: 'Jaipur',
      logo_url: 'https://r2.example.com/meena.png',
      last_visited_at: '2026-09-10T10:00:00.000Z',
      visit_count: 3,
      is_muted: false,
    });
  });

  it('orders rows by most recent visit even when the payload is unordered', () => {
    const rows = mapStoreVisits(PAYLOAD);
    expect(rows.map((r) => r.retailer_id)).toEqual(['ret_2', 'ret_1']);
  });

  it('builds a storefront href from the store slug', () => {
    const rows = mapStoreVisits(PAYLOAD);
    expect(rows.map((r) => r.href)).toEqual(['/shree-sarees', '/meena-bazaar']);
  });

  it('keeps a store that has no slug, but with no link to tap', () => {
    const rows = mapStoreVisits({
      stores: [
        {
          retailer: { id: 'ret_3', shop_name: 'New Shop', city: null, logo_url: null, public_slug: null },
          last_visited_at: '2026-09-16T10:00:00.000Z',
          visit_count: 1,
          is_muted: false,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.shop_name).toBe('New Shop');
    expect(rows[0]?.href).toBeNull();
  });

  it('drops malformed rows instead of rendering blank store cards', () => {
    const rows = mapStoreVisits({
      stores: [
        { retailer: { id: 'ret_ok', shop_name: 'Good Shop', public_slug: 'good-shop' }, last_visited_at: '2026-09-15T10:00:00.000Z' },
        { retailer: { id: 'ret_no_name', shop_name: null, public_slug: 'x' }, last_visited_at: '2026-09-15T10:00:00.000Z' },
        { retailer: null, last_visited_at: '2026-09-15T10:00:00.000Z' },
        { last_visited_at: '2026-09-15T10:00:00.000Z' },
        null,
      ],
    });

    expect(rows.map((r) => r.retailer_id)).toEqual(['ret_ok']);
  });

  it('returns an empty list for a non-response payload', () => {
    expect(mapStoreVisits(null)).toEqual([]);
    expect(mapStoreVisits(undefined)).toEqual([]);
    expect(mapStoreVisits({})).toEqual([]);
    expect(mapStoreVisits({ stores: 'nope' })).toEqual([]);
    expect(mapStoreVisits({ error: { code: 'NO_SESSION' } })).toEqual([]);
  });

  it('never carries rows over from a previous call — one payload in, its rows out', () => {
    // A stale-cache accumulation here would show a customer stores that the
    // API's own scoping did not return for this payload.
    const first = mapStoreVisits(PAYLOAD);
    expect(first).toHaveLength(2);

    const second = mapStoreVisits({ stores: [] });
    expect(second).toEqual([]);
  });
});

describe('formatLastVisit', () => {
  const now = new Date('2026-09-17T12:00:00.000Z');

  it('renders recent visits as relative time', () => {
    expect(formatLastVisit('2026-09-17T11:59:30.000Z', now)).toBe('Just now');
    expect(formatLastVisit('2026-09-17T11:45:00.000Z', now)).toBe('15 min ago');
    expect(formatLastVisit('2026-09-17T09:00:00.000Z', now)).toBe('3 hr ago');
    expect(formatLastVisit('2026-09-16T12:00:00.000Z', now)).toBe('1 day ago');
    expect(formatLastVisit('2026-09-14T12:00:00.000Z', now)).toBe('3 days ago');
  });

  it('falls back to a plain date once a visit is older than a week', () => {
    expect(formatLastVisit('2026-09-01T12:00:00.000Z', now)).toBe('1 Sep 2026');
  });

  it('returns an empty string for an unusable timestamp', () => {
    expect(formatLastVisit('', now)).toBe('');
    expect(formatLastVisit('not-a-date', now)).toBe('');
  });
});
