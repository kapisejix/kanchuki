import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  ExternalLink,
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

export default function FbAdsConfigScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [accessToken, setAccessToken] = useState('')
  const [adAccountId, setAdAccountId] = useState('')
  const [pageId, setPageId] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ connected: boolean; account_name?: string } | null>(null)
  const [error, setError] = useState('')

  const canSave = accessToken.trim() && adAccountId.trim() && pageId.trim() && !saving

  const saveMutation = useMutation({
    mutationFn: () =>
      growthApi.configureFbAds({
        access_token: accessToken.trim(),
        ad_account_id: adAccountId.trim(),
        page_id: pageId.trim(),
      }),
    onSuccess: () => {
      setSaving(false)
      void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
      Alert.alert('Connected!', 'Facebook Ads is now connected.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    },
    onError: (err) => { setSaving(false); showError(err, 'Failed to save Facebook Ads credentials') },
  })

  const testMutation = useMutation({
    mutationFn: () => growthApi.testFbAds(),
    onMutate: () => { setTesting(true); setTestResult(null) },
    onSuccess: (res) => { setTesting(false); setTestResult(res.data) },
    onError: () => { setTesting(false); setTestResult({ connected: false }) },
  })

  return (
    <View className="flex-1 bg-[#F8F7FC]">
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
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-xl font-bold text-spaceCadet-900"
          >
            Facebook & Meta Ads
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-xs text-heliotrope-500 mb-4 leading-relaxed font-medium">
          Connect your Facebook Ads account to create local awareness campaigns
          that reach shoppers near your boutique.
        </Text>

        <AnimatedPressable
          onPress={() => Linking.openURL('https://www.facebook.com/business/learn/how-to-create-facebook-ads')}
          className="flex-row items-center gap-2 bg-lavender-100 rounded-2xl px-4 py-3 mb-4 border border-lavender-200"
        >
          <ExternalLink size={14} color="#BB3F95" />
          <Text className="text-xs font-bold text-fuchsia-700">
            How to get Facebook Ads API credentials →
          </Text>
        </AnimatedPressable>

        <Label text="Business Access Token" />
        <TextInput
          value={accessToken}
          onChangeText={setAccessToken}
          placeholder="Long-lived Business token"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label text="Ad Account ID" />
        <TextInput
          value={adAccountId}
          onChangeText={setAdAccountId}
          placeholder="act_123456789"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label text="Page ID" />
        <TextInput
          value={pageId}
          onChangeText={setPageId}
          placeholder="Facebook Page ID for ad creative"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {testResult && (
          <View className={`rounded-2xl px-4 py-3 mb-4 border ${testResult.connected ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <Text className={`text-xs font-bold ${testResult.connected ? 'text-emerald-700' : 'text-rose-700'}`}>
              {testResult.connected
                ? `Connected! Account: ${testResult.account_name ?? 'Verified'}`
                : 'Connection failed. Check your credentials.'}
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
              label={saving ? 'Saving…' : '💾 Save & Connect'}
              onPress={() => { setSaving(true); void saveMutation.mutate() }}
              disabled={!canSave}
            />
          </View>
          <View className="flex-1">
            <AnimatedPressable
              onPress={() => void testMutation.mutate()}
              disabled={testing || !canSave}
              className="items-center justify-center bg-lavender-100 rounded-2xl py-3.5 border border-lavender-200"
            >
              {testing ? <ActivityIndicator size="small" color="#BB3F95" /> : (
                <Text className="text-sm font-bold text-spaceCadet-900">Test Connection</Text>
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
    <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">{text}</Text>
  )
}
