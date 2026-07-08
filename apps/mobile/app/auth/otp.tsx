import { useState, useRef, useEffect } from 'react'
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
import { router, useLocalSearchParams } from 'expo-router'
import { authApi, setToken } from '../../src/lib/api'
import { setItem } from '../../src/lib/storage'

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>()
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(30)
  const [resending, setResending] = useState(false)
  const inputRef = useRef<TextInput>(null)

  // Countdown for resend
  useEffect(() => {
    if (resendTimer <= 0) return
    const timer = setInterval(() => {
      setResendTimer((t) => t - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [resendTimer])

  const handleVerify = async (code: string) => {
    if (code.length !== 6 || !phone) return
    setLoading(true)
    try {
      const result = await authApi.verifyOtp(phone, code)
      await setToken(result.access_token)
      await setItem('refresh_token', result.refresh_token)
      await setItem('retailer_id', result.retailer_id)

      // New retailer → onboarding, existing → home
      router.replace(result.is_new ? '/onboarding' : '/(tabs)')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid OTP'
      Alert.alert('Incorrect OTP', message)
      setOtp('')
      inputRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!phone || resendTimer > 0) return
    setResending(true)
    try {
      await authApi.sendOtp(phone)
      setResendTimer(30)
      Alert.alert('OTP Sent', 'A new OTP has been sent to your number')
    } catch (err) {
      Alert.alert('Error', 'Failed to resend OTP')
    } finally {
      setResending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <View className="flex-1 px-6 pt-16 pb-10 justify-between">
        {/* Top */}
        <View>
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mb-8"
          >
            <Text className="text-lg">←</Text>
          </TouchableOpacity>

          <Text className="text-3xl font-bold text-gray-900">Enter OTP</Text>
          <Text className="text-gray-500 text-base mt-2">
            Sent to +91 ****{phone?.slice(-4)}
          </Text>

          {/* OTP input — single hidden input drives display */}
          <View className="mt-10">
            <View className="flex-row gap-3 justify-center">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => inputRef.current?.focus()}
                  className={`w-12 h-14 rounded-2xl border-2 items-center justify-center ${
                    otp.length === i
                      ? 'border-violet-600 bg-violet-50'
                      : otp.length > i
                      ? 'border-violet-300 bg-violet-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <Text className="text-2xl font-bold text-gray-900">
                    {otp[i] ?? ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Hidden real input */}
            <TextInput
              ref={inputRef}
              value={otp}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '').slice(0, 6)
                setOtp(digits)
                if (digits.length === 6) void handleVerify(digits)
              }}
              keyboardType="number-pad"
              maxLength={6}
              className="absolute opacity-0 w-px h-px"
              autoFocus
            />
          </View>

          {/* Resend */}
          <View className="flex-row justify-center mt-6">
            {resendTimer > 0 ? (
              <Text className="text-gray-400 text-sm">
                Resend OTP in {resendTimer}s
              </Text>
            ) : (
              <TouchableOpacity onPress={() => void handleResend()} disabled={resending}>
                <Text className="text-violet-600 text-sm font-semibold">
                  {resending ? 'Sending...' : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Verify button */}
        <TouchableOpacity
          onPress={() => void handleVerify(otp)}
          disabled={otp.length !== 6 || loading}
          className={`py-4 rounded-2xl items-center justify-center ${
            otp.length === 6 && !loading ? 'bg-violet-600' : 'bg-gray-200'
          }`}
        >
          {loading
            ? <ActivityIndicator color="white" />
            : <Text className={`text-base font-bold ${otp.length === 6 ? 'text-white' : 'text-gray-400'}`}>
                Verify & Continue →
              </Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
