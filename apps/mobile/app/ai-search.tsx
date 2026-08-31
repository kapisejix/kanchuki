import { formatPaiseShort } from '@kanchuki/shared'
import { useMutation } from '@tanstack/react-query'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
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
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-xl font-bold text-spaceCadet-900 flex-1"
          >
            AI Vernacular Search
          </Text>
        </View>

        {/* Search box */}
        <View className="flex-row items-center gap-2.5 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-2.5 mt-3.5">
          <Search size={18} color="#BB3F95" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => runSearch(query)}
            placeholder="“cotton pink suits under ₹2000”"
            placeholderTextColor="#928EB2"
            className="flex-1 text-sm font-bold text-spaceCadet-900"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <AnimatedPressable
              onPress={() => runSearch(query)}
              className="bg-spaceCadet-900 rounded-xl px-3.5 py-1.5 shadow-sm"
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Text className="text-white text-xs font-bold">Search</Text>
            </AnimatedPressable>
          )}
        </View>
        <Text className="text-[11px] text-heliotrope-400 font-medium mt-2 flex-row items-center">
          <Mic size={11} color="#BB3F95" /> Speak in Hindi, Hinglish, or English via your keyboard mic.
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {submitted === '' ? (
          <View>
            {/* Hero */}
            <LinearGradient
              colors={['#231F48', '#560A39']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="rounded-3xl p-5 mb-4 shadow-sm"
            >
              <View className="flex-row items-center gap-2 mb-1.5">
                <Sparkles size={18} color="#BB3F95" />
                <Text
                  style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                  className="text-white text-base font-bold"
                >
                  Describe Designs in Natural Language
                </Text>
              </View>
              <Text className="text-lavender-200 text-xs leading-relaxed mt-1 font-medium">
                “neela cotton suit”, “लाल साड़ी silk”, “kurti under 1500” — the AI understands
                Hindi, Hinglish, colors, fabrics and budget ranges effortlessly.
              </Text>
            </LinearGradient>

            {/* Example queries */}
            <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider px-1 mb-2.5">
              Popular Queries
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
                  className="bg-white rounded-3xl p-4 border border-lavender-200 flex-row items-center shadow-sm"
                >
                  <View
                    className="w-10 h-10 rounded-2xl items-center justify-center mr-3 bg-lavender-100 border border-lavender-200"
                  >
                    <Search size={16} color="#BB3F95" />
                  </View>
                  <Text className="text-sm font-bold text-spaceCadet-900 flex-1">{q}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>
        ) : (
          <View>
            {/* Interpretation chips */}
            <View className="flex-row flex-wrap gap-1.5 mb-3.5">
              {(interpretation.detected_colors ?? []).map((c) => (
                <View key={`c-${c}`} className="bg-fuchsia-500/10 border border-fuchsia-500/20 px-3 py-1 rounded-full">
                  <Text className="text-xs font-bold text-fuchsia-700">{c}</Text>
                </View>
              ))}
              {(interpretation.detected_fabrics ?? []).map((f) => (
                <View key={`f-${f}`} className="bg-lavender-100 border border-lavender-200 px-3 py-1 rounded-full">
                  <Text className="text-xs font-bold text-spaceCadet-900">{f}</Text>
                </View>
              ))}
              {interpretation.detected_budget_max != null && (
                <View className="bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <Text className="text-xs font-bold text-emerald-700">
                    under {formatPaiseShort(interpretation.detected_budget_max)}
                  </Text>
                </View>
              )}
            </View>

            {search.isPending ? (
              <View className="items-center py-16">
                <ActivityIndicator color="#BB3F95" />
                <Text className="text-xs text-heliotrope-500 font-medium mt-3">Searching boutique catalog…</Text>
              </View>
            ) : results.length === 0 ? (
              <View className="items-center py-16">
                <Search size={32} color="#BB3F95" />
                <Text className="text-xs text-heliotrope-500 font-medium mt-3 text-center max-w-[260px]">
                  No matches for “{submitted}”. Try simpler keywords, colors, or fabrics.
                </Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-3">
                {results.map((p) => (
                  <AnimatedPressable
                    key={p.id}
                    onPress={() => router.push(`/product/${p.id}`)}
                    accessibilityRole="button"
                    className="bg-white rounded-3xl border border-lavender-200 overflow-hidden shadow-sm"
                    style={{ width: '48%' }}
                  >
                    {p.primary_photo_url ? (
                      <Image
                        source={{ uri: p.primary_photo_url }}
                        className="w-full h-36"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="w-full h-36 bg-lavender-100 items-center justify-center">
                        <ImageIcon size={24} color="#928EB2" />
                      </View>
                    )}
                    <View className="p-3">
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                        className="text-sm font-bold text-spaceCadet-900"
                        numberOfLines={1}
                      >
                        {p.category ?? 'Design'}
                      </Text>
                      <View className="flex-row items-center justify-between mt-1">
                        {p.price_min != null ? (
                          <Text
                            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                            className="text-xs font-bold text-spaceCadet-900"
                          >
                            {formatPaiseShort(p.price_min)}
                          </Text>
                        ) : (
                          <Text className="text-xs text-heliotrope-400">—</Text>
                        )}
                        {p.is_new_arrival && (
                          <View className="bg-fuchsia-500/10 border border-fuchsia-500/20 px-2 py-0.5 rounded-full">
                            <Text className="text-[9px] font-bold text-fuchsia-700">NEW</Text>
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
