/**
 * Mock for react-native-reanimated.
 *
 * The real module pulls in react-native-worklets, whose native part can't
 * initialize in vitest's Node environment (WorkletsError at suite load).
 * This file is aliased to `react-native-reanimated` in vitest.config.ts (the
 * same pattern as the `react-native` mock), so every ESM import of reanimated
 * in the test graph resolves here. Plain-object stubs keep rendering working —
 * scale springs become no-ops.
 *
 * NOTE: aliases intercept ESM imports only — a component pulling reanimated
 * through a node_modules require() would load the real module instead. Keep
 * app imports ESM.
 */

export default {
  createAnimatedComponent: (component: unknown) => component,
}

export const useSharedValue = <T,>(value: T) => ({ value })
export const useAnimatedStyle = (styleFactory: () => unknown) => styleFactory()
export const withSpring = (value: unknown) => value
