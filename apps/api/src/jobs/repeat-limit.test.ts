import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// RC-062: BullMQ `repeat.limit` is the TOTAL number of repetitions, so
// `limit: 1` stops a cron after one run. Only referral-payout may keep it
// (owner decision, real money).
describe('maintenance cron registration', () => {
  it('no repeat sets limit except referral-payout', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const withLimit = [...src.matchAll(/repeat:\s*\{([^}]*)\}/g)]
      .map((m) => m[1] ?? '')
      .filter((body) => /\blimit\b/.test(body));
    expect(withLimit).toHaveLength(1);
    expect(withLimit[0]).toContain("'30 2 30 * *'");
  });
});
