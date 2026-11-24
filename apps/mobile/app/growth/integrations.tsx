import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ArrowRight,
  ChevronLeft,
  CheckCircle,
  XCircle,
  Settings2,
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
import { useScreenInsets } from '../../src/lib/safe-area'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { BrandIcon, type Brand } from '../../src/components/BrandIcon'
import { DangerButton } from '../../src/components/DangerButton'
import { GradientButton } from '../../src/components/GradientButton'
import { WHITE_BUTTON_INK, WhiteButton } from '../../src/components/WhiteButton'
import { growthApi } from '../../src/lib/api/growth'
import { retailerApi } from '../../src/lib/api/retailer'
import { META_SOCIAL_ENABLED } from '../../src/lib/meta-social';

type TabType = 'all' | 'social' | 'ads'

export default function IntegrationsScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets()
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
        style={{ paddingTop: headerPaddingTop }}
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
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-xl text-spaceCadet-900 flex-1"
          >
            Social & Marketing Channels
          </Text>
        </View>

        {/* Tab Filters */}
        <View className="flex-row flex-wrap gap-2 mt-4">
          {(
            [
              { key: 'all', label: 'All Channels (6)' },
              { key: 'social', label: 'Social Media (3)' },
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
                    ? 'bg-spaceCadet-900 border-spaceCadet-900'
                    : 'bg-lavender-50 border-lavender-200'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
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
          <ActivityIndicator color="#6B4773" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: screenPaddingBottom }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          {/* Hero Banner */}
          <View className="bg-white rounded-2xl p-5 mb-4 border border-lavender-200">
            <View className="flex-row items-center gap-2 mb-1.5">
              <Share2 size={18} color="#6B4773" />
              <Text
                style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                className="text-spaceCadet-900 text-base"
              >
                Social and ad accounts
              </Text>
            </View>
            <Text className="text-heliotrope-500 text-xs leading-relaxed mt-1 font-medium">
              {META_SOCIAL_ENABLED
                ? 'Publish catalog drops, lookbooks, and 6s photoshoot reels across Instagram, Facebook and WhatsApp. '
                : 'Connect WhatsApp and Google for your shop. '}
              Credentials are encrypted and securely stored.
            </Text>
          </View>

          {/* Social Media Accounts Section */}
          {(activeTab === 'all' || activeTab === 'social') && (
            <View className="mb-4">
              <Text className="text-xs font-semibold text-heliotrope-500 px-1 mb-2.5">
                Social media accounts
              </Text>

              {META_SOCIAL_ENABLED && (<>
              {/* Instagram Business */}
              <IntegrationCard
                brand="instagram"
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
                brand="facebook"
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

              </>)}

              {/* WhatsApp Cloud API */}
              <IntegrationCard
                brand="whatsapp"
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
                        await retailerApi.disconnectWhatsAppApi()
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
              <Text className="text-xs font-semibold text-heliotrope-500 px-1 mb-2.5">
                Ad platforms and local search
              </Text>

              {META_SOCIAL_ENABLED && (<>
              {/* Facebook Ads */}
              <IntegrationCard
                brand="facebook-ads"
                title="Facebook Local Awareness Ads"
                subtitle="Create local ad campaigns across Instagram & Facebook"
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

              </>)}

              {/* Google Ads */}
              <IntegrationCard
                brand="google-ads"
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
  brand,
  title,
  subtitle,
  configured,
  configuredAt,
  metaLabel,
  onConfigure,
  onDisconnect,
}: {
  brand: Brand
  title: string
  subtitle: string
  configured: boolean
  configuredAt: string | null
  metaLabel?: string
  onConfigure: () => void
  onDisconnect: () => void
}) {
  return (
    <View className="bg-white rounded-2xl border border-lavender-200 p-4 mb-4">
      <View className="flex-row items-start gap-3">
        <BrandIcon brand={brand} size={48} />
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-base text-spaceCadet-900 flex-1"
            >
              {title}
            </Text>
            {configured ? (
              <View className="flex-row items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                <CheckCircle size={11} color="#16a34a" />
                <Text className="text-[11px] font-semibold text-emerald-700">Linked</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-1 bg-lavender-100 px-2 py-0.5 rounded-full shrink-0">
                <XCircle size={11} color="#6B4773" />
                <Text className="text-[11px] font-semibold text-heliotrope-500">Not Linked</Text>
              </View>
            )}
          </View>
          <Text className="text-xs text-heliotrope-500 mb-2 leading-relaxed font-medium">{subtitle}</Text>
          {configured && (metaLabel || configuredAt) && (
            <View className="flex-row flex-wrap items-center gap-2 mb-2">
              {metaLabel && (
                <View className="bg-fuchsia-500/10 border border-fuchsia-500/20 px-2.5 py-0.5 rounded-full">
                  <Text className="text-[11px] font-semibold text-fuchsia-700">{metaLabel}</Text>
                </View>
              )}
              {configuredAt && (
                <Text className="text-[11px] text-heliotrope-500 font-medium">
                  Connected {new Date(configuredAt).toLocaleDateString('en-IN')}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
      {/* Buttons: dark = GradientButton web, white = WhiteButton, red keeps its colour
          (shared default radius + navy shadow). Full card width so labels never cut off. */}
      <View className="flex-row gap-3 mt-4">
        <View className="flex-1">
          {configured ? (
            <WhiteButton
              uppercase
              label="Reconfigure"
              icon={<Settings2 size={14} color={WHITE_BUTTON_INK} />}
              onPress={onConfigure}
            />
          ) : (
            <GradientButton
              variant="web"
              label="Connect Account"
              iconRight={<ArrowRight size={16} color="#FFFFFF" strokeWidth={2.5} />}
              onPress={onConfigure}
            />
          )}
        </View>
        {configured && (
          <View className="flex-1">
            <DangerButton label="Disconnect" onPress={onDisconnect} />
          </View>
        )}
      </View>
    </View>
  )
}
