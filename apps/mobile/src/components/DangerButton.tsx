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
  style,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
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
          borderRadius: 24,
          paddingVertical: 14,
          paddingHorizontal: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFF1F2',
          borderWidth: 1,
          borderColor: '#FECDD3',
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
        <ActivityIndicator size="small" color="#BE123C" />
      ) : (
        <Text
          style={{
            color: '#BE123C',
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
