import { Text, View, ActivityIndicator, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowRight } from 'lucide-react-native'
import { AnimatedPressable } from './AnimatedPressable'

/** Primary CTA — signature gradient fill (#231F48 Space Cadet → #560A39 Tyrian Purple) + shadow + press-scale.
 * Exactly matches .slide-btn-signature and .slide-btn-signature-compact from 2026 luxury design.
 */
export function GradientButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  accentBadge,
  colors,
  compact = false,
  style,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  icon?: React.ReactNode
  accentBadge?: React.ReactNode | null
  /** Override gradient stops (defaults to signature #231F48 Space Cadet → #560A39 Tyrian Purple) */
  colors?: [string, string]
  /** Auto-width compact centered button (just text + arrow badge, no stretched space) */
  compact?: boolean
  style?: ViewStyle
}) {
  const isDisabled = disabled || loading
  const gradientColors = colors ?? ['#231F48', '#560A39']

  const shadow: ViewStyle = {
    shadowColor: '#231F48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  }

  const badgeContent =
    accentBadge !== undefined ? (
      accentBadge
    ) : (
      <ArrowRight size={16} color="white" strokeWidth={2.2} />
    )

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      style={[
        isDisabled ? undefined : shadow,
        compact ? { alignSelf: 'center' } : { width: '100%' },
        style,
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 24,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: compact ? 'center' : 'space-between',
          paddingVertical: 10,
          paddingLeft: compact ? 20 : 18,
          paddingRight: 12,
          opacity: isDisabled ? 0.5 : 1,
          minHeight: 48,
        }}
      >
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 }}>
            <ActivityIndicator color="#FFFFFF" size="small" />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, marginRight: 8 }}>
              {icon}
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
            {badgeContent ? (
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 12,
                  backgroundColor: '#BB3F95',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                  elevation: 2,
                  flexShrink: 0,
                }}
              >
                {badgeContent}
              </View>
            ) : null}
          </>
        )}
      </LinearGradient>
    </AnimatedPressable>
  )
}
