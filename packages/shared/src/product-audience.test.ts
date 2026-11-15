import { describe, expect, it } from 'vitest';
import { demographicForCategory } from './constants/index.js';
import {
  AGE_GROUP_LABELS,
  AUDIENCE_LABELS,
  KIDS_AGE_GROUPS,
  PRODUCT_AUDIENCES,
  ageGroupFromLabel,
  asAgeGroup,
  asAudience,
  audienceForText,
  isKidsAudience,
  kidsAudiencesFor,
  normalizeAudience,
} from './product-audience.js';

describe('audienceForText', () => {
  it('reads kids wear from category text', () => {
    expect(audienceForText('Kids Ethnic Wear')).toBe('KIDS_UNISEX');
    expect(audienceForText('New Born')).toBe('KIDS_UNISEX');
  });
  it('splits girls and boys when the text says so', () => {
    expect(audienceForText('Kids', 'Girls Frock')).toBe('GIRLS');
    expect(audienceForText('Kids', null, 'Boys kurta set')).toBe('BOYS');
  });
  it('reads men and women', () => {
    expect(audienceForText("Men's Kurta Pajama")).toBe('MEN');
    expect(audienceForText('Saree')).toBe('WOMEN');
    expect(audienceForText('Ladies Suit')).toBe('WOMEN');
  });
  it('does not treat a "Frock suit" (women\'s ethnic wear) as kids', () => {
    expect(audienceForText('Ladies', 'Frock suit', 'Anarkali suit')).toBe('WOMEN');
    expect(demographicForCategory('Ladies', 'Frock suit')).toBe('womens');
  });
  it('returns null when unsure', () => {
    expect(audienceForText('Other')).toBeNull();
    expect(audienceForText('Dupatta')).toBeNull();
    expect(audienceForText(null, null, null)).toBeNull();
  });
});

describe('audience helpers', () => {
  it('isKidsAudience', () => {
    expect(isKidsAudience('GIRLS')).toBe(true);
    expect(isKidsAudience('KIDS_UNISEX')).toBe(true);
    expect(isKidsAudience('WOMEN')).toBe(false);
    expect(isKidsAudience(null)).toBe(false);
    expect(isKidsAudience(undefined)).toBe(false);
  });
  it('kidsAudiencesFor keeps unisex in both', () => {
    expect(kidsAudiencesFor('Boy')).toEqual(['BOYS', 'KIDS_UNISEX']);
    expect(kidsAudiencesFor('Girl')).toEqual(['GIRLS', 'KIDS_UNISEX']);
  });
  it('ageGroupFromLabel maps the KidsForm strings one-to-one', () => {
    expect(ageGroupFromLabel('0–2 yrs')).toBe('AGE_0_2');
    expect(ageGroupFromLabel('3–5 yrs')).toBe('AGE_3_5');
    expect(ageGroupFromLabel('13–16 yrs')).toBe('AGE_13_16');
    expect(ageGroupFromLabel('x')).toBeNull();
  });
  it('labels cover every value', () => {
    for (const a of PRODUCT_AUDIENCES) expect(AUDIENCE_LABELS[a]).toBeTruthy();
    for (const g of KIDS_AGE_GROUPS) expect(AGE_GROUP_LABELS[g]).toBeTruthy();
  });
});

describe('asAudience / asAgeGroup', () => {
  it('accepts enum values and nulls everything else', () => {
    expect(asAudience('GIRLS')).toBe('GIRLS');
    expect(asAudience('junk')).toBeNull();
    expect(asAudience(undefined)).toBeNull();
    expect(asAudience('null')).toBeNull();
    expect(asAgeGroup('AGE_3_5')).toBe('AGE_3_5');
    expect(asAgeGroup('3-5')).toBeNull();
  });
});

describe('normalizeAudience', () => {
  it('leaves both fields untouched when neither is sent', () => {
    expect(normalizeAudience(undefined, undefined, 'GIRLS')).toEqual({});
  });
  it('keeps an age with a kids audience', () => {
    expect(normalizeAudience('GIRLS', 'AGE_3_5', null)).toEqual({
      audience: 'GIRLS',
      kids_age_group: 'AGE_3_5',
    });
  });
  it('drops the age when the audience is not a kids value', () => {
    expect(normalizeAudience('WOMEN', 'AGE_3_5', null)).toEqual({
      audience: 'WOMEN',
      kids_age_group: null,
    });
  });
  it('clears the stored age when the audience changes to an adult one or null', () => {
    expect(normalizeAudience('MEN', undefined, 'GIRLS')).toEqual({
      audience: 'MEN',
      kids_age_group: null,
    });
    expect(normalizeAudience(null, undefined, 'GIRLS')).toEqual({
      audience: null,
      kids_age_group: null,
    });
  });
  it('judges an age-only update against the stored audience', () => {
    expect(normalizeAudience(undefined, 'AGE_6_8', 'BOYS')).toEqual({ kids_age_group: 'AGE_6_8' });
    expect(normalizeAudience(undefined, 'AGE_6_8', 'WOMEN')).toEqual({ kids_age_group: null });
    expect(normalizeAudience(undefined, 'AGE_6_8', null)).toEqual({ kids_age_group: null });
  });
});

describe('demographicForCategory with a stored audience', () => {
  it('prefers the stored audience over the keyword guess', () => {
    expect(demographicForCategory('Ladies Suit', null, 'GIRLS')).toBe('kids_girl');
    expect(demographicForCategory('Kids Ethnic Wear', null, 'WOMEN')).toBe('womens');
    expect(demographicForCategory('Saree', null, 'MEN')).toBe('mens');
    expect(demographicForCategory('Saree', null, 'BOYS')).toBe('kids_boy');
  });
  it('keeps the keyword behaviour when audience is unset', () => {
    expect(demographicForCategory('Kids', null, null)).toBe('kids_boy');
    expect(demographicForCategory('Kids')).toBe('kids_boy');
  });
});
