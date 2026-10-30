import { describe, expect, it } from 'vitest';
import { buildGoogleReviewUrl, extractPlaceId, isPlaceId } from './google-place.js';

const ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

describe('extractPlaceId', () => {
  it('accepts a raw id (trimmed)', () => {
    expect(extractPlaceId(`  ${ID} `)).toBe(ID);
  });
  it('reads query_place_id from a maps url', () => {
    expect(
      extractPlaceId(`https://www.google.com/maps/search/?api=1&query=x&query_place_id=${ID}`),
    ).toBe(ID);
  });
  it('finds a ChIJ token inside a long maps url', () => {
    expect(extractPlaceId(`https://www.google.com/maps/place/Shop/data=!4m2!3m1!1s${ID}!8m2`)).toBe(
      ID,
    );
  });
  it('returns null for a short share link, junk and empty input', () => {
    expect(extractPlaceId('https://maps.app.goo.gl/abc123')).toBeNull();
    expect(extractPlaceId('my shop in delhi')).toBeNull();
    expect(extractPlaceId('x'.repeat(300))).toBeNull();
    expect(extractPlaceId('   ')).toBeNull();
  });
});

describe('isPlaceId / buildGoogleReviewUrl', () => {
  it('rejects spaces and short strings', () => {
    expect(isPlaceId('short')).toBe(false);
    expect(isPlaceId(`${ID} x`)).toBe(false);
    expect(isPlaceId(ID)).toBe(true);
  });
  it('encodes the id', () => {
    expect(buildGoogleReviewUrl(ID)).toBe(
      `https://search.google.com/local/writereview?placeid=${ID}`,
    );
  });
});
