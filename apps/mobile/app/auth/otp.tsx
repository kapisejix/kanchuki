import { useState, useRef, useEffect } from 'react'
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
import { router, useLocalSearchParams } from 'expo-router'
import { normalizeIndianPhone } from '@kanchuki/shared'
import { authApi, setToken, ApiError, type VerifyOtpResult } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { setItem, deleteItem } from '../../src/lib/storage'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import {
  extractMsg91AccessToken,
  isMsg91OtpConfigured,
  retryMsg91Otp,
  verifyMsg91Otp,
} from '../../src/lib/msg91-otp'

/**
 * Apply the login result returned by the backend — identical for the widget
 * and legacy paths. Stores the session + staff/retailer context and routes.
 */
async function completeLogin(result: VerifyOtpResult) {
  await setToken(result.access_token)
  // TeamMember logins have no Supabase session → no refresh token (their team
  // JWT expires in 12h like the /team/login path). Only store one when the
  // backend actually returned one, and never keep a stale one from a previous
  // retailer login.
  if (result.refresh_token) {
    await setItem('refresh_token', result.refresh_token)
  } else {
    await deleteItem('refresh_token')
  }

  if (result.is_staff && result.staff) {
    // Staff (retailer's own shop employee) login — store staff context and
    // redirect to staff dashboard
    await setItem('staff_role', result.staff.role)
    await setItem('staff_name', result.staff.name)
    await setItem('staff_retailer_id', result.staff.retailer_id)
    await setItem('retailer_id', result.staff.retailer_id)
    router.replace('/staff')
  } else if (result.is_staff && result.team_member) {
    // TeamMember (Kanchuki's own field/sales/support agent) logged in via
    // phone OTP. access_token is a team JWT — the staff screens' teamApi
    // sends it to /team/* directly. No retailer scoping; clear any stale
    // retailer/staff context from a previous login on this device so the
    // agent is never shown the retailer UI or a stale shop identity.
    await setItem('staff_role', result.team_member.role)
    await setItem('staff_name', result.team_member.name)
    await Promise.all([deleteItem('staff_retailer_id'), deleteItem('retailer_id')])
    router.replace('/staff')
  } else if (result.retailer) {
    // Retailer owner login — existing flow. Clear any staff context left
    // behind by a previous team-member session on this device (shared shop
    // tablet), so the owner isn't shown the restricted staff UI.
    await Promise.all([
      deleteItem('staff_role'),
      deleteItem('staff_name'),
      deleteItem('staff_retailer_id'),
    ])
    await setItem('retailer_id', result.retailer.id)
    router.replace(result.is_new ? '/onboarding' : '/')
  }
}

/** Exchange a MSG91 widget access token for a backend session. */
async function verifyWithMsg91Token(phone: string, accessToken: string) {
  const { data: result } = await authApi.verifyMsg91(phone, accessToken)
  await completeLogin(result)
}

export default function OtpScreen() {
  const insets = useSafeAreaInsets()
  const { phone, reqId, token, bypass } = useLocalSearchParams<{
    phone: string
    reqId?: string
    token?: string
    bypass?: string
  }>()
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(30)
  const [resending, setResending] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const autoVerifyAttempted = useRef(false)

  // Countdown for resend
  useEffect(() => {
    if (resendTimer <= 0) return
    const timer = setInterval(() => {
      setResendTimer((t) => t - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [resendTimer])

  const msg91 = isMsg91OtpConfigured() && Boolean(reqId || token) && bypass !== 'true'

  const handleVerify = async (code: string) => {
    if (code.length !== 6 || !phone || loading) return
    setLoading(true)
    const digits = normalizeIndianPhone(phone)
    let verified = false
    try {
      if (bypass === 'true') {
        // Railway Demo / Test Phone Bypass: verify directly with backend API
        const { data: result } = await authApi.verifyOtp(digits, code)
        await completeLogin(result)
        return
      }

      if (msg91 && reqId) {
        // Real OTP flow: the widget verifies the code client-side and returns
        // an access token; the API re-confirms it with MSG91 server-side.
        try {
          const response = await verifyMsg91Otp(reqId, code)
          const accessToken = extractMsg91AccessToken(response)
          if (accessToken) {
            await verifyWithMsg91Token(digits, accessToken)
            verified = true
          }
        } catch (widgetErr) {
          console.warn('[auth] MSG91 widget verify failed, trying API verify:', widgetErr)
        }
      }
      if (!verified) {
        const { data: result } = await authApi.verifyOtp(digits, code)
        await completeLogin(result)
      }
    } catch (err) {
      // Don't blanket-label every failure "Incorrect OTP" — a 500 (e.g. the
      // phone number still being released after account deletion) or a 409 is
      // NOT a wrong code, and clearing the input to retype would mislead.
      const apiErr = err instanceof ApiError ? err : null
      if (apiErr?.status === 401) {
        showError(err, 'Invalid or expired OTP. Try again.', 'Incorrect OTP', () => {
          setOtp('')
          inputRef.current?.focus()
        })
      } else if (apiErr?.status === 409 || apiErr?.status === 429) {
        showError(err, apiErr.message, 'Unable to log in')
      } else {
        showError(
          err,
          'Something went wrong on our side. Please try again in a moment.',
          'Unable to log in',
          () => {
            setOtp('')
            inputRef.current?.focus()
          },
        )
      }
    } finally {
      setLoading(false)
    }
  }

  // Invisible-mode auto-verify (2026-08-12): with Mobile Integration enabled
  // on the MSG91 widget, the number can be verified carrier-side WITHOUT an
  // SMS/OTP. Two shapes:
  //   - the send response already carried the access token (token param), or
  //   - verifying with just the reqId succeeds without a code.
  // Both land in the same completeLogin. On failure we simply show the OTP
  // input — a normal code will have been sent as the fallback.
  useEffect(() => {
    if (!phone || autoVerifyAttempted.current) return
    autoVerifyAttempted.current = true

    if (token) {
      setLoading(true)
      verifyWithMsg91Token(phone, token).catch((err) => {
        console.warn('Auto-verify with pre-issued token failed:', err)
        setLoading(false)
      })
      return
    }

    if (!msg91 || !reqId) return

    setLoading(true)
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('invisible verify timed out')), 4000),
    )
    Promise.race([verifyMsg91Otp(reqId), timeout])
      .then((response) => {
        const accessToken = extractMsg91AccessToken(response)
        if (!accessToken) throw new Error('no token returned')
        return authApi.verifyMsg91(phone, accessToken)
      })
      .then(({ data }) => completeLogin(data))
      .catch((err) => {
        // Not invisible mode (or already consumed) — show the OTP input.
        if (!(err instanceof Error && err.message === 'invisible verify timed out')) {
          console.warn('Invisible auto-verify unavailable:', err)
        }
        setLoading(false)
      })
    // autoVerifyAttempted.current guards against re-runs, so the param deps
    // are safe to declare. completeLogin/verifyWithMsg91Token are module-level.
  }, [phone, msg91, reqId, token])

  const handleResend = async () => {
    if (!phone || resendTimer > 0) return
    setResending(true)
    try {
      let resent = false
      if (msg91 && reqId) {
        try {
          await retryMsg91Otp(reqId)
          resent = true
        } catch (widgetRetryErr) {
          console.warn('[auth] MSG91 widget retry failed, falling back to API:', widgetRetryErr)
        }
      }
      if (!resent) {
        await authApi.sendOtp(phone)
      }
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top */}
        <View>
          <AnimatedPressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-sand-100 items-center justify-center mb-8"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text className="text-lg">←</Text>
          </AnimatedPressable>

          <Text className="text-3xl font-bold text-sand-900">Enter OTP</Text>
          <Text className="text-sand-500 text-base mt-2">
            Sent to +91 ****{phone?.slice(-4)}
          </Text>

          {/* OTP input — single hidden input drives display */}
          <View className="mt-10">
            <View className="flex-row gap-3 justify-center">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <AnimatedPressable
                  key={i}
                  onPress={() => inputRef.current?.focus()}
                  className={`w-12 h-14 rounded-2xl border-2 items-center justify-center ${otp.length === i
                      ? 'border-ink-600 bg-ink-50'
                      : otp.length > i
                        ? 'border-ink-300 bg-ink-50'
                        : 'border-sand-200 bg-ink-50'
                    }`}
                >
                  <Text className="text-2xl font-bold text-sand-900">
                    {otp[i] ?? ''}
                  </Text>
                </AnimatedPressable>
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
              <Text className="text-sand-400 text-sm">
                Resend OTP in {resendTimer}s
              </Text>
            ) : (
              <AnimatedPressable onPress={() => void handleResend()} disabled={resending}>
                <Text className="text-ink-600 text-sm font-semibold">
                  {resending ? 'Sending...' : 'Resend OTP'}
                </Text>
              </AnimatedPressable>
            )}
          </View>
        </View>

        {/* Verify button */}
        <GradientButton
          label="Verify & Continue →"
          onPress={() => void handleVerify(otp)}
          disabled={otp.length !== 6 || loading}
          loading={loading}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
