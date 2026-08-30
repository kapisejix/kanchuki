// Tests for preference-vector.ts (Task 16).

import { describe, it, expect } from 'vitest';
import {
  computePreferenceVector,
  cosineSimilarity,
  hashVector,
  formatVectorLiteral,
} from '../preference-vector.js';

describe('computePreferenceVector', () => {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  it('returns null for empty embeddings', () => {
    expect(computePreferenceVector([])).toBeNull();
  });

  it('computes weighted mean of single embedding', () => {
    const result = computePreferenceVector([
      {
        product_id: 'p1',
        vector: [1, 0, 0],
        interaction_type: 'view',
        created_at: now,
      },
    ]);

    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
    // Should be unit vector
    const norm = Math.sqrt(result!.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });

  it('weights recent interactions more heavily', () => {
    // Two embeddings: one very old (purchase), one very recent (view)
    // Purchase has weight 10 but is 60 days old (decayed); view has weight 1 but is fresh
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const result = computePreferenceVector([
      {
        product_id: 'p1',
        vector: [1, 0, 0],
        interaction_type: 'purchase', // weight 10, but 60 days old → 10 * 2^(-60/30) = 10 * 0.25 = 2.5
        created_at: twoMonthsAgo,
      },
      {
        product_id: 'p2',
        vector: [0, 1, 0],
        interaction_type: 'view', // weight 1, but fresh → 1 * 2^(0) = 1
        created_at: now,
      },
    ]);

    expect(result).not.toBeNull();
    // Old purchase (decayed to ~2.5) should still dominate fresh view (1)
    // but recency narrows the gap significantly
    expect(result![0]).toBeGreaterThan(0.3); // purchase still contributes
    expect(result![1]).toBeGreaterThan(0.1); // view also contributes
  });

  it('handles negative signals (unfavorite)', () => {
    const result = computePreferenceVector([
      {
        product_id: 'p1',
        vector: [1, 0, 0],
        interaction_type: 'favorite',
        created_at: now,
      },
      {
        product_id: 'p1',
        vector: [1, 0, 0],
        interaction_type: 'unfavorite', // weight -5, skipped
        created_at: now,
      },
    ]);

    expect(result).not.toBeNull();
    // Only the favorite contributes (unfavorite is skipped due to negative weight)
    expect(result![0]).toBeCloseTo(1.0, 1);
  });

  it('returns null when all signals are negative', () => {
    const result = computePreferenceVector([
      {
        product_id: 'p1',
        vector: [1, 0, 0],
        interaction_type: 'unfavorite', // weight -5, skipped
        created_at: now,
      },
    ]);

    expect(result).toBeNull();
  });

  it('normalizes to unit vector', () => {
    const result = computePreferenceVector([
      {
        product_id: 'p1',
        vector: [3, 4, 0],
        interaction_type: 'purchase',
        created_at: now,
      },
    ]);

    expect(result).not.toBeNull();
    const norm = Math.sqrt(result!.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for mismatched dimensions', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
});

describe('hashVector', () => {
  it('returns consistent hash for same vector', () => {
    const hash1 = hashVector([1, 2, 3]);
    const hash2 = hashVector([1, 2, 3]);
    expect(hash1).toBe(hash2);
  });

  it('returns different hash for different vectors', () => {
    const hash1 = hashVector([1, 2, 3]);
    const hash2 = hashVector([3, 2, 1]);
    expect(hash1).not.toBe(hash2);
  });

  it('returns 16-char hex string', () => {
    const hash = hashVector([1, 2, 3]);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('formatVectorLiteral', () => {
  it('formats vector as PostgreSQL literal', () => {
    const result = formatVectorLiteral([1, 2, 3]);
    expect(result).toMatch(/^\[/);
    expect(result).toContain(',');
    expect(result).toMatch(/\]$/);
  });

  it('handles negative numbers', () => {
    const result = formatVectorLiteral([-0.5, 0.5]);
    expect(result).toContain('-0.5');
    expect(result).toContain('0.5');
  });
});
