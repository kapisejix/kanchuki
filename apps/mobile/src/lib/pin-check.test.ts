import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reverseGeocodeAsync } = vi.hoisted(() => ({ reverseGeocodeAsync: vi.fn() }));
vi.mock('expo-location', () => ({ reverseGeocodeAsync }));

const { pinMismatch, formatPlace, reviewPin } = await import('./pin-check');

beforeEach(() => vi.clearAllMocks());

describe('pinMismatch', () => {
  it('accepts a neighbouring pincode in the same postal sector', () => {
    expect(pinMismatch({ postalCode: '160020' }, { pincode: '160022' })).toBeNull();
  });

  it('flags a pin in another city (Delhi pin, Chandigarh pincode)', () => {
    expect(pinMismatch({ postalCode: '110001' }, { pincode: '160022' })).toContain('110001');
  });

  it('falls back to the state when a pincode is missing on either side', () => {
    expect(pinMismatch({ region: 'Delhi' }, { pincode: '', state: 'Punjab' })).toContain('Delhi');
    expect(pinMismatch({ region: 'Punjab' }, { state: 'Punjab' })).toBeNull();
    expect(pinMismatch({ region: 'Chandigarh' }, { state: 'Chandigarh' })).toBeNull();
  });

  it('never warns when there is nothing to compare (fails open)', () => {
    expect(pinMismatch(undefined, { pincode: '160022' })).toBeNull();
    expect(
      pinMismatch({ postalCode: null, region: null }, { pincode: '160022', state: 'Punjab' }),
    ).toBeNull();
    expect(pinMismatch({ postalCode: '160020' }, {})).toBeNull();
  });
});

describe('formatPlace', () => {
  it('joins the parts, drops empties and repeats, and appends the pincode', () => {
    expect(
      formatPlace({
        name: '12',
        street: 'Sector 22',
        district: null,
        city: 'Chandigarh',
        region: 'Chandigarh',
        postalCode: '160022',
      }),
    ).toBe('12, Sector 22, Chandigarh 160022');
    expect(formatPlace(undefined)).toBe('');
  });
});

describe('reviewPin', () => {
  it('returns the nearby address even when no address was typed (no warning, no block)', async () => {
    reverseGeocodeAsync.mockResolvedValue([
      { city: 'Mohali', region: 'Punjab', postalCode: '160059' },
    ]);
    const r = await reviewPin(30.7, 76.7, {});
    expect(r).toMatchObject({ address: 'Mohali, Punjab 160059', warning: null });
  });

  it('adds a warning when the typed pincode disagrees', async () => {
    reverseGeocodeAsync.mockResolvedValue([
      { city: 'Delhi', region: 'Delhi', postalCode: '110001' },
    ]);
    const r = await reviewPin(28.6, 77.2, { pincode: '160022' });
    expect(r?.warning).toContain('110001');
  });

  it('is null when the geocoder fails or finds nothing', async () => {
    reverseGeocodeAsync.mockRejectedValue(new Error('offline'));
    expect(await reviewPin(1, 1, {})).toBeNull();
    reverseGeocodeAsync.mockResolvedValue([]);
    expect(await reviewPin(1, 1, {})).toBeNull();
  });
});
