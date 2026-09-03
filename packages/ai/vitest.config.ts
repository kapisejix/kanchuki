import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Some @kanchuki/ai modules transitively import @kanchuki/db, whose
    // src/client.ts builds the Prisma client at import time and throws if
    // DATABASE_URL is unset. These tests mock the DB (or never touch it), so
    // a throwaway URL is enough to let the module graph load in CI (the
    // quality job sets no DATABASE_URL). Mirrors packages/db/vitest.config.ts
    // and the VAULT_DATABASE_URL dummy in .github/workflows/ci.yml.
    env: {
      DATABASE_URL: 'postgresql://ci:ci@localhost:5432/ci_db_unused',
    },
  },
})
