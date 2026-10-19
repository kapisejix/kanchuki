import { describe, expect, it } from 'vitest';
import { mapStyleQuizAnswers } from './style-quiz.js';

describe('mapStyleQuizAnswers', () => {
  it('maps the five web quiz answers onto columns', () => {
    expect(
      mapStyleQuizAnswers({
        occasion: ['Party / Festive', 'Wedding / Bridal'],
        region: ['North Indian'],
        budget: ['₹1,500 – ₹3,000'],
        fabric: ['Cotton', 'Silk'],
        color: ['Red / Maroon', 'Black'],
      }),
    ).toEqual({
      pref_occasions: ['party wear', 'festive', 'wedding'],
      pref_styles: ['north indian'],
      pref_fabrics: ['cotton', 'silk'],
      pref_colors: ['red', 'maroon', 'black'],
      budget_min: 150_000,
      budget_max: 300_000,
    });
  });

  it('only returns columns for the keys sent (a partial PATCH never wipes the rest)', () => {
    expect(mapStyleQuizAnswers({ fabric: ['Linen'] })).toEqual({ pref_fabrics: ['linen'] });
    expect(mapStyleQuizAnswers({})).toEqual({});
  });

  it('"No Preference" stores nothing for region and fabric', () => {
    expect(mapStyleQuizAnswers({ region: ['No Preference'], fabric: ['No Preference'] })).toEqual({
      pref_styles: [],
      pref_fabrics: [],
    });
  });

  it('colour labels split on "/" and go through the family table', () => {
    expect(
      mapStyleQuizAnswers({ color: ['Green / Emerald', 'Pink / Rose', 'White / Cream'] })
        .pref_colors,
    ).toEqual(['green', 'pink', 'white', 'cream']);
  });

  it('a colour with no family is kept as its own lowercase term, not dropped', () => {
    expect(mapStyleQuizAnswers({ color: ['Pastels', 'Bright / Multicolor'] }).pref_colors).toEqual([
      'pastels',
      'bright',
      'multi',
    ]);
  });

  it('uses the families it is given (admin-edited table), not just the defaults', () => {
    const custom = [{ name: 'maroon', aliases: ['red'] }];
    expect(mapStyleQuizAnswers({ color: ['Red'] }, custom).pref_colors).toEqual(['maroon']);
  });

  it('budget edges: open lower and open upper bound, in paise', () => {
    expect(mapStyleQuizAnswers({ budget: ['Under ₹500'] })).toEqual({
      budget_min: null,
      budget_max: 50_000,
    });
    expect(mapStyleQuizAnswers({ budget: ['₹10,000+'] })).toEqual({
      budget_min: 1_000_000,
      budget_max: null,
    });
  });

  it('ignores unknown occasion and budget labels', () => {
    expect(mapStyleQuizAnswers({ occasion: ['Beach'], budget: ['free'] })).toEqual({
      pref_occasions: [],
    });
  });
});
