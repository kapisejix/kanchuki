import { describe, expect, it } from 'vitest';
import { findBestMatch, namesMatch } from './name-match.js';

describe('namesMatch', () => {
  it('matches identical names case-insensitively', () => {
    expect(namesMatch('Kurti', 'Kurti')).toBe(true);
    expect(namesMatch('Kurti', 'kurti')).toBe(true);
  });

  it('matches singular against plural catalog groups', () => {
    expect(namesMatch('Kurti', 'Kurtis')).toBe(true);
    expect(namesMatch('Saree', 'Sarees')).toBe(true);
    expect(namesMatch('Dress', 'Dresses')).toBe(true);
    expect(namesMatch('Ladies Suit', 'Salwar Suits')).toBe(true);
  });

  it('matches by containment and token overlap', () => {
    expect(namesMatch('Suit', 'Salwar Suits')).toBe(true);
    expect(namesMatch('Anarkali', 'Anarkali Suits')).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(namesMatch('Lehenga', 'Kurtis')).toBe(false);
    expect(namesMatch('Gown', 'Salwar Suits')).toBe(false);
    expect(namesMatch('Blouse', 'Dresses')).toBe(false);
  });
});

describe('findBestMatch', () => {
  const CATS = ['New Arrivals', 'Sarees', 'Salwar Suits', 'Kurtis', 'Dresses', 'Co-ords'];

  it('resolves the AI category onto the retailer catalog group', () => {
    expect(findBestMatch('Kurti', CATS)).toBe('Kurtis');
    expect(findBestMatch('Saree', CATS)).toBe('Sarees');
  });

  it('resolves loose subtype-ish needles', () => {
    expect(findBestMatch('Anarkali Suit', CATS)).toBe('Salwar Suits');
    expect(findBestMatch('Dress', CATS)).toBe('Dresses');
  });

  it('returns null when nothing matches', () => {
    expect(findBestMatch('Lehenga', CATS)).toBeNull();
  });

  it('prefers an exact match over a token-overlap match', () => {
    const styles = ['Sharara Suits', 'Salwar Suits', 'Anarkali Suits'];
    expect(findBestMatch('Sharara Suit', styles)).toBe('Sharara Suits');
  });
});
