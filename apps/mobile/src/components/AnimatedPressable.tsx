import type { ReactNode } from 'react';
import type { GestureResponderEvent, Insets, StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useReduceMotion } from '../hooks/useReduceMotion';

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
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  accessibilityLabel?: string;
  accessibilityRole?: 'button';
  accessibilityState?: { selected?: boolean; disabled?: boolean };
  hitSlop?: Insets | number;
  testID?: string;
}) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        onPressIn={() => {
          if (!reduceMotion) scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          if (!reduceMotion) scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        }}
        className={className}
        style={style}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        hitSlop={hitSlop}
        testID={testID}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
