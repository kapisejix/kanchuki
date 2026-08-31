import { useState } from 'react'
import { COLORS, isValidIndianPhone } from '@kanchuki/shared'
import { View, Text, TextInput, ScrollView, Alert } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, MapPin } from 'lucide-react-native'
import { customerApi } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { GradientButton } from '../../src/components/GradientButton'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

export default function AddCustomerScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [saving, setSaving] = useState(false)

  const phoneValid = isValidIndianPhone(phone)
  const showPhoneError = phone.replace(/\D/g, '').length > 0 && !phoneValid

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Missing info', 'Name and phone are required.')
      return
    }
    if (!phoneValid) {
      Alert.alert('Invalid phone', 'Enter a valid 10-digit mobile number (starts with 6–9).')
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
    <ScrollView className="flex-1 bg-[#F8F7FC]">
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
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-base font-bold text-spaceCadet-900"
        >
          New Customer
        </Text>
        <GradientButton label="Save" onPress={() => void handleSave()} loading={saving} />
      </View>

      <View className="px-4 py-4 gap-4">
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
            Full Name *
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Customer name (e.g. Priya Sharma)"
            placeholderTextColor="#928EB2"
            className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
            autoFocus
          />
        </View>

        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
            Mobile Number *
          </Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="10-digit mobile number"
            placeholderTextColor="#928EB2"
            keyboardType="phone-pad"
            maxLength={15}
            className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
          />
          {showPhoneError ? (
            <Text className="text-xs font-medium text-red-600 mt-2">
              Enter a valid 10-digit mobile number (starts with 6–9)
            </Text>
          ) : null}
        </View>

        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
            Email Address (optional)
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="customer@example.com"
            placeholderTextColor="#928EB2"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
          />
        </View>

        {/* Address section */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <View className="flex-row items-center gap-1.5 mb-3">
            <MapPin size={15} color="#BB3F95" />
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
              Address (optional)
            </Text>
          </View>
          <TextInput
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="Street address or landmark"
            placeholderTextColor="#928EB2"
            className="text-sm font-bold text-spaceCadet-900 mb-3 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
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

        <Text className="text-xs text-heliotrope-500 font-medium px-2 leading-relaxed">
          Preferences, budget, Fashion DNA affinities, and measurements can be updated anytime after creating the profile.
        </Text>
      </View>
    </ScrollView>
  )
}
