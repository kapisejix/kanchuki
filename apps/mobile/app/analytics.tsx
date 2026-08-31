import { memo } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import {
  Eye,
  MessageCircle,
  Heart,
  Package,
  TrendingUp,
  BarChart3,
  Store,
} from 'lucide-react-native'
import { analyticsApi, retailerApi } from '../src/lib/api'
import { AnalyticsSkeleton } from '../src/components/Skeleton'
import { useTheme } from '../src/lib/theme'
import { AnimatedPressable } from '../src/components/AnimatedPressable'

// ── Types ─────────────────────────────────────────────────────────

type Analytics = {
  daily_trends: { date: string; views: number; enquiries: number }[]
  category_breakdown: { category: string; count: number }[]
  status_breakdown: { status: string; count: number }[]
  recent_collections: {
    id: string
    title: string
    slug: string
    status: string
    view_count: number
    enquiry_count: number
    favorite_count: number
    product_count: number
    created_at: string
  }[]
  plan: {
    plan: string
    plan_status: string
    max_products: number
    max_customers: number
    try_on_credits: number
  } | null
}

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days[d.getDay()]
}

// ponytail: categorical chart palette needs 6 distinct swatches — the blanket
// hex remap collapsed several to the same value, so these are hand-picked
// from the ink/rust/turmeric/sand ramps (tailwind.config.js) instead. First
// swatch is the admin-configurable brand color, so it's injected by the
// component (module scope can't call useTheme()).

// ── Stat Card ──────────────────────────────────────────────────────

const StatCard = memo(function StatCard({
  icon,
  label,
  value,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  color?: string
  subtitle?: string
  onPress?: () => void
}) {
  const content = (
    <View className="flex-1 bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm min-w-[48%]">
      <View className="flex-row items-center gap-2 mb-3">
        <View className="w-10 h-10 rounded-2xl items-center justify-center bg-lavender-100 border border-lavender-200">
          {icon}
        </View>
      </View>
      <Text
        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
        className="text-2xl font-bold text-spaceCadet-900"
      >
        {value}
      </Text>
      <Text className="text-xs font-bold text-spaceCadet-900 mt-1 uppercase tracking-wider">{label}</Text>
      {subtitle && <Text className="text-[11px] text-heliotrope-500 mt-0.5 font-medium">{subtitle}</Text>}
    </View>
  )

  if (onPress) {
    return <AnimatedPressable onPress={onPress} className="w-[48%]">{content}</AnimatedPressable>
  }
  return <View className="w-[48%]">{content}</View>
})

// ── Mini Bar Chart ─────────────────────────────────────────────────

function MiniBarChart({
  data,
  maxValue,
  color,
}: {
  data: { label: string; value: number }[]
  maxValue: number
  color: string
}) {
  const max = Math.max(maxValue, 1)
  return (
    <View className="flex-row items-end gap-2 h-24 pt-2">
      {data.map((d, i) => {
        const height = Math.max((d.value / max) * 70, d.value > 0 ? 8 : 3)
        return (
          <View key={i} className="flex-1 items-center gap-1.5">
            <Text className="text-[10px] text-heliotrope-500 font-bold">
              {d.value > 0 ? d.value : ''}
            </Text>
            <View
              className="w-full rounded-t-lg"
              style={{
                height,
                backgroundColor: d.value > 0 ? color : '#E0E1F6',
              }}
            />
            <Text className="text-[10px] text-heliotrope-500 font-bold">{d.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ── Category Breakdown ─────────────────────────────────────────────

function CategoryBreakdown({
  data,
}: {
  data: { category: string; count: number }[]
}) {
  const CHART_COLORS = [
    '#BB3F95',
    '#231F48',
    '#560A39',
    '#6B4773',
    '#845EC2',
    '#D65CB3',
  ]
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return null

  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
      <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-4">
        Products by Category
      </Text>
      {data.slice(0, 6).map((d, i) => {
        const pct = Math.round((d.count / total) * 100)
        return (
          <View key={d.category} className="flex-row items-center gap-3 mb-3">
            <View
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <Text className="flex-1 text-sm font-bold text-spaceCadet-900">{d.category}</Text>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xs font-bold text-spaceCadet-900"
            >
              {d.count} ({pct}%)
            </Text>
            <View className="w-16 bg-lavender-100 rounded-full h-2 overflow-hidden border border-lavender-200">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
            </View>
          </View>
        )
      })}
    </View>
  )
}

// ── Collection Card ────────────────────────────────────────────────

const CollectionCard = memo(function CollectionCard({
  item,
}: {
  item: Analytics['recent_collections'][0]
}) {
  return (
    <AnimatedPressable
      onPress={() => router.push({ pathname: '/collection/[id]', params: { id: item.id } })}
      className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm"
    >
      <View className="flex-row items-start justify-between mb-3">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-base font-bold text-spaceCadet-900 flex-1 mr-2"
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <View
          className={`px-3 py-1 rounded-full border ${
            item.status === 'ACTIVE'
              ? 'bg-fuchsia-500/15 border-fuchsia-500/30'
              : 'bg-lavender-100 border-lavender-200'
          }`}
        >
          <Text
            className={`text-[10px] font-bold ${
              item.status === 'ACTIVE' ? 'text-fuchsia-700' : 'text-heliotrope-500'
            }`}
          >
            {item.status}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-4 pt-2 border-t border-lavender-200">
        <View className="flex-row items-center gap-1.5">
          <Eye size={14} color="#BB3F95" />
          <Text className="text-xs font-bold text-spaceCadet-900">{item.view_count}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <MessageCircle size={14} color="#BB3F95" />
          <Text className="text-xs font-bold text-spaceCadet-900">{item.enquiry_count}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Heart size={14} color="#BB3F95" />
          <Text className="text-xs font-bold text-spaceCadet-900">{item.favorite_count}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Package size={14} color="#BB3F95" />
          <Text className="text-xs font-bold text-spaceCadet-900">{item.product_count}</Text>
        </View>
      </View>
    </AnimatedPressable>
  )
})

// ── Plan Usage Bar ─────────────────────────────────────────────────

function PlanUsageBar({
  current,
  max,
  label,
}: {
  current: number
  max: number
  label: string
}) {
  const pct = Math.min(Math.round((current / Math.max(max, 1)) * 100), 100)
  return (
    <View className="mb-3">
      <View className="flex-row justify-between items-center mb-1.5">
        <Text className="text-xs font-bold text-spaceCadet-900">{label}</Text>
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-xs font-bold text-spaceCadet-900"
        >
          {current} / {max >= 999999 ? '∞' : max.toLocaleString('en-IN')}
        </Text>
      </View>
      <View className="h-2 bg-lavender-100 rounded-full overflow-hidden border border-lavender-200">
        <View
          className="h-full rounded-full bg-fuchsia-600"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </View>
    </View>
  )
}

// ── Analytics Screen ───────────────────────────────────────────────

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets()
  const { primaryColor, colors } = useTheme()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => analyticsApi.getAnalytics(),
    staleTime: 60_000,
    gcTime: 300_000,
  })

  const analytics = (data as { data: Analytics } | undefined)?.data

  if (isLoading) {
    return <AnalyticsSkeleton />
  }

  const trends = analytics?.daily_trends ?? []
  const maxViews = Math.max(...trends.map((d) => d.views), 1)
  const totalViews = trends.reduce((s, d) => s + d.views, 0)
  const totalEnquiries = trends.reduce((s, d) => s + d.enquiries, 0)

  return (
    <ScrollView
      className="flex-1 bg-[#F8F7FC]"
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} />
      }
    >
      {/* Page Header */}
      <View
        className="bg-white px-5 pb-4 border-b border-lavender-200"
        style={{ paddingTop: insets.top + 16 }}
      >
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-2xl font-bold text-spaceCadet-900"
        >
          Store Analytics
        </Text>
        <Text className="text-xs text-heliotrope-500 mt-0.5 font-medium">
          Last 7 days performance overview
        </Text>
      </View>

      <View className="p-4 gap-4">
        {/* Overview Stats */}
        <View className="flex-row flex-wrap gap-3">
          <StatCard
            icon={<Eye size={20} color="#BB3F95" />}
            label="Total Views"
            value={totalViews.toLocaleString('en-IN')}
            subtitle="Across all collections"
          />
          <StatCard
            icon={<MessageCircle size={20} color="#BB3F95" />}
            label="Enquiries"
            value={totalEnquiries.toLocaleString('en-IN')}
            subtitle="WhatsApp leads"
          />
          <StatCard
            icon={<Package size={20} color="#BB3F95" />}
            label="Available SKUs"
            value={
              (analytics?.status_breakdown
                ?.find((s) => s.status === 'AVAILABLE')
                ?.count ?? 0).toLocaleString('en-IN')
            }
          />
          <StatCard
            icon={<BarChart3 size={20} color="#BB3F95" />}
            label="Total Products"
            value={
              (analytics?.status_breakdown
                ?.reduce((s, g) => s + g.count, 0) ?? 0).toLocaleString('en-IN')
            }
          />
        </View>

        {/* Daily Trend Chart */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
              Daily Views (7 Days)
            </Text>
            <TrendingUp size={16} color="#BB3F95" />
          </View>
          <MiniBarChart
            data={trends.map((d) => ({
              label: formatDate(d.date),
              value: d.views,
            }))}
            maxValue={maxViews}
            color="#BB3F95"
          />
          {totalViews === 0 && (
            <Text className="text-xs text-heliotrope-500 font-medium text-center mt-3">
              Share a collection link to start seeing views
            </Text>
          )}
        </View>

        {/* Daily Enquiries Chart */}
        {trends.some((d) => d.enquiries > 0) && (
          <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
                Daily Enquiries
              </Text>
              <MessageCircle size={16} color="#BB3F95" />
            </View>
            <MiniBarChart
              data={trends.map((d) => ({
                label: formatDate(d.date),
                value: d.enquiries,
              }))}
              maxValue={Math.max(...trends.map((d) => d.enquiries), 1)}
              color="#231F48"
            />
          </View>
        )}

        {/* Category Breakdown */}
        {(analytics?.category_breakdown?.length ?? 0) > 0 && (
          <CategoryBreakdown data={analytics!.category_breakdown} />
        )}

        {/* Plan Usage */}
        {analytics?.plan && (
          <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
                Plan Usage & Limits
              </Text>
              <View className="flex-row items-center gap-1.5">
                <Store size={14} color="#BB3F95" />
                <Text className="text-xs text-spaceCadet-900 font-bold">
                  {analytics.plan.plan}
                </Text>
                <View
                  className="px-2.5 py-0.5 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30"
                >
                  <Text className="text-[10px] font-bold text-fuchsia-700">
                    {analytics.plan.plan_status}
                  </Text>
                </View>
              </View>
            </View>
            <PlanUsageBar
              label="Products in Catalog"
              current={
                analytics.status_breakdown?.reduce((s, g) => s + g.count, 0) ?? 0
              }
              max={analytics.plan.max_products}
            />
            <PlanUsageBar
              label="Customer Contacts"
              current={analytics.recent_collections.length}
              max={analytics.plan.max_customers}
            />
            <AnimatedPressable
              onPress={() => router.push('/plan-select')}
              className="mt-3 bg-spaceCadet-900 py-3 rounded-2xl items-center"
            >
              <Text className="text-white text-xs font-bold uppercase tracking-wider">
                Manage Subscription & Billing
              </Text>
            </AnimatedPressable>
          </View>
        )}

        {/* Recent Collections */}
        {(analytics?.recent_collections?.length ?? 0) > 0 && (
          <View className="gap-3">
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider px-1">
              Recent Collections
            </Text>
            {analytics!.recent_collections.map((c) => (
              <CollectionCard key={c.id} item={c} />
            ))}
          </View>
        )}

        {/* Empty state */}
        {(analytics?.status_breakdown?.reduce((s, g) => s + g.count, 0) ?? 0) === 0 && (
          <View className="items-center py-10">
            <BarChart3 size={48} color="#928EB2" />
            <Text className="text-heliotrope-500 text-sm mt-4 text-center font-medium">
              No data yet.{'\n'}Start by adding products and sharing collections.
            </Text>
          </View>
        )}
      </View>

      <View style={{ height: insets.bottom + 32 }} />
    </ScrollView>
  )
}
