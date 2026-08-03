import { Text, ActivityIndicator, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { AnimatedPressable } from './AnimatedPressable'
import { useTheme } from '../lib/theme'

const SHADOW: ViewStyle = {
  shadowColor: '#14213D',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.25,
  shadowRadius: 12,
  elevation: 6,
}

/** Primary CTA — gradient fill (theme color → darker shade) + shadow + press-scale. One shared button for every screen's main action instead of a bespoke TouchableOpacity per form. */
export function GradientButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  colors,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  icon?: React.ReactNode
  /** Override gradient stops (defaults to theme primary → its 700 shade) */
  colors?: [string, string]
}) {
  const { primaryColor } = useTheme()
  const isDisabled = disabled || loading
  const gradientColors = colors ?? [primaryColor, '#101A30']

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      style={isDisabled ? undefined : SHADOW}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 16, opacity: isDisabled ? 0.5 : 1 }}
        className="flex-row items-center justify-center gap-2 py-3.5 px-5"
      >
        {loading ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <>
            {icon}
            <Text className="text-white text-sm font-sans-semibold">{label}</Text>
          </>
        )}
      </LinearGradient>
    </AnimatedPressable>
  )
}
