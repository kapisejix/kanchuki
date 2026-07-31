import { useState } from 'react'
import { View, Text, TextInput, ScrollView, Alert } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, MapPin } from 'lucide-react-native'
import { customerApi } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { GradientButton } from '../../src/components/GradientButton'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

export default function AddCustomerScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Missing info', 'Name and phone are required.')
      return
    }
    setSaving(true)
    try {
      const res = await customerApi.create({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        address_line1: addressLine1.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
      })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      const created = (res as { data: { id: string } }).data
      router.replace(`/customer/${created.id}`)
    } catch (err) {
      showError(err, 'Failed to create customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView className="flex-1 bg-ink-50">
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <AnimatedPressable onPress={() => router.back()} accessibilityLabel="Close" accessibilityRole="button">
          <X size={22} color="#4B4039" />
        </AnimatedPressable>
        <Text className="text-base font-bold text-sand-900">New Customer</Text>
        <GradientButton label="Save" onPress={() => void handleSave()} loading={saving} />
      </View>

      <View className="px-4 py-4 gap-4">
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">Name *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Customer name"
            placeholderTextColor="#ABA39C"
            className="text-base text-sand-900"
            autoFocus
          />
        </View>

        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">Phone *</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="10-digit mobile number"
            placeholderTextColor="#ABA39C"
            keyboardType="phone-pad"
            className="text-base text-sand-900"
          />
        </View>

        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">Email (optional)</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            placeholderTextColor="#ABA39C"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            className="text-base text-sand-900"
          />
        </View>

        {/* Address section */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center gap-1.5 mb-3">
            <MapPin size={14} color="#847B75" />
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">Address (optional)</Text>
          </View>
          <TextInput
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="Shop/Home address"
            placeholderTextColor="#ABA39C"
            className="text-sm text-sand-900 mb-3 bg-sand-50 rounded-xl px-3 py-2"
          />
          <View className="flex-row gap-3">
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor="#ABA39C"
              className="flex-1 text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2"
            />
            <TextInput
              value={state}
              onChangeText={setState}
              placeholder="State"
              placeholderTextColor="#ABA39C"
              className="flex-1 text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2"
            />
          </View>
        </View>

        <Text className="text-xs text-sand-400 px-1">
          Preferences, budget, and measurements can be added after saving.
        </Text>
      </View>
    </ScrollView>
  )
}
