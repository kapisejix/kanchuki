// F-034 L6: promo video runs on its own queue, so a 2-3 min paid Fal clip never
// holds a Studio Shoot worker slot. Source pin: the wiring lives in jobs/index.ts,
// which starts real BullMQ workers and is not unit-testable without Redis.
import { readFileSync } from 'node:fs';
import { QUEUES } from '@kanchuki/shared';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('promo video queue (L6)', () => {
  it('has its own queue name', () => {
    expect(QUEUES.PROMO_VIDEO).toBe('kanchuki-promo-video');
    expect(QUEUES.PROMO_VIDEO).not.toBe(QUEUES.STUDIO_SHOOT);
  });

  it('enqueues on the promo video queue, not the studio queue', () => {
    const fn = src.slice(src.indexOf('export async function addPromoVideoJob'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toContain('getPromoVideoQueue()');
  });

  it('the studio worker no longer runs promo jobs; a dedicated worker does', () => {
    const studio = src.slice(src.indexOf('new Worker(\n    QUEUES.STUDIO_SHOOT'));
    expect(studio.slice(0, studio.indexOf('concurrency'))).not.toContain('handlePromoVideo');
    expect(src).toMatch(/new Worker\(\s*QUEUES\.PROMO_VIDEO,[\s\S]{0,120}handlePromoVideo/);
    expect(src).toContain("reportJobFailure('promo-video'");
  });
});
