import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // React Native mock — handles ESM import statements in test/setup files.
      // CJS require() calls inside node_modules still go through Node's
      // native resolver (not affected by this alias), but those are handled
      // by vi.mock() in the setup file.
      'react-native': resolve(__dirname, 'src/test/__mocks__/react-native.ts'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.expo'],
    globals: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
