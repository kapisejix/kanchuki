import { Text, View, ActivityIndicator, type ViewStyle } from 'react-native'
import { AnimatedPressable } from './AnimatedPressable'

/** White secondary button — matches the customer-web white button (docs/tasks/pending/button-styles.md §2):
 * #FFFFFF fill, 1px #E0E1F6 border, radius 24, navy #231F48 label + icon, light shadow.
 * Pass icons already coloured navy (e.g. `<Share2 size={16} color={WHITE_BUTTON_INK} />`).
 * Label never truncates — it wraps and the button grows.
 */
export const WHITE_BUTTON_INK = '#231F48'

export function WhiteButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  uppercase = false,
  compact = false,
  radius = 16,
  style,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  icon?: React.ReactNode
  /** Product-sheet style is uppercase; design-page style is sentence case (default). */
  uppercase?: boolean
  compact?: boolean
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
      style={[compact ? { alignSelf: 'center' } : { width: '100%' }, style]}
    >
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: '#E0E1F6',
          borderRadius: radius,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 14,
          paddingHorizontal: 12,
          minHeight: 48,
          opacity: isDisabled ? 0.5 : 1,
          // Web `shadow-sm` (customer suit-detail white buttons). Fill + radius are on this
          // view, so Android elevation renders.
          shadowColor: '#231F48',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 3,
          elevation: 2,
        }}
      >
        {loading ? (
          <ActivityIndicator color={WHITE_BUTTON_INK} size="small" />
        ) : (
          <>
            {icon}
            {/* No numberOfLines: full label always shows. */}
            <Text
              style={{
                color: WHITE_BUTTON_INK,
                fontSize: 14, // web text-sm font-bold, sentence case
                fontWeight: '700',
                textAlign: 'center',
                flexShrink: 1,
                ...(uppercase ? { textTransform: 'uppercase', letterSpacing: 0.8 } : null),
              }}
            >
              {label}
            </Text>
          </>
        )}
      </View>
    </AnimatedPressable>
  )
}
