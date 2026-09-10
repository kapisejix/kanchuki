import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { normalizeIndianPhone } from '@kanchuki/shared'
import {
  authApi,
  setToken,
  ApiError,
  staffInviteApi,
  type VerifyOtpResult,
} from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { setItem, deleteItem } from '../../src/lib/storage'
import { emitAuthChange } from '../../src/lib/auth-events'
import { GradientButton } from '../../src/components/GradientButton'
import {
  extractMsg91AccessToken,
  isMsg91OtpConfigured,
  retryMsg91Otp,
  verifyMsg91Otp,
} from '../../src/lib/msg91-otp'

/**
 * Apply the login result returned by the backend — identical for the widget
 * and legacy paths. Stores the session + staff/retailer context, then emits
 * an auth change so the root Stack.Protected guards flip.
 *
 * No manual navigation is needed for the common cases: when the guard flips,
 * expo-router FILTERS the auth routes out of the navigation state and focuses
 * the first remaining screen — (tabs) for retailers, staff for employees — so
 * the Login screens structurally cannot linger beneath the dashboard and
 * hardware back can never return to them. A brand-new retailer gets a pending
 * navigateTo so the provider sends them to onboarding once the guards flip.
 */
export async function completeLogin(result: VerifyOtpResult) {
  try {
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

    if (result.retailer) {
      // Retailer owner login — clear any staff context left behind
      await Promise.all([
        deleteItem('staff_role'),
        deleteItem('staff_name'),
        deleteItem('staff_retailer_id'),
        deleteItem('staff_kind'),
      ])
      await setItem('retailer_id', result.retailer.id)
      const hasCompletedOnboarding =
        !result.is_new &&
        result.retailer.onboarding_completed === true &&
        Boolean(result.retailer.shop_name && result.retailer.shop_name.trim().length > 0)

      // Guards flip → (tabs) is auto-focused. New retailers are routed to
      // onboarding via the provider's pending-navigation mechanism.
      emitAuthChange({
        authed: true,
        navigateTo: hasCompletedOnboarding ? undefined : '/onboarding',
      })
    } else if (result.is_staff && result.staff) {
      // Staff (retailer's own shop employee) login — store staff context.
      // FR-2.2: kind='shop' routes them to the retailer (tabs) (scoped by
      // role), NOT app/staff/ (which is the internal TeamMember surface) and
      // NOT onboarding (the shop already exists — owner-only flow).
      await setItem('staff_role', result.staff.role)
      await setItem('staff_name', result.staff.name)
      await setItem('staff_retailer_id', result.staff.retailer_id)
      await setItem('staff_kind', 'shop')
      await setItem('retailer_id', result.staff.retailer_id)
      // Guards flip → (tabs) is auto-focused for the shop staff session.
      emitAuthChange({ authed: true })
    } else if (result.is_staff && result.team_member) {
      // TeamMember (Kanchuki's own field agent) login — stays on app/staff/.
      await setItem('staff_role', result.team_member.role)
      await setItem('staff_name', result.team_member.name)
      await setItem('staff_kind', 'team')
      await Promise.all([deleteItem('staff_retailer_id'), deleteItem('retailer_id')])
      emitAuthChange({ authed: true })
    } else {
      // Brand new retailer / Demo bypass without a retailer profile yet
      await Promise.all([
        deleteItem('staff_role'),
        deleteItem('staff_name'),
        deleteItem('staff_retailer_id'),
        deleteItem('staff_kind'),
      ])
      emitAuthChange({ authed: true, navigateTo: '/onboarding' })
    }
  } catch (err) {
    console.error('[auth] Error in completeLogin:', err)
  }
}

/** Exchange a MSG91 widget access token for a backend session. */
async function verifyWithMsg91Token(phone: string, accessToken: string, inviteToken?: string) {
  const { data: result } = await authApi.verifyMsg91(phone, accessToken, inviteToken)
  await completeLogin(result)
}

export default function OtpScreen() {
  const insets = useSafeAreaInsets()
  const { phone, reqId, token, bypass, invite_token, masked } = useLocalSearchParams<{
    phone: string
    reqId?: string
    token?: string
    bypass?: string
    // Tokenized staff invite (staff-invite-tokens.md §6.2): carried from the
    // join screen into the first verify so the server routes this phone to
    // the staff join instead of a brand-new retailer. Resend goes through
    // the public invite route (server owns the phone number). `masked` is
    // the invite's masked bound phone (•••••• 3210) for the display line —
    // the full number never crosses the wire (D3).
    invite_token?: string
    masked?: string
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

  // Deferred keyboard focus. `autoFocus` alone is unreliable on Android right
  // after the stack push animation, so re-focus once the screen is idle (and
  // again whenever an invisible-verify attempt releases `loading`).
  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => inputRef.current?.focus(), 200)
    return () => clearTimeout(t)
  }, [loading])

  const msg91 = isMsg91OtpConfigured() && Boolean(reqId || token) && bypass !== 'true'

  const isVerifyingRef = useRef(false)

  const handleVerify = async (code: string) => {
    if (code.length !== 6 || loading || isVerifyingRef.current) return
    isVerifyingRef.current = true
    setLoading(true)
    let verified = false
    try {
      if (invite_token) {
        // Staff invite flow (staff-invite-tokens.md §6.2): the server owns
        // the bound phone (D3) — verify with the token alone, no phone. The
        // server derived the phone from the invite before checking the OTP.
        const { data: result } = await authApi.verifyOtp(undefined, code, invite_token)
        await completeLogin(result)
        return
      }

      if (!phone) return
      const digits = normalizeIndianPhone(phone)
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
      isVerifyingRef.current = false
      // Don't blanket-label every failure "Incorrect OTP" — a 500 (e.g. the
      // phone number still being released after account deletion) or a 409 is
      // NOT a wrong code, and clearing the input to retype would mislead.
      // A 400 on the invite flow (INVITE_INVALID / INVITE_PHONE_MISMATCH)
      // is a dead end, not a retry — route back to the join screen.
      const apiErr = err instanceof ApiError ? err : null
      if (apiErr?.status === 400 && invite_token) {
        showError(err, apiErr.message, 'Invite problem', () => {
          router.replace('/auth/phone')
        })
      } else if (apiErr?.status === 401) {
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
    if (!phone || autoVerifyAttempted.current || bypass === 'true') return
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
  }, [phone, msg91, reqId, token, bypass])

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
        // Staff invite flow (staff-invite-tokens.md §6.2): the server owns
        // the bound phone — resend goes through the public invite route, not
        // /v1/auth/otp/send (which would need a client-supplied phone).
        if (invite_token) {
          await staffInviteApi.sendOtp(invite_token)
        } else {
          await authApi.sendOtp(phone)
        }
      }
      setResendTimer(30)
      Alert.alert('OTP Sent', 'A new OTP has been sent to your number')
    } catch {
      Alert.alert('Error', 'Failed to resend OTP')
    } finally {
      setResending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#F8F7FC]"
    >
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top */}
        <View>
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center mb-8 border border-lavender-200"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text className="text-spaceCadet-900 text-base font-bold">←</Text>
          </Pressable>

          <Text className="text-3xl font-bold text-spaceCadet-900 font-marcellus">Enter OTP</Text>
          <Text className="text-heliotrope-500 text-sm mt-2">
            {invite_token
              ? `Verification code sent to ${masked || 'your number'}`
              : `Verification code sent to +91 ****${phone?.slice(-4)}`}
          </Text>

          {/* OTP input — one real-sized input overlays the digit boxes.
              ponytail: it must NOT be opacity-0 / 1px — Android (Gboard) gives
              a zero-opacity sub-pixel input no IME connection, so the soft
              keyboard never opens. Full-size overlay + transparent text keeps
              it invisible while staying focusable. */}
          <View className="mt-8">
            <View style={{ position: 'relative' }}>
              <View className="flex-row gap-2.5 justify-center" pointerEvents="none">
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  // ponytail: per-box state goes through `style`, NOT a changing
                  // className. A className that mutates after the first render trips
                  // react-native-css-interop@0.1.22's printUpgradeWarning, whose
                  // JSON.stringify of the props deep-walks into React Navigation's
                  // NavigationStateContext default value and detonates its throwing
                  // `getKey` getter -> "Couldn't find a navigation context" crash.
                  const active = otp.length === i
                  const filled = otp.length > i
                  return (
                    <View
                      key={i}
                      className="w-12 h-14 rounded-2xl border-2 items-center justify-center"
                      style={{
                        borderColor: active ? '#BB3F95' : filled ? '#D65CB3' : '#E0E1F6',
                        backgroundColor: active ? '#F2F1FA' : '#FFFFFF',
                      }}
                    >
                      <Text className="text-2xl font-bold text-spaceCadet-900">
                        {otp[i] ?? ''}
                      </Text>
                    </View>
                  )
                })}
              </View>

              {/* Real input, transparent over the boxes. Rendered last = on top,
                  so tapping the row focuses it directly and the keyboard opens. */}
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
                caretHidden
                autoFocus
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  color: 'transparent',
                }}
              />
            </View>
          </View>

          {/* Resend */}
          <View className="flex-row justify-center mt-6">
            {resendTimer > 0 ? (
              <Text className="text-heliotrope-400 text-xs font-medium">
                Resend OTP in {resendTimer}s
              </Text>
            ) : (
              <Pressable onPress={() => void handleResend()} disabled={resending}>
                <Text className="text-fuchsia-600 text-xs font-bold uppercase tracking-wider">
                  {resending ? 'Sending...' : 'Resend OTP'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Verify button */}
        <View className="mt-8">
          <GradientButton
            label="Verify & Continue →"
            onPress={() => void handleVerify(otp)}
            disabled={otp.length !== 6 || loading}
            loading={loading}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
