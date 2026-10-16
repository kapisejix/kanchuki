import { Text, View, ActivityIndicator, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowRight } from 'lucide-react-native'
import { AnimatedPressable } from './AnimatedPressable'

/** Primary CTA — signature gradient fill (#231F48 Space Cadet → #560A39 Tyrian Purple) + shadow + press-scale.
 * Exactly matches .slide-btn-signature and .slide-btn-signature-compact from 2026 luxury design.
 *
 * `variant="web"` = the customer-web button (docs/tasks/pending/button-styles.md §1): horizontal
 * gradient, centred icon + label, no arrow badge, radius 24. Opt-in while piloted on one screen.
 * Only the web variant shows full labels (wraps, button grows); the default keeps its original look.
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
  variant = 'signature',
  iconRight,
  radius = 16,
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
  /** 'signature' = current look; 'web' = matches the customer web product-sheet button */
  variant?: 'signature' | 'web'
  /** web variant only: icon after the label (e.g. a white arrow) */
  iconRight?: React.ReactNode
  /** corner radius, web variant (default 16 — owner 2026-10-16; signature variant stays 24) */
  radius?: number
  style?: ViewStyle
}) {
  const isDisabled = disabled || loading
  const isWeb = variant === 'web'
  const gradientColors = colors ?? ['#231F48', '#560A39']

  const shadow: ViewStyle = isWeb
    ? {
        // Web `shadow-lg shadow-[#231F48]/25`. Android draws elevation only from a filled,
        // rounded view, so this wrapper carries the fill + radius (the gradient covers it).
        backgroundColor: '#231F48',
        borderRadius: radius,
        shadowColor: '#231F48',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 10,
      }
    : {
        shadowColor: '#231F48',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
        elevation: 6,
      }

  const badgeContent =
    isWeb && accentBadge === undefined
      ? null
      : accentBadge !== undefined
        ? accentBadge
        : <ArrowRight size={16} color="white" strokeWidth={2.2} />

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
        end={isWeb ? { x: 1, y: 0 } : { x: 1, y: 1 }}
        style={{
          borderRadius: isWeb ? radius : 24,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: isWeb || compact ? 'center' : 'space-between',
          paddingVertical: isWeb ? 12 : 10,
          paddingLeft: isWeb ? 10 : compact ? 20 : 18,
          paddingRight: isWeb ? 10 : 12,
          opacity: isDisabled ? 0.5 : 1,
          minHeight: isWeb ? 44 : 48,
        }}
      >
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 }}>
            <ActivityIndicator color="#FFFFFF" size="small" />
          </View>
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: isWeb ? 'center' : undefined,
                gap: 8,
                flexShrink: 1,
                marginRight: isWeb && !badgeContent ? 0 : 8,
              }}
            >
              {icon}
              {/* web variant: no line limit — full label shows, wraps to a 2nd line if long.
                  signature variant keeps its original one-line behaviour (other screens unchanged). */}
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: isWeb ? 10 : 12,
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  ...(isWeb ? { textAlign: 'center', flexShrink: 1 } : null),
                }}
                numberOfLines={isWeb ? undefined : 1}
              >
                {label}
              </Text>
              {isWeb ? iconRight : null}
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
