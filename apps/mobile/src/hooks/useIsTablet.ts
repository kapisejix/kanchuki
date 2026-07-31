import { useWindowDimensions } from 'react-native'

const TABLET_BREAKPOINT = 768

/** True on tablet-width windows (iPad, Android tablets, split-screen). Reactive to rotation/resize. */
export function useIsTablet(): boolean {
  const { width } = useWindowDimensions()
  return width >= TABLET_BREAKPOINT
}

/** Grid column count for product/list grids — 2 on phone, 3 on tablet. */
export function useGridColumns(): number {
  return useIsTablet() ? 3 : 2
}
