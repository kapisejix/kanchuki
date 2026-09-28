import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Several test files (or the route/lib modules they import) real-import
    // @kanchuki/db, whose src/client.ts builds the Prisma client at import
    // time and throws if DATABASE_URL is unset. The quality CI job sets no
    // DATABASE_URL (only VAULT_DATABASE_URL), so on a clean checkout those
    // modules fail to load during collection — visible only in CI, because
    // dev machines usually have DATABASE_URL in their local environment.
    // These tests mock Prisma (or never touch the DB), so a throwaway URL is
    // enough to let the module graph load. Mirrors packages/db/vitest.config.ts
    // and packages/ai/vitest.config.ts (053d66e / 99401fa).
    env: {
      DATABASE_URL: 'postgresql://ci:ci@localhost:5432/ci_db_unused',
    },

    // Suite-wide test budget. Vitest's 5 s default assumes an unloaded runner;
    // this suite is not one. Measured across a full green run (1546 tests with
    // a duration): median 9 ms, only 23 tests over 500 ms. But the tail is real
    // and several tests sit well inside the old 5 s budget with no per-test
    // override of their own — `referral-codes` at 2531 ms (51%), `admin.test`
    // at 1664 ms (33%). Under load a FAST test can also be reported past the
    // budget, because the budget is wall clock and therefore absorbs scheduling
    // delay the test did not cause: the two rotating failures seen on
    // 2026-09-29 were ~50 ms tests in `admin-festivals` and
    // `retailers-social-fanout`, both green in isolation (50/50 in 3.2 s).
    //
    // 15 s is ~6x the slowest test that depends on this value, which buys
    // headroom on a busy developer machine without weakening hang detection — a
    // hung test never settles, so any finite budget still fails it. Tests that
    // are slow BY CONSTRUCTION keep their own larger per-test overrides and are
    // deliberately unaffected (RC-039: `studio-shoot` 30 s, `admin.login` 15 s,
    // `fal-video` 60 s) — verified by running those files under a tiny global
    // (`--testTimeout=100`), which they still pass.
    //
    // Why suite-wide rather than more per-file constants: the per-file approach
    // patched the slow files it happened to inspect and left every other test on
    // a default mis-sized for this workload, which is why the failures kept
    // rotating to a new file each run instead of staying put.
    testTimeout: 15_000,
  },
})
