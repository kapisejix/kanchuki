import { ActivityIndicator, Text, View, type ViewStyle } from 'react-native'
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
      // Red box lives on an inner View: NativeWind's Pressable wrapper drops a background set
      // on the Pressable's function style (Disconnect rendered as white text on white).
      style={[{ width: '100%' }, style]}
    >
      <View
        style={{
          minHeight: 44,
          borderRadius: radius,
          paddingVertical: 12,
          paddingHorizontal: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#DC2626', // solid red, white label
          opacity: isDisabled ? 0.5 : 1,
          shadowColor: '#231F48',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 10,
        }}
      >
        {/* Label stays rendered (hidden) while loading so the button keeps its width; spinner overlays it. */}
        {loading ? (
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        ) : null}
        <Text
          style={{
            opacity: loading ? 0 : 1,
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  )
}
