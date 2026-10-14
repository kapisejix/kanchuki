import { beforeEach, describe, expect, it } from 'vitest';
import { interestScore, recordInterest, topInterests } from '../interests';

beforeEach(() => localStorage.clear());

describe('interests', () => {
  it('ranks by frequency, recent wins ties, lowercases and drops blanks', () => {
    recordInterest(['Kurti', null, ' ', 'Pink']);
    recordInterest(['kurti']);
    recordInterest(['Saree']);
    expect(topInterests(3)).toEqual(['kurti', 'saree', 'pink']);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('kanchuki_interests', '{nope');
    expect(topInterests()).toEqual([]);
    recordInterest(['suit']);
    expect(topInterests()).toEqual(['suit']);
  });

  it('scores a product by matched terms', () => {
    expect(interestScore(['Cotton Kurti', null, 'Pink'], ['kurti', 'pink', 'saree'])).toBe(2);
    expect(interestScore([null], ['kurti'])).toBe(0);
  });
});
