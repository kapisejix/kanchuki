import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { authApi } from '../../src/lib/api'

export default function PhoneScreen() {
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
      const message = err instanceof Error ? err.message : 'Failed to send OTP'
      Alert.alert('Error', message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <View className="flex-1 px-6 pt-20 pb-10 justify-between">
        {/* Top */}
        <View>
          {/* Logo */}
          <View className="w-16 h-16 bg-violet-600 rounded-2xl items-center justify-center mb-8">
            <Text className="text-white text-2xl font-bold">K</Text>
          </View>

          <Text className="text-3xl font-bold text-gray-900">Welcome to{'\n'}Kanchuki</Text>
          <Text className="text-gray-500 text-base mt-3">
            Aapki dukan, AI ki taakat.{'\n'}Enter your mobile number to continue.
          </Text>

          {/* Phone input */}
          <View className="mt-10">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Mobile Number
            </Text>
            <View className="flex-row items-center border-2 border-gray-200 rounded-2xl px-4 py-4 gap-3 focus:border-violet-500">
              <Text className="text-base font-semibold text-gray-600">+91</Text>
              <View className="w-px h-5 bg-gray-300" />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="10-digit mobile number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                maxLength={10}
                className="flex-1 text-base text-gray-900 font-medium"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => void handleSend()}
              />
            </View>
            <Text className="text-xs text-gray-400 mt-2 pl-1">
              OTP will be sent to this number
            </Text>
          </View>
        </View>

        {/* Bottom CTA */}
        <View>
          <TouchableOpacity
            onPress={() => void handleSend()}
            disabled={!isValid || loading}
            className={`py-4 rounded-2xl items-center justify-center flex-row gap-2 ${
              isValid && !loading ? 'bg-violet-600' : 'bg-gray-200'
            }`}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text className={`text-base font-bold ${isValid ? 'text-white' : 'text-gray-400'}`}>
                  Send OTP →
                </Text>}
          </TouchableOpacity>

          <Text className="text-center text-xs text-gray-400 mt-4 px-4">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
