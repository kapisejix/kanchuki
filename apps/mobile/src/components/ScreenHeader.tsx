import { router } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useScreenInsets } from '../lib/safe-area'
import { AnimatedPressable } from './AnimatedPressable'

type ScreenHeaderProps = {
  title: string
  subtitle?: string
  /** Action pill / button on the right (e.g. Save). */
  right?: ReactNode
  /** Defaults to router.back(). */
  onBack?: () => void
  /** Extra content under the title row (e.g. filter chips). */
  children?: ReactNode
}

/**
 * The one header style (audit C-02): circled back chip, left-aligned
 * Marcellus title, optional subtitle and right action.
 */
export function ScreenHeader({ title, subtitle, right, onBack, children }: ScreenHeaderProps) {
  const { headerPaddingTop } = useScreenInsets()
  return (
    <View
      className="bg-white border-b border-lavender-200 px-5 pb-4"
      style={{ paddingTop: headerPaddingTop }}
    >
      <View className="flex-row items-center gap-3">
        <AnimatedPressable
          onPress={onBack ?? (() => router.back())}
          hitSlop={8}
          className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={20} color="#231F48" />
        </AnimatedPressable>
        <View className="flex-1">
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-xl font-bold text-spaceCadet-900"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-xs text-heliotrope-500 font-medium">{subtitle}</Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  )
}

export default ScreenHeader
