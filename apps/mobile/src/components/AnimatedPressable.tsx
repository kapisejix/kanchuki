import type { ReactNode } from 'react';
import type { GestureResponderEvent, Insets, StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import { useReduceMotion } from '../hooks/useReduceMotion';

/** Press-scale wrapper (0.96 scale + 0.92 opacity) shared by buttons/cards/icons. Skips transform under Reduce Motion. */
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
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  className?: string;
  accessibilityLabel?: string;
  accessibilityRole?: 'button';
  accessibilityState?: { selected?: boolean; disabled?: boolean };
  hitSlop?: Insets | number;
  testID?: string;
}) {
  const reduceMotion = useReduceMotion();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      className={className}
      style={({ pressed }) => [
        typeof style === 'function' ? style({ pressed }) : style,
        !reduceMotion && pressed && !disabled ? { transform: [{ scale: 0.96 }], opacity: 0.92 } : undefined,
      ]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      hitSlop={hitSlop}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}
