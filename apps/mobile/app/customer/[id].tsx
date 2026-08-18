import { useEffect, useState } from 'react'
import { formatPrice, COLORS, SIZE_OPTIONS } from '@kanchuki/shared'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Check, Plus, Trash2, Ruler, Clock, Heart, Sparkles } from 'lucide-react-native'
import { customerApi, sizeChartApi, collectionApi, productAttributeApi } from '../../src/lib/api'
import { DetailScreenSkeleton } from '../../src/components/Skeleton'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

type Interaction = {
  id: string
  type: string
  created_at: string
  product: { category: string | null; primary_color: string | null } | null
}
type Customer = {
  id: string
  name: string
  phone: string
  email: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  pref_colors: string[]
  pref_styles: string[]
  pref_fabrics: string[]
  budget_min: number | null
  budget_max: number | null
  usual_size: string | null
  notes: string | null
  total_purchases: number
  total_spent: number
  interactions: Interaction[]
  fashion_dna: {
    color_affinities: Record<string, number>
    style_affinities: Record<string, number>
    confidence_score: number
    interaction_count: number
  } | null
}
type Measurement = {
  id: string
  source: 'MANUAL' | 'PHOTO'
  height_cm: number
  bust_cm: number | null
  waist_cm: number | null
  hip_cm: number | null
  confidence_score: number | null
  photo_deleted_at: string | null
  created_at: string
}
type MatchedProduct = {
  id: string
  category: string | null
  primary_color: string | null
  price_min: number | null
  price_max: number | null
  status: string
  primary_photo_url: string | null
  search_tags: string[]
  /** Roadmap N — suggested size from usual size / purchase history / chart. */
  suggested_size: string | null
  size_basis: string | null
}

export default function CustomerDetailScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [generatingCollection, setGeneratingCollection] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => customerApi.get(id),
  })
  const customer = (data as { data: Customer } | undefined)?.data

  const { data: measurementsData } = useQuery({
    queryKey: ['customers', id, 'measurements'],
    queryFn: () => customerApi.getMeasurements(id),
  })
  const measurements = (measurementsData as { data: Measurement[] } | undefined)?.data ?? []
  const hasMeasurement = measurements.length > 0

  // Recommended size per category
  const { data: upperSize } = useQuery({
    queryKey: ['customers', id, 'recommend', 'UPPER'],
    queryFn: () => sizeChartApi.recommend(id, 'UPPER').then((r) => r.data).catch(() => null),
    enabled: hasMeasurement,
  })
  const { data: lowerSize } = useQuery({
    queryKey: ['customers', id, 'recommend', 'LOWER'],
    queryFn: () => sizeChartApi.recommend(id, 'LOWER').then((r) => r.data).catch(() => null),
    enabled: hasMeasurement,
  })

  // AI-matched products (Fashion DNA — Phase 1)
  const { data: matchesData } = useQuery({
    queryKey: ['customers', id, 'matches'],
    queryFn: () => customerApi.getMatches(id, { limit: 6 }),
    enabled: !!customer,
    staleTime: 60_000,
  })
  const matches = (matchesData as { data: { products: MatchedProduct[]; dna_used: boolean } } | undefined)?.data
  const matchedProducts = matches?.products ?? []
  const dnaUsed = matches?.dna_used ?? false

  // Dynamic, retailer-editable Style/Fabric taxonomy (DB-backed, same lists
  // the product-add screen uses — no hardcoded option lists).
  const { data: stylesData } = useQuery({
    queryKey: ['attributes', 'STYLE'],
    queryFn: () => productAttributeApi.list('STYLE'),
  })
  const styleOptions = stylesData?.data ?? []
  const { data: fabricsData } = useQuery({
    queryKey: ['attributes', 'FABRIC'],
    queryFn: () => productAttributeApi.list('FABRIC'),
  })
  const fabricOptions = fabricsData?.data ?? []

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [notes, setNotes] = useState('')
  const [colorInput, setColorInput] = useState('')
  const [prefColors, setPrefColors] = useState<string[]>([])
  const [prefStyles, setPrefStyles] = useState<string[]>([])
  const [prefFabrics, setPrefFabrics] = useState<string[]>([])
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [usualSize, setUsualSize] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Manual measurement entry ────────────────────────────────────
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualHeight, setManualHeight] = useState('')
  const [manualBust, setManualBust] = useState('')
  const [manualWaist, setManualWaist] = useState('')
  const [manualHip, setManualHip] = useState('')
  const [manualPantWaist, setManualPantWaist] = useState('')
  const [manualPantHip, setManualPantHip] = useState('')
  const [manualInseam, setManualInseam] = useState('')
  const [savingManual, setSavingManual] = useState(false)

  const handleSaveManualMeasurement = async () => {
    const heightNum = parseFloat(manualHeight)
    if (!heightNum || heightNum < 50 || heightNum > 250) {
      Alert.alert('Height required', 'Enter a valid height between 50–250 cm.')
      return
    }
    setSavingManual(true)
    try {
      if (!customer) return
      await customerApi.createManualMeasurement(customer.id, {
        height_cm: heightNum,
        bust_cm: manualBust ? parseFloat(manualBust) : undefined,
        waist_cm: manualWaist ? parseFloat(manualWaist) : undefined,
        hip_cm: manualHip ? parseFloat(manualHip) : undefined,
        pant_waist_cm: manualPantWaist ? parseFloat(manualPantWaist) : undefined,
        pant_hip_cm: manualPantHip ? parseFloat(manualPantHip) : undefined,
        inseam_cm: manualInseam ? parseFloat(manualInseam) : undefined,
      })
      void queryClient.invalidateQueries({ queryKey: ['customers', id, 'measurements'] })
      setShowManualForm(false)
      setManualHeight('')
      setManualBust('')
      setManualWaist('')
      setManualHip('')
      setManualPantWaist('')
      setManualPantHip('')
      setManualInseam('')
      Alert.alert('Saved', 'Manual measurements recorded.')
    } catch (err) {
      showError(err, 'Failed to save measurements')
    } finally {
      setSavingManual(false)
    }
  }

  useEffect(() => {
    if (!customer) return
    setName(customer.name)
    setEmail(customer.email ?? '')
    setAddressLine1(customer.address_line1 ?? '')
    setCity(customer.city ?? '')
    setState(customer.state ?? '')
    setNotes(customer.notes ?? '')
    setPrefColors(customer.pref_colors ?? [])
    setPrefStyles(customer.pref_styles ?? [])
    setPrefFabrics(customer.pref_fabrics ?? [])
    setBudgetMin(customer.budget_min ? String(customer.budget_min / 100) : '')
    setBudgetMax(customer.budget_max ? String(customer.budget_max / 100) : '')
    setUsualSize(customer.usual_size ?? null)
  }, [customer])

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  const addColor = () => {
    const trimmed = colorInput.trim()
    if (!trimmed || prefColors.includes(trimmed)) return
    setPrefColors((prev) => [...prev, trimmed])
    setColorInput('')
  }

  const handleSave = async () => {
    if (!customer) return
    setSaving(true)
    try {
      await customerApi.update(customer.id, {
        name,
        email: email || undefined,
        address_line1: addressLine1.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        notes: notes || undefined,
        pref_colors: prefColors,
        pref_styles: prefStyles,
        pref_fabrics: prefFabrics,
        budget_min: budgetMin ? Math.round(parseFloat(budgetMin) * 100) : undefined,
        budget_max: budgetMax ? Math.round(parseFloat(budgetMax) * 100) : undefined,
        usual_size: usualSize ?? undefined,
      })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      Alert.alert('Saved', 'Customer updated.')
    } catch (err) {
      showError(err, 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!customer) return
    Alert.alert('Delete Customer', 'This removes them from your CRM. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await customerApi.delete(customer.id)
            void queryClient.invalidateQueries({ queryKey: ['customers'] })
            router.back()
          } catch (err) {
            showError(err, 'Failed to delete customer')
          }
        },
      },
    ])
  }

  const handleAutoSuggestCollection = async () => {
    if (!customer) return
    setGeneratingCollection(true)
    try {
      const result = await collectionApi.autoSuggest(customer.id, `AI Picks for ${customer.name}`)
      const collectionData = result.data as { url?: string; slug?: string }
      if (collectionData.url) {
        Alert.alert(
          'Collection Created!',
          `AI collection "${customer.name}'s AI Picks" created with products matched to their preferences.`,
          [
            { text: 'OK', style: 'default' },
          ],
        )
        void queryClient.invalidateQueries({ queryKey: ['customers', id, 'matches'] })
      } else {
        Alert.alert('Not enough data', "We need more customer preferences and product interactions to suggest a collection. Add their color/style/fabric preferences and record their activity.")
      }
    } catch (err) {
      showError(err, 'Failed to generate collection')
    } finally {
      setGeneratingCollection(false)
    }
  }

  if (isLoading || !customer) {
    return <DetailScreenSkeleton withPhoto={false} />
  }

  return (
    <ScrollView className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <AnimatedPressable onPress={() => router.back()} accessibilityLabel="Close" accessibilityRole="button">
          <X size={22} color={colors.sand[700]} />
        </AnimatedPressable>
        <Text className="text-base font-bold text-sand-900">Customer</Text>
        <AnimatedPressable
          onPress={() => void handleSave()}
          disabled={saving}
          className="bg-ink-600 px-4 py-2 rounded-xl"
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-semibold text-sm">Save</Text>
          )}
        </AnimatedPressable>
      </View>

      <View className="px-4 py-4 gap-4">
        {/* Identity */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-14 h-14 rounded-full bg-ink-100 items-center justify-center">
              <Text className="text-ink-700 font-bold text-xl">
                {name.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
            <View className="flex-1">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Customer name"
                className="text-base font-bold text-sand-900"
                placeholderTextColor={colors.sand[400]}
              />
              <Text className="text-xs text-sand-400 mt-0.5">{customer.phone}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com (optional)"
                placeholderTextColor={colors.sand[400]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="text-xs text-sand-500 mt-0.5"
              />
            </View>
          </View>

          {/* Address fields */}
          <View className="border-t border-sand-100 pt-3 gap-3">
            <TextInput
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="Shop/Home address (optional)"
              placeholderTextColor={colors.sand[400]}
              className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2"
            />
            <View className="flex-row gap-3">
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor={colors.sand[400]}
                className="flex-1 text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2"
              />
              <TextInput
                value={state}
                onChangeText={setState}
                placeholder="State"
                placeholderTextColor={colors.sand[400]}
                className="flex-1 text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2"
              />
            </View>
          </View>
        </View>

        {/* Purchase summary */}
        <View className="flex-row gap-3">
          <View className="flex-1 bg-white rounded-2xl p-3 border border-sand-100 items-center">
            <Text className="text-lg font-bold text-sand-900">{customer.total_purchases}</Text>
            <Text className="text-xs text-sand-400">Purchases</Text>
          </View>
          <View className="flex-1 bg-white rounded-2xl p-3 border border-sand-100 items-center">
            <Text className="text-lg font-bold text-sand-900">{formatPrice(customer.total_spent)}</Text>
            <Text className="text-xs text-sand-400">Total Spent</Text>
          </View>
        </View>

        {/* Fashion DNA — AI Match Section */}
        {matchedProducts.length > 0 && (
          <View className="bg-white rounded-2xl p-4 border border-sand-100">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <Heart size={16} color={colors.rust[500]} />
                <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
                  AI Match
                </Text>
                {dnaUsed && (
                  <View className="bg-fuchsia-100 px-2 py-0.5 rounded-full">
                    <Text className="text-[10px] text-fuchsia-700 font-semibold">DNA</Text>
                  </View>
                )}
              </View>
              <AnimatedPressable
                onPress={() => void handleAutoSuggestCollection()}
                disabled={generatingCollection}
                className="flex-row items-center gap-1 bg-fuchsia-600 px-3 py-1.5 rounded-full"
              >
                {generatingCollection ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Sparkles size={12} color="white" />
                    <Text className="text-white text-xs font-semibold">Create Collection</Text>
                  </>
                )}
              </AnimatedPressable>
            </View>

            {/* Top matched products — horizontal scroll */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              {matchedProducts.map((product) => (
                <AnimatedPressable
                  key={product.id}
                  onPress={() => router.push(`/product/${product.id}`)}
                  className="mr-2 w-28"
                >
                  <View className="bg-sand-50 rounded-xl overflow-hidden border border-sand-100">
                    {product.primary_photo_url ? (
                      <Image
                        source={{ uri: product.primary_photo_url }}
                        className="w-full h-28"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="w-full h-28 bg-ink-100 items-center justify-center">
                        <Text className="text-ink-400 text-xs">No photo</Text>
                      </View>
                    )}
                    <View className="px-2 py-1.5">
                      <Text className="text-xs font-semibold text-sand-900" numberOfLines={1}>
                        {product.category ?? 'Product'}
                      </Text>
                      {product.price_min != null && (
                        <Text className="text-[10px] text-sand-500">
                          {formatPrice(product.price_min)}
                        </Text>
                      )}
                      {product.suggested_size && (
                        <View
                          className="mt-1 self-start rounded-full px-2 py-0.5"
                          style={{ backgroundColor: `${primaryColor}1A` }}
                        >
                          <Text className="text-[9px] font-bold" style={{ color: primaryColor }}>
                            Size {product.suggested_size}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </AnimatedPressable>
              ))}
            </ScrollView>

            {customer.fashion_dna && (
              <View className="flex-row items-center gap-2 mt-2">
                <Text className="text-[10px] text-sand-400">
                  {customer.fashion_dna.interaction_count} interactions · {(customer.fashion_dna.confidence_score * 100).toFixed(0)}% confidence
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Preferred colors — free text */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Preferred Colors
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {prefColors.map((c) => (
              <AnimatedPressable
                key={c}
                onPress={() => setPrefColors((prev) => prev.filter((x) => x !== c))}
                className="bg-ink-600 px-3 py-1.5 rounded-full flex-row items-center gap-1"
                accessibilityLabel={`Remove ${c}`}
                accessibilityRole="button"
              >
                <Text className="text-white text-xs font-medium">{c}</Text>
                <X size={10} color="white" />
              </AnimatedPressable>
            ))}
          </View>
          <View className="flex-row gap-2">
            <TextInput
              value={colorInput}
              onChangeText={setColorInput}
              onSubmitEditing={addColor}
              placeholder="e.g. Maroon"
              placeholderTextColor={colors.sand[400]}
              className="flex-1 bg-ink-50 border border-sand-200 rounded-xl px-3 py-2 text-sm"
            />
            <AnimatedPressable
              onPress={addColor}
              className="bg-sand-100 px-3 rounded-xl items-center justify-center"
              accessibilityLabel="Add color"
              accessibilityRole="button"
            >
              <Plus size={16} color={colors.sand[700]} />
            </AnimatedPressable>
          </View>
        </View>

        {/* Preferred styles */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Preferred Style
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {styleOptions.map((s) => {
              const selected = prefStyles.includes(s.name)
              return (
                <AnimatedPressable
                  key={s.id}
                  onPress={() => toggle(prefStyles, setPrefStyles, s.name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>{s.name}</Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Preferred fabrics */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Preferred Fabrics
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {fabricOptions.map((f) => {
              const selected = prefFabrics.includes(f.name)
              return (
                <AnimatedPressable
                  key={f.id}
                  onPress={() => toggle(prefFabrics, setPrefFabrics, f.name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>{f.name}</Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Usual size — roadmap N quick capture */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1">
            Usual Size
          </Text>
          <Text className="text-[11px] text-sand-400 mb-2.5">
            Used to recommend sizes on products this customer browses.
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {SIZE_OPTIONS.map((s) => {
              const selected = usualSize === s
              return (
                <AnimatedPressable
                  key={s}
                  onPress={() => setUsualSize(selected ? null : s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-2.5 py-1.5 rounded-lg border ${selected ? 'border-ink-600' : 'border-sand-200 bg-white'}`}
                  style={selected ? { backgroundColor: primaryColor } : undefined}
                >
                  <Text className={`text-[11px] font-semibold ${selected ? 'text-white' : 'text-sand-600'}`}>
                    {s}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Budget */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
            Budget Range (₹)
          </Text>
          <View className="flex-row gap-3">
            <TextInput
              value={budgetMin}
              onChangeText={setBudgetMin}
              placeholder="Min"
              keyboardType="numeric"
              placeholderTextColor={colors.sand[400]}
              className="flex-1 bg-ink-50 border border-sand-200 rounded-xl px-3 py-2 text-sm"
            />
            <TextInput
              value={budgetMax}
              onChangeText={setBudgetMax}
              placeholder="Max"
              keyboardType="numeric"
              placeholderTextColor={colors.sand[400]}
              className="flex-1 bg-ink-50 border border-sand-200 rounded-xl px-3 py-2 text-sm"
            />
          </View>
        </View>

        {/* Measurements */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              Measurements
            </Text>
            <View className="flex-row gap-1.5">
              <AnimatedPressable
                onPress={() => setShowManualForm(true)}
                className="flex-row items-center gap-1 bg-turmeric-50 px-2.5 py-1 rounded-full"
              >
                <Text className="text-turmeric-700 text-xs font-semibold">Manual</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => router.push(`/customer/${customer.id}/measurement`)}
                className="flex-row items-center gap-1 bg-ink-50 px-2.5 py-1 rounded-full"
              >
                <Ruler size={12} color={primaryColor} />
                <Text className="text-ink-700 text-xs font-semibold">Camera</Text>
              </AnimatedPressable>
            </View>
          </View>

          {measurements.length === 0 ? (
            <Text className="text-xs text-sand-400">No measurements recorded yet.</Text>
          ) : (
            <View className="gap-2">
              {measurements.slice(0, 3).map((m) => (
                <View key={m.id} className="bg-ink-50 rounded-xl px-3 py-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5">
                      <View className={`px-2 py-0.5 rounded ${m.source === 'PHOTO' ? 'bg-ink-100' : 'bg-turmeric-100'}`}>
                        <Text className={`text-[10px] font-semibold ${m.source === 'PHOTO' ? 'text-ink-700' : 'text-turmeric-700'}`}>
                          {m.source === 'PHOTO' ? 'AI' : 'Tape'}
                        </Text>
                      </View>
                      <Text className="text-[10px] text-sand-400">
                        {new Date(m.created_at).toLocaleDateString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-xs text-sand-600 mt-1">
                    Height {m.height_cm}cm
                    {m.bust_cm ? ` · Bust ${m.bust_cm}cm` : ''}
                    {m.waist_cm ? ` · Waist ${m.waist_cm}cm` : ''}
                    {m.hip_cm ? ` · Hip ${m.hip_cm}cm` : ''}
                  </Text>
                  {m.source === 'PHOTO' && !m.bust_cm && (
                    <Text className="text-[10px] text-turmeric-600 mt-1">Processing...</Text>
                  )}
                </View>
              ))}
              {measurements.length > 3 && (
                <Text className="text-[10px] text-sand-400 text-center">
                  +{measurements.length - 3} more
                </Text>
              )}
            </View>
          )}

          {(upperSize || lowerSize) && (
            <View className="flex-row gap-2 mt-3">
              {upperSize && (
                <View className="bg-turmeric-50 rounded-xl px-3 py-2 flex-1">
                  <Text className="text-[10px] text-turmeric-700 font-semibold uppercase">Upper Size</Text>
                  <Text className="text-sm font-bold text-turmeric-800">{upperSize.size_label}</Text>
                </View>
              )}
              {lowerSize && (
                <View className="bg-turmeric-50 rounded-xl px-3 py-2 flex-1">
                  <Text className="text-[10px] text-turmeric-700 font-semibold uppercase">Lower Size</Text>
                  <Text className="text-sm font-bold text-turmeric-800">{lowerSize.size_label}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Recent activity */}
        {customer.interactions.length > 0 && (
          <View className="bg-white rounded-2xl p-4 border border-sand-100">
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
              Recent Activity
            </Text>
            <View className="gap-2">
              {customer.interactions.slice(0, 8).map((i) => (
                <View key={i.id} className="flex-row items-center gap-2">
                  <Clock size={12} color={colors.sand[400]} />
                  <Text className="text-xs text-sand-600 flex-1">
                    {i.type}
                    {i.product ? ` · ${i.product.category ?? ''} ${i.product.primary_color ?? ''}` : ''}
                  </Text>
                  <Text className="text-[10px] text-sand-400">
                    {new Date(i.created_at).toLocaleDateString('en-IN')}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
            Notes (private)
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={`e.g. "likes bright colors", "buying for daughter's wedding"`}
            multiline
            numberOfLines={2}
            className="text-sm text-sand-900"
            placeholderTextColor={colors.sand[400]}
          />
        </View>

        {/* Delete */}
        <AnimatedPressable
          onPress={handleDelete}
          className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-rust-100 bg-rust-50"
        >
          <Trash2 size={16} color={colors.rust[600]} />
          <Text className="text-rust-600 font-semibold text-sm">Delete Customer</Text>
        </AnimatedPressable>
      </View>

      {/* ── Manual Measurement Modal ─────────────────────────────── */}
      <Modal
        visible={showManualForm}
        animationType="slide"
        {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' } : {})}
        onRequestClose={() => setShowManualForm(false)}
      >
        <View className="flex-1 bg-ink-50" style={{ paddingTop: insets.top + 16 }}>
          {/* Modal Header */}
          <View className="flex-row items-center justify-between px-4 pb-4">
            <AnimatedPressable onPress={() => setShowManualForm(false)} accessibilityLabel="Close" accessibilityRole="button">
              <X size={22} color={colors.sand[700]} />
            </AnimatedPressable>
            <Text className="text-base font-bold text-sand-900">Manual Measurements</Text>
            <AnimatedPressable
              onPress={() => void handleSaveManualMeasurement()}
              disabled={savingManual}
              className="bg-turmeric-600 px-4 py-2 rounded-xl"
            >
              {savingManual ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-semibold text-sm">Save</Text>
              )}
            </AnimatedPressable>
          </View>

          <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled">
            {/* Height — required */}
            <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-3">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
                Height (cm) *
              </Text>
              <TextInput
                value={manualHeight}
                onChangeText={setManualHeight}
                placeholder="e.g. 162"
                keyboardType="numeric"
                className="text-lg font-bold text-sand-900 bg-ink-50 border border-sand-200 rounded-xl px-3 py-2"
                placeholderTextColor={colors.sand[400]}
              />
            </View>

            {/* Upper body */}
            <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-3">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
                Upper Body (cm, optional)
              </Text>
              <View className="gap-3">
                <View>
                  <Text className="text-xs text-sand-500 mb-1">Bust</Text>
                  <TextInput
                    value={manualBust}
                    onChangeText={setManualBust}
                    placeholder="e.g. 92"
                    keyboardType="numeric"
                    className="text-sm text-sand-900 bg-ink-50 border border-sand-200 rounded-xl px-3 py-2"
                    placeholderTextColor={colors.sand[400]}
                  />
                </View>
                <View>
                  <Text className="text-xs text-sand-500 mb-1">Waist</Text>
                  <TextInput
                    value={manualWaist}
                    onChangeText={setManualWaist}
                    placeholder="e.g. 76"
                    keyboardType="numeric"
                    className="text-sm text-sand-900 bg-ink-50 border border-sand-200 rounded-xl px-3 py-2"
                    placeholderTextColor={colors.sand[400]}
                  />
                </View>
                <View>
                  <Text className="text-xs text-sand-500 mb-1">Hip</Text>
                  <TextInput
                    value={manualHip}
                    onChangeText={setManualHip}
                    placeholder="e.g. 100"
                    keyboardType="numeric"
                    className="text-sm text-sand-900 bg-ink-50 border border-sand-200 rounded-xl px-3 py-2"
                    placeholderTextColor={colors.sand[400]}
                  />
                </View>
              </View>
            </View>

            {/* Lower body */}
            <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-3">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
                Lower Body (cm, optional)
              </Text>
              <View className="gap-3">
                <View>
                  <Text className="text-xs text-sand-500 mb-1">Pant Waist</Text>
                  <TextInput
                    value={manualPantWaist}
                    onChangeText={setManualPantWaist}
                    placeholder="e.g. 78"
                    keyboardType="numeric"
                    className="text-sm text-sand-900 bg-ink-50 border border-sand-200 rounded-xl px-3 py-2"
                    placeholderTextColor={colors.sand[400]}
                  />
                </View>
                <View>
                  <Text className="text-xs text-sand-500 mb-1">Pant Hip</Text>
                  <TextInput
                    value={manualPantHip}
                    onChangeText={setManualPantHip}
                    placeholder="e.g. 102"
                    keyboardType="numeric"
                    className="text-sm text-sand-900 bg-ink-50 border border-sand-200 rounded-xl px-3 py-2"
                    placeholderTextColor={colors.sand[400]}
                  />
                </View>
                <View>
                  <Text className="text-xs text-sand-500 mb-1">Inseam</Text>
                  <TextInput
                    value={manualInseam}
                    onChangeText={setManualInseam}
                    placeholder="e.g. 78"
                    keyboardType="numeric"
                    className="text-sm text-sand-900 bg-ink-50 border border-sand-200 rounded-xl px-3 py-2"
                    placeholderTextColor={colors.sand[400]}
                  />
                </View>
              </View>
            </View>

            <View className="bg-turmeric-50 rounded-2xl p-3 border border-turmeric-100 mb-6">
              <Text className="text-xs text-turmeric-700">
                Use a flexible measuring tape. Measure over light clothing. Keep tape snug but not tight.
              </Text>
            </View>

            <View className="h-8" />
          </ScrollView>
        </View>
      </Modal>

      <View className="h-12" />
    </ScrollView>
  )
}
