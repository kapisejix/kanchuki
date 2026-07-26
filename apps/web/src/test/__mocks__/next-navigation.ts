/**
 * Mock for next/navigation hooks used in animation components.
 * 
 * The real hooks depend on Next.js router context which isn't
 * available in jsdom/vitest. These mocks provide controlled
 * return values for testing.
 */

export function usePathname(): string {
  return '/admin'
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams()
}

export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  }
}

export function useParams(): Record<string, string> {
  return {}
}

export function redirect() {}
export function notFound() {}
