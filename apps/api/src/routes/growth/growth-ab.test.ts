import { describe, expect, it } from 'vitest';
import { AB_MIN_SAMPLE_PER_VARIANT, abTestSignificance } from './growth-helpers.js';

describe('abTestSignificance (roadmap S)', () => {
  it('reports unreliable + no winner when samples are too small', () => {
    const r = abTestSignificance(
      { label: 'A', sent: 10, opened: 4, open_rate: 0.4 },
      { label: 'B', sent: 10, opened: 2, open_rate: 0.2 },
    );
    expect(r.winner).toBeNull();
    expect(r.reliable).toBe(false);
  });

  it('names the higher open-rate variant as winner when samples are adequate', () => {
    const r = abTestSignificance(
      { label: 'A', sent: 60, opened: 30, open_rate: 0.5 },
      { label: 'B', sent: 60, opened: 15, open_rate: 0.25 },
    );
    expect(r.reliable).toBe(true);
    expect(r.winner).toBe('A');
    expect(r.p_value).not.toBeNull();
    // Large gap → strongly significant p-value.
    expect(r.p_value!).toBeLessThan(0.01);
  });

  it('returns null p-value when nothing was sent', () => {
    const r = abTestSignificance(
      { label: 'A', sent: 0, opened: 0, open_rate: 0 },
      { label: 'B', sent: 0, opened: 0, open_rate: 0 },
    );
    expect(r.p_value).toBeNull();
    expect(r.winner).toBeNull();
    expect(r.reliable).toBe(false);
  });

  it('no winner on a tie', () => {
    const r = abTestSignificance(
      { label: 'A', sent: 100, opened: 30, open_rate: 0.3 },
      { label: 'B', sent: 100, opened: 30, open_rate: 0.3 },
    );
    expect(r.winner).toBeNull();
    expect(r.reliable).toBe(true);
  });

  it('exposes the min sample constant for the UI copy', () => {
    expect(AB_MIN_SAMPLE_PER_VARIANT).toBe(30);
  });
});
