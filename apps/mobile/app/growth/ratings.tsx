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
  const filled = color ?? '#BB3F95'
  const empty = '#E0E1F6'
  return (
    <View className="flex-row gap-1">
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
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <View className="flex-1">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Ratings & Reputation
            </Text>
            <Text className="text-xs text-heliotrope-500 font-medium">
              {summary?.store.rating_count ?? 0} verified reviews
            </Text>
          </View>
        </View>

        {/* Tab bar */}
        <View className="flex-row gap-2 mt-4">
          {[
            { key: 'summary' as const, label: 'Summary', icon: Star },
            { key: 'product' as const, label: 'Designs', icon: ShoppingBag },
            { key: 'store' as const, label: 'Boutique', icon: Store },
          ].map(({ key, label, icon: Icon }) => {
            const active = tab === key
            return (
              <AnimatedPressable
                key={key}
                onPress={() => setTab(key)}
                className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-2xl border ${
                  active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                }`}
              >
                <Icon
                  size={14}
                  color={active ? '#FFFFFF' : '#928EB2'}
                />
                <Text
                  className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
                >
                  {label}
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
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          {tab === 'summary' && summary && (
            <SummaryTab summary={summary} />
          )}
          {tab === 'product' && (
            <ProductReviewsTab
              reviews={productData?.data ?? []}
            />
          )}
          {tab === 'store' && (
            <StoreReviewsTab
              reviews={storeData?.data ?? []}
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
}: {
  summary: any
}) {
  return (
    <View className="gap-4">
      {/* Store rating overview */}
      <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-base font-bold text-spaceCadet-900 mb-3"
        >
          Overall Boutique Rating
        </Text>
        <View className="flex-row items-center gap-4">
          <View className="items-center">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-4xl font-bold text-spaceCadet-900"
            >
              {summary.store.avg_rating.toFixed(1)}
            </Text>
            <View className="my-1.5">
              <StarRating rating={summary.store.avg_rating} size={16} />
            </View>
            <Text className="text-xs text-heliotrope-500 font-medium">
              {summary.store.rating_count} reviews
            </Text>
          </View>
          <View className="flex-1 gap-1.5">
            {summary.store.distribution
              .slice()
              .reverse()
              .map(({ star, count }: { star: number; count: number }) => {
                const pct = summary.store.rating_count
                  ? (count / summary.store.rating_count) * 100
                  : 0
                return (
                  <View key={star} className="flex-row items-center gap-2">
                    <Text className="text-xs text-heliotrope-500 font-bold w-3">{star}</Text>
                    <Star size={11} color="#BB3F95" fill="#BB3F95" />
                    <View className="flex-1 h-2 bg-lavender-100 rounded-full overflow-hidden">
                      <View
                        className="h-full rounded-full bg-fuchsia-600"
                        style={{
                          width: `${pct}%`,
                        }}
                      />
                    </View>
                    <Text className="text-xs text-heliotrope-400 font-medium w-6 text-right">{count}</Text>
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
          className="bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm flex-row items-center gap-3.5"
        >
          <View
            className="w-11 h-11 rounded-2xl items-center justify-center bg-fuchsia-500/10 border border-fuchsia-500/20"
          >
            <ExternalLink size={20} color="#BB3F95" />
          </View>
          <View className="flex-1">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-sm font-bold text-spaceCadet-900"
            >
              Google & JustDial Review Link
            </Text>
            <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">Share with happy customers via WhatsApp</Text>
          </View>
          <ChevronLeft size={16} color="#928EB2" style={{ transform: [{ rotate: '180deg' }] }} />
        </AnimatedPressable>
      )}

      {/* Top reviewed products */}
      {summary.top_products.length > 0 && (
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-base font-bold text-spaceCadet-900 mb-3.5"
          >
            Top Rated Designs
          </Text>
          <View className="gap-3">
            {summary.top_products.map((p: any) => (
              <View key={p.id} className="flex-row items-center gap-3">
                <View
                  className="w-10 h-10 rounded-xl bg-lavender-100 border border-lavender-200 items-center justify-center"
                >
                  <ShoppingBag size={18} color="#BB3F95" />
                </View>
                <View className="flex-1">
                  <Text
                    style={{ fontFamily: 'Marcellus_400Regular' }}
                    className="text-sm font-bold text-spaceCadet-900"
                    numberOfLines={1}
                  >
                    {p.name ?? 'Untitled Design'}
                  </Text>
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <StarRating rating={p.avg_rating} size={11} />
                    <Text className="text-xs text-heliotrope-500 font-medium">
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
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-base font-bold text-spaceCadet-900 mb-3.5"
          >
            Recent Customer Feedback
          </Text>
          <View className="gap-3.5">
            {summary.recent_reviews.map((r: any) => (
              <View key={r.id} className="border-b border-lavender-100 pb-3 last:border-b-0">
                <View className="flex-row items-center gap-2 mb-1.5">
                  <StarRating rating={r.rating} size={12} />
                  <Text className="text-xs text-heliotrope-400 font-medium">{timeAgo(r.created_at)}</Text>
                  <View
                    className="rounded-full px-2.5 py-0.5 ml-auto bg-fuchsia-500/10 border border-fuchsia-500/20"
                  >
                    <Text
                      className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-700"
                    >
                      {r.type === 'product' ? 'Design' : 'Boutique'}
                    </Text>
                  </View>
                </View>
                <Text className="text-xs font-bold text-spaceCadet-900">
                  {r.customer?.name ?? 'Anonymous'}
                  {r.type === 'product' && r.product ? ` on ${r.product.name}` : ''}
                </Text>
                {r.comment && (
                  <Text className="text-xs text-heliotrope-500 mt-1 leading-relaxed font-medium">{r.comment}</Text>
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
}: {
  reviews: any[]
}) {
  if (reviews.length === 0) {
    return (
      <View className="items-center py-12">
        <View
          className="w-16 h-16 rounded-3xl items-center justify-center mb-4 bg-lavender-100 border border-lavender-200"
        >
          <MessageSquare size={28} color="#BB3F95" />
        </View>
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-lg font-bold text-spaceCadet-900"
        >
          No design reviews yet
        </Text>
        <Text className="text-xs text-heliotrope-500 text-center mt-1.5 max-w-[260px] leading-relaxed font-medium">
          Reviews will appear here when customers rate your collections.
        </Text>
      </View>
    )
  }

  return (
    <View className="gap-3">
      {reviews.map((r) => (
        <View key={r.id} className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <View className="flex-row items-center gap-2 mb-2">
            <StarRating rating={r.rating} size={14} />
            <Text className="text-xs text-heliotrope-400 font-medium ml-auto">{timeAgo(r.created_at)}</Text>
            {r.is_flagged && (
              <View className="bg-rose-50 rounded-full px-2 py-0.5 border border-rose-200">
                <Flag size={10} color="#e11d48" />
              </View>
            )}
          </View>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-base font-bold text-spaceCadet-900"
            numberOfLines={1}
          >
            {r.product?.name ?? 'Collection Item'}
          </Text>
          <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">
            by {r.customer?.name ?? 'Anonymous'}
          </Text>
          {r.comment && (
            <Text className="text-xs text-spaceCadet-900 mt-2 leading-relaxed font-medium">{r.comment}</Text>
          )}
        </View>
      ))}
    </View>
  )
}

// ─── Store Reviews Tab ───────────────────────────────────────────

function StoreReviewsTab({
  reviews,
}: {
  reviews: any[]
}) {
  if (reviews.length === 0) {
    return (
      <View className="items-center py-12">
        <View
          className="w-16 h-16 rounded-3xl items-center justify-center mb-4 bg-lavender-100 border border-lavender-200"
        >
          <Store size={28} color="#BB3F95" />
        </View>
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-lg font-bold text-spaceCadet-900"
        >
          No boutique reviews yet
        </Text>
        <Text className="text-xs text-heliotrope-500 text-center mt-1.5 max-w-[260px] leading-relaxed font-medium">
          Boutique reviews will appear here when customers rate their showroom experience.
        </Text>
      </View>
    )
  }

  return (
    <View className="gap-3">
      {reviews.map((r) => (
        <View key={r.id} className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <View className="flex-row items-center gap-2 mb-2">
            <StarRating rating={r.rating} size={14} />
            <Text className="text-xs text-heliotrope-400 font-medium ml-auto">{timeAgo(r.created_at)}</Text>
            {r.is_flagged && (
              <View className="bg-rose-50 rounded-full px-2 py-0.5 border border-rose-200">
                <Flag size={10} color="#e11d48" />
              </View>
            )}
          </View>
          <Text className="text-xs font-bold text-spaceCadet-900">
            by {r.customer?.name ?? 'Anonymous'}
          </Text>
          {r.comment && (
            <Text className="text-xs text-spaceCadet-900 mt-2 leading-relaxed font-medium">{r.comment}</Text>
          )}
        </View>
      ))}
    </View>
  )
}
