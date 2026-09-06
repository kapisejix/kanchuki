import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const STATUS_BAR_MIN = 24;
export const HEADER_TOP_PAD = 12;
// MUST match (tabs)/_layout.tsx tabBarStyle.height
export const TAB_BAR_HEIGHT = 64;
export const SCREEN_BOTTOM_PAD = 16;

/**
 * Single source of truth for screen inset math.
 *
 * - `headerPaddingTop`: clears the status bar (min 24 for devices that report
 *   no top inset) plus breathing room. Screens with their own custom header
 *   use this instead of the old ad-hoc `Math.max(insets.top, 24) + 12`.
 * - `screenPaddingBottom`: bottom inset plus breathing room for screens
 *   pushed on the root stack (no tab bar underneath).
 * - `tabScrollPaddingBottom`: tab-bar height + bottom inset + breathing room
 *   for scroll bodies rendered INSIDE the (tabs) navigator so the last row
 *   clears the tab bar.
 */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  return {
    insets,
    headerPaddingTop: Math.max(insets.top, STATUS_BAR_MIN) + HEADER_TOP_PAD,
    screenPaddingBottom: insets.bottom + SCREEN_BOTTOM_PAD,
    tabScrollPaddingBottom: TAB_BAR_HEIGHT + insets.bottom + SCREEN_BOTTOM_PAD,
  };
}
