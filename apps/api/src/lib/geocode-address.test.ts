import { describe, expect, it, vi } from 'vitest';
import { buildQueries, geocodeAddress, parseNominatim } from './geocode-address.js';

describe('buildQueries', () => {
  it('goes address -> pincode -> city, most specific first', () => {
    const q = buildQueries({
      address_line1: 'SCO 12, Sector 22',
      city: 'Chandigarh',
      state: 'Chandigarh',
      pincode: '160022',
    });
    expect(q.map((x) => x.level)).toEqual(['address', 'pincode', 'city']);
    expect(q[0]?.q).toBe('SCO 12, Sector 22, Chandigarh, Chandigarh, 160022, India');
  });

  it('ignores a malformed pincode (e.g. 39502) and returns nothing for an empty address', () => {
    expect(buildQueries({ city: 'Chandigarh', pincode: '39502' }).map((x) => x.level)).toEqual([
      'city',
    ]);
    expect(buildQueries({ city: '', state: null, pincode: null })).toEqual([]);
  });
});

describe('parseNominatim', () => {
  it('takes the first result inside India and rejects one outside', () => {
    const json = [
      { lat: '51.5', lon: '-0.12', display_name: 'London' },
      { lat: '30.7333', lon: '76.7794', display_name: 'Chandigarh' },
    ];
    expect(parseNominatim(json, 'city')).toEqual({
      lat: 30.7333,
      lng: 76.7794,
      level: 'city',
      display: 'Chandigarh',
    });
    expect(parseNominatim([{ lat: '51.5', lon: '-0.12' }], 'city')).toBeNull();
    expect(parseNominatim({ error: 'x' }, 'city')).toBeNull();
  });
});

describe('geocodeAddress', () => {
  it('falls through to the next query when the first finds nothing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ lat: '30.7', lon: '76.8', display_name: '160022' }],
      });
    const hit = await geocodeAddress(
      { address_line1: 'x', city: 'Chandigarh', pincode: '160022' },
      fetchImpl as unknown as typeof fetch,
      async () => {},
    );
    expect(hit?.level).toBe('pincode');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('makes no request for an address with nothing searchable', async () => {
    const fetchImpl = vi.fn();
    expect(
      await geocodeAddress({}, fetchImpl as unknown as typeof fetch, async () => {}),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
