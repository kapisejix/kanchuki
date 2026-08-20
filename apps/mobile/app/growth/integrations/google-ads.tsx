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
import { useTheme } from '../../../src/lib/theme'

export default function GoogleAdsConfigScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [refreshToken, setRefreshToken] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [developerToken, setDeveloperToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [error, setError] = useState('')

  const canSave = refreshToken.trim() && customerId.trim() && developerToken.trim() && !saving

  const saveMutation = useMutation({
    mutationFn: () =>
      growthApi.configureGoogleAds({
        refresh_token: refreshToken.trim(),
        customer_id: customerId.trim(),
        developer_token: developerToken.trim(),
      }),
    onSuccess: () => {
      setSaving(false)
      void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
      Alert.alert('Connected!', 'Google Ads is now connected.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    },
    onError: (err) => { setSaving(false); showError(err, 'Failed to save Google Ads credentials') },
  })

  const testMutation = useMutation({
    mutationFn: () => growthApi.testGoogleAds(),
    onMutate: () => { setTesting(true); setTestResult(null) },
    onSuccess: (res) => { setTesting(false); setTestResult(res.data.connected ? 'success' : 'error') },
    onError: () => { setTesting(false); setTestResult('error') },
  })

  return (
    <View className="flex-1 bg-ink-50">
      <View className="bg-white border-b border-sand-100 px-4 pb-4" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-3">
          <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">Google Ads</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-xs text-sand-500 mb-4 leading-4">
          Connect your Google Ads account to manage Local Service Ads campaigns
          and reach customers searching for clothing stores nearby.
        </Text>

        <AnimatedPressable
          onPress={() => Linking.openURL('https://developers.google.com/google-ads/api/docs/start')}
          className="flex-row items-center gap-2 bg-blue-50 rounded-xl px-4 py-3 mb-4"
        >
          <ExternalLink size={14} color="#3B82F6" />
          <Text className="text-xs font-medium text-blue-600">
            How to get Google Ads API credentials →
          </Text>
        </AnimatedPressable>

        <Label text="Customer ID" />
        <Input value={customerId} onChangeText={setCustomerId} placeholder="XXX-XXX-XXXX" colors={colors} />

        <Label text="Developer Token" />
        <Input value={developerToken} onChangeText={setDeveloperToken} placeholder="Your Google Ads developer token" colors={colors} secureTextEntry />

        <Label text="OAuth Refresh Token" />
        <Input value={refreshToken} onChangeText={setRefreshToken} placeholder="OAuth2 refresh token" colors={colors} secureTextEntry />

        {testResult === 'success' && (
          <View className="flex-row items-center gap-2 bg-green-50 rounded-xl px-4 py-3 mb-4">
            <CheckCircle size={16} color="#22C55E" />
            <Text className="text-xs font-medium text-green-600">Connection successful!</Text>
          </View>
        )}
        {testResult === 'error' && (
          <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
            <Text className="text-xs text-red-600">Connection failed. Check your credentials.</Text>
          </View>
        )}

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
            <Text className="text-xs text-red-600">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3">
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
              className="items-center justify-center bg-sand-100 rounded-xl py-3.5"
            >
              {testing ? <ActivityIndicator size="small" color={primaryColor} /> : (
                <Text className="text-sm font-semibold text-sand-600">Test Connection</Text>
              )}
            </AnimatedPressable>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function Label({ text }: { text: string }) {
  return <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">{text}</Text>
}

function Input({ value, onChangeText, placeholder, colors, secureTextEntry }: {
  value: string; onChangeText: (t: string) => void; placeholder: string; colors: any; secureTextEntry?: boolean
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.sand[300]}
      className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4"
      secureTextEntry={secureTextEntry}
      autoCapitalize="none"
      autoCorrect={false}
    />
  )
}
