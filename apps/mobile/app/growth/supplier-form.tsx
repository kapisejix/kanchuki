import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi } from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

function Label({ text }: { text: string }) {
  return <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5 mt-3">{text}</Text>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
      <Text
        style={{ fontFamily: 'Marcellus_400Regular' }}
        className="text-base font-bold text-spaceCadet-900 mb-3.5"
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

export default function SupplierFormScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ id?: string }>()
  const editingId = params.id
  const isEdit = !!editingId

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: existingData, isLoading: existingLoading } = useQuery({
    queryKey: ['growth', 'suppliers', editingId],
    queryFn: () => growthApi.supplier(editingId!),
    enabled: isEdit,
  })
  const existing = existingData?.data

  useEffect(() => {
    if (!existing) return
    setName(existing.name)
    setPhone(existing.phone ?? '')
    setCity(existing.city ?? '')
    setNotes(existing.notes ?? '')
  }, [existing])

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing info', 'Give the supplier a name.')
      return
    }
    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      city: city.trim() || null,
      notes: notes.trim() || null,
    }
    setSaving(true)
    try {
      if (isEdit) {
        await growthApi.updateSupplier(editingId!, payload)
      } else {
        await growthApi.createSupplier(payload)
      }
      await queryClient.invalidateQueries({ queryKey: ['growth', 'suppliers'] })
      router.back()
    } catch (err) {
      showError(err, isEdit ? 'Failed to update supplier' : 'Failed to add supplier')
      setSaving(false)
    }
  }

  if (isEdit && existingLoading) {
    return (
      <View className="flex-1 bg-[#F8F7FC] items-center justify-center">
        <Text className="text-xs text-heliotrope-500 font-medium">Loading…</Text>
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
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-xl font-bold text-spaceCadet-900"
          >
            {isEdit ? 'Edit Supplier' : 'Add Supplier'}
          </Text>
        </View>
        <GradientButton label={saving ? 'Saving…' : 'Save'} onPress={() => void handleSave()} loading={saving} />
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <Section title="Supplier Details">
          <Label text="Name *" />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Shree Textiles"
            placeholderTextColor="#928EB2"
            className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
            maxLength={120}
          />
          <Label text="Phone" />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="98765 43210"
            placeholderTextColor="#928EB2"
            keyboardType="phone-pad"
            className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
            maxLength={20}
          />
          <Label text="City" />
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Surat"
            placeholderTextColor="#928EB2"
            className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
            maxLength={60}
          />
          <Label text="Notes" />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Payment terms, usual lead time…"
            placeholderTextColor="#928EB2"
            multiline
            className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 min-h-[90px]"
            maxLength={500}
            textAlignVertical="top"
          />
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
