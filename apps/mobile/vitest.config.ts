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
      // Reanimated mock — the real module pulls in react-native-worklets,
      // whose native part can't initialize in vitest's Node environment
      // (WorkletsError at suite load). Aliased the same way as react-native.
      'react-native-reanimated': resolve(
        __dirname,
        'src/test/__mocks__/react-native-reanimated.ts',
      ),
      // LinearGradient mock — real vendor build ships JSX in a .js file,
      // which Rolldown's SSR transform can't parse. Aliased the same way.
      'expo-linear-gradient': resolve(
        __dirname,
        'src/test/__mocks__/expo-linear-gradient.ts',
      ),
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
    css: true,
  },
})
