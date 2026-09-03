import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // src/client.ts builds the Prisma client at import time and throws if
    // DATABASE_URL is unset. The unit tests here mock or never touch the DB,
    // so a throwaway URL is enough to let the module load in CI (the quality
    // job sets no DATABASE_URL). Mirrors the VAULT_DATABASE_URL dummy in
    // .github/workflows/ci.yml.
    env: {
      DATABASE_URL: 'postgresql://ci:ci@localhost:5432/ci_db_unused',
    },
  },
})
