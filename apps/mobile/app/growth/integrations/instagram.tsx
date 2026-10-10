import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  CheckCircle2,
  ChevronLeft,
  Lock,
  Sparkles,
  Zap,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native'
import * as Linking from 'expo-linking'
import { useScreenInsets } from '../../../src/lib/safe-area'
import { KeyboardScreen } from '../../../src/components/KeyboardScreen'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { growthApi } from '../../../src/lib/api/growth'
import { socialApi } from '../../../src/lib/api/social'
import { showError } from '../../../src/lib/errors'
import {
  FacebookAuthCancelled,
  FacebookAuthUnavailable,
  loginWithFacebook,
} from '../../../src/lib/facebook-auth'

export default function InstagramConfigScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets()
  const queryClient = useQueryClient()

  // Fetch current integration status
  const { data: integrationsData, refetch: refetchIntegrations } = useQuery({
    queryKey: ['growth', 'integrations'],
    queryFn: () => growthApi.integrations(),
  })

  const currentInstagram = integrationsData?.data?.instagram

  const [accountId, setAccountId] = useState(currentInstagram?.account_id ?? '')
  const [handle, setHandle] = useState(currentInstagram?.handle ?? '')
  const [autoPublishReels, setAutoPublishReels] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const isConnected = !!currentInstagram?.configured || !!handle.trim()

  // Listen for OAuth deep-link return (e.g. kanchuki://oauth/callback?code=...&state=...)
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      try {
        const url = event.url
        if (!url || (!url.includes('code=') && !url.includes('oauth/callback'))) return

        const parsed = Linking.parse(url)
        const code = (parsed.queryParams?.code as string) || 'auth_code_sample'
        const state = (parsed.queryParams?.state as string) || 'sample_state'

        if (code) {
          setConnecting(true)
          // No redirect_uri → API defaults to its https URL (matches the OAuth
          // dialog's redirect). Facebook rejects custom schemes (#9).
          const res = await socialApi.autoConnect({
            code,
            state,
            provider: 'instagram',
          })

          if (res?.data?.connected) {
            // The server already stored the real encrypted token on the
            // INSTAGRAM SocialAccount row — just refresh from it (mirrors the
            // Facebook screen). No placeholder configure() write.
            const connectedHandle = res.data.handle || '@instagram_store'
            setHandle(connectedHandle)
            setAccountId(res.data.account_id || '')
            await refetchIntegrations()
            void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
            Alert.alert('Connected!', `Successfully linked Instagram account ${connectedHandle}!`)
          }
        }
      } catch (err) {
        showError(err, 'Failed to complete 1-Click Instagram connection')
      } finally {
        setConnecting(false)
      }
    }

    const sub = Linking.addEventListener('url', handleDeepLink)
    return () => sub.remove()
  }, [queryClient, refetchIntegrations])

  const applyConnected = async (rawHandle: string, accountId: string) => {
    const finalHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`
    setHandle(finalHandle)
    setAccountId(accountId)
    // Server already persisted the real INSTAGRAM SocialAccount + token via
    // /social/connect-native. Just re-read it — no placeholder configure().
    await refetchIntegrations()
    void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
    Alert.alert('Connected!', `Instagram account ${finalHandle} connected.`)
  }

  // Fallback for builds without the native SDK (Expo Go only): open the real web
  // OAuth URL. https redirect (API default) so Meta accepts the dialog (#9).
  // No mock/simulated success — if OAuth can't start, the error is shown.
  const connectViaWeb = async () => {
    const res = await socialApi.getConnectUrl('instagram')
    const authUrl = res.data?.auth_url
    if (!authUrl) {
      throw new Error('Server did not return an Instagram login URL (social publishing not configured).')
    }
    await Linking.openURL(authUrl)
  }

  // 1-Click Connect Action — Instagram publishing runs through the linked
  // Facebook Page, so this is the same native FB login with IG scopes added.
  const handleOneClickConnect = async () => {
    setConnecting(true)
    setConnectError(null)
    try {
      const token = await loginWithFacebook('instagram')
      const res = await socialApi.connectWithToken(token, 'instagram')
      if (res.data?.connected) {
        await applyConnected(
          res.data.handle || res.data.account_name || '@instagram_store',
          res.data.account_id || '',
        )
      }
    } catch (err) {
      if (err instanceof FacebookAuthCancelled) return
      if (err instanceof FacebookAuthUnavailable) {
        // Native SDK module isn't linked in this build — log the real reason
        // instead of silently opening the browser with no on-screen trace.
        console.warn('[instagram-connect] native SDK unavailable, falling back to web OAuth:', err.message)
        try {
          await connectViaWeb()
          setConnectError(
            `Instagram app login isn't available in this build (${err.message}). Opened browser login instead — if that also fails, this Meta app needs Live mode or a tester Role.`,
          )
        } catch (webErr) {
          setConnectError(webErr instanceof Error ? webErr.message : 'Could not initiate Instagram connection')
        }
        return
      }
      // Surface the real reason — from our API (e.g. "No Instagram Business
      // account is linked to your Facebook Page…") or the Facebook SDK.
      setConnectError(err instanceof Error ? err.message : 'Could not connect your Instagram account')
    } finally {
      setConnecting(false)
    }
  }

  // Disconnect Action
  const handleDisconnect = () => {
    Alert.alert('Disconnect Instagram?', 'Your Instagram Business account will be unlinked from auto-publishing.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await growthApi.disconnectInstagram()
          setHandle('')
          setAccountId('')
          void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
          void refetchIntegrations()
        },
      },
    ])
  }

  return (
    <KeyboardScreen className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: headerPaddingTop }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Instagram Integration
            </Text>
            <Text className="text-[11px] text-heliotrope-500 font-medium">
              1-Click Business & Creator Publishing
            </Text>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: screenPaddingBottom }}>
        {/* 1-Click Connect Hero Card */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2.5">
              <View className="w-12 h-12 rounded-2xl items-center justify-center bg-fuchsia-600">
                <Text className="text-2xl">📸</Text>
              </View>
              <View>
                <Text className="text-base font-bold text-spaceCadet-900">
                  Instagram App Connect
                </Text>
                <Text className="text-xs text-heliotrope-500 font-medium">
                  Direct App-to-App Single Sign-On
                </Text>
              </View>
            </View>
            {isConnected && (
              <View className="flex-row items-center gap-1 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <CheckCircle2 size={12} color="#059669" />
                <Text className="text-[11px] font-bold text-emerald-700">Connected</Text>
              </View>
            )}
          </View>

          <Text className="text-xs text-heliotrope-600 leading-relaxed font-medium mb-4">
            No technical IDs, developer tokens, or API keys required. Simply tap connect to link with your installed Instagram or Facebook app in 1 click.
          </Text>

          {isConnected ? (
            <View className="bg-lavender-50 rounded-2xl p-4 border border-lavender-200 gap-2 mb-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-bold text-heliotrope-500 uppercase">Linked Handle</Text>
                <Text className="text-sm font-bold text-fuchsia-700">
                  {handle.startsWith('@') ? handle : `@${handle || 'connected_account'}`}
                </Text>
              </View>
              {accountId ? (
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold text-heliotrope-500 uppercase">Business ID</Text>
                  <Text className="text-xs font-semibold text-spaceCadet-700">{accountId}</Text>
                </View>
              ) : null}
              <View className="flex-row gap-2 mt-2 pt-2 border-t border-lavender-200">
                <View className="flex-1">
                  <AnimatedPressable
                    onPress={handleDisconnect}
                    className="bg-rose-50 py-2.5 rounded-xl border border-rose-200 items-center justify-center"
                  >
                    <Text className="text-xs font-bold text-rose-700">Disconnect</Text>
                  </AnimatedPressable>
                </View>
              </View>
            </View>
          ) : (
            <AnimatedPressable
              onPress={handleOneClickConnect}
              disabled={connecting}
              className="bg-fuchsia-600 py-3.5 px-4 rounded-2xl items-center justify-center flex-row gap-2 shadow-md"
              style={{
                shadowColor: '#BB3F95',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              {connecting ? (
                <>
                  <ActivityIndicator size="small" color="white" />
                  <Text className="text-white text-sm font-bold">Connecting App…</Text>
                </>
              ) : (
                <>
                  <Zap size={18} color="white" strokeWidth={2.5} />
                  <Text className="text-white text-sm font-bold">
                    1-Click Connect Instagram
                  </Text>
                </>
              )}
            </AnimatedPressable>
          )}

          {connectError && !isConnected && (
            <View className="mt-3 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3">
              <Text className="text-xs font-bold text-rose-700 mb-0.5">Could not connect</Text>
              <Text className="text-[11px] text-rose-600 leading-relaxed">{connectError}</Text>
            </View>
          )}

          <View className="flex-row items-center gap-1.5 mt-3 justify-center">
            <Lock size={11} color="#928EB2" />
            <Text className="text-[11px] text-heliotrope-400 font-medium">
              Official Meta Graph API OAuth • Tokens encrypted via 256-bit AES
            </Text>
          </View>
        </View>

        {/* Feature Switches */}
        <View className="bg-white rounded-3xl p-4 border border-lavender-200 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center gap-1.5 mb-1">
                <Sparkles size={14} color="#BB3F95" />
                <Text className="text-xs font-bold text-spaceCadet-900">
                  Auto-publish AI Video Reels & Shoots
                </Text>
              </View>
              <Text className="text-[11px] text-heliotrope-500 font-medium leading-relaxed">
                Automatically post generated 6s Ken Burns video reels and new catalog arrivals to your Instagram profile.
              </Text>
            </View>
            <Switch
              value={autoPublishReels}
              onValueChange={setAutoPublishReels}
              trackColor={{ false: '#E0E1F6', true: '#BB3F95' }}
              thumbColor="white"
            />
          </View>
        </View>

      </ScrollView>
    </KeyboardScreen>
  )
}
