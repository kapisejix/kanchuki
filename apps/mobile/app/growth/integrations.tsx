import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  Globe,
  CheckCircle,
  XCircle,
  ExternalLink,
  Trash2,
  Plug,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  Linking,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import {
  growthApi,
  type IntegrationsStatus,
} from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

// ─── Main Screen ──────────────────────────────────────────────────

export default function IntegrationsScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const { data: integrations, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'integrations'],
    queryFn: () => growthApi.integrations(),
  })
  const data = integrations?.data

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">Integrations</Text>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          <Text className="text-xs text-sand-500 mb-4 leading-4">
            Connect your own Google Business Profile, Facebook Ads, and Google Ads accounts.
            Credentials are stored encrypted and never shared.
          </Text>

          {/* Google Business Profile */}
          <IntegrationCard
            icon="📍"
            title="Google Business Profile"
            subtitle="Post updates to your Google listing"
            configured={data?.gmb.configured ?? false}
            configuredAt={data?.gmb.configured_at ?? null}
            primaryColor={primaryColor}
            colors={colors}
            onConfigure={() => router.push('/growth/integrations/gmb' as any)}
            onDisconnect={() => {
              Alert.alert('Disconnect GMB?', 'Your Google Business Profile will be disconnected.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Disconnect',
                  style: 'destructive',
                  onPress: async () => {
                    await growthApi.disconnectGmb()
                    void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
                  },
                },
              ])
            }}
          />

          {/* Facebook Ads */}
          <IntegrationCard
            icon="📘"
            title="Facebook Local Awareness Ads"
            subtitle="Create local ad campaigns on Facebook"
            configured={data?.facebook_ads.configured ?? false}
            configuredAt={data?.facebook_ads.configured_at ?? null}
            primaryColor={primaryColor}
            colors={colors}
            onConfigure={() => router.push('/growth/integrations/fb-ads' as any)}
            onDisconnect={() => {
              Alert.alert('Disconnect Facebook Ads?', 'Your Facebook Ads account will be disconnected.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Disconnect',
                  style: 'destructive',
                  onPress: async () => {
                    await growthApi.disconnectFbAds()
                    void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
                  },
                },
              ])
            }}
          />

          {/* Google Ads */}
          <IntegrationCard
            icon="📊"
            title="Google Local Service Ads"
            subtitle="Manage Google LSA campaigns"
            configured={data?.google_ads.configured ?? false}
            configuredAt={data?.google_ads.configured_at ?? null}
            primaryColor={primaryColor}
            colors={colors}
            onConfigure={() => router.push('/growth/integrations/google-ads' as any)}
            onDisconnect={() => {
              Alert.alert('Disconnect Google Ads?', 'Your Google Ads account will be disconnected.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Disconnect',
                  style: 'destructive',
                  onPress: async () => {
                    await growthApi.disconnectGoogleAds()
                    void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
                  },
                },
              ])
            }}
          />
        </ScrollView>
      )}
    </View>
  )
}

// ─── Integration Card ─────────────────────────────────────────────

function IntegrationCard({
  icon,
  title,
  subtitle,
  configured,
  configuredAt,
  primaryColor,
  colors,
  onConfigure,
  onDisconnect,
}: {
  icon: string
  title: string
  subtitle: string
  configured: boolean
  configuredAt: string | null
  primaryColor: string
  colors: any
  onConfigure: () => void
  onDisconnect: () => void
}) {
  return (
    <View className="bg-white rounded-2xl border border-sand-100 p-4 mb-3">
      <View className="flex-row items-start gap-3">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center"
          style={{ backgroundColor: `${primaryColor}1A` }}
        >
          <Text className="text-lg">{icon}</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-0.5">
            <Text className="text-sm font-bold text-sand-900">{title}</Text>
            {configured ? (
              <CheckCircle size={14} color="#22C55E" />
            ) : (
              <XCircle size={14} color={colors.sand[300]} />
            )}
          </View>
          <Text className="text-xs text-sand-500 mb-2">{subtitle}</Text>
          {configured && configuredAt && (
            <Text className="text-[10px] text-sand-400 mb-2">
              Connected {new Date(configuredAt).toLocaleDateString('en-IN')}
            </Text>
          )}
          <View className="flex-row gap-2">
            <AnimatedPressable
              onPress={onConfigure}
              className="rounded-lg px-3 py-1.5 border"
              style={{
                backgroundColor: configured ? colors.sand[50] : `${primaryColor}1A`,
                borderColor: configured ? colors.sand[200] : primaryColor,
              }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: configured ? colors.sand[600] : primaryColor }}
              >
                {configured ? 'Reconfigure' : 'Configure'}
              </Text>
            </AnimatedPressable>
            {configured && (
              <AnimatedPressable
                onPress={onDisconnect}
                className="rounded-lg px-3 py-1.5 bg-red-50 border border-red-100"
              >
                <Text className="text-xs font-semibold text-red-500">Disconnect</Text>
              </AnimatedPressable>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
