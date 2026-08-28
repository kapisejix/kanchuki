import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  CheckCircle,
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

export default function GmbConfigScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [accountId, setAccountId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [error, setError] = useState('')

  const canSave = accountId.trim() && locationId.trim() && accessToken.trim() && !saving

  const saveMutation = useMutation({
    mutationFn: () =>
      growthApi.configureGmb({
        account_id: accountId.trim(),
        location_id: locationId.trim(),
        access_token: accessToken.trim(),
        refresh_token: refreshToken.trim() || undefined,
      }),
    onSuccess: () => {
      setSaving(false)
      void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
      Alert.alert('Connected!', 'Google Business Profile is now connected.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    },
    onError: (err) => {
      setSaving(false)
      showError(err, 'Failed to save GMB credentials')
    },
  })

  const testMutation = useMutation({
    mutationFn: () => growthApi.testGmb(),
    onMutate: () => { setTesting(true); setTestResult(null) },
    onSuccess: (res) => {
      setTesting(false)
      setTestResult(res.data.connected ? 'success' : 'error')
    },
    onError: () => { setTesting(false); setTestResult('error') },
  })

  return (
    <View className="flex-1 bg-[#F8F7FC]">
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
            Google Business Profile
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-xs text-heliotrope-500 mb-4 leading-relaxed font-medium">
          Connect your Google Business Profile to post updates, offers, and new arrivals
          directly to your Google boutique storefront listing.
        </Text>

        {/* Help link */}
        <AnimatedPressable
          onPress={() => Linking.openURL('https://developers.google.com/my-business')}
          className="flex-row items-center gap-2 bg-lavender-100 rounded-2xl px-4 py-3 mb-4 border border-lavender-200"
        >
          <ExternalLink size={14} color="#BB3F95" />
          <Text className="text-xs font-bold text-fuchsia-700">
            How to get GMB API credentials →
          </Text>
        </AnimatedPressable>

        <Label text="Account ID" />
        <TextInput
          value={accountId}
          onChangeText={setAccountId}
          placeholder="Your GMB account ID"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
        />

        <Label text="Location ID" />
        <TextInput
          value={locationId}
          onChangeText={setLocationId}
          placeholder="Your shop's GMB location ID"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
        />

        <Label text="Access Token" />
        <TextInput
          value={accessToken}
          onChangeText={setAccessToken}
          placeholder="OAuth access token"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          secureTextEntry
        />

        <Label text="Refresh Token (optional)" />
        <TextInput
          value={refreshToken}
          onChangeText={setRefreshToken}
          placeholder="OAuth refresh token"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          secureTextEntry
        />

        {/* Test result */}
        {testResult === 'success' && (
          <View className="flex-row items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-4">
            <CheckCircle size={16} color="#16a34a" />
            <Text className="text-xs font-bold text-emerald-700">Connection successful!</Text>
          </View>
        )}
        {testResult === 'error' && (
          <View className="bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 mb-4">
            <Text className="text-xs text-rose-700 font-semibold">Connection failed. Check your credentials.</Text>
          </View>
        )}

        {error ? (
          <View className="bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 mb-4">
            <Text className="text-xs text-rose-700 font-semibold">{error}</Text>
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
              <Text className="text-sm font-bold text-spaceCadet-900">
                {testing ? 'Testing…' : 'Test Connection'}
              </Text>
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
