import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GradientButton } from '../src/components/GradientButton'
import { ApiError, staffInviteApi, type StaffInviteInfo } from '../src/lib/api'
import { showError } from '../src/lib/errors'

/**
 * Tokenized staff invite join screen (docs/tasks/staff-invite-tokens.md §6.1).
 *
 * Opened via kanchuki://join?token=<raw> (or the web /join fallback). Shows a
 * masked summary of the invite (shop, role, masked phone — the full number
 * NEVER crosses the wire), then hands off to the normal OTP screen with the
 * token as a route param so the FIRST verify routes this phone to the staff
 * join, never to /onboarding as a junk retailer.
 *
 * Status handling (§3.2):
 *   pending  → "Join {shop} as {role}" → Continue → /auth/otp?invite_token=…
 *   used     → "already joined — log in with your phone" → auth/phone
 *   expired / revoked / 404 → dead end (no onboarding).
 */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; info: StaffInviteInfo }
  | { kind: 'used' }
  | { kind: 'dead' }

export default function JoinScreen() {
  const insets = useSafeAreaInsets()
  const { token } = useLocalSearchParams<{ token?: string }>()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [sending, setSending] = useState(false)

  // Fetch the invite summary when the token appears. On a deep-link cold start
  // the param may not be populated on first render — this refetches when it
  // does, and short-circuits once we've loaded it.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    const load = async () => {
      try {
        const { data } = await staffInviteApi.get(token)
        if (cancelled) return
        if (data.status === 'pending') setState({ kind: 'ready', info: data })
        else if (data.status === 'used') setState({ kind: 'used' })
        else setState({ kind: 'dead' })
      } catch (err) {
        if (cancelled) return
        // 404 (unknown/expired/revoked — the server keeps them
        // indistinguishable) and network failures both land on the dead end.
        const apiErr = err instanceof ApiError ? err : null
        if (apiErr?.status === 404) {
          setState({ kind: 'dead' })
        } else {
          showError(err, 'Could not check this invite. Check your connection and try again.')
          setState({ kind: 'dead' })
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  const handleContinue = async () => {
    if (!token || sending) return
    setSending(true)
    try {
      // Server sends the OTP to the invite's bound phone. The client never
      // learns the number — it only gets a masked confirmation.
      await staffInviteApi.sendOtp(token)
      router.replace({
        pathname: '/auth/otp',
        // invite_token + the masked bound phone for display (the full number
        // never crosses the wire — D3).
        params: {
          invite_token: token,
          masked: state.kind === 'ready' ? state.info.phone_masked : '',
        },
      })
    } catch (err) {
      showError(err, 'Could not send the OTP. Try again.')
    } finally {
      setSending(false)
    }
  }

  const goToLogin = () => router.replace('/auth/phone')

  return (
    <ScrollView
      className="flex-1 bg-[#F8F7FC] px-6"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'space-between',
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
      }}
    >
      <View>
        <Text className="text-3xl font-bold text-spaceCadet-900 font-marcellus mt-4">
          Join your store
        </Text>

        {state.kind === 'loading' && (
          <View className="mt-10 items-center">
            <ActivityIndicator size="large" color="#BB3F95" />
          </View>
        )}

        {state.kind === 'ready' && (
          <View className="mt-8">
            <View className="bg-white rounded-3xl p-6 border border-lavender-200">
              <Text className="text-2xl font-bold text-spaceCadet-900">
                {state.info.member_name}
              </Text>
              <Text className="text-heliotrope-600 text-base mt-1">
                You've been added to {state.info.shop_name ?? 'the store'} as{' '}
                {state.info.role === 'manager' ? 'Manager' : 'Team member'}
              </Text>
              <View className="mt-5 bg-lavender-50 rounded-2xl p-4">
                <Text className="text-xs font-semibold text-heliotrope-500 uppercase tracking-wider">
                  Verification
                </Text>
                <Text className="text-sm text-spaceCadet-800 mt-2">
                  We'll send a one-time password (OTP) to {state.info.phone_masked}.
                </Text>
              </View>
            </View>
          </View>
        )}

        {state.kind === 'used' && (
          <View className="mt-8 bg-white rounded-3xl p-6 border border-lavender-200">
            <Text className="text-xl font-bold text-spaceCadet-900">
              You've already joined
            </Text>
            <Text className="text-sm text-spaceCadet-600 mt-2 leading-relaxed">
              Just log in with your phone number to open the app.
            </Text>
          </View>
        )}

        {state.kind === 'dead' && (
          <View className="mt-8 bg-white rounded-3xl p-6 border border-lavender-200">
            <Text className="text-xl font-bold text-spaceCadet-900">
              This invite link is no longer valid
            </Text>
            <Text className="text-sm text-spaceCadet-600 mt-2 leading-relaxed">
              Ask the store owner to send you a new one.
            </Text>
          </View>
        )}
      </View>

      <View className="mt-8 gap-3">
        {state.kind === 'ready' && (
          <GradientButton
            label={sending ? 'Sending OTP…' : 'Continue'}
            onPress={() => void handleContinue()}
            disabled={sending}
            loading={sending}
          />
        )}
        {(state.kind === 'used' || state.kind === 'dead') && (
          <GradientButton label="Log in with phone" onPress={goToLogin} />
        )}
        {state.kind === 'ready' && (
          <Pressable onPress={goToLogin} className="py-3 items-center">
            <Text className="text-heliotrope-500 text-sm font-semibold">
              Log in with a different account
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  )
}