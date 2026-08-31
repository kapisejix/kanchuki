import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Languages, X } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { productApi } from '../../src/lib/api'
import {
  growthApi,
  type AudienceSpec,
  type CampaignType,
  type CustomerLeadSource,
} from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

const TYPE_OPTIONS: { key: CampaignType; label: string; hint: string }[] = [
  { key: 'FESTIVAL', label: 'Festival', hint: 'Diwali, Navratri, Onam…' },
  { key: 'REACTIVATION', label: 'Reactivation', hint: 'Win back inactive customers' },
  { key: 'PROMOTION', label: 'Promotion', hint: 'Offer or discount blast' },
  { key: 'AB_TEST', label: 'A/B Test', hint: 'Compare two messages' },
]

const LEAD_SOURCES: { key: CustomerLeadSource; label: string }[] = [
  { key: 'MANUAL', label: 'Manual' },
  { key: 'QR_SCAN', label: 'QR scan' },
  { key: 'REFERRAL', label: 'Referral' },
  { key: 'CAMPAIGN', label: 'Campaign' },
  { key: 'STORE_SCAN', label: 'Store scan' },
]

// Template placeholders the backend fills at send time.
const PLACEHOLDERS: { token: string; hint: string }[] = [
  { token: '{{name}}', hint: "customer's first name" },
  { token: '{{shop}}', hint: 'your shop name' },
  { token: '{{link}}', hint: 'your storefront link' },
  { token: '{{festival}}', hint: 'festival name (festival campaigns)' },
  { token: '{{offer}}', hint: 'offer text' },
]

// Pre-built message templates, picked by campaign type/occasion — retailer
// taps one to populate the textarea, then edits from there.
const MESSAGE_TEMPLATES: Record<CampaignType, { label: string; text: string }[]> = {
  FESTIVAL: [
    {
      label: 'Festive collection',
      text: 'Happy {{festival}} {{name}}! 🪔 Our new festive collection is here. Browse at {{link}} — exclusive styles for you.',
    },
    {
      label: 'Festive offer',
      text: '{{festival}} special for you, {{name}}! 🎉 {{offer}} at {{shop}}. Shop the collection: {{link}}',
    },
    {
      label: 'Festive invite',
      text: '{{name}}, {{festival}} is here! ✨ Visit {{shop}} or browse online: {{link}}',
    },
  ],
  REACTIVATION: [
    {
      label: 'We miss you',
      text: 'Hi {{name}}, we miss you at {{shop}}! Fresh arrivals just landed. Take a look: {{link}}',
    },
    {
      label: 'Welcome back offer',
      text: '{{name}}, it\'s been a while! Come back to {{shop}} — {{offer}} waiting for you: {{link}}',
    },
  ],
  PROMOTION: [
    {
      label: 'Offer blast',
      text: 'Special offer for you {{name}}! {{offer}} at {{shop}}. Shop now: {{link}}',
    },
    {
      label: 'Limited time',
      text: '{{name}}, don\'t miss out! {{offer}} at {{shop}} — for a limited time only. {{link}}',
    },
  ],
  AB_TEST: [
    { label: 'New arrivals', text: 'Hi {{name}}, new styles just arrived at {{shop}}: {{link}}' },
  ],
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
      <Text
        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
        className="text-base font-bold text-spaceCadet-900 mb-3.5"
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

function Label({ text }: { text: string }) {
  return <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5 mt-3">{text}</Text>
}

function Chip({
  label,
  active,
  onPress,
  color,
}: {
  label: string
  active: boolean
  onPress: () => void
  color?: string
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`px-4 py-2 rounded-2xl border ${
        active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'border-lavender-200 bg-lavender-50'
      }`}
      style={active && color ? { backgroundColor: color, borderColor: color } : undefined}
    >
      <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}>
        {label}
      </Text>
    </AnimatedPressable>
  )
}

function InlineToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <AnimatedPressable
      onPress={() => onChange(!value)}
      accessibilityRole="button"
      accessibilityState={{ selected: value }}
      className="flex-row items-center justify-between py-2.5"
    >
      <View className="flex-1 pr-3">
        <Text className="text-sm font-bold text-spaceCadet-900">{label}</Text>
        <Text className="text-xs text-heliotrope-500 mt-0.5 font-medium">{hint}</Text>
      </View>
      <View
        className="w-11 h-6 rounded-full items-center justify-center px-0.5"
        style={{ backgroundColor: value ? '#BB3F95' : '#E0E1F6' }}
      >
        <View
          className="w-5 h-5 rounded-full bg-white shadow-sm"
          style={{ alignSelf: value ? 'flex-end' : 'flex-start' }}
        />
      </View>
    </AnimatedPressable>
  )
}

export default function CampaignFormScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ id?: string; type?: string; inactive_days?: string }>()
  const editingId = params.id
  const isEdit = !!editingId

  // ── Form state ──
  const [type, setType] = useState<CampaignType>(
    (['FESTIVAL', 'REACTIVATION', 'PROMOTION', 'AB_TEST'] as const).includes(
      params.type as CampaignType,
    )
      ? (params.type as CampaignType)
      : 'REACTIVATION',
  )
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  // Cursor tracking so placeholder taps insert at the cursor, not just append.
  const messageSelectionRef = useRef({ start: 0, end: 0 })
  const [messageSelection, setMessageSelection] = useState<{ start: number; end: number } | undefined>(undefined)
  // Numeric auto-increment festival id (admin-managed calendar).
  const [festivalId, setFestivalId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Audience
  const [allAudience, setAllAudience] = useState(false)
  const [colorsStr, setColorsStr] = useState('')
  const [stylesStr, setStylesStr] = useState('')
  const [fabricsStr, setFabricsStr] = useState('')
  const [minSpent, setMinSpent] = useState('')
  const [maxBudget, setMaxBudget] = useState('')
  const [inactiveDays, setInactiveDays] = useState(
    params.inactive_days ? String(params.inactive_days) : '60',
  )
  const [neverPurchased, setNeverPurchased] = useState(false)
  const [sources, setSources] = useState<CustomerLeadSource[]>([])

  // A/B — variant collections (roadmap S) + stagger
  const [abA, setAbA] = useState({ label: '', message: '', pct: '50', products: [] as string[], delay: '' })
  const [abB, setAbB] = useState({ label: '', message: '', pct: '50', products: [] as string[], delay: '' })
  const [variantPicker, setVariantPicker] = useState<'A' | 'B' | null>(null)

  // Edit mode — prefill from the existing campaign.
  const { data: existingData, isLoading: existingLoading } = useQuery({
    queryKey: ['growth', 'campaign', editingId],
    queryFn: () => growthApi.campaign(editingId!),
    enabled: isEdit,
  })
  const existing = existingData?.data

  useEffect(() => {
    if (!existing) return
    setType(existing.type)
    setName(existing.name)
    setMessage(existing.message_template)
    setFestivalId(existing.festival_id)
    const a = existing.audience_json ?? {}
    setAllAudience(!!a.all)
    setColorsStr((a.colors ?? []).join(', '))
    setStylesStr((a.styles ?? []).join(', '))
    setFabricsStr((a.fabrics ?? []).join(', '))
    setMinSpent(a.min_total_spent_paise ? String(a.min_total_spent_paise / 100) : '')
    setMaxBudget(a.max_budget_paise ? String(a.max_budget_paise / 100) : '')
    setInactiveDays(a.inactive_days ? String(a.inactive_days) : '60')
    setNeverPurchased(!!a.never_purchased)
    setSources(a.sources ?? [])
    if (existing.ab_variants?.length === 2) {
      setAbA({
        label: existing.ab_variants[0].label,
        message: existing.ab_variants[0].message_template,
        pct: String(existing.ab_variants[0].send_pct),
        products: existing.ab_variants[0].product_ids ?? [],
        delay: existing.ab_variants[0].send_delay_min ? String(existing.ab_variants[0].send_delay_min) : '',
      })
      setAbB({
        label: existing.ab_variants[1].label,
        message: existing.ab_variants[1].message_template,
        pct: String(existing.ab_variants[1].send_pct),
        products: existing.ab_variants[1].product_ids ?? [],
        delay: existing.ab_variants[1].send_delay_min ? String(existing.ab_variants[1].send_delay_min) : '',
      })
    }
  }, [existing])

  const { data: festivalsData } = useQuery({
    queryKey: ['growth', 'festivals', 'upcoming'],
    queryFn: () => growthApi.festivals(true),
    enabled: type === 'FESTIVAL',
  })
  const festivals = festivalsData?.data ?? []

  // Products for the A/B collection picker (roadmap S). The modal keeps a
  // working Set locally and only commits it to the variant on Done.
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set())
  const pickerProductsQuery = useQuery({
    queryKey: ['products', 'list', 'ab-picker'],
    queryFn: () => productApi.list({ status: 'AVAILABLE', limit: 50 }),
    enabled: variantPicker !== null,
  })
  const pickerProducts = (pickerProductsQuery.data?.data ?? []) as { id: string; category: string | null; primary_photo_url: string | null }[]
  const activeVariantState = variantPicker === 'A' ? abA : variantPicker === 'B' ? abB : null
  const activeVariantSet = variantPicker === 'A' ? setAbA : variantPicker === 'B' ? setAbB : null

  const openPicker = (key: 'A' | 'B') => {
    const current = key === 'A' ? abA.products : abB.products
    setPickerSelection(new Set(current))
    setVariantPicker(key)
  }

  const commitPicker = () => {
    if (!variantPicker || !activeVariantSet || !activeVariantState) return
    activeVariantSet({ ...activeVariantState, products: [...pickerSelection] })
    setVariantPicker(null)
  }

  const splitList = (raw: string) =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

  const buildAudience = (): AudienceSpec => {
    if (allAudience) return { all: true }
    const audience: AudienceSpec = {}
    const colorsList = splitList(colorsStr)
    const stylesList = splitList(stylesStr)
    const fabricsList = splitList(fabricsStr)
    if (colorsList.length) audience.colors = colorsList
    if (stylesList.length) audience.styles = stylesList
    if (fabricsList.length) audience.fabrics = fabricsList
    const min = Math.round((parseFloat(minSpent) || 0) * 100)
    const max = Math.round((parseFloat(maxBudget) || 0) * 100)
    if (min > 0) audience.min_total_spent_paise = min
    if (max > 0) audience.max_budget_paise = max
    if (type === 'REACTIVATION' && inactiveDays) {
      audience.inactive_days = Math.max(1, Math.min(3650, parseInt(inactiveDays, 10) || 60))
    }
    if (neverPurchased) audience.never_purchased = true
    if (sources.length) audience.sources = sources
    return audience
  }

  const insertPlaceholder = (token: string) => {
    const { start, end } = messageSelectionRef.current
    setMessage((prev) => prev.slice(0, start) + token + prev.slice(end))
    const pos = start + token.length
    messageSelectionRef.current = { start: pos, end: pos }
    setMessageSelection({ start: pos, end: pos })
  }

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing info', 'Give the campaign a name.')
      return
    }
    if (!message.trim() && type !== 'AB_TEST') {
      Alert.alert('Missing info', 'Write a message template for the campaign.')
      return
    }
    if (type === 'FESTIVAL' && !festivalId) {
      Alert.alert('Missing info', 'Pick a festival for the campaign.')
      return
    }
    if (type === 'AB_TEST') {
      const pctA = parseInt(abA.pct, 10) || 0
      const pctB = parseInt(abB.pct, 10) || 0
      if (!abA.label.trim() || !abB.label.trim() || !abA.message.trim() || !abB.message.trim()) {
        Alert.alert('Missing info', 'Both A/B variants need a label and a message.')
        return
      }
      if (pctA + pctB !== 100) {
        Alert.alert('Invalid split', 'The A/B split must total 100%.')
        return
      }
    }
    if (!allAudience && !sources.length && !splitList(colorsStr).length && !splitList(stylesStr).length && !splitList(fabricsStr).length && !minSpent && !maxBudget && !neverPurchased && type !== 'REACTIVATION') {
      Alert.alert('Missing audience', 'Pick at least one audience filter, or send to everyone.')
      return
    }

    const payload = {
      type,
      name: name.trim(),
      message_template: type === 'AB_TEST' ? abA.message.trim() : message.trim(),
      audience: buildAudience(),
      ...(type === 'FESTIVAL' && festivalId ? { festival_id: festivalId } : {}),
      ...(type === 'AB_TEST'
        ? {
            ab_variants: [
              {
                label: abA.label.trim(),
                message_template: abA.message.trim(),
                send_pct: parseInt(abA.pct, 10),
                product_ids: abA.products,
                send_delay_min: abA.delay ? parseInt(abA.delay, 10) : undefined,
              },
              {
                label: abB.label.trim(),
                message_template: abB.message.trim(),
                send_pct: parseInt(abB.pct, 10),
                product_ids: abB.products,
                send_delay_min: abB.delay ? parseInt(abB.delay, 10) : undefined,
              },
            ],
          }
        : {}),
    }

    setSaving(true)
    try {
      const res = isEdit
        ? await growthApi.updateCampaign(editingId, payload)
        : await growthApi.createCampaign(payload)
      await queryClient.invalidateQueries({ queryKey: ['growth'] })
      const created = res.data
      router.replace(`/growth/campaign/${created.id}`)
    } catch (err) {
      showError(err, isEdit ? 'Failed to update campaign' : 'Failed to create campaign')
      setSaving(false)
    }
  }

  if (isEdit && existingLoading) {
    return (
      <View className="flex-1 bg-ink-50 items-center justify-center">
        <ActivityIndicator color={primaryColor} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#F8F7FC]"
    >
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-5 pb-4 bg-white border-b border-lavender-200"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            {isEdit ? (
              <ChevronLeft size={20} color="#231F48" />
            ) : (
              <X size={18} color="#231F48" />
            )}
          </AnimatedPressable>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-xl font-bold text-spaceCadet-900"
          >
            {isEdit ? 'Edit Campaign' : 'New Campaign'}
          </Text>
        </View>
        <GradientButton
          label={saving ? 'Saving…' : 'Save'}
          onPress={() => void handleSave()}
          loading={saving}
        />
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="gap-4">
          {/* Type */}
          <Section title="Campaign Type">
            <View className="flex-row flex-wrap gap-2">
              {TYPE_OPTIONS.map((t) => (
                <Chip
                  key={t.key}
                  label={t.label}
                  active={type === t.key}
                  onPress={() => {
                    setType(t.key)
                    if (t.key === 'REACTIVATION') setInactiveDays('60')
                  }}
                />
              ))}
            </View>
            <Text className="text-xs text-heliotrope-500 mt-2.5 font-medium">
              {TYPE_OPTIONS.find((t) => t.key === type)?.hint}
            </Text>
          </Section>

          {/* Festival picker */}
          {type === 'FESTIVAL' && (
            <Section title="Occasion / Festival">
              {festivals.length === 0 ? (
                <Text className="text-xs text-heliotrope-500 font-medium">
                  No upcoming festivals in the calendar yet.
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {festivals.map((f) => (
                    <Chip
                      key={f.id}
                      label={`${f.name}${f.region !== 'PAN_INDIA' ? ` · ${f.region}` : ''}`}
                      active={festivalId === f.id}
                      onPress={() => {
                        setFestivalId(f.id)
                        setName(f.name)
                      }}
                    />
                  ))}
                </View>
              )}
            </Section>
          )}

          {/* Name */}
          <Section title="Campaign Title">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Diwali collection blast"
              placeholderTextColor="#928EB2"
              className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
              maxLength={120}
            />
          </Section>

          {/* Message template */}
          {type !== 'AB_TEST' && (
            <Section title="WhatsApp Message Draft">
              <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-2">
                Quick Templates
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-3.5">
                {MESSAGE_TEMPLATES[type].map((t) => (
                  <AnimatedPressable
                    key={t.label}
                    onPress={() => {
                      setMessage(t.text)
                      messageSelectionRef.current = { start: t.text.length, end: t.text.length }
                      setMessageSelection(undefined)
                    }}
                    accessibilityRole="button"
                    className="px-3.5 py-2 rounded-2xl border border-lavender-200 bg-lavender-50"
                  >
                    <Text className="text-xs font-bold text-spaceCadet-900">{t.label}</Text>
                  </AnimatedPressable>
                ))}
              </View>
              <TextInput
                value={message}
                onChangeText={(t) => {
                  setMessage(t)
                  setMessageSelection(undefined)
                }}
                onSelectionChange={(e) => {
                  messageSelectionRef.current = e.nativeEvent.selection
                  setMessageSelection(undefined)
                }}
                selection={messageSelection}
                placeholder="Write the WhatsApp message…"
                placeholderTextColor="#928EB2"
                className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 min-h-[105px]"
                multiline
                maxLength={2000}
                textAlignVertical="top"
              />
              <Text className="text-xs text-heliotrope-500 mt-2 font-medium">
                Place your cursor where you want it, then tap a placeholder below to insert it.
              </Text>
              <View className="flex-row flex-wrap gap-2 mt-2.5">
                {PLACEHOLDERS.map((p) => (
                  <AnimatedPressable
                    key={p.token}
                    onPress={() => insertPlaceholder(p.token)}
                    accessibilityRole="button"
                    accessibilityLabel={`Insert ${p.token}`}
                    className="px-3 py-1.5 rounded-xl bg-lavender-100 border border-lavender-200"
                  >
                    <Text className="text-xs font-bold text-fuchsia-700">{p.token}</Text>
                  </AnimatedPressable>
                ))}
              </View>
              <View className="mt-3.5 bg-lavender-50 rounded-2xl p-3.5 border border-lavender-200">
                <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider mb-1">
                  Message Preview
                </Text>
                <Text className="text-xs text-spaceCadet-900 leading-relaxed font-medium">
                  {message.trim()
                    ? message
                        .replace(/\{\{\s*name\s*\}\}/g, 'Priya')
                        .replace(/\{\{\s*shop\s*\}\}/g, 'Your Store')
                        .replace(/\{\{\s*link\s*\}\}/g, 'kanchuki.app/c/yourstore')
                        .replace(/\{\{\s*festival\s*\}\}/g, 'Diwali')
                        .replace(/\{\{\s*offer\s*\}\}/g, '20% off')
                    : 'Your message preview appears here…'}
                </Text>
              </View>
              <AnimatedPressable
                onPress={() =>
                  router.push(
                    `/growth/translate?mode=message&campaignId=new&campaignName=${encodeURIComponent(name || 'New campaign')}&message=${encodeURIComponent(message)}`,
                  )
                }
                accessibilityRole="button"
                className="flex-row items-center justify-center gap-2 mt-3 border border-dashed border-fuchsia-400 bg-fuchsia-500/5 rounded-2xl py-2.5"
              >
                <Languages size={15} color="#BB3F95" />
                <Text className="text-fuchsia-800 text-xs font-bold">AI Multi-lingual Translate</Text>
              </AnimatedPressable>
            </Section>
          )}

          {/* A/B variants */}
          {type === 'AB_TEST' && (
            <Section title="A/B Split Test Configuration">
              <View className="gap-3.5">
                {(
                  [
                    { key: 'A' as const, state: abA, set: setAbA },
                    { key: 'B' as const, state: abB, set: setAbB },
                  ]
                ).map(({ key, state, set }) => (
                  <View key={key} className="bg-lavender-50 rounded-3xl p-4 border border-lavender-200">
                    <View className="flex-row items-center justify-between mb-2.5">
                      <View className="flex-row items-center gap-2 flex-1">
                        <View
                          className="w-7 h-7 rounded-full items-center justify-center bg-fuchsia-600"
                        >
                          <Text className="text-xs font-bold text-white">
                            {key}
                          </Text>
                        </View>
                        <TextInput
                          value={state.label}
                          onChangeText={(v) => set({ ...state, label: v })}
                          placeholder={`Variant ${key} label`}
                          placeholderTextColor="#928EB2"
                          className="text-xs font-bold text-spaceCadet-900 bg-white rounded-xl px-3 py-2 border border-lavender-200 flex-1"
                          maxLength={40}
                        />
                      </View>
                    </View>
                    <TextInput
                      value={state.message}
                      onChangeText={(v) => set({ ...state, message: v })}
                      placeholder="Message text…"
                      placeholderTextColor="#928EB2"
                      className="text-sm font-bold text-spaceCadet-900 bg-white rounded-2xl px-3.5 py-3 min-h-[75px] border border-lavender-200"
                      multiline
                      maxLength={2000}
                      textAlignVertical="top"
                    />
                    <View className="flex-row items-center gap-2 mt-2.5">
                      <Text className="text-xs font-bold text-heliotrope-500">Send to</Text>
                      <TextInput
                        value={state.pct}
                        onChangeText={(v) => set({ ...state, pct: v.replace(/\D/g, '') })}
                        placeholder="50"
                        placeholderTextColor="#928EB2"
                        keyboardType="number-pad"
                        maxLength={3}
                        className="text-xs font-bold text-spaceCadet-900 bg-white rounded-xl px-3 py-1.5 border border-lavender-200 w-16 text-center"
                      />
                      <Text className="text-xs font-bold text-heliotrope-500">% of audience</Text>
                    </View>

                    {/* Collection A/B — per-variant product set + stagger */}
                    <View className="flex-row items-center justify-between mt-3 pt-2.5 border-t border-lavender-200">
                      <Text className="text-xs font-bold text-spaceCadet-900">Collection Products</Text>
                      <AnimatedPressable
                        onPress={() => openPicker(key)}
                        accessibilityRole="button"
                        accessibilityLabel={`Pick products for variant ${key}`}
                        className="bg-white border border-lavender-200 rounded-xl px-3 py-1.5"
                      >
                        <Text className="text-xs font-bold text-fuchsia-700">
                          {state.products.length > 0
                            ? `${state.products.length} selected · Edit`
                            : 'Pick products'}
                        </Text>
                      </AnimatedPressable>
                    </View>
                    <View className="flex-row items-center gap-2 mt-2">
                      <Text className="text-xs font-bold text-heliotrope-500">Send after</Text>
                      <TextInput
                        value={state.delay}
                        onChangeText={(v) => set({ ...state, delay: v.replace(/\D/g, '') })}
                        placeholder="0"
                        placeholderTextColor="#928EB2"
                        keyboardType="number-pad"
                        maxLength={4}
                        className="text-xs font-bold text-spaceCadet-900 bg-white rounded-xl px-3 py-1.5 border border-lavender-200 w-16 text-center"
                      />
                      <Text className="text-xs font-bold text-heliotrope-500">min (stagger delay)</Text>
                    </View>
                  </View>
                ))}
                <View className="flex-row items-center justify-between px-1">
                  <Text className="text-xs text-heliotrope-500 font-medium">Split must total 100%</Text>
                  <Text className="text-xs font-bold text-spaceCadet-900">
                    {((parseInt(abA.pct, 10) || 0) + (parseInt(abB.pct, 10) || 0))}%
                  </Text>
                </View>
              </View>
            </Section>
          )}

          {/* A/B product picker modal */}
          <Modal
            visible={variantPicker !== null}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setVariantPicker(null)}
          >
            <View className="flex-1 bg-[#F8F7FC]">
              <View
                className="flex-row items-center justify-between px-5 pb-4 pt-5 bg-white border-b border-lavender-200"
                style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
              >
                <Text
                  style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                  className="text-lg font-bold text-spaceCadet-900"
                >
                  Variant {variantPicker} · Products
                </Text>
                <GradientButton
                  label={`Done (${pickerSelection.size})`}
                  onPress={commitPicker}
                />
              </View>
              <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
                <Text className="text-xs text-heliotrope-500 mb-3.5 leading-relaxed font-medium">
                  Each variant can point customers at a different set of products. Tap to select.
                </Text>
                {pickerProductsQuery.isLoading ? (
                  <View className="items-center py-10">
                    <ActivityIndicator color="#BB3F95" />
                  </View>
                ) : pickerProducts.length === 0 ? (
                  <Text className="text-sm text-heliotrope-500 text-center py-10 font-medium">
                    No available products. Add products first.
                  </Text>
                ) : (
                  <View className="gap-2.5">
                    {pickerProducts.map((p) => {
                      const selected = pickerSelection.has(p.id)
                      return (
                        <AnimatedPressable
                          key={p.id}
                          onPress={() => {
                            setPickerSelection((prev) => {
                              const next = new Set(prev)
                              if (next.has(p.id)) next.delete(p.id)
                              else next.add(p.id)
                              return next
                            })
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          className={`flex-row items-center bg-white rounded-2xl p-3.5 border ${
                            selected ? 'border-fuchsia-600 shadow-sm' : 'border-lavender-200'
                          }`}
                        >
                          <View
                            className={`w-6 h-6 rounded-lg border items-center justify-center mr-3 ${
                              selected ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-lavender-300'
                            }`}
                          >
                            {selected && <Text className="text-white text-xs font-bold">✓</Text>}
                          </View>
                          <Text
                            className={`text-sm flex-1 ${selected ? 'font-bold text-spaceCadet-900' : 'text-heliotrope-500 font-medium'}`}
                            numberOfLines={1}
                          >
                            {p.category ?? 'Product'}
                          </Text>
                          {selected && (
                            <Text className="text-xs font-bold text-fuchsia-700">
                              #{[...pickerSelection].indexOf(p.id) + 1}
                            </Text>
                          )}
                        </AnimatedPressable>
                      )
                    })}
                  </View>
                )}
              </ScrollView>
            </View>
          </Modal>

          {/* Audience */}
          <Section title="Target Audience">
            <InlineToggle
              label="All consented customers"
              hint="Ignore filters below and message everyone who opted in"
              value={allAudience}
              onChange={setAllAudience}
            />

            {!allAudience && (
              <View className="mt-1">
                {type === 'REACTIVATION' && (
                  <>
                    <Label text="Inactive for (days)" />
                    <View className="flex-row gap-2">
                      {['30', '60', '90', '180'].map((d) => (
                        <Chip
                          key={d}
                          label={`${d} days`}
                          active={inactiveDays === d}
                          onPress={() => setInactiveDays(d)}
                        />
                      ))}
                      <TextInput
                        value={inactiveDays}
                        onChangeText={(v) => setInactiveDays(v.replace(/\D/g, ''))}
                        placeholder="Custom"
                        placeholderTextColor="#928EB2"
                        keyboardType="number-pad"
                        maxLength={4}
                        className="text-xs font-bold text-spaceCadet-900 bg-lavender-50 rounded-2xl px-3 py-2 border border-lavender-200 w-24"
                      />
                    </View>
                    <Text className="text-xs text-heliotrope-500 mt-1.5 font-medium">
                      Customers with no view/enquiry in this window.
                    </Text>
                  </>
                )}

                <Label text="Prefers colours (comma separated)" />
                <TextInput
                  value={colorsStr}
                  onChangeText={setColorsStr}
                  placeholder="pink, black, navy blue"
                  placeholderTextColor="#928EB2"
                  className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                />

                <Label text="Prefers styles (comma separated)" />
                <TextInput
                  value={stylesStr}
                  onChangeText={setStylesStr}
                  placeholder="saree, suit, kurti"
                  placeholderTextColor="#928EB2"
                  className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                />

                <Label text="Prefers fabrics (comma separated)" />
                <TextInput
                  value={fabricsStr}
                  onChangeText={setFabricsStr}
                  placeholder="cotton, silk, georgette"
                  placeholderTextColor="#928EB2"
                  className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                />

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Label text="Min. lifetime spend (₹)" />
                    <TextInput
                      value={minSpent}
                      onChangeText={(v) => setMinSpent(v.replace(/[^\d.]/g, ''))}
                      placeholder="2000"
                      placeholderTextColor="#928EB2"
                      keyboardType="decimal-pad"
                      className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                    />
                  </View>
                  <View className="flex-1">
                    <Label text="Max budget (₹)" />
                    <TextInput
                      value={maxBudget}
                      onChangeText={(v) => setMaxBudget(v.replace(/[^\d.]/g, ''))}
                      placeholder="5000"
                      placeholderTextColor="#928EB2"
                      keyboardType="decimal-pad"
                      className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                    />
                  </View>
                </View>

                <View className="mt-1">
                  <InlineToggle
                    label="Never purchased"
                    hint="Only customers who've never bought"
                    value={neverPurchased}
                    onChange={setNeverPurchased}
                  />
                </View>

                <Label text="Lead source" />
                <View className="flex-row flex-wrap gap-2">
                  {LEAD_SOURCES.map((s) => {
                    const active = sources.includes(s.key)
                    return (
                      <Chip
                        key={s.key}
                        label={s.label}
                        active={active}
                        onPress={() =>
                          setSources((prev) =>
                            active ? prev.filter((x) => x !== s.key) : [...prev, s.key],
                          )
                        }
                      />
                    )
                  })}
                </View>
                <Text className="text-xs text-heliotrope-500 mt-1.5 font-medium">
                  e.g. QR scan = customers who scanned your store QR.
                </Text>
              </View>
            )}
          </Section>

          {/* Save */}
          <View className="mt-2">
            <GradientButton
              label={isEdit ? 'Save Changes' : 'Create Campaign'}
              onPress={() => void handleSave()}
              loading={saving}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
