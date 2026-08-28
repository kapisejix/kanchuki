import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  ExternalLink,
  Sparkles,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  Linking,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { GradientButton } from '../../../src/components/GradientButton'
import { growthApi } from '../../../src/lib/api/growth'
import { showError } from '../../../src/lib/errors'

export default function InstagramConfigScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [accountId, setAccountId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [handle, setHandle] = useState('')
  const [autoPublishReels, setAutoPublishReels] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ connected: boolean; username?: string } | null>(null)
  const [error, setError] = useState('')

  const canSave = (accountId.trim() || handle.trim()) && !saving

  const saveMutation = useMutation({
    mutationFn: () =>
      growthApi.configureInstagram({
        account_id: accountId.trim() || handle.trim(),
        access_token: accessToken.trim() || 'demo_token',
        handle: handle.trim().replace(/^@/, ''),
        auto_publish_reels: autoPublishReels,
      }),
    onSuccess: () => {
      setSaving(false)
      void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
      Alert.alert('Connected!', 'Instagram Business account is now linked.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    },
    onError: (err) => {
      setSaving(false)
      showError(err, 'Failed to save Instagram credentials')
    },
  })

  const testMutation = useMutation({
    mutationFn: () =>
      growthApi.testInstagram({
        account_id: accountId.trim(),
        access_token: accessToken.trim(),
      }),
    onMutate: () => {
      setTesting(true)
      setTestResult(null)
      setError('')
    },
    onSuccess: (res) => {
      setTesting(false)
      setTestResult(res.data)
    },
    onError: () => {
      setTesting(false)
      setTestResult({ connected: false })
    },
  })

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-xl font-bold text-spaceCadet-900"
          >
            Instagram Business
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-xs text-heliotrope-500 mb-4 leading-relaxed font-medium">
          Connect your Instagram Professional / Business account to automatically publish
          high-resolution catalog shoots, lookbooks, and 6s Ken Burns video reels.
        </Text>

        <AnimatedPressable
          onPress={() => Linking.openURL('https://developers.facebook.com/docs/instagram-api')}
          className="flex-row items-center gap-2 bg-lavender-100 rounded-2xl px-4 py-3 mb-4 border border-lavender-200"
        >
          <ExternalLink size={14} color="#BB3F95" />
          <Text className="text-xs font-bold text-fuchsia-700">
            How to get Instagram Graph API credentials →
          </Text>
        </AnimatedPressable>

        <Label text="Instagram Handle / Username" />
        <TextInput
          value={handle}
          onChangeText={setHandle}
          placeholder="@yourboutique_couture"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label text="Instagram Business Account ID" />
        <TextInput
          value={accountId}
          onChangeText={setAccountId}
          placeholder="17841400000000000"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label text="Meta Graph User Access Token" />
        <TextInput
          value={accessToken}
          onChangeText={setAccessToken}
          placeholder="Long-lived Instagram Graph Token"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Feature Switches */}
        <View className="bg-white rounded-3xl p-4 border border-lavender-200 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center gap-1.5 mb-1">
                <Sparkles size={14} color="#BB3F95" />
                <Text className="text-xs font-bold text-spaceCadet-900">
                  Auto-publish AI Video Reels
                </Text>
              </View>
              <Text className="text-[11px] text-heliotrope-500 font-medium leading-relaxed">
                Automatically post generated 6s Ken Burns video reels to your Instagram profile.
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

        {testResult && (
          <View
            className={`rounded-2xl px-4 py-3 mb-4 border ${
              testResult.connected
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-rose-50 border-rose-200'
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                testResult.connected ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {testResult.connected
                ? `Connected! Profile: @${handle.trim().replace(/^@/, '') || 'Verified'}`
                : 'Connection test failed. Verify account ID & token.'}
            </Text>
          </View>
        )}

        {error ? (
          <View className="bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 mb-4">
            <Text className="text-xs text-rose-600 font-semibold">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <GradientButton
              label={saving ? 'Saving…' : '💾 Save & Link'}
              onPress={() => {
                setSaving(true)
                void saveMutation.mutate()
              }}
              disabled={!canSave}
            />
          </View>
          <View className="flex-1">
            <AnimatedPressable
              onPress={() => void testMutation.mutate()}
              disabled={testing || !canSave}
              className="items-center justify-center bg-lavender-100 rounded-2xl py-3.5 border border-lavender-200"
            >
              {testing ? (
                <ActivityIndicator size="small" color="#BB3F95" />
              ) : (
                <Text className="text-sm font-bold text-spaceCadet-900">Test Account</Text>
              )}
            </AnimatedPressable>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function Label({ text }: { text: string }) {
  return (
    <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">
      {text}
    </Text>
  )
}

