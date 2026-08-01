# Web app test guide

Vitest (jsdom) + Testing Library. Config: `vitest.config.ts`; shared mocks in
`src/test/__mocks__/`; global mocks in `src/test/setup.ts`.

## Mocking next/navigation

### 1. Fixed shared mock (default)

`vitest.config.ts` aliases `next/navigation` to
`src/test/__mocks__/next-navigation.ts`, whose `usePathname()` always returns
`'/admin'`. Use this when the test doesn't care about the current route — most
component tests. No setup needed.

> ⚠️ If your component is **not** under `/admin`, don't trust the shared mock's
> pathname — it will silently be `'/admin'` (a customer-page test that forgets
> the override can make wrong assertions pass). Use the controllable pattern
> below whenever the route matters.

### 2. Controllable pathname (route-change tests)

The shared mock is stateful: it exports `createControllablePathname(initialPath)`,
which returns a handle mutating the same module state the hooks read. Import it
and call once at module top level — no `vi.mock` needed:

```tsx
import { createControllablePathname } from '@/test/__mocks__/next-navigation'

const nav = createControllablePathname('/admin')

beforeEach(() => {
  nav.reset() // restore initial path + clear router mock call history
})
```

Then change the route and re-render the **same root**:

```tsx
const { rerender } = render(<Page />)
nav.setPathname('/admin/retailers')
rerender(<Page />) // NOT render() again — a second render mounts a parallel tree
```

The handle also exposes the router mocks for assertions (e.g. `nav.router.push`
for a sign-out redirect) and `useSearchParams` returns a **stable** module-level
instance, so components whose `useEffect` depends on `searchParams` identity
(like the retailers page's `[loadRetailers, searchParams]`) won't infinitely
refetch.

### Why it works

- `vitest.config.ts` already aliases `next/navigation` to this file, so every
  import of the hooks — from the component under test *and* the test itself —
  resolves to the same module instance. The handle mutates that shared state.
- Vitest isolates modules per test file, so `currentPath` starts at the default
  `'/admin'` in every other test file — no cross-file leakage.
- No `vi.mock` hoisting subtleties to get wrong: the mock *is* the module.

### Other Next.js module mocks

- `next/link` — own alias mock at `src/test/__mocks__/next-link.tsx`
  (also aliased in `vitest.config.ts`).
- `next/dynamic` and `next/image` — stubbed file-scoped with `vi.mock` where
  lazy-loading or the optimizer breaks under jsdom (see the layout and
  CollectionView tests for the exact stubs).

### Where it's used

- `src/app/admin/__tests__/layout.test.tsx` — admin shell persists across a
  route change; only the keyed content area remounts.
- `src/app/admin/components/__tests__/Sidebar.test.tsx` — active-link class
  contract across routes.
- `src/app/c/[slug]/components/__tests__/CollectionView.test.tsx` — favorites
  survive a route-change remount via localStorage.
- `src/app/admin/retailers/__tests__/page.test.tsx` — the mirror image: the
  retailers page persists nothing in memory, so a route-change remount must
  reset stale selection/filter state while the session (`admin_key`) still
  rides along on the fresh refetch.
- `src/components/__tests__/RouteProgress.test.tsx` — per-route progress bar
  triggers and timer cleanup.

> If you already pasted the old `vi.mock` factory block into a test, replace it
> with `createControllablePathname` (the factory is now baked into the shared
> mock — pasting the legacy block re-mocks the module the test already receives
> and reintroduces the per-render `new URLSearchParams()` infinite-refetch bug
> for `searchParams`-dependent effects).

### Gotchas

- **Call `nav.reset()` in `beforeEach`** — the pathname (and any
  `searchParams` mutations) are module state shared across tests in the file;
  without a reset, a test's `setPathname`/`searchParams.set(...)` leaks into
  the next.
- **Use `rerender()`, not a second `render()`** — a second `render()` mounts a
  parallel tree and makes every query ambiguous.
- **Route-change semantics differ per surface** — the admin layout keeps its
  chrome mounted (assert DOM-node identity with `toBe`), while the customer
  layout remounts the whole page subtree (assert persistence/rehydration).
