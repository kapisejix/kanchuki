import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Languages,
  Megaphone,
  PackageSearch,
  Percent,
  Sparkles,
  Truck,
  Users,
  Video,
  Wand2,
} from 'lucide-react-native'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi, type CampaignType } from '../../src/lib/api'
import { ApiError } from '../../src/lib/api/client'
import { useTheme } from '../../src/lib/theme'

const TYPE_LABEL: Record<CampaignType, string> = {
  FESTIVAL: 'Festival',
  REACTIVATION: 'Reactivation',
  PROMOTION: 'Promotion',
  AB_TEST: 'A/B Test',
}

// Every growth module now has a live screen. Each card routes to its module.
const GROWTH_MODULES = [
  { icon: Wand2, label: 'AI Campaign Assistant', hint: 'Type a command, get a campaign', href: '/growth/ai-campaign' as const },
  { icon: Users, label: 'Referrals', hint: 'Customers bring customers', href: '/growth/referrals' as const },
  { icon: Percent, label: 'Promotions', hint: 'Discount codes & offers', href: '/growth/promotions' as const },
  { icon: Truck, label: 'Suppliers', hint: 'Orders & pending payments', href: '/growth/suppliers' as const },
  { icon: DoorOpen, label: 'Try-on Bookings', hint: 'In-store slot booking', href: '/growth/bookings' as const },
  { icon: PackageSearch, label: 'Inventory Alerts', hint: 'Dead stock & reorders', href: '/growth/inventory' as const },
  { icon: Video, label: 'Product Videos', hint: '5–10s clips on your catalog', href: '/growth/videos' as const },
  { icon: Languages, label: 'AI Translate', hint: 'Hindi & regional descriptions', href: '/growth/translate' as const },
]

function isFeatureUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'FEATURE_UNAVAILABLE'
}

export default function GrowthHubScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()

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
          <Text className="text-base font-bold text-sand-900">Growth Tools</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero */}
        <View className="bg-ink-600 rounded-3xl p-5 mb-4">
          <View className="flex-row items-center gap-2 mb-1.5">
            <Sparkles size={16} color={colors.turmeric[400]} />
            <Text className="text-turmeric-300 text-xs font-semibold uppercase tracking-wide">
              Grow your store
            </Text>
          </View>
          <Text className="text-white text-lg font-bold leading-6">
            Bring customers back and win new ones — without the manual work.
          </Text>
        </View>

        {featureLocked && (
          <View className="bg-sand-100 rounded-2xl p-4 border border-sand-200 mb-4">
            <Text className="text-sm font-semibold text-sand-900">
              Growth tools aren't on your current plan
            </Text>
            <Text className="text-xs text-sand-600 mt-1">
              Upgrade to unlock campaigns, referrals and the rest of the growth suite.
            </Text>
            <View className="mt-3">
              <GradientButton label="View Plans" onPress={() => router.push('/billing')} />
            </View>
          </View>
        )}

        {/* Campaigns — the live module */}
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-2.5">
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide px-1">
              Campaigns
            </Text>
            <View className="flex-row items-center gap-3">
              <AnimatedPressable
                onPress={() => router.push('/growth/analytics')}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text className="text-xs font-semibold" style={{ color: primaryColor }}>
                  Analytics
                </Text>
              </AnimatedPressable>
              {campaigns.length > 0 && (
                <AnimatedPressable
                  onPress={() => router.push('/growth/campaigns')}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold" style={{ color: primaryColor }}>
                    View all
                  </Text>
                </AnimatedPressable>
              )}
            </View>
          </View>

          {loading ? (
            <View className="bg-white rounded-2xl p-6 border border-sand-100 items-center">
              <ActivityIndicator color={primaryColor} />
            </View>
          ) : (
            <AnimatedPressable
              onPress={() => router.push('/growth/campaigns')}
              className="bg-white rounded-2xl p-4 border border-sand-100"
            >
              {campaigns.length === 0 && featureLocked ? (
                <View className="flex-row items-center gap-2 py-1">
                  <Megaphone size={18} color={colors.sand[400]} />
                  <Text className="text-sm font-semibold text-sand-500">
                    Campaigns unlock with a plan upgrade
                  </Text>
                </View>
              ) : campaigns.length === 0 ? (
                <>
                  <View className="flex-row items-center gap-2 mb-1">
                    <Megaphone size={18} color={primaryColor} />
                    <Text className="text-sm font-bold text-sand-900">
                      Send your first campaign
                    </Text>
                  </View>
                  <Text className="text-xs text-sand-500 mt-0.5 leading-4">
                    Festival greetings, reactivation offers, or a simple new-arrivals blast to
                    your consented customers.
                  </Text>
                  <View className="mt-3">
                    <GradientButton
                      label="Create Campaign"
                      onPress={() => router.push('/growth/campaign-new')}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View className="flex-row items-center gap-2 mb-2.5">
                    <View
                      className="w-9 h-9 rounded-xl items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}1A` }}
                    >
                      <Megaphone size={18} color={primaryColor} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-sand-900">
                        {campaigns.length} {campaigns.length === 1 ? 'Campaign' : 'Campaigns'}
                      </Text>
                      <Text className="text-xs text-sand-400">
                        {sentTotal} sent · {openedTotal} opened
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.sand[400]} />
                  </View>
                  <View className="gap-1.5">
                    {campaigns.slice(0, 3).map((c) => (
                      <View
                        key={c.id}
                        className="flex-row items-center justify-between bg-sand-50 rounded-xl px-3 py-2"
                      >
                        <Text className="text-xs font-medium text-sand-700 flex-1 mr-2" numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text className="text-[10px] font-semibold text-sand-400 uppercase">
                          {c.status === 'SENT' ? `${c.sent_count} sent` : TYPE_LABEL[c.type]}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View className="flex-row gap-3 mt-3">
                    <View className="flex-1">
                      <GradientButton
                        label="+ New"
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
            className="bg-white rounded-2xl p-4 border border-sand-100 mb-4"
          >
            <View className="flex-row items-center gap-2 mb-1">
              <CalendarHeart size={18} color={colors.rust[600]} />
              <Text className="text-sm font-bold text-sand-900">Bring customers back</Text>
            </View>
            <Text className="text-xs text-sand-500 mt-0.5 leading-4">
              {inactive} {inactive === 1 ? 'customer hasn\'t' : 'customers haven\'t'} interacted in
              60 days. One tap builds a reactivation campaign for them.
            </Text>
          </AnimatedPressable>
        )}

        {/* All growth modules — each opens its live screen */}
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide px-1 mb-2.5">
          More Growth Tools
        </Text>
        <View className="gap-2.5">
          {GROWTH_MODULES.map(({ icon: Icon, label, hint, href }) => (
                  <AnimatedPressable
                    key={label}
                    onPress={() => router.push(href as any)}
                    accessibilityRole="button"
              accessibilityLabel={label}
              className="flex-row items-center bg-white rounded-2xl p-4 border border-sand-100"
            >
              <View
                className="w-9 h-9 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: `${primaryColor}1A` }}
              >
                <Icon size={18} color={primaryColor} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-sand-900">{label}</Text>
                <Text className="text-xs text-sand-400 mt-0.5">{hint}</Text>
              </View>
              <ChevronRight size={16} color={colors.sand[300]} />
            </AnimatedPressable>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
