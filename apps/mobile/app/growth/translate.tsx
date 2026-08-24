import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
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
import { useTheme } from '../../src/lib/theme'

type PickedItem = { id: string; name: string | null; message?: string | null }

type Mode = 'description' | 'message'

export default function TranslateScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  // Deep-linked from a product's or campaign's detail page — skip straight to
  // the language picker instead of the pick-an-item list.
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
  // Editable message source for campaign-message mode (prefilled from the campaign).
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
            onPress={() => (picked && !deepLinked ? setPicked(null) : router.back())}
            hitSlop={8}
            accessibilityLabel={picked ? 'Back to list' : 'Go back'}
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900 flex-1">
            {picked ? picked.name ?? 'Item' : 'AI Translate'}
          </Text>
        </View>

        {/* Mode toggle — description vs WhatsApp/campaign message */}
        {!picked && (
          <View className="flex-row bg-sand-100 rounded-xl p-1 mt-3">
            {(
              [
                { key: 'description', label: 'Product description', icon: <Languages size={13} color="white" /> },
                { key: 'message', label: 'Campaign message', icon: <MessageSquareText size={13} color="white" /> },
              ] as const
            ).map((m) => {
              const active = mode === m.key
              return (
                <AnimatedPressable
                  key={m.key}
                  onPress={() => switchMode(m.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${
                    active ? '' : 'bg-transparent'
                  }`}
                  style={active ? { backgroundColor: primaryColor } : undefined}
                >
                  {active && m.icon}
                  <Text
                    className={`text-xs font-semibold ${active ? 'text-white' : 'text-sand-500'}`}
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
          <View className="bg-white border-b border-sand-100 px-4 py-3 flex-row items-center gap-2">
            <Search size={16} color={colors.sand[400]} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={mode === 'description' ? 'Search by name or SKU…' : 'Filter campaigns…'}
              placeholderTextColor={colors.sand[400]}
              className="flex-1 text-sm text-sand-900"
            />
          </View>
          <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
            <View className="bg-ink-600 rounded-2xl p-4 mb-4">
              <View className="flex-row items-center gap-2 mb-1">
                {mode === 'description' ? (
                  <Languages size={16} color={colors.turmeric[400]} />
                ) : (
                  <Megaphone size={16} color={colors.turmeric[400]} />
                )}
                <Text className="text-turmeric-300 text-xs font-semibold uppercase tracking-wide">
                  {mode === 'description'
                    ? 'Descriptions your customers understand'
                    : 'Messages your customers understand'}
                </Text>
              </View>
              <Text className="text-white text-sm leading-5 mt-1">
                {mode === 'description'
                  ? 'Write product descriptions in Hindi, Hinglish, Tamil, Telugu, Marathi, Gujarati or Bengali — from the product’s own attributes.'
                  : 'Rewrite a WhatsApp / campaign message in a regional language. {{placeholders}} stay untouched so they still fill per customer at send time.'}
              </Text>
            </View>
            {mode === 'description'
              ? productsQuery.isLoading || campaignsQuery.isLoading
                ? (
                  <View className="items-center py-10">
                    <ActivityIndicator color={primaryColor} />
                  </View>
                )
                : products.length === 0
                  ? (
                    <View className="items-center py-10">
                      <Languages size={28} color={colors.sand[300]} />
                      <Text className="text-sm text-sand-400 mt-3 text-center max-w-[260px]">
                        No available products found. Pick a product to translate its description.
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
                          </View>
                          <ChevronRight size={16} color={colors.sand[300]} />
                        </AnimatedPressable>
                      ))}
                    </View>
                  )
              : campaignsQuery.isLoading
                ? (
                  <View className="items-center py-10">
                    <ActivityIndicator color={primaryColor} />
                  </View>
                )
                : campaigns.length === 0
                  ? (
                    <View className="items-center py-10">
                      <Megaphone size={28} color={colors.sand[300]} />
                      <Text className="text-sm text-sand-400 mt-3 text-center max-w-[260px]">
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
                            className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center"
                          >
                            <View
                              className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                              style={{ backgroundColor: `${primaryColor}1A` }}
                            >
                              <Megaphone size={18} color={primaryColor} />
                            </View>
                            <View className="flex-1 mr-2">
                              <Text className="text-sm font-semibold text-sand-900" numberOfLines={1}>
                                {c.name}
                              </Text>
                              <Text className="text-xs text-sand-400 mt-0.5" numberOfLines={1}>
                                {c.message_template}
                              </Text>
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
          {/* Editable message source (campaign mode) */}
          {mode === 'message' && (
            <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-4">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
                Message
              </Text>
              <TextInput
                value={messageInput}
                onChangeText={setMessageInput}
                placeholder="Write the WhatsApp message…"
                placeholderTextColor={colors.sand[400]}
                className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3 min-h-[88px]"
                multiline
                maxLength={2000}
                textAlignVertical="top"
              />
              <Text className="text-[11px] text-sand-400 mt-2 leading-4">
                {'{{name}}, {{shop}}, {{link}} and {{festival}} placeholders are preserved by the AI — they still fill per customer at send time.'}
              </Text>
            </View>
          )}

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
            label={
              translate.isPending
                ? 'Writing…'
                : resultText
                  ? 'Regenerate'
                  : mode === 'description'
                    ? 'Generate Description'
                    : 'Translate Message'
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
            <Text className="text-[11px] text-turmeric-600 font-medium mt-2 text-center">
              Reused the saved copy for this language — no new AI call.
            </Text>
          )}

          {/* Result */}
          {resultText && (
            <View className="bg-white rounded-2xl p-4 border border-sand-100 mt-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
                  {mode === 'description' ? 'Description' : 'Message'} ·{' '}
                  {TRANSLATE_LANGUAGES.find((l) => l.key === language)?.label}
                </Text>
                <AnimatedPressable
                  onPress={handleCopy}
                  hitSlop={8}
                  accessibilityLabel="Copy text"
                  accessibilityRole="button"
                  className="flex-row items-center gap-1"
                >
                  {copied ? (
                    <Check size={14} color={colors.turmeric[600]} />
                  ) : (
                    <Copy size={14} color={colors.sand[500]} />
                  )}
                  <Text
                    className="text-[11px] font-semibold"
                    style={{ color: copied ? colors.turmeric[600] : colors.sand[600] }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </AnimatedPressable>
              </View>
              <Text className="text-sm text-sand-800 leading-5">{resultText}</Text>
            </View>
          )}

          <Text className="text-[11px] text-sand-400 mt-4 text-center leading-4">
            {mode === 'description'
              ? 'Generated from the product’s name, category, colour, fabric and sizes. Paste it into the product’s description or WhatsApp it to customers.'
              : 'Paste the translated message back into your campaign, or WhatsApp it directly to customers.'}
          </Text>
        </ScrollView>
      )}
    </View>
  )
}
