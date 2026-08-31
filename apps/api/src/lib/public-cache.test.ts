import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type PublicCacheRedis,
  normalizedPublicCacheKey,
  publicCacheGetOrCompute,
  withPublicCache,
} from './public-cache.js';

// In-memory fake for the PublicCacheRedis surface — get/set/del string ops
// plus a `down` switch to simulate a Redis outage mid-flight.
class FakeRedis implements PublicCacheRedis {
  store = new Map<string, string>();
  down = false;
  lastSet: { mode: 'EX' | 'PX'; ttl: number } | null = null;

  async get(key: string): Promise<string | null> {
    if (this.down) throw new Error('redis down');
    return this.store.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    mode: 'EX' | 'PX',
    ttl: number,
    condition?: 'NX',
  ): Promise<'OK' | null> {
    if (this.down) throw new Error('redis down');
    this.lastSet = { mode, ttl };
    if (condition === 'NX' && this.store.has(key)) return null;
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('publicCacheGetOrCompute', () => {
  it('serves a cached value without running compute', async () => {
    const redis = new FakeRedis();
    redis.store.set('k', JSON.stringify({ cached: true }));
    const compute = vi.fn(async () => ({ cached: false }));

    const value = await publicCacheGetOrCompute(redis, 'k', compute);

    expect(value).toEqual({ cached: true });
    expect(compute).not.toHaveBeenCalled();
  });

  it('miss computes, stores with a jittered EX TTL, and releases the lock', async () => {
    const redis = new FakeRedis();
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // jitter ≈ 50% → 15 + floor(7.49) = 22 (BASE_TTL_SEC=15)
    const compute = vi.fn(async () => ({ n: 42 }));

    const value = await publicCacheGetOrCompute(redis, 'k', compute);

    expect(value).toEqual({ n: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(redis.store.get('k')).toBe(JSON.stringify({ n: 42 }));
    expect(redis.lastSet?.mode).toBe('EX');
    expect(redis.lastSet?.ttl).toBe(22);
    expect(redis.store.has('k:lock')).toBe(false); // lock released
  });

  it('jitter at 0 expires exactly at the base TTL', async () => {
    const redis = new FakeRedis();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const compute = vi.fn(async () => ({ n: 1 }));

    await publicCacheGetOrCompute(redis, 'k', compute);

    expect(redis.lastSet?.ttl).toBe(15); // BASE_TTL_SEC
  });

  it('single-flight: concurrent callers trigger exactly one compute', async () => {
    const redis = new FakeRedis();
    let resolveCompute!: (v: { v: string }) => void;
    const compute = vi.fn(() => {
      return new Promise<{ v: string }>((resolve) => {
        resolveCompute = resolve;
      });
    });

    const first = publicCacheGetOrCompute(redis, 'k', compute, {
      lockWaitMs: 500,
      waitSleepMs: 5,
    });
    await new Promise((r) => setTimeout(r, 10)); // first acquires the lock, starts computing

    const second = publicCacheGetOrCompute(redis, 'k', compute, {
      lockWaitMs: 500,
      waitSleepMs: 5,
    });
    await new Promise((r) => setTimeout(r, 10)); // second is now polling the cache

    expect(compute).toHaveBeenCalledTimes(1);

    resolveCompute({ v: 'fresh' });
    await expect(first).resolves.toEqual({ v: 'fresh' });
    await expect(second).resolves.toEqual({ v: 'fresh' });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('bounded stampede: a stalled winner makes waiters compute after the wait budget', async () => {
    const redis = new FakeRedis();
    const resolves: Array<(v: { ok: boolean }) => void> = [];
    const compute = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => resolves.push(resolve)));

    const first = publicCacheGetOrCompute(redis, 'k', compute, {
      lockWaitMs: 40,
      waitSleepMs: 5,
    });
    await new Promise((r) => setTimeout(r, 10));

    const second = publicCacheGetOrCompute(redis, 'k', compute, {
      lockWaitMs: 40,
      waitSleepMs: 5,
    });
    await new Promise((r) => setTimeout(r, 120)); // second's 40ms wait expires → it computes

    expect(compute).toHaveBeenCalledTimes(2);

    for (const r of resolves) r({ ok: true });
    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: true });
  });

  it('recomputes when the cached value is corrupt instead of failing the request', async () => {
    const redis = new FakeRedis();
    redis.store.set('k', 'garbage-not-json'); // corrupt cached value
    const compute = vi.fn(async () => ({ ok: true }));

    const value = await publicCacheGetOrCompute(redis, 'k', compute);

    expect(value).toEqual({ ok: true });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(redis.store.get('k')).toBe(JSON.stringify({ ok: true }));
  });

  it('fails open to a direct compute when Redis is down', async () => {
    const redis = new FakeRedis();
    redis.down = true;
    const compute = vi.fn(async () => ({ ok: true }));

    await expect(publicCacheGetOrCompute(redis, 'k', compute)).resolves.toEqual({ ok: true });
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('normalizedPublicCacheKey', () => {
  it('sorts query params so equivalent URLs share one key', () => {
    expect(normalizedPublicCacheKey('/v1/public/collections/x?page=2&category=A')).toBe(
      'public:get:/v1/public/collections/x?category=A&page=2',
    );
    expect(normalizedPublicCacheKey('/v1/public/collections/x?category=A&page=2')).toBe(
      'public:get:/v1/public/collections/x?category=A&page=2',
    );
    expect(normalizedPublicCacheKey('/v1/public/collections/x')).toBe(
      'public:get:/v1/public/collections/x',
    );
    expect(normalizedPublicCacheKey('/v1/public/collections/x?page=2')).toBe(
      'public:get:/v1/public/collections/x?page=2',
    );
  });
});

describe('withPublicCache', () => {
  it('bypasses Redis entirely under test (NODE_ENV=test)', async () => {
    const compute = vi.fn(async () => ({ ok: true }));

    await expect(withPublicCache('/v1/public/x', compute)).resolves.toEqual({ ok: true });
    expect(compute).toHaveBeenCalledTimes(1);
  });
});
