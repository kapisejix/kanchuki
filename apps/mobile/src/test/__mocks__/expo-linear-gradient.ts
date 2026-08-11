/**
 * Mock for expo-linear-gradient.
 *
 * The real vendor build (`build/LinearGradient.js`) ships JSX in a plain
 * `.js` file. Vite/Rolldown's SSR transform (vitest's transform pipeline)
 * refuses to parse JSX in `.js` — only `.jsx`/`.tsx` — so any test that
 * pulls this in via GradientButton/GradientBorderCard fails at collect time
 * with a RolldownError, not a real app bug. Aliased the same way as the
 * react-native/react-native-reanimated mocks in vitest.config.ts.
 */

import React from 'react'

export const LinearGradient = React.forwardRef<unknown, Record<string, unknown>>(
  (props, ref) => {
    const { children, colors, ...rest } = props
    return React.createElement('LinearGradient' as never, { ...rest, ref }, children as React.ReactNode)
  },
)
LinearGradient.displayName = 'LinearGradient'
