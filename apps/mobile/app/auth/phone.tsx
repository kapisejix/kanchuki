import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { authApi } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { GradientButton } from '../../src/components/GradientButton'

export default function PhoneScreen() {
  const insets = useSafeAreaInsets()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  const isValid = phone.replace(/\D/g, '').length === 10

  const handleSend = async () => {
    if (!isValid) return
    setLoading(true)
    try {
      await authApi.sendOtp(phone)
      router.push({ pathname: '/auth/otp', params: { phone } })
    } catch (err) {
      showError(err, 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top */}
        <View>
          {/* Logo */}
          <View className="w-16 h-16 bg-ink-600 rounded-2xl items-center justify-center mb-8">
            <Text className="text-white text-2xl font-bold">K</Text>
          </View>

          <Text className="text-3xl font-bold text-sand-900">Welcome to{'\n'}Kanchuki</Text>
          <Text className="text-sand-500 text-base mt-3">
            Aapki dukan, AI ki taakat.{'\n'}Enter your mobile number to continue.
          </Text>

          {/* Phone input */}
          <View className="mt-10">
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
              Mobile Number
            </Text>
            <View className="flex-row items-center border-2 border-sand-200 rounded-2xl px-4 py-4 gap-3 focus:border-ink-500">
              <Text className="text-base font-semibold text-sand-600">+91</Text>
              <View className="w-px h-5 bg-sand-300" />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="10-digit mobile number"
                placeholderTextColor="#ABA39C"
                keyboardType="phone-pad"
                maxLength={10}
                className="flex-1 text-base text-sand-900 font-medium"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => void handleSend()}
              />
            </View>
            <Text className="text-xs text-sand-400 mt-2 pl-1">
              OTP will be sent to this number
            </Text>
          </View>
        </View>

        {/* Bottom CTA */}
        <View>
          <GradientButton
            label="Send OTP →"
            onPress={() => void handleSend()}
            disabled={!isValid}
            loading={loading}
          />

          <Text className="text-center text-xs text-sand-400 mt-4 px-4">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
