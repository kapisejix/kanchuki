import { ActivityIndicator, Text, type ViewStyle } from 'react-native'
import { AnimatedPressable } from './AnimatedPressable'

/** Destructive action (Disconnect / Delete) — keeps its red colour but shares the button
 * shape + navy shadow of GradientButton/WhiteButton (docs/tasks/pending/button-styles.md).
 * Label never truncates — it wraps and the button grows.
 */
export function DangerButton({
  label,
  onPress,
  disabled,
  loading,
  radius = 16,
  style,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  /** corner radius (default 16 — owner 2026-10-16) */
  radius?: number
  style?: ViewStyle
}) {
  const isDisabled = disabled || loading
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      style={[
        {
          width: '100%',
          minHeight: 48,
          borderRadius: radius,
          paddingVertical: 14,
          paddingHorizontal: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#DC2626', // solid red, white label
          opacity: isDisabled ? 0.5 : 1,
          shadowColor: '#231F48',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 10,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 12,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
  )
}
