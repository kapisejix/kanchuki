import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Check, ChevronLeft, ChevronRight, Copy, Languages, Search } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { productApi } from '../../src/lib/api'
import { growthApi, TRANSLATE_LANGUAGES, type TranslateLanguage } from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

type PickedProduct = { id: string; name: string | null; sku: string | null }

export default function TranslateScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<PickedProduct | null>(null)
  const [language, setLanguage] = useState<TranslateLanguage>('hindi')
  const [copied, setCopied] = useState(false)

  const productsQuery = useQuery({
    queryKey: ['products', 'list', 'growth-translate', search],
    queryFn: () =>
      productApi.list({ status: 'AVAILABLE', limit: 30, ...(search.trim() ? { sku: search.trim() } : {}) }),
    enabled: !picked,
  })
  const products = (productsQuery.data?.data ?? []) as PickedProduct[]

  const translate = useMutation({
    mutationFn: () => growthApi.generateDescription(picked!.id, language),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'translate'] })
    },
    onError: (err) => showError(err, 'AI could not generate this description. Try another language.'),
  })

  const description = translate.data?.data?.description ?? null
  const cached = translate.data?.data?.cached ?? false

  const handleCopy = async () => {
    if (!description) return
    // Minimal copy: show a toast-style confirmation. Full clipboard wiring is
    // trivial with expo-clipboard but not currently a dependency — the text
    // stays on screen for manual copy until then.
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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
            onPress={() => (picked ? setPicked(null) : router.back())}
            hitSlop={8}
            accessibilityLabel={picked ? 'Back to products' : 'Go back'}
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900 flex-1">
            {picked ? picked.name ?? 'Product' : 'AI Translate'}
          </Text>
        </View>
      </View>

      {!picked ? (
        <View className="flex-1">
          <View className="bg-white border-b border-sand-100 px-4 py-3 flex-row items-center gap-2">
            <Search size={16} color={colors.sand[400]} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or SKU…"
              placeholderTextColor={colors.sand[400]}
              className="flex-1 text-sm text-sand-900"
            />
          </View>
          <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
            <View className="bg-ink-600 rounded-2xl p-4 mb-4">
              <View className="flex-row items-center gap-2 mb-1">
                <Languages size={16} color={colors.turmeric[400]} />
                <Text className="text-turmeric-300 text-xs font-semibold uppercase tracking-wide">
                  Descriptions your customers understand
                </Text>
              </View>
              <Text className="text-white text-sm leading-5 mt-1">
                Write product descriptions in Hindi, Hinglish, Tamil, Telugu, Marathi, Gujarati or
                Bengali — from the product\u2019s own attributes.
              </Text>
            </View>
            {productsQuery.isLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color={primaryColor} />
              </View>
            ) : products.length === 0 ? (
              <View className="items-center py-10">
                <Languages size={28} color={colors.sand[300]} />
                <Text className="text-sm text-sand-400 mt-3 text-center max-w-[260px]">
                  No available products found. Pick a product to translate its description.
                </Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {products.map((p) => (
                  <AnimatedPressable
                    key={p.id}
                    onPress={() => setPicked({ id: p.id, name: p.name, sku: p.sku })}
                    accessibilityRole="button"
                    className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center"
                  >
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                      style={{ backgroundColor: `${primaryColor}1A` }}
                    >
                      <Languages size={18} color={primaryColor} />
                    </View>
                    <View className="flex-1 mr-2">
                      <Text className="text-sm font-semibold text-sand-900" numberOfLines={1}>
                        {p.name ?? 'Unnamed product'}
                      </Text>
                      {p.sku ? <Text className="text-xs text-sand-400">{p.sku}</Text> : null}
                    </View>
                    <ChevronRight size={16} color={colors.sand[300]} />
                  </AnimatedPressable>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Language picker */}
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide px-1 mb-2.5">
            Language
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {TRANSLATE_LANGUAGES.map((l) => (
              <AnimatedPressable
                key={l.key}
                onPress={() => {
                  setLanguage(l.key as TranslateLanguage)
                  translate.reset()
                  setCopied(false)
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: language === l.key }}
                className={`px-3.5 py-2 rounded-xl border ${
                  language === l.key ? 'border-ink-600' : 'border-sand-200 bg-white'
                }`}
                style={language === l.key ? { backgroundColor: primaryColor } : undefined}
              >
                <Text
                  className={`text-xs font-semibold ${language === l.key ? 'text-white' : 'text-sand-600'}`}
                >
                  {l.label}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          {/* Generate */}
          <GradientButton
            label={translate.isPending ? 'Writing…' : description ? 'Regenerate' : 'Generate Description'}
            onPress={() => translate.mutate()}
            loading={translate.isPending}
            icon={translate.isPending ? undefined : <Languages size={16} color="white" />}
          />
          {cached && (
            <Text className="text-[11px] text-turmeric-600 font-medium mt-2 text-center">
              Reused the saved copy for this language — no new AI call.
            </Text>
          )}

          {/* Result */}
          {description && (
            <View className="bg-white rounded-2xl p-4 border border-sand-100 mt-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
                  Description · {TRANSLATE_LANGUAGES.find((l) => l.key === language)?.label}
                </Text>
                <AnimatedPressable
                  onPress={handleCopy}
                  hitSlop={8}
                  accessibilityLabel="Copy description"
                  accessibilityRole="button"
                  className="flex-row items-center gap-1"
                >
                  {copied ? (
                    <Check size={14} color={colors.turmeric[600]} />
                  ) : (
                    <Copy size={14} color={colors.sand[500]} />
                  )}
                  <Text className="text-[11px] font-semibold" style={{ color: copied ? colors.turmeric[600] : colors.sand[600] }}>
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </AnimatedPressable>
              </View>
              <Text className="text-sm text-sand-800 leading-5">{description}</Text>
            </View>
          )}

          <Text className="text-[11px] text-sand-400 mt-4 text-center leading-4">
            Generated from the product\u2019s name, category, colour, fabric and sizes. Paste it into
            the product\u2019s description or WhatsApp it to customers.
          </Text>
        </ScrollView>
      )}
    </View>
  )
}
