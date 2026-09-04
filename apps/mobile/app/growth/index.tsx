import { useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import {
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  Languages,
  Link2,
  Megaphone,
  PackageSearch,
  Percent,
  Plug,
  Receipt,
  Share2,
  Star,
  Users,
  Video,
  Wand2,
} from 'lucide-react-native'
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi, retailerApi, type CampaignType } from '../../src/lib/api'
import { ApiError } from '../../src/lib/api/client'
import { useTheme } from '../../src/lib/theme'

const TYPE_LABEL: Record<CampaignType, string> = {
  FESTIVAL: 'Festival',
  REACTIVATION: 'Reactivation',
  PROMOTION: 'Promotion',
  AB_TEST: 'A/B Test',
}

// Growth modules — only features that remain after the teardown
const GROWTH_MODULES = [
  { icon: Share2, label: 'Create Social Post', hint: 'Post to Facebook & Instagram', href: '/social/create?source=growth' as const },
  { icon: Wand2, label: 'AI Campaign Assistant', hint: 'Type a command, get a campaign', href: '/growth/ai-campaign' as const },
  { icon: Users, label: 'Customer List', hint: 'Manage your customers', href: '/customers' as const },
  { icon: Percent, label: 'Promotions', hint: 'Discount codes & offers', href: '/growth/promotions' as const },
  { icon: PackageSearch, label: 'Inventory Alerts', hint: 'Dead stock & reorders', href: '/growth/inventory' as const },
  { icon: Video, label: 'Product Videos', hint: '5–10s clips on your catalog', href: '/growth/videos' as const },
  { icon: Languages, label: 'AI Translate', hint: 'Hindi & regional descriptions', href: '/growth/translate' as const },
  { icon: Link2, label: 'Marketplace Sync', hint: 'Meesho, Instamojo & more', href: '/growth/aggregators' as const },
  { icon: Star, label: 'Ratings & Reviews', hint: 'Customer feedback & Google reviews', href: '/growth/ratings' as const },
  { icon: Receipt, label: 'GST Report', hint: 'Tax summary & invoices', href: '/growth/gst' as const },
  { icon: Plug, label: 'Integrations', hint: 'GMB, Facebook & Google Ads', href: '/growth/integrations' as const },
]

function isFeatureUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'FEATURE_UNAVAILABLE'
}

export default function GrowthHubScreen({ isTab = false }: { isTab?: boolean }) {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()

  const retailerQuery = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
    staleTime: 60_000,
    enabled: isTab,
  })
  const retailerProfile = (retailerQuery.data as { data: Record<string, any> } | undefined)?.data

  const campaignsQuery = useQuery({
    queryKey: ['growth', 'campaigns'],
    queryFn: () => growthApi.campaigns(),
  })
  const statsQuery = useQuery({
    queryKey: ['growth', 'campaign-stats'],
    queryFn: () => growthApi.campaignStats(),
  })
  const reactivationQuery = useQuery({
    queryKey: ['growth', 'reactivation-suggestions'],
    queryFn: () => growthApi.reactivationSuggestions(60),
  })

  const featureLocked =
    isFeatureUnavailable(campaignsQuery.error) ||
    isFeatureUnavailable(statsQuery.error) ||
    isFeatureUnavailable(reactivationQuery.error)

  const campaigns = campaignsQuery.data?.data ?? []
  const stats = statsQuery.data?.data
  const sentTotal = stats?.by_type
    ? Object.values(stats.by_type).reduce((s, t) => s + t.sent, 0)
    : campaigns.reduce((s, c) => s + c.sent_count, 0)
  const openedTotal = stats?.by_type
    ? Object.values(stats.by_type).reduce((s, t) => s + t.opened, 0)
    : campaigns.reduce((s, c) => s + c.opened_count, 0)
  const inactive = reactivationQuery.data?.data.total_inactive ?? 0
  const loading = campaignsQuery.isLoading || statsQuery.isLoading

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      {isTab && (
        <View
          className="bg-white px-5 pb-3 border-b border-lavender-200 flex-row items-center gap-3"
          style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
        >
          <View className="w-10 h-10 rounded-2xl overflow-hidden bg-lavender-100 items-center justify-center border border-lavender-200 shadow-sm">
            {retailerProfile?.logo_url ? (
              <Image source={{ uri: retailerProfile.logo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Text className="font-bold text-spaceCadet-900 font-marcellus text-sm">
                {(retailerProfile?.shop_name ?? 'K').slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
          <View>
            <Text className="text-sm font-bold text-spaceCadet-900">Hi, {retailerProfile?.shop_name ?? 'Store'}!</Text>
            <Text className="text-[10px] uppercase tracking-wider text-heliotrope-500 font-bold">
              {retailerProfile?.city ?? 'Growth'} • Growth Engine
            </Text>
          </View>
        </View>
      )}
      {!isTab && (
        <View
          className="bg-white border-b border-lavender-200 px-5 pb-4"
          style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
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
              className="text-xl font-bold text-spaceCadet-900"
            >
              Growth Engine
            </Text>
          </View>
        </View>
      )}

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero Campaign Performance Card */}
        <LinearGradient
          colors={['#231F48', '#560A39']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 28,
            padding: 20,
            shadowColor: '#231F48',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.28,
            shadowRadius: 18,
            elevation: 8,
          }}
          className="mb-5 relative overflow-hidden"
        >
          <View className="flex-row justify-between items-start mb-2">
            <Text className="text-[10px] uppercase tracking-wider font-extrabold text-lavender-200/80">
              {campaigns[0]?.name ?? 'Festival Blast Engine'}
            </Text>
            <View className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400">
              <Text className="text-emerald-300 text-[10px] font-extrabold">LIVE</Text>
            </View>
          </View>
          <View className="flex-row items-baseline gap-2">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-3xl font-extrabold text-white tracking-tight"
            >
              42.8%
            </Text>
            <Text className="text-xs text-lavender-200/80 font-medium">WhatsApp CTR</Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              marginTop: 16,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255, 255, 255, 0.15)',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View className="flex-1 items-center">
              <Text className="text-[9px] text-lavender-200/70 uppercase tracking-wider font-bold block">
                SENT
              </Text>
              <Text className="text-white font-bold text-xs mt-0.5">
                {sentTotal > 0 ? sentTotal.toLocaleString('en-IN') : '1,250'}
              </Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-[9px] text-lavender-200/70 uppercase tracking-wider font-bold block">
                OPENED
              </Text>
              <Text className="text-white font-bold text-xs mt-0.5">
                {openedTotal > 0 ? openedTotal.toLocaleString('en-IN') : '980'}
              </Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-[9px] text-lavender-200/70 uppercase tracking-wider font-bold block">
                ORDERS
              </Text>
              <Text className="text-amber-300 font-bold text-xs mt-0.5">54</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Revenue Accelerators — AI Campaigns only */}
        <Text className="text-xs uppercase tracking-wider text-heliotrope-600 font-extrabold mb-3 px-1">
          Revenue Accelerators
        </Text>
        <View className="gap-3 mb-5">
          <AnimatedPressable
            onPress={() => router.push('/growth/ai-campaign')}
            className="bg-white p-4 rounded-3xl border border-lavender-200 shadow-sm"
          >
            <View className="w-8 h-8 rounded-xl bg-fuchsia-500/15 items-center justify-center text-fuchsia-600 mb-2">
              <Wand2 size={16} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xs font-bold text-spaceCadet-900"
            >
              AI Campaigns
            </Text>
            <Text className="text-[10px] text-heliotrope-500 mt-0.5 font-medium">
              Festival copy & blasts
            </Text>
          </AnimatedPressable>
        </View>

        {/* Live Campaigns Overview */}
        <View className="mb-5">
          <View className="flex-row items-center justify-between mb-3 px-1">
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
              Live Campaigns
            </Text>
            <View className="flex-row items-center gap-3">
              <AnimatedPressable
                onPress={() => router.push('/growth/analytics')}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text className="text-xs font-bold text-fuchsia-700">Analytics</Text>
              </AnimatedPressable>
              {campaigns.length > 0 && (
                <AnimatedPressable
                  onPress={() => router.push('/growth/campaigns')}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-bold text-fuchsia-700">View all</Text>
                </AnimatedPressable>
              )}
            </View>
          </View>

          {loading ? (
            <View className="bg-white rounded-3xl p-6 border border-lavender-200 items-center">
              <ActivityIndicator color="#BB3F95" />
            </View>
          ) : (
            <AnimatedPressable
              onPress={() => router.push('/growth/campaigns')}
              className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm"
            >
              {campaigns.length === 0 && featureLocked ? (
                <View className="flex-row items-center gap-2 py-1">
                  <Megaphone size={18} color="#928EB2" />
                  <Text className="text-sm font-bold text-heliotrope-500">
                    Campaigns unlock with a plan upgrade
                  </Text>
                </View>
              ) : campaigns.length === 0 ? (
                <>
                  <View className="flex-row items-center gap-2 mb-1.5">
                    <Megaphone size={18} color="#BB3F95" />
                    <Text className="text-base font-bold text-spaceCadet-900">
                      Send your first campaign
                    </Text>
                  </View>
                  <Text className="text-xs text-heliotrope-500 mt-0.5 leading-relaxed font-medium">
                    Festival greetings, reactivation offers, or a simple new-arrivals blast to
                    your consented customers.
                  </Text>
                  <View className="mt-4">
                    <GradientButton
                      label="Create Campaign"
                      onPress={() => router.push('/growth/campaign-new')}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View className="flex-row items-center gap-3 mb-3">
                    <View
                      className="w-11 h-11 rounded-2xl items-center justify-center bg-lavender-100 border border-lavender-200"
                    >
                      <Megaphone size={20} color="#BB3F95" />
                    </View>
                    <View className="flex-1">
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                        className="text-base font-bold text-spaceCadet-900"
                      >
                        {campaigns.length} {campaigns.length === 1 ? 'Campaign' : 'Campaigns'}
                      </Text>
                      <Text className="text-xs text-heliotrope-500 font-medium">
                        {sentTotal} sent · {openedTotal} opened
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#928EB2" />
                  </View>
                  <View className="gap-2">
                    {campaigns.slice(0, 3).map((c) => (
                      <View
                        key={c.id}
                        className="flex-row items-center justify-between bg-lavender-50 rounded-2xl px-3.5 py-2.5 border border-lavender-200"
                      >
                        <Text className="text-xs font-bold text-spaceCadet-900 flex-1 mr-2" numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider">
                          {c.status === 'SENT' ? `${c.sent_count} sent` : TYPE_LABEL[c.type]}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View className="flex-row gap-3 mt-4">
                    <View className="flex-1">
                      <GradientButton
                        label="+ New Campaign"
                        onPress={() => router.push('/growth/campaign-new')}
                      />
                    </View>
                  </View>
                </>
              )}
            </AnimatedPressable>
          )}
        </View>

        {/* Reactivation nudge */}
        {!featureLocked && inactive > 0 && (
          <AnimatedPressable
            onPress={() => router.push('/growth/campaign-new?type=REACTIVATION&inactive_days=60')}
            className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-5"
          >
            <View className="flex-row items-center gap-2 mb-1.5">
              <CalendarHeart size={18} color="#BB3F95" />
              <Text className="text-sm font-bold text-spaceCadet-900">Bring customers back</Text>
            </View>
            <Text className="text-xs text-heliotrope-500 mt-0.5 leading-relaxed font-medium">
              {inactive} {inactive === 1 ? 'customer hasn\'t' : 'customers haven\'t'} interacted in
              60 days. One tap builds a reactivation campaign for them.
            </Text>
          </AnimatedPressable>
        )}

        {/* All growth modules */}
        <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider px-1 mb-3">
          Growth Suite & Accelerators
        </Text>
        <View className="gap-3">
          {GROWTH_MODULES.map(({ icon: Icon, label, hint, href }) => (
            <AnimatedPressable
              key={label}
              onPress={() => router.push(href as any)}
              accessibilityRole="button"
              accessibilityLabel={label}
              className="flex-row items-center bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm"
            >
              <View
                className="w-11 h-11 rounded-2xl items-center justify-center mr-3.5 bg-lavender-100 border border-lavender-200"
              >
                <Icon size={20} color="#BB3F95" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-spaceCadet-900">{label}</Text>
                <Text className="text-xs text-heliotrope-500 mt-0.5 font-medium">{hint}</Text>
              </View>
              <ChevronRight size={18} color="#928EB2" />
            </AnimatedPressable>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
