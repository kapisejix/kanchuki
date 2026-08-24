import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/navigation': path.resolve(__dirname, './src/test/__mocks__/next-navigation.ts'),
      'next/link': path.resolve(__dirname, './src/test/__mocks__/next-link.tsx'),
      // Packages with no declared react peer dep (e.g. swiper) resolve a bare
      // `import 'react'` via Node's directory walk-up, which lands on the
      // react@19 hoisted at the workspace root (pulled in by a stray
      // @sentry/react-native dep there) instead of this app's react@18 —
      // pin the exact specifiers so every import shares one React instance.
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
      'react-dom/client': path.resolve(__dirname, 'node_modules/react-dom/client'),
    },
    dedupe: ['react', 'react-dom'],
  },
})
