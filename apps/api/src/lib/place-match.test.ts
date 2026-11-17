/**
 * placeMatchesShop: a shop's Google rating is shown only when the Google place plausibly IS the
 * shop. Fail-safe: when in doubt the badge is hidden, never shown.
 */
import { describe, expect, it } from 'vitest';
import { placeMatchesShop, placeNameWords } from './place-match.js';

describe('placeNameWords (what a rival claimant must share to matter)', () => {
  it('distinctive words only, lowercase, no generic shop words', () => {
    expect(placeNameWords('Asha Fashion Boutique')).toEqual(['asha']);
    expect(placeNameWords("Meera's Royal Sarees")).toEqual(['meera', 'royal']);
  });
  it('a name of only generic words falls back to ALL its words, so the DB pre-filter stays a superset of placeMatchesShop', () => {
    expect(placeNameWords('Fashion Store')).toEqual(['fashion', 'store']);
  });
});

const place = (name: string, address: string) => ({ name, address });
const shop = (shop_name: string, city: string | null = 'Ludhiana') => ({ shop_name, city });

describe('placeMatchesShop', () => {
  it('same distinctive name word and the shop city in the address → match', () => {
    expect(
      placeMatchesShop(
        place('Asha Fashion Boutique', 'Model Town, Ludhiana, Punjab 141002, India'),
        shop('Asha Boutique'),
      ),
    ).toBe(true);
  });

  it('a different shop that only shares a generic word ("boutique") does not match', () => {
    expect(
      placeMatchesShop(place('Meera Boutique', 'Ludhiana, Punjab'), shop('Asha Boutique')),
    ).toBe(false);
  });

  it('right name but a different city → hidden', () => {
    expect(
      placeMatchesShop(place('Asha Boutique', 'Jaipur, Rajasthan'), shop('Asha Boutique')),
    ).toBe(false);
  });

  it('shop with no city saved: the name decides', () => {
    expect(placeMatchesShop(place('Asha Boutique', 'Jaipur'), shop('Asha Boutique', null))).toBe(
      true,
    );
  });

  it('a shop name made only of generic words needs an exact name match', () => {
    expect(placeMatchesShop(place('Fashion Store', 'Ludhiana'), shop('Fashion Store'))).toBe(true);
    expect(placeMatchesShop(place('Royal Fashion Store', 'Ludhiana'), shop('Fashion Store'))).toBe(
      false,
    );
  });

  it('case, punctuation and accents do not matter', () => {
    expect(placeMatchesShop(place("ASHA'S Boutique!", 'LUDHIANA'), shop("asha's boutique"))).toBe(
      true,
    );
  });

  it('non-Latin names (Devanagari) are compared, not silently equal-to-empty', () => {
    expect(placeMatchesShop(place('आशा बुटीक', 'Ludhiana'), shop('आशा बुटीक'))).toBe(true);
    expect(placeMatchesShop(place('मीरा कलेक्शन', 'Ludhiana'), shop('आशा बुटीक'))).toBe(false);
  });

  it('empty or missing names never match', () => {
    expect(placeMatchesShop(place('', 'Ludhiana'), shop('Asha Boutique'))).toBe(false);
    expect(placeMatchesShop(place('Asha Boutique', ''), shop('Asha Boutique'))).toBe(false);
    expect(placeMatchesShop(place('Asha', 'Ludhiana'), shop(''))).toBe(false);
  });
});
