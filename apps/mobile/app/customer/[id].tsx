import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Check, Plus, Trash2, Ruler, Clock } from 'lucide-react-native'
import { customerApi } from '../../src/lib/api'
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

export default function CustomerDetailScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()

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

  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [colorInput, setColorInput] = useState('')
  const [prefColors, setPrefColors] = useState<string[]>([])
  const [prefStyles, setPrefStyles] = useState<string[]>([])
  const [prefFabrics, setPrefFabrics] = useState<string[]>([])
  const [prefOccasions, setPrefOccasions] = useState<string[]>([])
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!customer) return
    setName(customer.name)
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
          await customerApi.delete(customer.id)
          void queryClient.invalidateQueries({ queryKey: ['customers'] })
          router.back()
        },
      },
    ])
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
        <View className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center gap-3">
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
            <TouchableOpacity
              onPress={() => router.push(`/customer/${customer.id}/measurement`)}
              className="flex-row items-center gap-1 bg-cyan-50 px-2.5 py-1 rounded-full"
            >
              <Ruler size={12} color="#0891B2" />
              <Text className="text-cyan-700 text-xs font-semibold">Add Measurement</Text>
            </TouchableOpacity>
          </View>

          {measurements.length === 0 ? (
            <Text className="text-xs text-gray-400">No measurements recorded yet.</Text>
          ) : (
            <View className="gap-2">
              {measurements.map((m) => (
                <View key={m.id} className="bg-cyan-50 rounded-xl px-3 py-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-gray-700">
                      {m.source === 'PHOTO' ? 'Photo capture' : 'Manual entry'}
                    </Text>
                    <Text className="text-[10px] text-gray-400">
                      {new Date(m.created_at).toLocaleDateString('en-IN')}
                    </Text>
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

      <View className="h-12" />
    </ScrollView>
  )
}
