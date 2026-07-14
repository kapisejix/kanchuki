import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
import { customerApi, sizeChartApi, collectionApi } from '../../src/lib/api'
import { FABRIC_TYPES, OCCASION_TYPES, formatPrice } from '@kanchuki/shared'

const STYLE_OPTIONS = ['Casual', 'Party', 'Office', 'Wedding', 'Festive']

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
  pref_occasions: string[]
  budget_min: number | null
  budget_max: number | null
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
}

export default function CustomerDetailScreen() {
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
  const [prefOccasions, setPrefOccasions] = useState<string[]>([])
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
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
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save measurements')
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
    setPrefOccasions(customer.pref_occasions ?? [])
    setBudgetMin(customer.budget_min ? String(customer.budget_min / 100) : '')
    setBudgetMax(customer.budget_max ? String(customer.budget_max / 100) : '')
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
        pref_occasions: prefOccasions,
        budget_min: budgetMin ? Math.round(parseFloat(budgetMin) * 100) : undefined,
        budget_max: budgetMax ? Math.round(parseFloat(budgetMax) * 100) : undefined,
      })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      Alert.alert('Saved', 'Customer updated.')
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save')
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
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete customer')
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
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate collection')
    } finally {
      setGeneratingCollection(false)
    }
  }

  if (isLoading || !customer) {
    return (
      <View className="flex-1 bg-cyan-50 items-center justify-center">
        <ActivityIndicator color="#0891B2" />
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-cyan-50">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-gray-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <X size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">Customer</Text>
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving}
          className="bg-cyan-600 px-4 py-2 rounded-xl"
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-semibold text-sm">Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <View className="px-4 py-4 gap-4">
        {/* Identity */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-14 h-14 rounded-full bg-cyan-100 items-center justify-center">
              <Text className="text-cyan-700 font-bold text-xl">
                {name.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
            <View className="flex-1">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Customer name"
                className="text-base font-bold text-gray-900"
                placeholderTextColor="#9CA3AF"
              />
              <Text className="text-xs text-gray-400 mt-0.5">{customer.phone}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com (optional)"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="text-xs text-gray-500 mt-0.5"
              />
            </View>
          </View>

          {/* Address fields */}
          <View className="border-t border-gray-100 pt-3 gap-3">
            <TextInput
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="Shop/Home address (optional)"
              placeholderTextColor="#9CA3AF"
              className="text-sm text-gray-900 bg-gray-50 rounded-xl px-3 py-2"
            />
            <View className="flex-row gap-3">
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-sm text-gray-900 bg-gray-50 rounded-xl px-3 py-2"
              />
              <TextInput
                value={state}
                onChangeText={setState}
                placeholder="State"
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-sm text-gray-900 bg-gray-50 rounded-xl px-3 py-2"
              />
            </View>
          </View>
        </View>

        {/* Purchase summary */}
        <View className="flex-row gap-3">
          <View className="flex-1 bg-white rounded-2xl p-3 border border-gray-100 items-center">
            <Text className="text-lg font-bold text-gray-900">{customer.total_purchases}</Text>
            <Text className="text-xs text-gray-400">Purchases</Text>
          </View>
          <View className="flex-1 bg-white rounded-2xl p-3 border border-gray-100 items-center">
            <Text className="text-lg font-bold text-gray-900">{formatPrice(customer.total_spent)}</Text>
            <Text className="text-xs text-gray-400">Total Spent</Text>
          </View>
        </View>

        {/* Fashion DNA — AI Match Section */}
        {matchedProducts.length > 0 && (
          <View className="bg-white rounded-2xl p-4 border border-gray-100">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <Heart size={16} color="#EC4899" />
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  AI Match
                </Text>
                {dnaUsed && (
                  <View className="bg-fuchsia-100 px-2 py-0.5 rounded-full">
                    <Text className="text-[10px] text-fuchsia-700 font-semibold">DNA</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
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
              </TouchableOpacity>
            </View>

            {/* Top matched products — horizontal scroll */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              {matchedProducts.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  onPress={() => router.push(`/product/${product.id}`)}
                  className="mr-2 w-28"
                >
                  <View className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                    {product.primary_photo_url ? (
                      <Image
                        source={{ uri: product.primary_photo_url }}
                        className="w-full h-28"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="w-full h-28 bg-cyan-100 items-center justify-center">
                        <Text className="text-cyan-400 text-xs">No photo</Text>
                      </View>
                    )}
                    <View className="px-2 py-1.5">
                      <Text className="text-xs font-semibold text-gray-900" numberOfLines={1}>
                        {product.category ?? 'Product'}
                      </Text>
                      {product.price_min != null && (
                        <Text className="text-[10px] text-gray-500">
                          {formatPrice(product.price_min)}
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {customer.fashion_dna && (
              <View className="flex-row items-center gap-2 mt-2">
                <Text className="text-[10px] text-gray-400">
                  {customer.fashion_dna.interaction_count} interactions · {(customer.fashion_dna.confidence_score * 100).toFixed(0)}% confidence
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Preferred colors — free text */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Preferred Colors
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {prefColors.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setPrefColors((prev) => prev.filter((x) => x !== c))}
                className="bg-cyan-600 px-3 py-1.5 rounded-full flex-row items-center gap-1"
              >
                <Text className="text-white text-xs font-medium">{c}</Text>
                <X size={10} color="white" />
              </TouchableOpacity>
            ))}
          </View>
          <View className="flex-row gap-2">
            <TextInput
              value={colorInput}
              onChangeText={setColorInput}
              onSubmitEditing={addColor}
              placeholder="e.g. Maroon"
              placeholderTextColor="#9CA3AF"
              className="flex-1 bg-cyan-50 border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
            <TouchableOpacity onPress={addColor} className="bg-gray-100 px-3 rounded-xl items-center justify-center">
              <Plus size={16} color="#374151" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Preferred styles */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Preferred Style
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {STYLE_OPTIONS.map((s) => {
              const selected = prefStyles.includes(s)
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => toggle(prefStyles, setPrefStyles, s)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>{s}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Preferred fabrics */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Preferred Fabrics
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {FABRIC_TYPES.map((f) => {
              const selected = prefFabrics.includes(f)
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => toggle(prefFabrics, setPrefFabrics, f)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>{f}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Preferred occasions */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Occasions
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {OCCASION_TYPES.map((o) => {
              const selected = prefOccasions.includes(o)
              return (
                <TouchableOpacity
                  key={o}
                  onPress={() => toggle(prefOccasions, setPrefOccasions, o)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>{o}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Budget */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Budget Range (₹)
          </Text>
          <View className="flex-row gap-3">
            <TextInput
              value={budgetMin}
              onChangeText={setBudgetMin}
              placeholder="Min"
              keyboardType="numeric"
              placeholderTextColor="#9CA3AF"
              className="flex-1 bg-cyan-50 border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
            <TextInput
              value={budgetMax}
              onChangeText={setBudgetMax}
              placeholder="Max"
              keyboardType="numeric"
              placeholderTextColor="#9CA3AF"
              className="flex-1 bg-cyan-50 border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </View>
        </View>

        {/* Measurements */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Measurements
            </Text>
            <View className="flex-row gap-1.5">
              <TouchableOpacity
                onPress={() => setShowManualForm(true)}
                className="flex-row items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full"
              >
                <Text className="text-emerald-700 text-xs font-semibold">Manual</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push(`/customer/${customer.id}/measurement`)}
                className="flex-row items-center gap-1 bg-cyan-50 px-2.5 py-1 rounded-full"
              >
                <Ruler size={12} color="#0891B2" />
                <Text className="text-cyan-700 text-xs font-semibold">Camera</Text>
              </TouchableOpacity>
            </View>
          </View>

          {measurements.length === 0 ? (
            <Text className="text-xs text-gray-400">No measurements recorded yet.</Text>
          ) : (
            <View className="gap-2">
              {measurements.slice(0, 3).map((m) => (
                <View key={m.id} className="bg-cyan-50 rounded-xl px-3 py-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5">
                      <View className={`px-2 py-0.5 rounded ${m.source === 'PHOTO' ? 'bg-cyan-100' : 'bg-emerald-100'}`}>
                        <Text className={`text-[10px] font-semibold ${m.source === 'PHOTO' ? 'text-cyan-700' : 'text-emerald-700'}`}>
                          {m.source === 'PHOTO' ? 'AI' : 'Tape'}
                        </Text>
                      </View>
                      <Text className="text-[10px] text-gray-400">
                        {new Date(m.created_at).toLocaleDateString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-xs text-gray-600 mt-1">
                    Height {m.height_cm}cm
                    {m.bust_cm ? ` · Bust ${m.bust_cm}cm` : ''}
                    {m.waist_cm ? ` · Waist ${m.waist_cm}cm` : ''}
                    {m.hip_cm ? ` · Hip ${m.hip_cm}cm` : ''}
                  </Text>
                  {m.source === 'PHOTO' && !m.bust_cm && (
                    <Text className="text-[10px] text-amber-600 mt-1">Processing...</Text>
                  )}
                </View>
              ))}
              {measurements.length > 3 && (
                <Text className="text-[10px] text-gray-400 text-center">
                  +{measurements.length - 3} more
                </Text>
              )}
            </View>
          )}

          {(upperSize || lowerSize) && (
            <View className="flex-row gap-2 mt-3">
              {upperSize && (
                <View className="bg-emerald-50 rounded-xl px-3 py-2 flex-1">
                  <Text className="text-[10px] text-emerald-700 font-semibold uppercase">Upper Size</Text>
                  <Text className="text-sm font-bold text-emerald-800">{upperSize.size_label}</Text>
                </View>
              )}
              {lowerSize && (
                <View className="bg-emerald-50 rounded-xl px-3 py-2 flex-1">
                  <Text className="text-[10px] text-emerald-700 font-semibold uppercase">Lower Size</Text>
                  <Text className="text-sm font-bold text-emerald-800">{lowerSize.size_label}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Recent activity */}
        {customer.interactions.length > 0 && (
          <View className="bg-white rounded-2xl p-4 border border-gray-100">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Recent Activity
            </Text>
            <View className="gap-2">
              {customer.interactions.slice(0, 8).map((i) => (
                <View key={i.id} className="flex-row items-center gap-2">
                  <Clock size={12} color="#9CA3AF" />
                  <Text className="text-xs text-gray-600 flex-1">
                    {i.type}
                    {i.product ? ` · ${i.product.category ?? ''} ${i.product.primary_color ?? ''}` : ''}
                  </Text>
                  <Text className="text-[10px] text-gray-400">
                    {new Date(i.created_at).toLocaleDateString('en-IN')}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Notes (private)
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={`e.g. "likes bright colors", "buying for daughter's wedding"`}
            multiline
            numberOfLines={2}
            className="text-sm text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Delete */}
        <TouchableOpacity
          onPress={handleDelete}
          className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-red-100 bg-red-50"
        >
          <Trash2 size={16} color="#DC2626" />
          <Text className="text-red-600 font-semibold text-sm">Delete Customer</Text>
        </TouchableOpacity>
      </View>

      {/* ── Manual Measurement Modal ─────────────────────────────── */}
      <Modal
        visible={showManualForm}
        animationType="slide"
        {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' } : {})}
        onRequestClose={() => setShowManualForm(false)}
      >
        <View className="flex-1 bg-cyan-50" style={{ paddingTop: insets.top + 16 }}>
          {/* Modal Header */}
          <View className="flex-row items-center justify-between px-4 pb-4">
            <TouchableOpacity onPress={() => setShowManualForm(false)}>
              <X size={22} color="#374151" />
            </TouchableOpacity>
            <Text className="text-base font-bold text-gray-900">Manual Measurements</Text>
            <TouchableOpacity
              onPress={() => void handleSaveManualMeasurement()}
              disabled={savingManual}
              className="bg-emerald-600 px-4 py-2 rounded-xl"
            >
              {savingManual ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-semibold text-sm">Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled">
            {/* Height — required */}
            <View className="bg-white rounded-2xl p-4 border border-gray-100 mb-3">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Height (cm) *
              </Text>
              <TextInput
                value={manualHeight}
                onChangeText={setManualHeight}
                placeholder="e.g. 162"
                keyboardType="numeric"
                className="text-lg font-bold text-gray-900 bg-cyan-50 border border-gray-200 rounded-xl px-3 py-2"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Upper body */}
            <View className="bg-white rounded-2xl p-4 border border-gray-100 mb-3">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Upper Body (cm, optional)
              </Text>
              <View className="gap-3">
                <View>
                  <Text className="text-xs text-gray-500 mb-1">Bust</Text>
                  <TextInput
                    value={manualBust}
                    onChangeText={setManualBust}
                    placeholder="e.g. 92"
                    keyboardType="numeric"
                    className="text-sm text-gray-900 bg-cyan-50 border border-gray-200 rounded-xl px-3 py-2"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View>
                  <Text className="text-xs text-gray-500 mb-1">Waist</Text>
                  <TextInput
                    value={manualWaist}
                    onChangeText={setManualWaist}
                    placeholder="e.g. 76"
                    keyboardType="numeric"
                    className="text-sm text-gray-900 bg-cyan-50 border border-gray-200 rounded-xl px-3 py-2"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View>
                  <Text className="text-xs text-gray-500 mb-1">Hip</Text>
                  <TextInput
                    value={manualHip}
                    onChangeText={setManualHip}
                    placeholder="e.g. 100"
                    keyboardType="numeric"
                    className="text-sm text-gray-900 bg-cyan-50 border border-gray-200 rounded-xl px-3 py-2"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>
            </View>

            {/* Lower body */}
            <View className="bg-white rounded-2xl p-4 border border-gray-100 mb-3">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Lower Body (cm, optional)
              </Text>
              <View className="gap-3">
                <View>
                  <Text className="text-xs text-gray-500 mb-1">Pant Waist</Text>
                  <TextInput
                    value={manualPantWaist}
                    onChangeText={setManualPantWaist}
                    placeholder="e.g. 78"
                    keyboardType="numeric"
                    className="text-sm text-gray-900 bg-cyan-50 border border-gray-200 rounded-xl px-3 py-2"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View>
                  <Text className="text-xs text-gray-500 mb-1">Pant Hip</Text>
                  <TextInput
                    value={manualPantHip}
                    onChangeText={setManualPantHip}
                    placeholder="e.g. 102"
                    keyboardType="numeric"
                    className="text-sm text-gray-900 bg-cyan-50 border border-gray-200 rounded-xl px-3 py-2"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View>
                  <Text className="text-xs text-gray-500 mb-1">Inseam</Text>
                  <TextInput
                    value={manualInseam}
                    onChangeText={setManualInseam}
                    placeholder="e.g. 78"
                    keyboardType="numeric"
                    className="text-sm text-gray-900 bg-cyan-50 border border-gray-200 rounded-xl px-3 py-2"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>
            </View>

            <View className="bg-amber-50 rounded-2xl p-3 border border-amber-100 mb-6">
              <Text className="text-xs text-amber-700">
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
