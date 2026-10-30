import { describe, expect, it, vi } from 'vitest';
import { pruneStaleRepeatables } from './prune-stale-repeatables.js';

const rep = (name: string, pattern: string) => ({
  key: `${name}::::${pattern}`,
  name,
  pattern,
  endDate: null,
  tz: null,
});

function fakeQueue(jobs: ReturnType<typeof rep>[]) {
  return {
    getRepeatableJobs: vi.fn(async () => jobs),
    removeRepeatableByKey: vi.fn(async () => true),
  };
}

describe('pruneStaleRepeatables (T1.4 F4)', () => {
  it('removes a repeatable whose name is registered under a new pattern', async () => {
    const q = fakeQueue([rep('catalog-daily-full-sync', '0 5 * * *')]);
    await pruneStaleRepeatables(q as never, new Set(['catalog-daily-full-sync|0 6 * * *']));
    expect(q.removeRepeatableByKey).toHaveBeenCalledTimes(1);
    expect(q.removeRepeatableByKey).toHaveBeenCalledWith('catalog-daily-full-sync::::0 5 * * *');
  });

  it('keeps a repeatable that matches name and pattern', async () => {
    const q = fakeQueue([rep('plan-lapse', '0 * * * *')]);
    await pruneStaleRepeatables(q as never, new Set(['plan-lapse|0 * * * *']));
    expect(q.removeRepeatableByKey).not.toHaveBeenCalled();
  });

  it('keeps both backup-database crons (same name, two registered patterns)', async () => {
    const q = fakeQueue([rep('backup-database', '0 3 * * *'), rep('backup-database', '0 4 * * 0')]);
    await pruneStaleRepeatables(
      q as never,
      new Set(['backup-database|0 3 * * *', 'backup-database|0 4 * * 0']),
    );
    expect(q.removeRepeatableByKey).not.toHaveBeenCalled();
  });

  it('never touches a name this boot did not register', async () => {
    const q = fakeQueue([rep('owned-elsewhere', '*/5 * * * *')]);
    await pruneStaleRepeatables(q as never, new Set(['plan-lapse|0 * * * *']));
    expect(q.removeRepeatableByKey).not.toHaveBeenCalled();
  });

  it('does not throw when Redis fails', async () => {
    const q = {
      getRepeatableJobs: vi.fn(async () => {
        throw new Error('redis down');
      }),
      removeRepeatableByKey: vi.fn(),
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      pruneStaleRepeatables(q as never, new Set(['plan-lapse|0 * * * *'])),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
