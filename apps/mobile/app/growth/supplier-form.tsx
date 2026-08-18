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
  return <Text className="text-xs font-medium text-sand-600 mb-1.5 mt-3">{text}</Text>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl p-4 border border-sand-100">
      <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">{title}</Text>
      {children}
    </View>
  )
}

export default function SupplierFormScreen() {
  const { colors } = useTheme()
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
      <View className="flex-1 bg-ink-50 items-center justify-center">
        <Text className="text-xs text-sand-400">Loading…</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-ink-50"
    >
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">
            {isEdit ? 'Edit Supplier' : 'Add Supplier'}
          </Text>
        </View>
        <GradientButton label={saving ? 'Saving…' : 'Save'} onPress={() => void handleSave()} loading={saving} />
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <Section title="Details">
          <Label text="Name *" />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Shree Textiles"
            placeholderTextColor={colors.sand[400]}
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3"
            maxLength={120}
          />
          <Label text="Phone" />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="98765 43210"
            placeholderTextColor={colors.sand[400]}
            keyboardType="phone-pad"
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3"
            maxLength={20}
          />
          <Label text="City" />
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Surat"
            placeholderTextColor={colors.sand[400]}
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3"
            maxLength={60}
          />
          <Label text="Notes" />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Payment terms, usual lead time…"
            placeholderTextColor={colors.sand[400]}
            multiline
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3 min-h-[80px]"
            maxLength={500}
            textAlignVertical="top"
          />
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
