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
  },
})
