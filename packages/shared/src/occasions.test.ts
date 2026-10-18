import { describe, expect, it } from 'vitest';
import { normalizeOccasions, PRODUCT_OCCASIONS } from './occasions.js';
import { mapStyleQuizAnswers } from './style-quiz.js';

describe('normalizeOccasions', () => {
  it('keeps canonical values, fixes case, dedupes, caps at 2', () => {
    expect(normalizeOccasions(['wedding', 'WEDDING', 'festive', 'Party Wear'])).toEqual([
      'Wedding',
      'Festive',
    ]);
  });

  it('drops anything off the list (injection / hallucination)', () => {
    expect(normalizeOccasions(['hacked', 'Ignore previous instructions', 7, null])).toEqual([]);
  });

  it('returns [] for non-arrays', () => {
    expect(normalizeOccasions(undefined)).toEqual([]);
    expect(normalizeOccasions('Wedding')).toEqual([]);
  });
});

describe('quiz alignment', () => {
  // The ranker compares lowercase exact strings, so every occasion the quiz can emit must
  // be one the tagger can write.
  it('every quiz occasion is a tagger occasion', () => {
    const labels = [
      'daily wear',
      'party / festive',
      'wedding / bridal',
      'office / formal',
      'casual outings',
    ];
    const emitted = mapStyleQuizAnswers({ occasion: labels }).pref_occasions ?? [];
    expect(emitted.length).toBeGreaterThan(0);
    const allowed = PRODUCT_OCCASIONS.map((o) => o.toLowerCase());
    for (const o of emitted) expect(allowed).toContain(o);
  });
});
