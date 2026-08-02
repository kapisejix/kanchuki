import type { ComponentType, ReactNode } from 'react'
import type { GestureResponderEvent, Insets, PressableProps, StyleProp, ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { Pressable } from 'react-native'
import { useReduceMotion } from '../hooks/useReduceMotion'

// RN 0.81 types Pressable as ForwardRefExoticComponent<PressableProps & RefAttributes<View>>,
// which matches none of reanimated 4.1.7's createAnimatedComponent overloads (they only
// accept FunctionComponent | ComponentClass | ComponentType, typed against the React 18
// @types/react copy hoisted for @types/react-dom, so the generic inference breaks).
// Cast through `any` to bypass the broken overload resolution, then re-type the result
// so JSX prop checking on <AnimatedView> stays intact.
const AnimatedView = Animated.createAnimatedComponent(
  Pressable as any,
) as ComponentType<PressableProps>

/** Press-scale wrapper (0.96 spring) shared by buttons/cards/icons. Skips the scale under Reduce Motion. */
export function AnimatedPressable({
  onPress,
  onLongPress,
  disabled,
  children,
  style,
  className,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  hitSlop,
  testID,
}: {
  onPress?: (e: GestureResponderEvent) => void
  onLongPress?: (e: GestureResponderEvent) => void
  disabled?: boolean
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  className?: string
  accessibilityLabel?: string
  accessibilityRole?: 'button'
  accessibilityState?: { selected?: boolean; disabled?: boolean }
  hitSlop?: Insets | number
  testID?: string
}) {
  const reduceMotion = useReduceMotion()
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <AnimatedView
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onPressIn={() => {
        if (!reduceMotion) scale.value = withSpring(0.96, { damping: 15, stiffness: 300 })
      }}
      onPressOut={() => {
        if (!reduceMotion) scale.value = withSpring(1, { damping: 15, stiffness: 300 })
      }}
      className={className}
      style={[animStyle, style]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      hitSlop={hitSlop}
      testID={testID}
    >
      {children}
    </AnimatedView>
  )
}
