import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Languages,
  Megaphone,
  MessageSquareText,
  Search,
} from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { productApi } from '../../src/lib/api'
import { growthApi, TRANSLATE_LANGUAGES, type TranslateLanguage, type TranslateResult } from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'

type PickedItem = { id: string; name: string | null; message?: string | null }

type Mode = 'description' | 'message'

export default function TranslateScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{
    mode?: string
    productId?: string
    productName?: string
    campaignId?: string
    campaignName?: string
    message?: string
  }>()
  const deepLinked = !!(params.productId || params.campaignId)
  const [mode, setMode] = useState<Mode>(params.campaignId ? 'message' : 'description')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<PickedItem | null>(
    params.productId
      ? { id: params.productId, name: params.productName ?? null }
      : params.campaignId
        ? { id: params.campaignId, name: params.campaignName ?? null, message: params.message ?? null }
        : null,
  )
  const [language, setLanguage] = useState<TranslateLanguage>('hindi')
  const [messageInput, setMessageInput] = useState(params.message ?? '')
  const [copied, setCopied] = useState(false)

  const productsQuery = useQuery({
    queryKey: ['products', 'list', 'growth-translate', search],
    queryFn: () =>
      productApi.list({ status: 'AVAILABLE', limit: 30, ...(search.trim() ? { sku: search.trim() } : {}) }),
    enabled: !picked && mode === 'description',
  })
  const products = (productsQuery.data?.data ?? []) as PickedItem[]

  const campaignsQuery = useQuery({
    queryKey: ['growth', 'campaigns'],
    queryFn: () => growthApi.campaigns(),
    enabled: !picked && mode === 'message',
  })
  const campaigns = campaignsQuery.data?.data ?? []

  const translate = useMutation<
    { data: TranslateResult } | { data: { message: string; language: string; placeholders_preserved: boolean } },
    unknown,
    void
  >({
    mutationFn: () => {
      if (mode === 'description') return growthApi.generateDescription(picked!.id, language)
      return growthApi.translateMessage(
        messageInput.trim(),
        language,
        picked?.message ? `Campaign: ${picked.name ?? ''}` : undefined,
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'translate'] })
    },
    onError: (err) =>
      showError(err, 'AI could not generate this. Try another language or shorten the text.'),
  })

  const translateData = translate.data?.data as
    | { description?: string | null; cached?: boolean }
    | { message?: string | null }
    | undefined
  const description = translateData && 'description' in translateData ? (translateData.description ?? null) : null
  const translatedMessage = translateData && 'message' in translateData ? (translateData.message ?? null) : null
  const cached = translateData && 'cached' in translateData ? !!translateData.cached : false
  const resultText = mode === 'description' ? description : translatedMessage

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    setPicked(null)
    setMessageInput('')
    setSearch('')
    translate.reset()
    setCopied(false)
  }

  const handleCopy = () => {
    if (!resultText) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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
            onPress={() => (picked && !deepLinked ? setPicked(null) : router.back())}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
            accessibilityLabel={picked ? 'Back to list' : 'Go back'}
            accessibilityRole="button"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-xl font-bold text-spaceCadet-900 flex-1"
          >
            {picked ? picked.name ?? 'Item' : 'AI Multilingual Studio'}
          </Text>
        </View>

        {/* Mode toggle */}
        {!picked && (
          <View className="flex-row gap-2 mt-3.5">
            {(
              [
                { key: 'description', label: 'Product Copy', icon: <Languages size={13} color="white" /> },
                { key: 'message', label: 'WhatsApp Broadcast', icon: <MessageSquareText size={13} color="white" /> },
              ] as const
            ).map((m) => {
              const active = mode === m.key
              return (
                <AnimatedPressable
                  key={m.key}
                  onPress={() => switchMode(m.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl py-2.5 border ${
                    active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                  }`}
                >
                  {active && m.icon}
                  <Text
                    className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
                  >
                    {m.label}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        )}
      </View>

      {!picked ? (
        <View className="flex-1">
          <View className="bg-white border-b border-lavender-200 px-5 py-3 flex-row items-center gap-2.5">
            <Search size={16} color="#928EB2" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={mode === 'description' ? 'Search design name or SKU…' : 'Filter campaigns…'}
              placeholderTextColor="#928EB2"
              className="flex-1 text-sm font-bold text-spaceCadet-900"
            />
          </View>
          <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
            <LinearGradient
              colors={['#231F48', '#560A39']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="rounded-3xl p-5 mb-4 shadow-sm"
            >
              <View className="flex-row items-center gap-2 mb-1.5">
                {mode === 'description' ? (
                  <Languages size={18} color="#BB3F95" />
                ) : (
                  <Megaphone size={18} color="#BB3F95" />
                )}
                <Text
                  style={{ fontFamily: 'Marcellus_400Regular' }}
                  className="text-white text-base font-bold"
                >
                  {mode === 'description'
                    ? 'Regional Catalog Descriptions'
                    : 'Vernacular WhatsApp Messages'}
                </Text>
              </View>
              <Text className="text-lavender-200 text-xs leading-relaxed mt-1 font-medium">
                {mode === 'description'
                  ? 'Generate high-converting luxury product descriptions in Hindi, Hinglish, Tamil, Telugu, Marathi, Gujarati or Bengali — from design attributes.'
                  : 'Rewrite WhatsApp broadcasts in regional languages. All {{placeholders}} are preserved to auto-fill at send time.'}
              </Text>
            </LinearGradient>

            {mode === 'description'
              ? productsQuery.isLoading || campaignsQuery.isLoading
                ? (
                  <View className="items-center py-10">
                    <ActivityIndicator color="#BB3F95" />
                  </View>
                )
                : products.length === 0
                  ? (
                    <View className="items-center py-10">
                      <Languages size={32} color="#BB3F95" />
                      <Text className="text-xs text-heliotrope-500 mt-3 text-center max-w-[260px] font-medium">
                        No available designs found. Pick a product to translate its description.
                      </Text>
                    </View>
                  )
                  : (
                    <View className="gap-2.5">
                      {products.map((p) => (
                        <AnimatedPressable
                          key={p.id}
                          onPress={() => setPicked({ id: p.id, name: p.name })}
                          accessibilityRole="button"
                          className="bg-white rounded-3xl p-4 border border-lavender-200 flex-row items-center shadow-sm"
                        >
                          <View
                            className="w-10 h-10 rounded-2xl items-center justify-center mr-3 bg-lavender-100 border border-lavender-200"
                          >
                            <Languages size={18} color="#BB3F95" />
                          </View>
                          <View className="flex-1 mr-2">
                            <Text
                              style={{ fontFamily: 'Marcellus_400Regular' }}
                              className="text-base font-bold text-spaceCadet-900"
                              numberOfLines={1}
                            >
                              {p.name ?? 'Unnamed design'}
                            </Text>
                          </View>
                          <ChevronRight size={16} color="#928EB2" />
                        </AnimatedPressable>
                      ))}
                    </View>
                  )
              : campaignsQuery.isLoading
                ? (
                  <View className="items-center py-10">
                    <ActivityIndicator color="#BB3F95" />
                  </View>
                )
                : campaigns.length === 0
                  ? (
                    <View className="items-center py-10">
                      <Megaphone size={32} color="#BB3F95" />
                      <Text className="text-xs text-heliotrope-500 mt-3 text-center max-w-[260px] font-medium">
                        No campaigns yet. Create one in Campaigns, then translate its message here.
                      </Text>
                    </View>
                  )
                  : (
                    <View className="gap-2.5">
                      {campaigns
                        .filter((c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))
                        .map((c) => (
                          <AnimatedPressable
                            key={c.id}
                            onPress={() => {
                              setPicked({ id: c.id, name: c.name, message: c.message_template })
                              setMessageInput(c.message_template)
                            }}
                            accessibilityRole="button"
                            className="bg-white rounded-3xl p-4 border border-lavender-200 flex-row items-center shadow-sm"
                          >
                            <View
                              className="w-10 h-10 rounded-2xl items-center justify-center mr-3 bg-lavender-100 border border-lavender-200"
                            >
                              <Megaphone size={18} color="#BB3F95" />
                            </View>
                            <View className="flex-1 mr-2">
                              <Text
                                style={{ fontFamily: 'Marcellus_400Regular' }}
                                className="text-base font-bold text-spaceCadet-900"
                                numberOfLines={1}
                              >
                                {c.name}
                              </Text>
                              <Text className="text-xs text-heliotrope-500 font-medium mt-0.5" numberOfLines={1}>
                                {c.message_template}
                              </Text>
                            </View>
                            <ChevronRight size={16} color="#928EB2" />
                          </AnimatedPressable>
                        ))}
                    </View>
                  )}
          </ScrollView>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Editable message source (campaign mode) */}
          {mode === 'message' && (
            <View className="bg-white rounded-3xl p-5 border border-lavender-200 mb-4 shadow-sm">
              <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-2">
                Original Message
              </Text>
              <TextInput
                value={messageInput}
                onChangeText={setMessageInput}
                placeholder="Write the WhatsApp message…"
                placeholderTextColor="#928EB2"
                className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 min-h-[95px]"
                multiline
                maxLength={2000}
                textAlignVertical="top"
              />
              <Text className="text-[11px] text-heliotrope-400 font-medium mt-2 leading-relaxed">
                {'{{name}}, {{shop}}, {{link}} and {{festival}} placeholders are preserved by the AI.'}
              </Text>
            </View>
          )}

          {/* Language picker */}
          <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider px-1 mb-2.5">
            Target Language
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {TRANSLATE_LANGUAGES.map((l) => {
              const active = language === l.key
              return (
                <AnimatedPressable
                  key={l.key}
                  onPress={() => {
                    setLanguage(l.key as TranslateLanguage)
                    translate.reset()
                    setCopied(false)
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`px-4 py-2 rounded-full border ${
                    active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'border-lavender-200 bg-lavender-50'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
                  >
                    {l.label}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>

          {/* Generate */}
          <GradientButton
            label={
              translate.isPending
                ? 'Writing Translation…'
                : resultText
                  ? 'Regenerate Translation'
                  : mode === 'description'
                    ? '✨ Generate Luxury Description'
                    : '✨ Translate Broadcast'
            }
            onPress={() => {
              if (mode === 'message' && !messageInput.trim()) {
                showError(new Error('Write a message to translate first.'), 'Missing message')
                return
              }
              translate.mutate()
            }}
            loading={translate.isPending}
            icon={
              translate.isPending ? undefined : (
                mode === 'description' ? (
                  <Languages size={16} color="white" />
                ) : (
                  <MessageSquareText size={16} color="white" />
                )
              )
            }
          />
          {cached && (
            <Text className="text-xs text-fuchsia-700 font-bold mt-2 text-center">
              Reused saved copy for this language — zero latency.
            </Text>
          )}

          {/* Result */}
          {resultText && (
            <View className="bg-white rounded-3xl p-5 border border-lavender-200 mt-4 shadow-sm">
              <View className="flex-row items-center justify-between mb-2.5 pb-2 border-b border-lavender-100">
                <Text
                  style={{ fontFamily: 'Marcellus_400Regular' }}
                  className="text-sm font-bold text-spaceCadet-900"
                >
                  {mode === 'description' ? 'Generated Description' : 'Translated Message'} ·{' '}
                  {TRANSLATE_LANGUAGES.find((l) => l.key === language)?.label}
                </Text>
                <AnimatedPressable
                  onPress={handleCopy}
                  hitSlop={8}
                  accessibilityLabel="Copy text"
                  accessibilityRole="button"
                  className="flex-row items-center gap-1 bg-fuchsia-500/10 px-3 py-1 rounded-full border border-fuchsia-500/20"
                >
                  {copied ? (
                    <Check size={12} color="#16a34a" />
                  ) : (
                    <Copy size={12} color="#BB3F95" />
                  )}
                  <Text
                    className={`text-xs font-bold ${copied ? 'text-emerald-700' : 'text-fuchsia-700'}`}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </AnimatedPressable>
              </View>
              <Text className="text-xs text-spaceCadet-900 leading-relaxed font-medium">{resultText}</Text>
            </View>
          )}

          <Text className="text-[11px] text-heliotrope-400 mt-4 text-center leading-relaxed font-medium">
            {mode === 'description'
              ? 'Generated from the product’s name, category, colour, fabric and sizes.'
              : 'Paste the translated message back into your broadcast campaign.'}
          </Text>
        </ScrollView>
      )}
    </View>
  )
}
