import { Text, View, ActivityIndicator, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowRight } from 'lucide-react-native'
import { AnimatedPressable } from './AnimatedPressable'
import { useTheme } from '../lib/theme'

/** Primary CTA — gradient fill (#231F48 Space Cadet → #560A39 Tyrian Purple) + shadow + press-scale. One shared button for every screen's main action. */
export function GradientButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  accentBadge,
  colors,
  compact = false,
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
}) {
  const { colors: themeColors } = useTheme()
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
      <ArrowRight size={14} color="white" strokeWidth={2.5} />
    )

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      style={[isDisabled ? undefined : shadow, compact ? { alignSelf: 'center' } : { width: '100%' }]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 24, opacity: isDisabled ? 0.5 : 1 }}
        className={`flex-row items-center ${
          compact
            ? 'justify-center gap-3 py-3 px-6'
            : 'justify-between py-3.5 px-5'
        }`}
      >
        {loading ? (
          <View className={`${compact ? 'px-6' : 'w-full'} flex-row items-center justify-center py-0.5`}>
            <ActivityIndicator color="white" size="small" />
          </View>
        ) : (
          <>
            <View className="flex-row items-center gap-2">
              {icon}
              <Text className="text-white text-xs font-bold uppercase tracking-wider">{label}</Text>
            </View>
            {badgeContent ? (
              <View className="w-7 h-7 rounded-xl bg-fuchsia-500 items-center justify-center shadow-sm">
                {badgeContent}
              </View>
            ) : null}
          </>
        )}
      </LinearGradient>
    </AnimatedPressable>
  )
}

