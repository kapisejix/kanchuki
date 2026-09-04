import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { CheckCircle2, Sparkles } from 'lucide-react-native'
import type { PostTemplateInfo } from '../../lib/api/social'
import { AnimatedPressable } from '../AnimatedPressable'

interface TemplatePickerProps {
  templates: PostTemplateInfo[]
  selectedId: string | null
  onSelect: (template: PostTemplateInfo | null) => void
  colors: any
}

/**
 * Shared admin-template picker (T-9.6 composer; T-9.7 campaign creation gets
 * the same component filtered to CAMPAIGN|BOTH). Occasion filter chips above
 * a horizontal card row. Tapping the selected card deselects — the caption
 * stays whatever the retailer edited.
 */
export function TemplatePicker({ templates, selectedId, onSelect, colors }: TemplatePickerProps) {
  const occasions = [
    'All',
    ...new Set(
      templates
        .map((t) => t.occasion?.trim())
        .filter((o): o is string => Boolean(o)),
    ),
  ]
  const [occasion, setOccasion] = useState<string>('All')
  const filtered = occasion === 'All' ? templates : templates.filter((t) => t.occasion === occasion)

  return (
    <View>
      {occasions.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2.5">
          <View className="flex-row gap-2 px-0.5 py-0.5">
            {occasions.map((o) => {
              const active = occasion === o
              return (
                <AnimatedPressable
                  key={o}
                  onPress={() => setOccasion(o)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`rounded-full border px-3.5 py-1.5 ${
                    active ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  <Text
                    className={`text-[11px] font-semibold ${active ? 'text-white' : 'text-sand-600'}`}
                  >
                    {o}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </ScrollView>
      )}

      {filtered.length === 0 ? (
        <View className="bg-white rounded-2xl border border-sand-100 px-4 py-6 items-center">
          <Sparkles size={18} color={colors.sand[400]} />
          <Text className="text-xs text-sand-400 text-center mt-2 leading-4">
            No templates here yet — the team adds ready-made captions soon.
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2.5 pb-1">
            {filtered.map((t) => {
              const selected = selectedId === t.id
              return (
                <AnimatedPressable
                  key={t.id}
                  onPress={() => onSelect(selected ? null : t)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`w-60 p-3.5 rounded-2xl border-2 ${
                    selected ? 'border-ink-600 bg-ink-600/5' : 'border-sand-100 bg-white'
                  }`}
                >
                  <View className="flex-row items-start justify-between gap-2">
                    <Text
                      className={`text-sm font-bold flex-1 ${selected ? 'text-ink-800' : 'text-sand-900'}`}
                      numberOfLines={1}
                    >
                      {t.name}
                    </Text>
                    {selected ? <CheckCircle2 size={16} color={colors.ink[700]} /> : null}
                  </View>
                  {t.description ? (
                    <Text className="text-[11px] text-sand-500 mt-1 leading-4" numberOfLines={2}>
                      {t.description}
                    </Text>
                  ) : null}
                  <View className="flex-row gap-1.5 mt-2">
                    {t.occasion ? (
                      <View className="bg-fuchsia-50 rounded-full px-2 py-0.5">
                        <Text className="text-[10px] font-semibold text-fuchsia-700">{t.occasion}</Text>
                      </View>
                    ) : null}
                    {t.post_type ? (
                      <View className="bg-sand-100 rounded-full px-2 py-0.5">
                        <Text className="text-[10px] font-semibold text-sand-500">
                          {t.post_type.replace(/_/g, ' ')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </AnimatedPressable>
              )
            })}
          </View>
        </ScrollView>
      )}
    </View>
  )
}