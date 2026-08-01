import { vi } from 'vitest'

/**
 * Mock for next/navigation hooks.
 *
 * The real hooks depend on Next.js router context which isn't available in
 * jsdom/vitest. This file is aliased to `next/navigation` in vitest.config.ts,
 * so every test import of `next/navigation` resolves here.
 *
 * By default `usePathname()` returns `'/admin'` (the fixed mock — enough for
 * most component tests). For tests that must simulate a real client-side route
 * change, use `createControllablePathname()` and drive the shared state from
 * the returned handle — see src/test/README.md for the full pattern.
 */

let currentPath = '/admin'

// Stable instance: components whose effects depend on `searchParams` identity
// (e.g. `useEffect(..., [searchParams])`) would infinitely refetch if this
// returned a fresh URLSearchParams per render.
const searchParams = new URLSearchParams()

// Stable router so tests can assert on calls via the createControllablePathname
// handle (e.g. Sidebar's sign-out push assertion).
const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}

export function usePathname(): string {
  return currentPath
}

export function useSearchParams(): URLSearchParams {
  return searchParams
}

export function useRouter() {
  return router
}

export function useParams(): Record<string, string> {
  return {}
}

export function redirect() {}
export function notFound() {}

/**
 * Controllable route handle for route-change tests.
 *
 * Call once at module top level of a test file, then:
 * - `setPathname(path)` inside a test to simulate client-side navigation,
 * - `reset()` in `beforeEach` to restore the initial path, clear the shared
 *   searchParams, and clear the router mock call history,
 * - `router.push` (etc.) to assert on router calls.
 *
 * The shared `usePathname`/`useRouter` hooks read the same module state, so
 * components under test see the changes without any `vi.mock` boilerplate.
 * Module state is per-test-file (vitest isolates modules), so `currentPath`
 * always starts at the default for every other test file.
 */
export function createControllablePathname(initialPath = '/admin') {
  currentPath = initialPath
  return {
    setPathname: (path: string) => {
      currentPath = path
    },
    reset: () => {
      currentPath = initialPath
      // A test may mutate the shared searchParams (e.g. searchParams.set(...))
      // — clear all keys so nothing leaks into the next test in the file.
      for (const key of [...searchParams.keys()]) searchParams.delete(key)
      router.push.mockClear()
      router.replace.mockClear()
      router.back.mockClear()
      router.forward.mockClear()
      router.refresh.mockClear()
      router.prefetch.mockClear()
    },
    router,
  }
}
