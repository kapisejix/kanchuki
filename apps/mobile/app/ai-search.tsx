import { formatPaiseShort } from '@kanchuki/shared'
import { useMutation } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ChevronLeft, Image as ImageIcon, Mic, Search, Sparkles } from 'lucide-react-native'
import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { productApi } from '../src/lib/api'
import { showError } from '../src/lib/errors'
import { useTheme } from '../src/lib/theme'

// ─── Roadmap M — Hinglish voice search surface ─────────────────────
// The /v1/search endpoint already understands Hindi/Hinglish (devanagari +
// transliteration + budget phrases). This screen is its first retailer UI.
// Voice input: the OS keyboard's built-in dictation (tap the mic on the
// keyboard) — it transcribes Hinglish speech into the search box. A native
// in-app mic needs a dev build (same standing constraint as the MSG91
// widget — Expo Go can't run extra native modules).

type SearchResult = {
  id: string
  category: string | null
  primary_color: string | null
  price_min: number | null
  price_max: number | null
  status: string
  primary_photo_url: string | null
  is_new_arrival: boolean
  similarity?: number
}

type Interpretation = {
  detected_colors?: string[]
  detected_fabrics?: string[]
  detected_budget_max?: number | null
}

const EXAMPLE_QUERIES = [
  'pink cotton suit under 2000',
  'लाल साड़ी silk',
  'neela kurta for men',
  'navy lehenga',
]


export default function AiSearchScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')

  const search = useMutation({
    mutationFn: (q: string) => productApi.search(q, undefined, 24),
    onError: (err) => showError(err, 'Search failed — try a simpler phrase'),
  })

  const results = (search.data?.data ?? []) as unknown as SearchResult[]
  const interpretation = (search.data?.query_interpretation ?? {}) as Interpretation

  const runSearch = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setSubmitted(trimmed)
    search.mutate(trimmed)
  }

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900 flex-1">AI Search</Text>
        </View>

        {/* Search box */}
        <View className="flex-row items-center gap-2 bg-sand-100 rounded-2xl px-3.5 py-2.5 mt-3">
          <Search size={16} color={colors.sand[500]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => runSearch(query)}
            placeholder="“cotton pink suits under ₹2000”"
            placeholderTextColor={colors.sand[400]}
            className="flex-1 text-sm text-sand-900"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <AnimatedPressable
              onPress={() => runSearch(query)}
              className="bg-ink-600 rounded-xl px-3 py-1.5"
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Text className="text-white text-xs font-bold">Search</Text>
            </AnimatedPressable>
          )}
        </View>
        <Text className="text-[11px] text-sand-400 mt-2 flex-row items-center">
          <Mic size={11} color={colors.sand[400]} /> Speak it: use the mic on your keyboard — Hindi
          or Hinglish both work.
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {submitted === '' ? (
          <View>
            {/* Hero */}
            <View className="bg-ink-600 rounded-2xl p-4 mb-4">
              <View className="flex-row items-center gap-2 mb-1">
                <Sparkles size={16} color={colors.turmeric[400]} />
                <Text className="text-turmeric-300 text-xs font-semibold uppercase tracking-wide">
                  Describe it in your own words
                </Text>
              </View>
              <Text className="text-white text-sm leading-5 mt-1">
                “neela cotton suit”, “लाल साड़ी silk”, “kurti under 1500” — the AI understands
                Hindi, Hinglish and mixed phrases with prices.
              </Text>
            </View>

            {/* Example queries */}
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide px-1 mb-2.5">
              Try one
            </Text>
            <View className="gap-2.5">
              {EXAMPLE_QUERIES.map((q) => (
                <AnimatedPressable
                  key={q}
                  onPress={() => {
                    setQuery(q)
                    runSearch(q)
                  }}
                  accessibilityRole="button"
                  className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center"
                >
                  <View
                    className="w-9 h-9 rounded-xl items-center justify-center mr-3"
                    style={{ backgroundColor: `${primaryColor}1A` }}
                  >
                    <Search size={16} color={primaryColor} />
                  </View>
                  <Text className="text-sm text-sand-800 flex-1">{q}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>
        ) : (
          <View>
            {/* Interpretation chips */}
            <View className="flex-row flex-wrap gap-1.5 mb-3">
              {(interpretation.detected_colors ?? []).map((c) => (
                <View key={`c-${c}`} className="bg-fuchsia-100 px-2.5 py-1 rounded-full">
                  <Text className="text-[11px] font-semibold text-fuchsia-700">{c}</Text>
                </View>
              ))}
              {(interpretation.detected_fabrics ?? []).map((f) => (
                <View key={`f-${f}`} className="bg-turmeric-50 px-2.5 py-1 rounded-full">
                  <Text className="text-[11px] font-semibold text-turmeric-700">{f}</Text>
                </View>
              ))}
              {interpretation.detected_budget_max != null && (
                <View className="bg-sand-100 px-2.5 py-1 rounded-full">
                  <Text className="text-[11px] font-semibold text-sand-600">
                    under {formatPaiseShort(interpretation.detected_budget_max)}
                  </Text>
                </View>
              )}
            </View>

            {search.isPending ? (
              <View className="items-center py-16">
                <ActivityIndicator color={primaryColor} />
                <Text className="text-xs text-sand-400 mt-3">Searching your catalog…</Text>
              </View>
            ) : results.length === 0 ? (
              <View className="items-center py-16">
                <Search size={28} color={colors.sand[300]} />
                <Text className="text-sm text-sand-400 mt-3 text-center max-w-[260px]">
                  No matches for “{submitted}”. Try simpler words, a colour, or a budget.
                </Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-3">
                {results.map((p) => (
                  <AnimatedPressable
                    key={p.id}
                    onPress={() => router.push(`/product/${p.id}`)}
                    accessibilityRole="button"
                    className="bg-white rounded-2xl border border-sand-100 overflow-hidden"
                    style={{ width: '48%' }}
                  >
                    {p.primary_photo_url ? (
                      <Image
                        source={{ uri: p.primary_photo_url }}
                        className="w-full h-32"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="w-full h-32 bg-ink-100 items-center justify-center">
                        <ImageIcon size={20} color={colors.sand[300]} />
                      </View>
                    )}
                    <View className="px-2.5 py-2">
                      <Text className="text-xs font-semibold text-sand-900" numberOfLines={1}>
                        {p.category ?? 'Product'}
                      </Text>
                      <View className="flex-row items-center justify-between mt-0.5">
                        {p.price_min != null ? (
                          <Text className="text-[11px] text-sand-500">{formatPaiseShort(p.price_min)}</Text>
                        ) : (
                          <Text className="text-[11px] text-sand-300">—</Text>
                        )}
                        {p.is_new_arrival && (
                          <View className="bg-emerald-50 px-1.5 py-0.5 rounded-full">
                            <Text className="text-[9px] font-bold text-emerald-700">NEW</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </AnimatedPressable>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
