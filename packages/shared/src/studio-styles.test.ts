import { describe, expect, it } from 'vitest';
import {
  MODEL_STYLES,
  PRODUCT_STYLES,
  poolsForSlug,
  resolveStyleTokens,
} from './studio-styles.js';

const ALL = [...PRODUCT_STYLES, ...MODEL_STYLES];

describe('studio styles', () => {
  it('has the 27 owner styles with unique ids and non-empty prompts', () => {
    expect(ALL).toHaveLength(27);
    expect(new Set(ALL.map((s) => s.id)).size).toBe(27);
    for (const s of ALL) expect(s.prompt.trim().length, s.id).toBeGreaterThan(50);
  });

  it('every {{token}} has a non-empty pool and resolves to no raw token', () => {
    for (const s of ALL) {
      const { prompt, picks } = resolveStyleTokens(s.prompt, 'pools' in s ? s.pools : undefined);
      expect(prompt, s.id).not.toMatch(/\{\{/);
      for (const k of s.prompt.matchAll(/\{\{(\w+)\}\}/g)) expect(picks[k[1] as string], `${s.id} ${k[1]}`).toBeTruthy();
    }
  });

  it('is deterministic for a given rng and records the picks', () => {
    const pools = { Pose: ['A', 'B', 'C'] };
    const r = resolveStyleTokens('Pose: {{Pose}}', pools, () => 0.99);
    expect(r).toEqual({ prompt: 'Pose: C', picks: { Pose: 'C' } });
  });

  it('drops a token with no pool instead of leaving it raw', () => {
    expect(resolveStyleTokens('x {{Nope}} y').prompt).toBe('x  y');
  });

  it('finds pools by seeded slug (lower-cased id)', () => {
    expect(poolsForSlug('ps-16')?.Environment?.length).toBeGreaterThan(0);
    expect(poolsForSlug('unknown-style')).toBeUndefined();
  });
});
