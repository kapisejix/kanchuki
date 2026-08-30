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
    <ScrollView className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-5 pb-3 bg-white border-b border-lavender-200"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <AnimatedPressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <X size={20} color="#231F48" />
        </AnimatedPressable>
        <Text
          style={{
            fontFamily: 'Marcellus_400Regular',
            fontSize: 16,
            lineHeight: 24,
            letterSpacing: 0.32,
            fontWeight: '800',
          }}
          className="text-base leading-6 tracking-[0.02em] font-extrabold text-spaceCadet-900 font-marcellus"
        >
          Customer Profile
        </Text>
        <AnimatedPressable
          onPress={() => void handleSave()}
          disabled={saving}
          className="bg-spaceCadet-900 px-4 py-2 rounded-2xl"
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-bold text-xs uppercase tracking-wider">Save</Text>
          )}
        </AnimatedPressable>
      </View>

      <View className="px-4 py-4 gap-4">
        {/* Identity */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <View className="flex-row items-center gap-3.5 mb-4">
            <View className="w-14 h-14 rounded-2xl bg-[#560A39] items-center justify-center border border-[#BB3F95]/30 flex-shrink-0">
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-[#E0E1F6] font-bold text-xl"
              >
                {name.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
            <View className="flex-1">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Customer name"
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-lg font-bold text-spaceCadet-900"
                placeholderTextColor="#928EB2"
              />
              <Text className="text-xs text-heliotrope-500 mt-0.5 font-medium">{customer.phone}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com (optional)"
                placeholderTextColor="#928EB2"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="text-xs text-heliotrope-500 mt-0.5"
              />
            </View>
          </View>

          {/* Address fields */}
          <View className="border-t border-lavender-200 pt-3 gap-3">
            <TextInput
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="Shop/Home address (optional)"
              placeholderTextColor="#928EB2"
              className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
            />
            <View className="flex-row gap-3">
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor="#928EB2"
                className="flex-1 text-sm font-bold text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
              />
              <TextInput
                value={state}
                onChangeText={setState}
                placeholder="State"
                placeholderTextColor="#928EB2"
                className="flex-1 text-sm font-bold text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
              />
            </View>
          </View>
        </View>

        {/* Purchase summary */}
        <View className="flex-row gap-3">
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm items-center">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-2xl font-bold text-spaceCadet-900"
            >
              {customer.total_purchases}
            </Text>
            <Text className="text-xs text-heliotrope-500 font-bold uppercase tracking-wider mt-0.5">Purchases</Text>
          </View>
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm items-center">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-2xl font-bold text-spaceCadet-900"
            >
              {formatPrice(customer.total_spent)}
            </Text>
            <Text className="text-xs text-heliotrope-500 font-bold uppercase tracking-wider mt-0.5">Total Spent</Text>
          </View>
        </View>

        {/* Fashion DNA — AI Match Section */}
        {matchedProducts.length > 0 && (
          <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
            <View className="flex-row items-center justify-between mb-3.5">
              <View className="flex-row items-center gap-2">
                <Heart size={16} color="#BB3F95" />
                <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wide">
                  AI Match & Fashion DNA
                </Text>
                {dnaUsed && (
                  <View className="bg-fuchsia-500/15 border border-fuchsia-500/30 px-2 py-0.5 rounded-full">
                    <Text className="text-[10px] text-fuchsia-700 font-bold">DNA</Text>
                  </View>
                )}
              </View>
              <AnimatedPressable
                onPress={() => void handleAutoSuggestCollection()}
                disabled={generatingCollection}
                className="flex-row items-center gap-1 bg-fuchsia-600 px-3.5 py-1.5 rounded-full shadow-sm"
              >
                {generatingCollection ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Sparkles size={12} color="white" />
                    <Text className="text-white text-xs font-bold">Create Collection</Text>
                  </>
                )}
              </AnimatedPressable>
            </View>

            {/* Top matched products — horizontal scroll */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 py-1">
              {matchedProducts.map((product) => (
                <AnimatedPressable
                  key={product.id}
                  onPress={() => router.push(`/product/${product.id}`)}
                  className="mr-3 w-32"
                >
                  <View className="bg-lavender-50 rounded-2xl overflow-hidden border border-lavender-200">
                    {product.primary_photo_url ? (
                      <Image
                        source={{ uri: product.primary_photo_url }}
                        className="w-full h-32"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="w-full h-32 bg-lavender-100 items-center justify-center">
                        <Text className="text-heliotrope-400 text-xs">No photo</Text>
                      </View>
                    )}
                    <View className="p-2 gap-0.5">
                      <Text className="text-xs font-semibold text-spaceCadet-900 truncate" numberOfLines={1}>
                        {product.category ?? 'Product'}
                      </Text>
                      {product.price_min != null && (
                        <Text
                          style={{ fontFamily: 'Marcellus_400Regular' }}
                          className="text-xs font-bold text-spaceCadet-900"
                        >
                          {formatPrice(product.price_min)}
                        </Text>
                      )}
                      {product.suggested_size && (
                        <View
                          className="mt-1 self-start rounded-full px-2 py-0.5 bg-fuchsia-500/15 border border-fuchsia-500/30"
                        >
                          <Text className="text-[9px] font-bold text-fuchsia-700">
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
              <View className="flex-row items-center gap-2 mt-2 pt-2 border-t border-lavender-200">
                <Text className="text-[10px] text-heliotrope-500 font-medium">
                  {customer.fashion_dna.interaction_count} interactions · {(customer.fashion_dna.confidence_score * 100).toFixed(0)}% AI confidence
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Preferred colors — free text */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-3">
            Preferred Colors
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {prefColors.map((c) => (
              <AnimatedPressable
                key={c}
                onPress={() => setPrefColors((prev) => prev.filter((x) => x !== c))}
                className="bg-spaceCadet-900 px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5 shadow-sm"
                accessibilityLabel={`Remove ${c}`}
                accessibilityRole="button"
              >
                <Text className="text-white text-xs font-bold">{c}</Text>
                <X size={12} color="white" />
              </AnimatedPressable>
            ))}
          </View>
          <View className="flex-row gap-2">
            <TextInput
              value={colorInput}
              onChangeText={setColorInput}
              onSubmitEditing={addColor}
              placeholder="e.g. Rani Pink, Maroon, Mustard"
              placeholderTextColor="#928EB2"
              className="flex-1 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900"
            />
            <AnimatedPressable
              onPress={addColor}
              className="bg-spaceCadet-900 px-4 rounded-2xl items-center justify-center"
              accessibilityLabel="Add color"
              accessibilityRole="button"
            >
              <Plus size={18} color="white" />
            </AnimatedPressable>
          </View>
        </View>

        {/* Preferred styles */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-3">
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
                  className={`px-3.5 py-2 rounded-2xl border flex-row items-center gap-1.5 ${
                    selected ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-lavender-50 border-lavender-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-spaceCadet-900'}`}>{s.name}</Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Preferred fabrics */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-3">
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
                  className={`px-3.5 py-2 rounded-2xl border flex-row items-center gap-1.5 ${
                    selected ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-lavender-50 border-lavender-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-spaceCadet-900'}`}>{f.name}</Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Usual size — roadmap N quick capture */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-1">
            Usual Size
          </Text>
          <Text className="text-[11px] text-heliotrope-500 font-medium mb-3">
            Used to recommend sizes on products this customer browses.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {SIZE_OPTIONS.map((s) => {
              const selected = usualSize === s
              return (
                <AnimatedPressable
                  key={s}
                  onPress={() => setUsualSize(selected ? null : s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`w-12 h-12 rounded-full border items-center justify-center ${
                    selected
                      ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm'
                      : 'bg-white border-lavender-200'
                  }`}
                >
                  <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-spaceCadet-900'}`}>
                    {s}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Budget */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2.5">
            Budget Range (₹)
          </Text>
          <View className="flex-row gap-3">
            <TextInput
              value={budgetMin}
              onChangeText={setBudgetMin}
              placeholder="Min"
              keyboardType="numeric"
              placeholderTextColor="#928EB2"
              className="flex-1 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900"
            />
            <TextInput
              value={budgetMax}
              onChangeText={setBudgetMax}
              placeholder="Max"
              keyboardType="numeric"
              placeholderTextColor="#928EB2"
              className="flex-1 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900"
            />
          </View>
        </View>

        {/* Measurements */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <View className="flex-row items-center justify-between mb-3.5">
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
              Measurements
            </Text>
            <View className="flex-row gap-2">
              <AnimatedPressable
                onPress={() => setShowManualForm(true)}
                className="flex-row items-center gap-1 bg-lavender-100 border border-lavender-200 px-3 py-1 rounded-full"
              >
                <Text className="text-spaceCadet-900 text-xs font-bold">Manual</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => router.push(`/customer/${customer.id}/measurement`)}
                className="flex-row items-center gap-1 bg-fuchsia-500/15 border border-fuchsia-500/30 px-3 py-1 rounded-full"
              >
                <Ruler size={12} color="#BB3F95" />
                <Text className="text-fuchsia-700 text-xs font-bold">Camera</Text>
              </AnimatedPressable>
            </View>
          </View>

          {measurements.length === 0 ? (
            <Text className="text-xs text-heliotrope-500 font-medium">No measurements recorded yet.</Text>
          ) : (
            <View className="gap-2">
              {measurements.slice(0, 3).map((m) => (
                <View key={m.id} className="bg-lavender-50 border border-lavender-200 rounded-2xl p-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5">
                      <View className={`px-2 py-0.5 rounded-full ${m.source === 'PHOTO' ? 'bg-fuchsia-500/20' : 'bg-spaceCadet-900/15'}`}>
                        <Text className={`text-[10px] font-bold ${m.source === 'PHOTO' ? 'text-fuchsia-700' : 'text-spaceCadet-900'}`}>
                          {m.source === 'PHOTO' ? 'AI CAM' : 'TAPE'}
                        </Text>
                      </View>
                      <Text className="text-[10px] text-heliotrope-500 font-medium">
                        {new Date(m.created_at).toLocaleDateString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-xs font-bold text-spaceCadet-900 mt-1.5">
                    Height {m.height_cm}cm
                    {m.bust_cm ? ` · Bust ${m.bust_cm}cm` : ''}
                    {m.waist_cm ? ` · Waist ${m.waist_cm}cm` : ''}
                    {m.hip_cm ? ` · Hip ${m.hip_cm}cm` : ''}
                  </Text>
                  {m.source === 'PHOTO' && !m.bust_cm && (
                    <Text className="text-[10px] text-fuchsia-600 mt-1 font-medium">AI Processing...</Text>
                  )}
                </View>
              ))}
              {measurements.length > 3 && (
                <Text className="text-[10px] text-heliotrope-500 text-center font-medium">
                  +{measurements.length - 3} more
                </Text>
              )}
            </View>
          )}

          {(upperSize || lowerSize) && (
            <View className="flex-row gap-2 mt-3 pt-3 border-t border-lavender-200">
              {upperSize && (
                <View className="bg-lavender-50 border border-lavender-200 rounded-2xl p-3 flex-1">
                  <Text className="text-[10px] text-heliotrope-500 font-bold uppercase tracking-wider">Upper Size</Text>
                  <Text
                    style={{ fontFamily: 'Marcellus_400Regular' }}
                    className="text-base font-bold text-spaceCadet-900 mt-0.5"
                  >
                    {upperSize.size_label}
                  </Text>
                </View>
              )}
              {lowerSize && (
                <View className="bg-lavender-50 border border-lavender-200 rounded-2xl p-3 flex-1">
                  <Text className="text-[10px] text-heliotrope-500 font-bold uppercase tracking-wider">Lower Size</Text>
                  <Text
                    style={{ fontFamily: 'Marcellus_400Regular' }}
                    className="text-base font-bold text-spaceCadet-900 mt-0.5"
                  >
                    {lowerSize.size_label}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Recent activity */}
        {customer.interactions.length > 0 && (
          <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-3">
              Recent Activity
            </Text>
            <View className="gap-2.5">
              {customer.interactions.slice(0, 8).map((i) => (
                <View key={i.id} className="flex-row items-center gap-2">
                  <Clock size={13} color="#928EB2" />
                  <Text className="text-xs text-spaceCadet-900 font-semibold flex-1">
                    {i.type}
                    {i.product ? ` · ${i.product.category ?? ''} ${i.product.primary_color ?? ''}` : ''}
                  </Text>
                  <Text className="text-[10px] text-heliotrope-500 font-medium">
                    {new Date(i.created_at).toLocaleDateString('en-IN')}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
            Store Notes (private)
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={`e.g. "likes bright colors", "buying for daughter's wedding"`}
            multiline
            numberOfLines={3}
            className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
            placeholderTextColor="#928EB2"
          />
        </View>

        {/* Delete */}
        <AnimatedPressable
          onPress={handleDelete}
          className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border border-red-200 bg-red-50/70"
        >
          <Trash2 size={16} color="#dc2626" />
          <Text className="text-red-700 font-bold text-xs uppercase tracking-wider">Delete Customer</Text>
        </AnimatedPressable>
      </View>

      {/* ── Manual Measurement Modal ─────────────────────────────── */}
      <Modal
        visible={showManualForm}
        animationType="slide"
        {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' } : {})}
        onRequestClose={() => setShowManualForm(false)}
      >
        <View className="flex-1 bg-[#F8F7FC]" style={{ paddingTop: insets.top + 16 }}>
          {/* Modal Header */}
          <View className="flex-row items-center justify-between px-5 pb-4 border-b border-lavender-200 bg-white">
            <AnimatedPressable
              onPress={() => setShowManualForm(false)}
              className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={20} color="#231F48" />
            </AnimatedPressable>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-base font-bold text-spaceCadet-900"
            >
              Manual Measurements
            </Text>
            <AnimatedPressable
              onPress={() => void handleSaveManualMeasurement()}
              disabled={savingManual}
              className="bg-spaceCadet-900 px-4 py-2 rounded-2xl"
            >
              {savingManual ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-bold text-xs uppercase tracking-wider">Save</Text>
              )}
            </AnimatedPressable>
          </View>

          <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
            {/* Height — required */}
            <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-3">
              <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
                Height (cm) *
              </Text>
              <TextInput
                value={manualHeight}
                onChangeText={setManualHeight}
                placeholder="e.g. 162"
                keyboardType="numeric"
                className="text-lg font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                placeholderTextColor="#928EB2"
              />
            </View>

            {/* Upper body */}
            <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-3">
              <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-3">
                Upper Body (cm, optional)
              </Text>
              <View className="gap-3">
                <View>
                  <Text className="text-xs font-bold text-heliotrope-500 mb-1">Bust</Text>
                  <TextInput
                    value={manualBust}
                    onChangeText={setManualBust}
                    placeholder="e.g. 92"
                    keyboardType="numeric"
                    className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                    placeholderTextColor="#928EB2"
                  />
                </View>
                <View>
                  <Text className="text-xs font-bold text-heliotrope-500 mb-1">Waist</Text>
                  <TextInput
                    value={manualWaist}
                    onChangeText={setManualWaist}
                    placeholder="e.g. 76"
                    keyboardType="numeric"
                    className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                    placeholderTextColor="#928EB2"
                  />
                </View>
                <View>
                  <Text className="text-xs font-bold text-heliotrope-500 mb-1">Hip</Text>
                  <TextInput
                    value={manualHip}
                    onChangeText={setManualHip}
                    placeholder="e.g. 100"
                    keyboardType="numeric"
                    className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                    placeholderTextColor="#928EB2"
                  />
                </View>
              </View>
            </View>

            {/* Lower body */}
            <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-3">
              <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-3">
                Lower Body (cm, optional)
              </Text>
              <View className="gap-3">
                <View>
                  <Text className="text-xs font-bold text-heliotrope-500 mb-1">Pant Waist</Text>
                  <TextInput
                    value={manualPantWaist}
                    onChangeText={setManualPantWaist}
                    placeholder="e.g. 78"
                    keyboardType="numeric"
                    className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                    placeholderTextColor="#928EB2"
                  />
                </View>
                <View>
                  <Text className="text-xs font-bold text-heliotrope-500 mb-1">Pant Hip</Text>
                  <TextInput
                    value={manualPantHip}
                    onChangeText={setManualPantHip}
                    placeholder="e.g. 102"
                    keyboardType="numeric"
                    className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                    placeholderTextColor="#928EB2"
                  />
                </View>
                <View>
                  <Text className="text-xs font-bold text-heliotrope-500 mb-1">Inseam</Text>
                  <TextInput
                    value={manualInseam}
                    onChangeText={setManualInseam}
                    placeholder="e.g. 78"
                    keyboardType="numeric"
                    className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
                    placeholderTextColor="#928EB2"
                  />
                </View>
              </View>
            </View>

            <View className="bg-lavender-100 rounded-2xl p-3.5 border border-lavender-200 mb-6">
              <Text className="text-xs text-heliotrope-500 font-medium leading-relaxed">
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
