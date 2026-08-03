import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

/**
 * Subtle gradient-edge card (outer-gradient + inner-fill trick — RN has no
 * border-image/background-clip). Pattern + taste rules from MengTo/Skills'
 * css-border-gradient skill: 1px border, low-opacity stops, one hierarchy
 * level at a time, quieter than the content it frames.
 */
export function GradientBorderCard({
  children,
  fill,
  colors,
  radius = 16,
  borderWidth = 1,
  style,
}: {
  children: ReactNode
  /** Inner surface color (matches the card's existing bg token) */
  fill: string
  /** 3-stop neutral -> accent -> neutral gradient, low alpha per skill's taste rules */
  colors: [string, string, string]
  radius?: number
  borderWidth?: number
  style?: ViewStyle
}) {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius, padding: borderWidth }, style]}
    >
      <View style={{ backgroundColor: fill, borderRadius: radius - borderWidth, overflow: 'hidden' }}>
        {children}
      </View>
    </LinearGradient>
  )
}
