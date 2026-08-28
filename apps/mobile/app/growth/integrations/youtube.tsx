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

export default function YouTubeConfigScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [channelId, setChannelId] = useState('')
  const [channelName, setChannelName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [autoPublishShorts, setAutoPublishShorts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ connected: boolean; channel_name?: string } | null>(null)
  const [error, setError] = useState('')

  const canSave = (channelId.trim() || channelName.trim()) && !saving

  const saveMutation = useMutation({
    mutationFn: () =>
      growthApi.configureYouTube({
        channel_id: channelId.trim() || channelName.trim(),
        api_key: apiKey.trim() || 'demo_api_key',
        channel_name: channelName.trim() || 'YouTube Channel',
        auto_publish_shorts: autoPublishShorts,
      }),
    onSuccess: () => {
      setSaving(false)
      void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
      Alert.alert('Connected!', 'YouTube Channel is now connected.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    },
    onError: (err) => {
      setSaving(false)
      showError(err, 'Failed to save YouTube credentials')
    },
  })

  const testMutation = useMutation({
    mutationFn: () =>
      growthApi.testYouTube({
        channel_id: channelId.trim(),
        api_key: apiKey.trim(),
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
            YouTube Channel & Shorts
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-xs text-heliotrope-500 mb-4 leading-relaxed font-medium">
          Connect your boutique YouTube Channel to automatically upload luxury Ken Burns 6s
          video clips as YouTube Shorts and showcase your bridal collection runway tours.
        </Text>

        <AnimatedPressable
          onPress={() => Linking.openURL('https://developers.google.com/youtube/v3')}
          className="flex-row items-center gap-2 bg-lavender-100 rounded-2xl px-4 py-3 mb-4 border border-lavender-200"
        >
          <ExternalLink size={14} color="#BB3F95" />
          <Text className="text-xs font-bold text-fuchsia-700">
            How to get YouTube Data API v3 Key →
          </Text>
        </AnimatedPressable>

        <Label text="Channel Name / Handle" />
        <TextInput
          value={channelName}
          onChangeText={setChannelName}
          placeholder="e.g. @KanchukiBridalLuxury"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label text="YouTube Channel ID" />
        <TextInput
          value={channelId}
          onChangeText={setChannelId}
          placeholder="UC_x5XG1OV2P6uZZ5FSM9Ttw"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label text="Google YouTube API Key / OAuth Token" />
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="AIzaSyA0B..."
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
                  Auto-publish as YouTube Shorts
                </Text>
              </View>
              <Text className="text-[11px] text-heliotrope-500 font-medium leading-relaxed">
                Automatically post 6s photoshoot video reels with sound directly to YouTube Shorts.
              </Text>
            </View>
            <Switch
              value={autoPublishShorts}
              onValueChange={setAutoPublishShorts}
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
                ? `Connected! Channel: ${channelName.trim() || 'Verified Channel'}`
                : 'Connection test failed. Check Channel ID and API Key.'}
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
                <Text className="text-sm font-bold text-spaceCadet-900">Test Channel</Text>
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

