import { useState } from 'react'
import {
  View, Text, ScrollView, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Store, ChevronLeft, Phone, MapPin, User, CheckCircle2,
  X, UserPlus,
} from 'lucide-react-native'
import { teamApi } from '../../src/lib/team-api'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

export default function RetailerOnboardScreen() {
  const { primaryColor } = useTheme()
  const insets = useSafeAreaInsets()
  const [phone, setPhone] = useState('')
  const [shopName, setShopName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [pincode, setPincode] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const isFormValid =
    phone.replace(/\D/g, '').length === 10 &&
    shopName.trim().length >= 1 &&
    city.trim().length >= 1

  const handleSubmit = async () => {
    if (!isFormValid) return
    setSaving(true)
    try {
      const result = await teamApi.onboardRetailer({
        phone: phone.replace(/\D/g, ''),
        shop_name: shopName.trim(),
        owner_name: ownerName.trim() || undefined,
        city: city.trim(),
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
      })
      setSuccess(true)
      Alert.alert(
        'Retailer Onboarded',
        `${result.data.retailer.shop_name} has been added to your territory with a 14-day trial.${result.data.over_capacity ? '\n\n⚠️ You are over your capacity limit.' : ''}`,
        [
          {
            text: 'Add Another',
            onPress: () => {
              setPhone('')
              setShopName('')
              setOwnerName('')
              setCity('')
              setState('')
              setPincode('')
              setSuccess(false)
            },
          },
          {
            text: 'Go to Dashboard',
            onPress: () => router.back(),
          },
        ],
      )
    } catch (err) {
      // errors.ts policy: never surface raw err.message on screen. Show the
      // API's curated message only when the server actually responded
      // (status > 0 — a TeamApiError with body.error?.message); for network
      // failures (status 0) fall back to the friendly generic string.
      const apiErr = err as { status?: number } | undefined
      const msg =
        err instanceof Error && apiErr?.status && apiErr.status > 0
          ? err.message
          : 'Something went wrong. Check the phone number and try again.'
      Alert.alert('Failed to Onboard', msg)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'bg-sand-50 border border-sand-200 rounded-xl px-4 py-3.5 text-sm text-sand-900'
  const labelClass = 'text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5'

  if (success) {
    return (
      <View className="flex-1 bg-ink-50 items-center justify-center px-6">
        <View className="w-20 h-20 bg-turmeric-100 rounded-full items-center justify-center mb-4">
          <CheckCircle2 size={40} color="#946A4B" />
        </View>
        <Text className="text-xl font-bold text-sand-900 text-center">Retailer Onboarded!</Text>
        <Text className="text-sand-500 text-sm mt-2 text-center">
          {shopName} has been added with a 14-day free trial.
        </Text>
        <AnimatedPressable
          onPress={() => router.back()}
          className="mt-8 bg-ink-600 px-8 py-3.5 rounded-2xl"
        >
          <Text className="text-white font-semibold">Back to Dashboard</Text>
        </AnimatedPressable>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-ink-50"
    >
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <ChevronLeft size={24} color="#4B4039" />
          </AnimatedPressable>
          <View>
            <Text className="text-base font-bold text-sand-900">New Retailer</Text>
            <Text className="text-xs text-sand-400">Quick field onboarding</Text>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          {/* Shop name */}
          <View className="bg-white rounded-2xl p-4 border border-sand-100">
            <View className="flex-row items-center gap-2 mb-2">
              <Store size={16} color={primaryColor} />
              <Text className={labelClass}>Shop Name *</Text>
            </View>
            <TextInput
              value={shopName}
              onChangeText={setShopName}
              placeholder="e.g. Sharma Saree Center"
              placeholderTextColor="#ABA39C"
              className={inputClass}
              autoFocus
            />
          </View>

          {/* Phone */}
          <View className="bg-white rounded-2xl p-4 border border-sand-100">
            <View className="flex-row items-center gap-2 mb-2">
              <Phone size={16} color="#946A4B" />
              <Text className={labelClass}>Mobile Number *</Text>
            </View>
            <View className="flex-row items-center border border-sand-200 rounded-xl px-4">
              <Text className="text-sm font-semibold text-sand-600">+91</Text>
              <View className="w-px h-5 bg-sand-300 mx-3" />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="9876543210"
                placeholderTextColor="#ABA39C"
                keyboardType="phone-pad"
                maxLength={10}
                className="flex-1 py-3.5 text-sm text-sand-900"
              />
            </View>
          </View>

          {/* Owner name */}
          <View className="bg-white rounded-2xl p-4 border border-sand-100">
            <View className="flex-row items-center gap-2 mb-2">
              <User size={16} color="#E3262D" />
              <Text className={labelClass}>Owner Name</Text>
            </View>
            <TextInput
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="e.g. Rajesh Sharma"
              placeholderTextColor="#ABA39C"
              className={inputClass}
            />
          </View>

          {/* City + State */}
          <View className="flex-row gap-3">
            <View className="flex-1 bg-white rounded-2xl p-4 border border-sand-100">
              <View className="flex-row items-center gap-2 mb-2">
                <MapPin size={16} color="#946A4B" />
                <Text className={labelClass}>City *</Text>
              </View>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Jaipur"
                placeholderTextColor="#ABA39C"
                className={inputClass}
              />
            </View>
            <View className="flex-1 bg-white rounded-2xl p-4 border border-sand-100">
              <Text className={labelClass}>State</Text>
              <TextInput
                value={state}
                onChangeText={setState}
                placeholder="e.g. Rajasthan"
                placeholderTextColor="#ABA39C"
                className={inputClass}
              />
            </View>
          </View>

          {/* Pincode */}
          <View className="bg-white rounded-2xl p-4 border border-sand-100">
            <Text className={labelClass}>Pincode</Text>
            <TextInput
              value={pincode}
              onChangeText={setPincode}
              placeholder="302001"
              placeholderTextColor="#ABA39C"
              keyboardType="number-pad"
              maxLength={6}
              className={inputClass}
            />
            <Text className="text-xs text-sand-400 mt-1.5">
              Used to auto-assign territory. Will be editable by the retailer later.
            </Text>
          </View>

          {/* Info note */}
          <View className="bg-ink-50 border border-ink-200 rounded-2xl px-4 py-3.5">
            <Text className="text-xs text-ink-800">
              The retailer will receive a 14-day free trial and can log in via OTP on their own phone.
              A placeholder account is created now; it links to their phone number on first login.
            </Text>
          </View>
        </View>

        {/* Bottom padding */}
        <View className="h-24" />
      </ScrollView>

      {/* Submit button */}
      <View
        className="bg-white border-t border-sand-100 px-4 py-4"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <GradientButton
          label="Onboard Retailer"
          onPress={() => void handleSubmit()}
          disabled={!isFormValid}
          loading={saving}
          icon={<UserPlus size={20} color="white" />}
        />
      </View>
    </KeyboardAvoidingView>
  )
}
