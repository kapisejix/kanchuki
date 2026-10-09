import { describe, expect, it } from 'vitest';
import {
  MAX_SAMPLES,
  getMemoryHistory,
  recordMemorySample,
  takeMemorySample,
} from './admin-server-memory.js';

// Contract: a sample carries every number the admin card renders, and the
// history ring buffer never grows past 24 h of samples.

describe('takeMemorySample', () => {
  it('returns positive MB numbers and an ISO timestamp', () => {
    const s = takeMemorySample(new Date('2026-10-09T10:00:00Z'));
    expect(s.at).toBe('2026-10-09T10:00:00.000Z');
    expect(s.rss_mb).toBeGreaterThan(0);
    expect(s.heap_used_mb).toBeGreaterThan(0);
    expect(s.heap_total_mb).toBeGreaterThanOrEqual(s.heap_used_mb);
    expect(s.native_other_mb).toBeGreaterThanOrEqual(0);
  });
});

describe('recordMemorySample', () => {
  it('caps the history at MAX_SAMPLES (oldest dropped)', () => {
    for (let i = 0; i < MAX_SAMPLES + 20; i++) recordMemorySample();
    expect(getMemoryHistory()).toHaveLength(MAX_SAMPLES);
  });
});
