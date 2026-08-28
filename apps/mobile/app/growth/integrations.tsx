import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ChevronLeft,
  CheckCircle,
  XCircle,
  Share2,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { growthApi, type IntegrationsStatus } from '../../src/lib/api/growth'

type TabType = 'all' | 'social' | 'ads'

export default function IntegrationsScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('all')

  const { data: integrations, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'integrations'],
    queryFn: () => growthApi.integrations(),
  })
  const data = integrations?.data

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
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-xl font-bold text-spaceCadet-900 flex-1"
          >
            Social & Marketing Channels
          </Text>
        </View>

        {/* Tab Filters */}
        <View className="flex-row gap-2 mt-3.5">
          {(
            [
              { key: 'all', label: 'All Channels (9)' },
              { key: 'social', label: 'Social Media (6)' },
              { key: 'ads', label: 'Ad Discovery (3)' },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.key
            return (
              <AnimatedPressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                className={`px-3.5 py-2 rounded-full border ${
                  active
                    ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm'
                    : 'bg-lavender-50 border-lavender-200'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    active ? 'text-white' : 'text-spaceCadet-900'
                  }`}
                >
                  {tab.label}
                </Text>
              </AnimatedPressable>
            )
          })}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          {/* Hero Banner */}
          <LinearGradient
            colors={['#231F48', '#560A39']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-3xl p-5 mb-4 shadow-sm"
          >
            <View className="flex-row items-center gap-2 mb-1.5">
              <Share2 size={18} color="#BB3F95" />
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-white text-base font-bold"
              >
                Omnichannel Social & Ads Sync
              </Text>
            </View>
            <Text className="text-lavender-200 text-xs leading-relaxed mt-1 font-medium">
              Publish catalog drops, lookbooks, and 6s photoshoot reels across Instagram, Facebook,
              YouTube, X.com, and WhatsApp. Credentials are encrypted and securely stored.
            </Text>
          </LinearGradient>

          {/* Social Media Accounts Section */}
          {(activeTab === 'all' || activeTab === 'social') && (
            <View className="mb-4">
              <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider px-1 mb-2.5">
                Social Media Accounts
              </Text>

              {/* Instagram Business */}
              <IntegrationCard
                icon="📸"
                title="Instagram Business & Creator"
                subtitle="Auto-publish 6s video reels, catalog photo carousels, and stories"
                configured={data?.instagram?.configured ?? false}
                configuredAt={data?.instagram?.configured_at ?? null}
                metaLabel={data?.instagram?.handle ? `@${data.instagram.handle}` : undefined}
                onConfigure={() => router.push('/growth/integrations/instagram' as any)}
                onDisconnect={() => {
                  Alert.alert('Disconnect Instagram?', 'Your Instagram Business account will be unlinked.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: async () => {
                        await growthApi.disconnectInstagram()
                        void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
                      },
                    },
                  ])
                }}
              />

              {/* Facebook Page */}
              <IntegrationCard
                icon="📘"
                title="Facebook Boutique Page"
                subtitle="Publish festival lookbooks, collection links, and status announcements"
                configured={data?.facebook?.configured ?? false}
                configuredAt={data?.facebook?.configured_at ?? null}
                metaLabel={data?.facebook?.page_name ?? undefined}
                onConfigure={() => router.push('/growth/integrations/facebook' as any)}
                onDisconnect={() => {
                  Alert.alert('Disconnect Facebook?', 'Your Facebook Page will be disconnected.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: async () => {
                        await growthApi.disconnectFacebook()
                        void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
                      },
                    },
                  ])
                }}
              />

              {/* YouTube Channel & Shorts */}
              <IntegrationCard
                icon="📺"
                title="YouTube Channel & Shorts"
                subtitle="Upload luxury Ken Burns 6s video reels and bridal runway showcase tours"
                configured={data?.youtube?.configured ?? false}
                configuredAt={data?.youtube?.configured_at ?? null}
                metaLabel={data?.youtube?.channel_name ?? undefined}
                onConfigure={() => router.push('/growth/integrations/youtube' as any)}
                onDisconnect={() => {
                  Alert.alert('Disconnect YouTube?', 'Your YouTube Channel will be disconnected.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: async () => {
                        await growthApi.disconnectYouTube()
                        void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
                      },
                    },
                  ])
                }}
              />

              {/* X.com (formerly Twitter) */}
              <IntegrationCard
                icon="𝕏"
                title="X.com (formerly Twitter)"
                subtitle="Tweet instant flash sales, new collection drops, and festival discounts"
                configured={data?.x?.configured ?? false}
                configuredAt={data?.x?.configured_at ?? null}
                metaLabel={data?.x?.handle ? `@${data.x.handle}` : undefined}
                onConfigure={() => router.push('/growth/integrations/x' as any)}
                onDisconnect={() => {
                  Alert.alert('Disconnect X.com?', 'Your X.com account will be disconnected.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: async () => {
                        await growthApi.disconnectX()
                        void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
                      },
                    },
                  ])
                }}
              />

              {/* WhatsApp Cloud API */}
              <IntegrationCard
                icon="💬"
                title="WhatsApp Business API"
                subtitle="Verified green-tick broadcasts, interactive catalog buttons, and 1-click cart links"
                configured={data?.whatsapp?.configured ?? false}
                configuredAt={data?.whatsapp?.configured_at ?? null}
                onConfigure={() => router.push('/growth/integrations/whatsapp' as any)}
                onDisconnect={() => {
                  Alert.alert('Disconnect WhatsApp API?', 'Your WhatsApp Cloud API account will be unlinked.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: async () => {
                        await growthApi.disconnectWhatsAppCloud()
                        void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
                      },
                    },
                  ])
                }}
              />

              {/* Pinterest Business */}
              <IntegrationCard
                icon="📌"
                title="Pinterest Business"
                subtitle="Sync bridal lookbooks, lehenga boards, and Rich Fashion Pins with price tags"
                configured={data?.pinterest?.configured ?? false}
                configuredAt={data?.pinterest?.configured_at ?? null}
                metaLabel={data?.pinterest?.username ? `@${data.pinterest.username}` : undefined}
                onConfigure={() => router.push('/growth/integrations/pinterest' as any)}
                onDisconnect={() => {
                  Alert.alert('Disconnect Pinterest?', 'Your Pinterest Business account will be disconnected.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: async () => {
                        await growthApi.disconnectPinterest()
                        void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
                      },
                    },
                  ])
                }}
              />
            </View>
          )}

          {/* Ad & Search Discovery Section */}
          {(activeTab === 'all' || activeTab === 'ads') && (
            <View>
              <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider px-1 mb-2.5">
                Ad Platforms & Local Search
              </Text>

              {/* Google Business Profile */}
              <IntegrationCard
                icon="📍"
                title="Google Business Profile"
                subtitle="Post updates and review alerts to your boutique Google listing & Maps"
                configured={data?.gmb.configured ?? false}
                configuredAt={data?.gmb.configured_at ?? null}
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
                icon="📢"
                title="Facebook Local Awareness Ads"
                subtitle="Create local luxury ad campaigns across Instagram & Facebook"
                configured={data?.facebook_ads.configured ?? false}
                configuredAt={data?.facebook_ads.configured_at ?? null}
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
                title="Google Local Service Ads (LSA)"
                subtitle="Manage Google LSA and Search campaigns for local shoppers"
                configured={data?.google_ads.configured ?? false}
                configuredAt={data?.google_ads.configured_at ?? null}
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
            </View>
          )}
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
  metaLabel,
  onConfigure,
  onDisconnect,
}: {
  icon: string
  title: string
  subtitle: string
  configured: boolean
  configuredAt: string | null
  metaLabel?: string
  onConfigure: () => void
  onDisconnect: () => void
}) {
  return (
    <View className="bg-white rounded-3xl border border-lavender-200 p-4 mb-3.5 shadow-sm">
      <View className="flex-row items-start gap-3">
        <View
          className="w-12 h-12 rounded-2xl items-center justify-center bg-lavender-100 border border-lavender-200"
        >
          <Text className="text-2xl">{icon}</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-base font-bold text-spaceCadet-900 flex-1"
            >
              {title}
            </Text>
            {configured ? (
              <View className="flex-row items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle size={11} color="#16a34a" />
                <Text className="text-[10px] font-bold text-emerald-700">Linked</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-1 bg-lavender-100 px-2 py-0.5 rounded-full">
                <XCircle size={11} color="#928EB2" />
                <Text className="text-[10px] font-bold text-heliotrope-400">Not Linked</Text>
              </View>
            )}
          </View>
          <Text className="text-xs text-heliotrope-500 mb-2 leading-relaxed font-medium">{subtitle}</Text>
          {configured && (metaLabel || configuredAt) && (
            <View className="flex-row items-center gap-2 mb-2.5">
              {metaLabel && (
                <View className="bg-fuchsia-500/10 border border-fuchsia-500/20 px-2.5 py-0.5 rounded-full">
                  <Text className="text-[10px] font-bold text-fuchsia-700">{metaLabel}</Text>
                </View>
              )}
              {configuredAt && (
                <Text className="text-[10px] text-heliotrope-400 font-medium">
                  Connected {new Date(configuredAt).toLocaleDateString('en-IN')}
                </Text>
              )}
            </View>
          )}
          <View className="flex-row gap-2 mt-1">
            <AnimatedPressable
              onPress={onConfigure}
              className={`rounded-2xl px-4 py-2 border ${
                configured
                  ? 'bg-lavender-50 border-lavender-200'
                  : 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  configured ? 'text-spaceCadet-900' : 'text-white'
                }`}
              >
                {configured ? 'Reconfigure' : 'Connect Account'}
              </Text>
            </AnimatedPressable>
            {configured && (
              <AnimatedPressable
                onPress={onDisconnect}
                className="rounded-2xl px-4 py-2 bg-rose-50 border border-rose-200"
              >
                <Text className="text-xs font-bold text-rose-700">Disconnect</Text>
              </AnimatedPressable>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
