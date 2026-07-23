import { memo } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
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
import { analyticsApi, retailerApi } from '../../src/lib/api'

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

const COLORS = ['#0891B2', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899']

// ── Stat Card ──────────────────────────────────────────────────────

const StatCard = memo(function StatCard({
  icon,
  label,
  value,
  color,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
  subtitle?: string
  onPress?: () => void
}) {
  const content = (
    <View className="flex-1 bg-white rounded-2xl p-4 border border-gray-100 min-w-[48%]">
      <View className="flex-row items-center gap-2 mb-2">
        <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          {icon}
        </View>
      </View>
      <Text className="text-2xl font-bold text-gray-900">{value}</Text>
      <Text className="text-xs text-gray-500 mt-0.5">{label}</Text>
      {subtitle && <Text className="text-[10px] text-gray-400 mt-0.5">{subtitle}</Text>}
    </View>
  )

  if (onPress) {
    return <TouchableOpacity onPress={onPress} className="w-[48%]">{content}</TouchableOpacity>
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
    <View className="flex-row items-end gap-1.5 h-24">
      {data.map((d, i) => {
        const height = Math.max((d.value / max) * 80, d.value > 0 ? 8 : 2)
        return (
          <View key={i} className="flex-1 items-center gap-1">
            <Text className="text-[10px] text-gray-400 font-medium">
              {d.value > 0 ? d.value : ''}
            </Text>
            <View
              className="w-full rounded-t-md"
              style={{
                height,
                backgroundColor: d.value > 0 ? color : '#F3F4F6',
                opacity: d.value > 0 ? 0.5 + (d.value / max) * 0.5 : 1,
              }}
            />
            <Text className="text-[10px] text-gray-400">{d.label}</Text>
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
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return null

  return (
    <View className="bg-white rounded-2xl p-4 border border-gray-100">
      <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Products by Category
      </Text>
      {data.slice(0, 6).map((d, i) => {
        const pct = Math.round((d.count / total) * 100)
        return (
          <View key={d.category} className="flex-row items-center gap-2 mb-2">
            <View
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <Text className="flex-1 text-sm text-gray-700">{d.category}</Text>
            <Text className="text-xs font-semibold text-gray-900">{d.count}</Text>
            <View className="w-12 bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: COLORS[i % COLORS.length],
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
    <TouchableOpacity
      onPress={() => router.push({ pathname: '/collection/[id]', params: { id: item.id } })}
      className="bg-white rounded-2xl p-4 border border-gray-100"
    >
      <View className="flex-row items-start justify-between mb-2">
        <Text className="text-sm font-semibold text-gray-900 flex-1 mr-2" numberOfLines={1}>
          {item.title}
        </Text>
        <View
          className={`px-2 py-0.5 rounded-full ${
            item.status === 'ACTIVE' ? 'bg-green-100' : 'bg-gray-100'
          }`}
        >
          <Text
            className={`text-[10px] font-medium ${
              item.status === 'ACTIVE' ? 'text-green-700' : 'text-gray-500'
            }`}
          >
            {item.status}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-row items-center gap-1">
          <Eye size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500">{item.view_count}</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <MessageCircle size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500">{item.enquiry_count}</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Heart size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500">{item.favorite_count}</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Package size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500">{item.product_count}</Text>
        </View>
      </View>
    </TouchableOpacity>
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
  const isNearLimit = pct >= 80
  return (
    <View className="mb-2">
      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-xs text-gray-600">{label}</Text>
        <Text className="text-xs font-semibold text-gray-900">
          {current}/{max >= 999999 ? '∞' : max.toLocaleString('en-IN')}
        </Text>
      </View>
      <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <View
          className={`h-full rounded-full ${isNearLimit ? 'bg-amber-500' : 'bg-cyan-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </View>
    </View>
  )
}

// ── Analytics Screen ───────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => analyticsApi.getAnalytics(),
    staleTime: 60_000,
    gcTime: 300_000,
  })

  const analytics = (data as { data: Analytics } | undefined)?.data

  if (isLoading) {
    return (
      <View className="flex-1 bg-cyan-50 items-center justify-center">
        <ActivityIndicator color="#0891B2" />
      </View>
    )
  }

  const trends = analytics?.daily_trends ?? []
  const maxViews = Math.max(...trends.map((d) => d.views), 1)
  const totalViews = trends.reduce((s, d) => s + d.views, 0)
  const totalEnquiries = trends.reduce((s, d) => s + d.enquiries, 0)

  return (
    <ScrollView
      className="flex-1 bg-cyan-50"
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} />
      }
    >
      {/* Page Header */}
      <View className="bg-white px-4 pt-4 pb-5 border-b border-gray-100">
        <Text className="text-2xl font-bold text-gray-900">Analytics</Text>
        <Text className="text-sm text-gray-500 mt-1">
          Last 7 days overview
        </Text>
      </View>

      <View className="p-4 gap-4">
        {/* Overview Stats */}
        <View className="flex-row flex-wrap gap-3">
          <StatCard
            icon={<Eye size={18} color="#0891B2" />}
            label="Total Views (7d)"
            value={totalViews.toLocaleString('en-IN')}
            color="#0891B2"
            subtitle="Across all collections"
          />
          <StatCard
            icon={<MessageCircle size={18} color="#10B981" />}
            label="Total Enquiries (7d)"
            value={totalEnquiries.toLocaleString('en-IN')}
            color="#10B981"
            subtitle="Customer enquiries"
          />
          <StatCard
            icon={<Package size={18} color="#F59E0B" />}
            label="Active Products"
            value={
              (analytics?.status_breakdown
                ?.find((s) => s.status === 'AVAILABLE')
                ?.count ?? 0).toLocaleString('en-IN')
            }
            color="#F59E0B"
          />
          <StatCard
            icon={<BarChart3 size={18} color="#3B82F6" />}
            label="Total Products"
            value={
              (analytics?.status_breakdown
                ?.reduce((s, g) => s + g.count, 0) ?? 0).toLocaleString('en-IN')
            }
            color="#3B82F6"
          />
        </View>

        {/* Daily Trend Chart */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Daily Views
            </Text>
            <TrendingUp size={16} color="#0891B2" />
          </View>
          <MiniBarChart
            data={trends.map((d) => ({
              label: formatDate(d.date),
              value: d.views,
            }))}
            maxValue={maxViews}
            color="#0891B2"
          />
          {totalViews === 0 && (
            <Text className="text-xs text-gray-400 text-center mt-3">
              Share a collection link to start seeing views
            </Text>
          )}
        </View>

        {/* Daily Enquiries Chart */}
        {trends.some((d) => d.enquiries > 0) && (
          <View className="bg-white rounded-2xl p-4 border border-gray-100">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Daily Enquiries
              </Text>
              <MessageCircle size={16} color="#10B981" />
            </View>
            <MiniBarChart
              data={trends.map((d) => ({
                label: formatDate(d.date),
                value: d.enquiries,
              }))}
              maxValue={Math.max(...trends.map((d) => d.enquiries), 1)}
              color="#10B981"
            />
          </View>
        )}

        {/* Category Breakdown */}
        {(analytics?.category_breakdown?.length ?? 0) > 0 && (
          <CategoryBreakdown data={analytics!.category_breakdown} />
        )}

        {/* Plan Usage */}
        {analytics?.plan && (
          <View className="bg-white rounded-2xl p-4 border border-gray-100">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Plan Usage
              </Text>
              <View className="flex-row items-center gap-1">
                <Store size={12} color="#9CA3AF" />
                <Text className="text-xs text-gray-500 font-medium">
                  {analytics.plan.plan}
                </Text>
                <View
                  className={`px-1.5 py-0.5 rounded-full ${
                    analytics.plan.plan_status === 'ACTIVE'
                      ? 'bg-green-100'
                      : analytics.plan.plan_status === 'TRIAL'
                        ? 'bg-amber-100'
                        : 'bg-gray-100'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-medium ${
                      analytics.plan.plan_status === 'ACTIVE'
                        ? 'text-green-700'
                        : analytics.plan.plan_status === 'TRIAL'
                          ? 'text-amber-700'
                          : 'text-gray-500'
                    }`}
                  >
                    {analytics.plan.plan_status}
                  </Text>
                </View>
              </View>
            </View>
            <PlanUsageBar
              label="Products"
              current={
                analytics.status_breakdown?.reduce((s, g) => s + g.count, 0) ?? 0
              }
              max={analytics.plan.max_products}
            />
            <PlanUsageBar
              label="Customers"
              current={analytics.recent_collections.length}
              max={analytics.plan.max_customers}
            />
            <TouchableOpacity
              onPress={() => router.push('/billing')}
              className="mt-2 bg-cyan-50 border border-cyan-100 py-2.5 rounded-xl items-center"
            >
              <Text className="text-cyan-700 text-sm font-semibold">
                Manage Plan
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Recent Collections */}
        {(analytics?.recent_collections?.length ?? 0) > 0 && (
          <View className="gap-2">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
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
            <BarChart3 size={48} color="#D1D5DB" />
            <Text className="text-gray-400 text-sm mt-4 text-center">
              No data yet.{'\n'}Start by adding products and sharing collections.
            </Text>
          </View>
        )}
      </View>

      <View className="h-8" />
    </ScrollView>
  )
}
