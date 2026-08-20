import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  Star,
  ExternalLink,
  Flag,
  MessageSquare,
  ShoppingBag,
  Store,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { growthApi } from '../../src/lib/api/growth'
import { useTheme } from '../../src/lib/theme'

// ─── Helpers ─────────────────────────────────────────────────────

const StarRating = ({
  rating,
  size = 14,
  color,
}: {
  rating: number
  size?: number
  color?: string
}) => {
  const filled = color ?? '#F59E0B'
  const empty = '#E5E7EB'
  return (
    <View className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          color={i <= Math.round(rating) ? filled : empty}
          fill={i <= Math.round(rating) ? filled : 'transparent'}
        />
      ))}
    </View>
  )
}

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ─── Main Screen ─────────────────────────────────────────────────

export default function RatingsScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<'summary' | 'product' | 'store'>('summary')

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'reviews', 'summary'],
    queryFn: () => growthApi.reviewSummary(),
  })
  const summary = data?.data

  const { data: productData } = useQuery({
    queryKey: ['growth', 'reviews', 'products'],
    queryFn: () => growthApi.productReviews({ limit: 20 }),
    enabled: tab === 'product',
  })

  const { data: storeData } = useQuery({
    queryKey: ['growth', 'reviews', 'stores'],
    queryFn: () => growthApi.storeReviews({ limit: 20 }),
    enabled: tab === 'store',
  })

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
          <View className="flex-1">
            <Text className="text-base font-bold text-sand-900">Ratings & Reviews</Text>
            <Text className="text-xs text-sand-400">
              {summary?.store.rating_count ?? 0} reviews
            </Text>
          </View>
        </View>

        {/* Tab bar */}
        <View className="flex-row gap-2 mt-4">
          {[
            { key: 'summary' as const, label: 'Summary', icon: Star },
            { key: 'product' as const, label: 'Products', icon: ShoppingBag },
            { key: 'store' as const, label: 'Store', icon: Store },
          ].map(({ key, label, icon: Icon }) => (
            <AnimatedPressable
              key={key}
              onPress={() => setTab(key)}
              className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-xl"
              style={{
                backgroundColor: tab === key ? `${primaryColor}1A` : colors.sand[50],
              }}
            >
              <Icon
                size={14}
                color={tab === key ? primaryColor : colors.sand[400]}
              />
              <Text
                className="text-xs font-semibold"
                style={{ color: tab === key ? primaryColor : colors.sand[500] }}
              >
                {label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          {tab === 'summary' && summary && (
            <SummaryTab summary={summary} primaryColor={primaryColor} colors={colors} />
          )}
          {tab === 'product' && (
            <ProductReviewsTab
              reviews={productData?.data ?? []}
              primaryColor={primaryColor}
              colors={colors}
            />
          )}
          {tab === 'store' && (
            <StoreReviewsTab
              reviews={storeData?.data ?? []}
              primaryColor={primaryColor}
              colors={colors}
            />
          )}
        </ScrollView>
      )}
    </View>
  )
}

// ─── Summary Tab ─────────────────────────────────────────────────

function SummaryTab({
  summary,
  primaryColor,
  colors,
}: {
  summary: any
  primaryColor: string
  colors: any
}) {
  return (
    <View className="gap-4">
      {/* Store rating overview */}
      <View className="bg-white rounded-2xl p-5 border border-sand-100">
        <Text className="text-sm font-bold text-sand-900 mb-3">Store Rating</Text>
        <View className="flex-row items-center gap-4">
          <View className="items-center">
            <Text className="text-3xl font-bold text-sand-900">
              {summary.store.avg_rating.toFixed(1)}
            </Text>
            <StarRating rating={summary.store.avg_rating} size={16} />
            <Text className="text-xs text-sand-400 mt-1">
              {summary.store.rating_count} reviews
            </Text>
          </View>
          <View className="flex-1 gap-1">
            {summary.store.distribution
              .slice()
              .reverse()
              .map(({ star, count }: { star: number; count: number }) => {
                const pct = summary.store.rating_count
                  ? (count / summary.store.rating_count) * 100
                  : 0
                return (
                  <View key={star} className="flex-row items-center gap-2">
                    <Text className="text-xs text-sand-500 w-3">{star}</Text>
                    <Star size={10} color="#F59E0B" fill="#F59E0B" />
                    <View className="flex-1 h-2 bg-sand-100 rounded-full overflow-hidden">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: primaryColor,
                        }}
                      />
                    </View>
                    <Text className="text-xs text-sand-400 w-6 text-right">{count}</Text>
                  </View>
                )
              })}
          </View>
        </View>
      </View>

      {/* Google review link */}
      {summary.google_review_url && (
        <AnimatedPressable
          onPress={() => {
            /* Linking.openURL(summary.google_review_url) */
          }}
          className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center gap-3"
        >
          <View
            className="w-10 h-10 rounded-xl items-center justify-center"
            style={{ backgroundColor: '#4285F41A' }}
          >
            <ExternalLink size={18} color="#4285F4" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-sand-900">Google Review Link</Text>
            <Text className="text-xs text-sand-400">Share with happy customers</Text>
          </View>
          <ChevronLeft size={16} color={colors.sand[300]} style={{ transform: [{ rotate: '180deg' }] }} />
        </AnimatedPressable>
      )}

      {/* Top reviewed products */}
      {summary.top_products.length > 0 && (
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-sm font-bold text-sand-900 mb-3">Top Reviewed Products</Text>
          <View className="gap-3">
            {summary.top_products.map((p: any) => (
              <View key={p.id} className="flex-row items-center gap-3">
                <View
                  className="w-8 h-8 rounded-lg"
                  style={{ backgroundColor: p.primary_color ? `${p.primary_color}30` : colors.sand[100] }}
                />
                <View className="flex-1">
                  <Text className="text-sm font-medium text-sand-900" numberOfLines={1}>
                    {p.name ?? 'Untitled'}
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <StarRating rating={p.avg_rating} size={10} />
                    <Text className="text-xs text-sand-400">
                      {p.avg_rating.toFixed(1)} ({p.rating_count})
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Recent reviews */}
      {summary.recent_reviews.length > 0 && (
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-sm font-bold text-sand-900 mb-3">Recent Reviews</Text>
          <View className="gap-3">
            {summary.recent_reviews.map((r: any) => (
              <View key={r.id} className="border-b border-sand-50 pb-3 last:border-b-0">
                <View className="flex-row items-center gap-2 mb-1">
                  <StarRating rating={r.rating} size={12} />
                  <Text className="text-xs text-sand-400">{timeAgo(r.created_at)}</Text>
                  <View
                    className="rounded-full px-2 py-0.5 ml-auto"
                    style={{
                      backgroundColor: r.type === 'product' ? '#8B5CF61A' : '#10B9811A',
                    }}
                  >
                    <Text
                      className="text-[10px] font-semibold"
                      style={{ color: r.type === 'product' ? '#8B5CF6' : '#10B981' }}
                    >
                      {r.type === 'product' ? 'Product' : 'Store'}
                    </Text>
                  </View>
                </View>
                <Text className="text-xs text-sand-600">
                  {r.customer?.name ?? 'Anonymous'}
                  {r.type === 'product' && r.product ? ` on ${r.product.name}` : ''}
                </Text>
                {r.comment && (
                  <Text className="text-xs text-sand-500 mt-1">{r.comment}</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  )
}

// ─── Product Reviews Tab ─────────────────────────────────────────

function ProductReviewsTab({
  reviews,
  primaryColor,
  colors,
}: {
  reviews: any[]
  primaryColor: string
  colors: any
}) {
  if (reviews.length === 0) {
    return (
      <View className="items-center py-12">
        <View
          className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
          style={{ backgroundColor: `${primaryColor}1A` }}
        >
          <MessageSquare size={28} color={primaryColor} />
        </View>
        <Text className="text-base font-bold text-sand-900">No product reviews yet</Text>
        <Text className="text-xs text-sand-500 text-center mt-1.5 max-w-[260px]">
          Reviews will appear here when customers rate your products.
        </Text>
      </View>
    )
  }

  return (
    <View className="gap-2.5">
      {reviews.map((r) => (
        <View key={r.id} className="bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center gap-2 mb-2">
            <StarRating rating={r.rating} size={14} />
            <Text className="text-xs text-sand-400 ml-auto">{timeAgo(r.created_at)}</Text>
            {r.is_flagged && (
              <View className="bg-red-50 rounded-full px-2 py-0.5">
                <Flag size={10} color="#EF4444" />
              </View>
            )}
          </View>
          <Text className="text-sm font-medium text-sand-900" numberOfLines={1}>
            {r.product?.name ?? 'Unknown product'}
          </Text>
          <Text className="text-xs text-sand-500 mt-0.5">
            by {r.customer?.name ?? 'Anonymous'}
          </Text>
          {r.comment && (
            <Text className="text-xs text-sand-600 mt-2 leading-4">{r.comment}</Text>
          )}
        </View>
      ))}
    </View>
  )
}

// ─── Store Reviews Tab ───────────────────────────────────────────

function StoreReviewsTab({
  reviews,
  primaryColor,
  colors,
}: {
  reviews: any[]
  primaryColor: string
  colors: any
}) {
  if (reviews.length === 0) {
    return (
      <View className="items-center py-12">
        <View
          className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
          style={{ backgroundColor: `${primaryColor}1A` }}
        >
          <Store size={28} color={primaryColor} />
        </View>
        <Text className="text-base font-bold text-sand-900">No store reviews yet</Text>
        <Text className="text-xs text-sand-500 text-center mt-1.5 max-w-[260px]">
          Store reviews will appear here when customers rate your shop experience.
        </Text>
      </View>
    )
  }

  return (
    <View className="gap-2.5">
      {reviews.map((r) => (
        <View key={r.id} className="bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center gap-2 mb-2">
            <StarRating rating={r.rating} size={14} />
            <Text className="text-xs text-sand-400 ml-auto">{timeAgo(r.created_at)}</Text>
            {r.is_flagged && (
              <View className="bg-red-50 rounded-full px-2 py-0.5">
                <Flag size={10} color="#EF4444" />
              </View>
            )}
          </View>
          <Text className="text-xs text-sand-500">
            by {r.customer?.name ?? 'Anonymous'}
          </Text>
          {r.comment && (
            <Text className="text-xs text-sand-600 mt-2 leading-4">{r.comment}</Text>
          )}
        </View>
      ))}
    </View>
  )
}
