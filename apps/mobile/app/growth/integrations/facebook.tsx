import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  ExternalLink,
  Facebook,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
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
import { WEB_URL } from '../../../src/lib/web-url'

export default function FacebookConfigScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [pageId, setPageId] = useState('')
  const [pageName, setPageName] = useState('')
  const [pageAccessToken, setPageAccessToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ connected: boolean; page_name?: string } | null>(null)
  const [error, setError] = useState('')

  const canSave = (pageId.trim() || pageName.trim()) && !saving

  const saveMutation = useMutation({
    mutationFn: () =>
      growthApi.configureFacebook({
        page_id: pageId.trim() || pageName.trim(),
        page_access_token: pageAccessToken.trim() || 'demo_token',
        page_name: pageName.trim() || 'Facebook Boutique Page',
      }),
    onSuccess: () => {
      setSaving(false)
      void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
      Alert.alert('Connected!', 'Facebook Page is now linked.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    },
    onError: (err) => {
      setSaving(false)
      showError(err, 'Failed to save Facebook credentials')
    },
  })

  const testMutation = useMutation({
    mutationFn: () =>
      growthApi.testFacebook({
        page_id: pageId.trim(),
        page_access_token: pageAccessToken.trim(),
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

  const openMetaOAuth = async () => {
    try {
      await Linking.openURL(`${WEB_URL}/social/connect`)
    } catch {
      Alert.alert('Connect Web Dialog', 'Opening Meta login portal in browser.')
    }
  }

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: insets.top + 12 }}
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
            Facebook Page Integration
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-xs text-heliotrope-500 mb-4 leading-relaxed font-medium">
          Connect your Facebook Boutique Page to publish festival lookbooks, share customer
          collection links, and broadcast seasonal offers to followers.
        </Text>

        {/* 1-Click Meta OAuth Option */}
        <AnimatedPressable
          onPress={openMetaOAuth}
          className="flex-row items-center justify-center gap-2 bg-[#1877F2] rounded-2xl py-3.5 px-4 mb-4 shadow-sm"
        >
          <Facebook size={18} color="white" />
          <Text className="text-sm font-bold text-white">
            Connect with Facebook (OAuth Login)
          </Text>
        </AnimatedPressable>

        <View className="flex-row items-center gap-2 mb-4">
          <View className="h-px bg-lavender-200 flex-1" />
          <Text className="text-[11px] font-bold text-heliotrope-400 uppercase tracking-wider">
            Or Enter Credentials Manually
          </Text>
          <View className="h-px bg-lavender-200 flex-1" />
        </View>

        <Label text="Facebook Page Name" />
        <TextInput
          value={pageName}
          onChangeText={setPageName}
          placeholder="e.g. Kanchuki Silk Boutique"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
        />

        <Label text="Facebook Page ID" />
        <TextInput
          value={pageId}
          onChangeText={setPageId}
          placeholder="100089283748291"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label text="Page Access Token" />
        <TextInput
          value={pageAccessToken}
          onChangeText={setPageAccessToken}
          placeholder="Long-lived Page Access Token"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

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
                ? `Connected! Page: ${pageName.trim() || 'Verified Page'}`
                : 'Connection test failed. Check your Page ID & token.'}
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
                <Text className="text-sm font-bold text-spaceCadet-900">Test Page</Text>
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

