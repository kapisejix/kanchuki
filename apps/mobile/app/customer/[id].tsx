import { useEffect, useState } from 'react'
import { formatPrice, SIZE_OPTIONS } from '@kanchuki/shared'
import { View, Text, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useScreenInsets } from '../../src/lib/safe-area'
import { X, Check, Plus, Trash2 } from 'lucide-react-native'
import { customerApi, productAttributeApi } from '../../src/lib/api'
import { DetailScreenSkeleton } from '../../src/components/Skeleton'
import { showError } from '../../src/lib/errors'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

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
  consent_given: boolean
  // total_purchases / total_spent columns still exist but now read 0 — the
  // 2026-08-31 teardown dropped checkout/orders. Kept optional because some
  // payloads (e.g. the aggregated list) omit them.
  total_purchases?: number
  total_spent?: number
}

export default function CustomerDetailScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => customerApi.get(id),
  })
  const customer = (data as { data: Customer } | undefined)?.data

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
  const [consent, setConsent] = useState(false)
  const [colorInput, setColorInput] = useState('')
  const [prefColors, setPrefColors] = useState<string[]>([])
  const [prefStyles, setPrefStyles] = useState<string[]>([])
  const [prefFabrics, setPrefFabrics] = useState<string[]>([])
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [usualSize, setUsualSize] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!customer) return
    setName(customer.name)
    setEmail(customer.email ?? '')
    setAddressLine1(customer.address_line1 ?? '')
    setCity(customer.city ?? '')
    setState(customer.state ?? '')
    setNotes(customer.notes ?? '')
    setConsent(!!customer.consent_given)
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
        consent_given: consent,
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

  if (isLoading || !customer) {
    return <DetailScreenSkeleton withPhoto={false} />
  }

  return (
    <ScrollView className="flex-1 bg-[#F8F7FC]" contentContainerStyle={{ paddingBottom: screenPaddingBottom }}>
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-5 pb-3 bg-white border-b border-lavender-200"
        style={{ paddingTop: headerPaddingTop }}
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
                style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
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
                style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
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

          {/* WhatsApp consent — campaign send filters on this */}
          <AnimatedPressable
            onPress={() => setConsent((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: consent }}
            className="border-t border-lavender-200 pt-3 mt-3 flex-row items-start gap-3"
          >
            <View
              className={`w-6 h-6 rounded-lg border items-center justify-center mt-0.5 ${
                consent ? 'bg-fuchsia-600 border-fuchsia-600' : 'bg-lavender-50 border-lavender-300'
              }`}
            >
              {consent ? <Text className="text-white text-xs font-bold">✓</Text> : null}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-spaceCadet-900">
                Agreed to WhatsApp offers & updates
              </Text>
              <Text className="text-xs text-heliotrope-500 font-medium mt-0.5 leading-relaxed">
                Off = excluded from all WhatsApp campaigns.
              </Text>
            </View>
          </AnimatedPressable>
        </View>

        {/* Purchase summary */}
        <View className="flex-row gap-3">
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm items-center">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-2xl font-bold text-spaceCadet-900"
            >
              {customer.total_purchases ?? 0}
            </Text>
            <Text className="text-xs text-heliotrope-500 font-bold uppercase tracking-wider mt-0.5">Purchases</Text>
          </View>
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm items-center">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-2xl font-bold text-spaceCadet-900"
            >
              {formatPrice(customer.total_spent ?? 0)}
            </Text>
            <Text className="text-xs text-heliotrope-500 font-bold uppercase tracking-wider mt-0.5">Total Spent</Text>
          </View>
        </View>

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

      <View className="h-12" />
    </ScrollView>
  )
}
