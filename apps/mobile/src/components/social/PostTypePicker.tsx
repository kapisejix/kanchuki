import { Images, Link2, Square } from 'lucide-react-native'
import { Text, View } from 'react-native'
import type { SocialPostComposeType } from '../../lib/api/social'
import { useTheme } from '../../lib/theme'
import { AnimatedPressable } from '../AnimatedPressable'

interface PostTypeOption {
  value: SocialPostComposeType
  label: string
  hint: string
}

const OPTIONS: PostTypeOption[] = [
  { value: 'SINGLE_PRODUCT', label: 'Single', hint: '1 product · photo or video' },
  { value: 'CAROUSEL', label: 'Carousel', hint: '2–10 products, one photo each' },
  { value: 'COLLECTION_LINK', label: 'Link', hint: 'Collection link, no media' },
]

export function PostTypePicker({
  value,
  onChange,
}: {
  value: SocialPostComposeType
  onChange: (v: SocialPostComposeType) => void
}) {
  const { colors } = useTheme()

  return (
    <View className="flex-row gap-2">
      {OPTIONS.map((opt) => {
        const active = value === opt.value
        const Icon = opt.value === 'SINGLE_PRODUCT' ? Square : opt.value === 'CAROUSEL' ? Images : Link2
        return (
          <AnimatedPressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${opt.label} post — ${opt.hint}`}
            className={`flex-1 rounded-2xl border px-3 py-3 ${
              active ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-100'
            }`}
          >
            <View className="flex-row items-center gap-1.5 mb-1">
              <Icon size={14} color={active ? '#fff' : colors.sand[600]} />
              <Text className={`text-sm font-bold ${active ? 'text-white' : 'text-sand-900'}`}>
                {opt.label}
              </Text>
            </View>
            <Text
              className={`text-[10px] leading-3.5 ${active ? 'text-white/70' : 'text-sand-400'}`}
              numberOfLines={2}
            >
              {opt.hint}
            </Text>
          </AnimatedPressable>
        )
      })}
    </View>
  )
}
