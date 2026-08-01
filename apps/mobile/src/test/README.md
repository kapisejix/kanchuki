# Mobile app test guide

Vitest (Node env) + @testing-library/react-native. Config: `vitest.config.ts`;
shared mocks in `src/test/__mocks__/`; global mocks in `src/test/setup.ts`.

## Aliased native mocks (no setup needed)

`vitest.config.ts` aliases these modules to real mock files, so every test
import — from the component under test *and* from the test itself — resolves
to the same mock instance:

- `react-native` → `src/test/__mocks__/react-native.ts` — all core components
  + APIs (View, Text, Pressable, StyleSheet, AccessibilityInfo, ...).
- `react-native-reanimated` → `src/test/__mocks__/react-native-reanimated.ts` —
  the real module pulls in react-native-worklets, whose native part can't
  initialize in vitest's Node environment (WorkletsError at suite load).
  Plain-object stubs keep rendering working — scale springs become no-ops.

Everything else (`expo-image`, `expo-router`, `expo-constants`,
`react-native-safe-area-context`, `lucide-react-native`, `@kanchuki/shared`,
`@tanstack/react-query`, `react-native-css-interop`,
`@testing-library/react-native`) is mocked globally in `src/test/setup.ts` via
`vi.mock` — no per-test action needed.

## Controllable AccessibilityInfo (reduce-motion tests)

`AccessibilityInfo` in the `react-native` mock is stateful: it exports
`createControllableAccessibility(initialReduceMotion)` returning a handle that
mutates the same module state the mock reads. Import it and call once at
module top level — no `vi.mock` needed:

```ts
// Path is relative to your test file (there's no `@` alias in mobile's vitest
// config). From a test in src/components/, that's:
import { createControllableAccessibility } from '../test/__mocks__/react-native'

const accessibility = createControllableAccessibility(false)

beforeEach(() => {
  accessibility.reset()
})
```

Then toggle the system Reduce Motion setting and assert the app's handling
(`useReduceMotion` hook, Skeleton/NetworkBanner dimming, onboarding crossfade):

```ts
accessibility.setReduceMotion(true)
// render … assert decorative animation is skipped
```

### Why it works

- Components import `react-native` → the mock file via the vitest alias; the
  handle mutates the same module-level state the mocked `AccessibilityInfo`
  reads, so components see the change.
- Vitest isolates modules per test file, so `reduceMotionEnabled` starts at the
  default in every other test file — no cross-file leakage.
- No `vi.mock` hoisting subtleties: the mock *is* the module.

### Where it's used

- `src/components/ProductCard.test.tsx` — ProductCard → AnimatedPressable pulls
  in reanimated (WorkletsError without the alias) + useReduceMotion
  (AccessibilityInfo un-mocked without this).

> ⚠️ **CJS caveat:** the alias only intercepts ESM imports. A component that
> pulls reanimated through a node_modules `require()` would load the real
> module (WorkletsError again). Today nothing in the tested chain does — the
> app imports reanimated via ESM only.
