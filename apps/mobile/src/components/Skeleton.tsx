import { COLORS } from '@kanchuki/shared';
import { useEffect } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotion } from '../hooks/useReduceMotion';

export function Skeleton({ className = '', style }: { className?: string; style?: object }) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    if (reduceMotion) {
      // Reduce Motion: keep the loading cue (dimmed block) without the pulse
      opacity.value = 0.6;
      return;
    }
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity, reduceMotion]);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View className={`rounded-md bg-sand-200 ${className}`} style={[animStyle, style]} />
  );
}

// ── Shape-matched skeletons, one per list/card layout in the app ──────────

export function ProductCardSkeleton() {
  return (
    <View className="flex-1 bg-white border border-sand-200 rounded-2xl overflow-hidden">
      <Skeleton className="w-full" style={{ aspectRatio: 3 / 4, borderRadius: 0 }} />
      <View className="p-2.5 gap-1.5">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </View>
    </View>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  const rows = Array.from({ length: Math.ceil(count / 2) });
  return (
    <View style={{ padding: 12, gap: 12 }}>
      {rows.map((_, r) => (
        <View key={r} className="flex-row" style={{ gap: 12 }}>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </View>
      ))}
    </View>
  );
}

export function CustomerRowSkeleton() {
  return (
    <View className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center gap-3">
      <Skeleton className="w-12 h-12 rounded-full" />
      <View className="flex-1 gap-1.5">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </View>
    </View>
  );
}

export function CustomerListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={{ padding: 12, gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <CustomerRowSkeleton key={i} />
      ))}
    </View>
  );
}

export function CollectionCardSkeleton() {
  return (
    <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-3">
      <View className="flex-row items-start justify-between">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </View>
      <View className="flex-row gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </View>
      <View className="flex-row gap-2">
        <Skeleton className="h-9 flex-1 rounded-xl" />
        <Skeleton className="h-9 w-12 rounded-xl" />
        <Skeleton className="h-9 w-12 rounded-xl" />
      </View>
    </View>
  );
}

export function CollectionListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={{ padding: 12, gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <CollectionCardSkeleton key={i} />
      ))}
    </View>
  );
}

// ── Full-screen detail skeletons (photo/header + a few field blocks) ──────

// ── Home Screen Skeleton ───────────────────────────────────────────

export function HomeScreenSkeleton() {
  return (
    <ScrollView className="flex-1 bg-[#F8F7FC]">
      {/* Top retailer header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-2xl" />
          <View className="gap-1.5">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-2.5 w-20 rounded-md" />
          </View>
        </View>
        <Skeleton className="w-9 h-9 rounded-2xl" />
      </View>

      {/* Gradient hero card */}
      <View className="px-4 pb-3">
        <Skeleton className="h-36 rounded-3xl" style={{ backgroundColor: '#231F4820' }} />
      </View>

      {/* Quick Tools */}
      <View className="px-4 pt-2 pb-2">
        <Skeleton className="h-2.5 w-24 mb-2" />
        <View className="flex-row gap-3">
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200 gap-2">
            <Skeleton className="w-10 h-10 rounded-2xl" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-20" />
          </View>
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200 gap-2">
            <Skeleton className="w-10 h-10 rounded-2xl" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-20" />
          </View>
        </View>
        <View className="flex-row gap-3 mt-3">
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200 gap-2">
            <Skeleton className="w-10 h-10 rounded-2xl" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-20" />
          </View>
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200 gap-2">
            <Skeleton className="w-10 h-10 rounded-2xl" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-20" />
          </View>
        </View>
      </View>

      {/* CTA button */}
      <View className="px-4 py-2">
        <Skeleton className="h-12 rounded-2xl" />
      </View>

      {/* Stats row */}
      <View className="px-4 pt-3 pb-2">
        <Skeleton className="h-2.5 w-32 mb-2.5" />
        <View className="flex-row gap-3">
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200">
            <Skeleton className="w-8 h-8 rounded-xl mb-2" />
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-2.5 w-12 mt-1" />
          </View>
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200">
            <Skeleton className="w-8 h-8 rounded-xl mb-2" />
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-2.5 w-12 mt-1" />
          </View>
        </View>
        <View className="flex-row gap-3 mt-3">
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200">
            <Skeleton className="w-8 h-8 rounded-xl mb-2" />
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-2.5 w-12 mt-1" />
          </View>
          <View className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200">
            <Skeleton className="w-8 h-8 rounded-xl mb-2" />
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-2.5 w-12 mt-1" />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function StatCardSkeleton() {
  return (
    <View className="flex-1 bg-white rounded-2xl p-4 border border-sand-100 gap-1.5">
      <Skeleton className="w-7 h-7 rounded-lg" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-12" />
    </View>
  );
}

// ── Analytics Screen Skeleton ─────────────────────────────────────

export function AnalyticsSkeleton() {
  return (
    <ScrollView className="flex-1 bg-ink-50">
      {/* Header */}
      <View className="bg-white px-4 pt-4 pb-5 border-b border-sand-100 gap-1">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-40" />
      </View>

      <View className="p-4 gap-4">
        {/* Stat cards */}
        <View className="flex-row flex-wrap gap-3">
          <MiniStatCardSkeleton />
          <MiniStatCardSkeleton />
          <MiniStatCardSkeleton />
          <MiniStatCardSkeleton />
        </View>

        {/* Bar chart placeholder */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-4">
          <View className="flex-row items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="w-4 h-4" />
          </View>
          <View className="flex-row items-end gap-1.5 h-24">
            {[55, 70, 40, 80, 50, 65, 45].map((h, i) => (
              <View key={i} className="flex-1 items-center gap-1">
                <Skeleton className="h-3 w-4" />
                <Skeleton className="w-full rounded-t-md" style={{ height: h }} />
                <Skeleton className="h-3 w-6" />
              </View>
            ))}
          </View>
        </View>

        {/* Category breakdown */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-3">
          <Skeleton className="h-3 w-36" />
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <Skeleton className="w-2.5 h-2.5 rounded-full" />
              <Skeleton className="flex-1 h-4 w-20" />
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-1.5 w-12 rounded-full" />
            </View>
          ))}
        </View>

        {/* Plan Usage */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-3">
          <Skeleton className="h-3 w-20" />
          {Array.from({ length: 2 }).map((_, i) => (
            <View key={i} className="gap-1">
              <View className="flex-row justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </View>
              <Skeleton className="h-2 rounded-full w-full" />
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function MiniStatCardSkeleton() {
  return (
    <View className="flex-1 bg-white rounded-2xl p-4 border border-sand-100 min-w-[48%] gap-2">
      <Skeleton className="w-8 h-8 rounded-lg" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-3 w-16" />
    </View>
  );
}

// ── Settings Screen Skeleton ──────────────────────────────────────

export function SettingsSkeleton() {
  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View className="bg-white border-b border-sand-100 px-4 pb-4 pt-14">
        <View className="flex-row items-center gap-3">
          <Skeleton className="w-6 h-6" />
          <Skeleton className="h-5 w-20" />
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
      >
        {/* Profile */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </View>

        {/* Usage */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-3">
          <Skeleton className="h-4 w-16" />
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} className="gap-1">
              <View className="flex-row justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </View>
              <Skeleton className="h-2 rounded-full w-full" />
            </View>
          ))}
        </View>

        {/* Settings rows */}
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            className="flex-row items-center bg-white rounded-2xl p-4 border border-sand-100"
          >
            <Skeleton className="w-9 h-9 rounded-xl mr-3" />
            <View className="flex-1 gap-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </View>
            <Skeleton className="w-4 h-4" />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Orders Screen Skeleton ────────────────────────────────────────

export function OrdersCardSkeleton() {
  return (
    <View className="bg-white rounded-2xl border border-sand-100 overflow-hidden">
      {/* Header — status + date */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <Skeleton className="h-6 w-28 rounded-lg" />
        <Skeleton className="h-3 w-20" />
      </View>

      {/* Customer info */}
      <View className="px-4 pb-2 gap-1">
        <View className="flex-row items-center gap-2">
          <Skeleton className="w-3.5 h-3.5" />
          <Skeleton className="h-4 w-36" />
        </View>
        <View className="flex-row items-center gap-2">
          <Skeleton className="w-3.5 h-3.5" />
          <Skeleton className="h-3 w-28" />
        </View>
      </View>

      {/* Items summary */}
      <View className="px-4 pb-2 border-b border-sand-50 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} className="flex-row items-center justify-between py-1">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-14" />
          </View>
        ))}
      </View>

      {/* Amount */}
      <View className="px-4 py-2 border-b border-sand-50">
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-4 w-20" />
        </View>
      </View>

      {/* View Details */}
      <View className="border-t border-sand-50 py-2 items-center">
        <Skeleton className="h-3 w-20" />
      </View>

      {/* Action buttons */}
      <View className="flex-row px-3 py-2 gap-2">
        <Skeleton className="flex-1 h-10 rounded-xl" />
        <Skeleton className="flex-1 h-10 rounded-xl" />
      </View>
    </View>
  );
}

export function OrdersListSkeleton({
  count = 4,
  refreshing,
  onRefresh,
}: {
  count?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <ScrollView
      className="flex-1 bg-sand-50"
      {...(refreshing !== undefined && onRefresh
        ? { refreshControl: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> }
        : {})}
    >
      {/* Status filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pt-3 pb-2">
        <View className="flex-row gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </View>
      </ScrollView>

      {/* Cards */}
      <View className="px-4 pt-2 pb-8 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <OrdersCardSkeleton key={i} />
        ))}
      </View>
    </ScrollView>
  );
}

// ── Collection Detail Screen Skeleton ─────────────────────────────

export function CollectionDetailSkeleton() {
  return (
    <ScrollView className="flex-1 bg-ink-50">
      {/* Stats grid */}
      <View className="flex-row flex-wrap px-4 pt-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            className="bg-white rounded-xl p-3 border border-sand-100 flex-1 min-w-[45%] gap-1"
          >
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-3 w-12" />
          </View>
        ))}
      </View>

      {/* Share button */}
      <View className="px-4 pt-4">
        <Skeleton className="h-12 rounded-xl w-full" />
      </View>

      {/* Action buttons row */}
      <View className="px-4 pt-3 flex-row gap-3">
        <Skeleton className="flex-1 h-12 rounded-xl" />
        <Skeleton className="flex-1 h-12 rounded-xl" />
      </View>

      {/* Products header */}
      <View className="px-4 pt-5 pb-8">
        <Skeleton className="h-3 w-24 mb-3" />
        {/* Product grid — 3 items per row */}
        <View className="flex-row flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              className="w-[31%] bg-white rounded-xl overflow-hidden border border-sand-100"
            >
              <Skeleton className="w-full" style={{ height: 96 }} />
              <View className="p-1.5">
                <Skeleton className="h-3 w-full" />
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ── Product Add Screen Skeleton (edit form step) ──────────────────

export function ProductAddSkeleton() {
  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100 pt-14">
        <Skeleton className="w-6 h-6" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-16 rounded-xl" />
      </View>

      <ScrollView className="flex-1">
        <View className="px-4 py-4 gap-4">
          {/* Photo preview */}
          <Skeleton className="w-full h-56 rounded-2xl" />

          {/* Auto-clean toggle */}
          <View className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center gap-3">
            <View className="flex-1 gap-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-48" />
            </View>
            <Skeleton className="w-12 h-6 rounded-full" />
          </View>

          {/* Price */}
          <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-32" />
          </View>

          {/* Location */}
          <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-48" />
          </View>

          {/* Category chips */}
          <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-3">
            <View className="flex-row items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </View>
            <View className="flex-row flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-20 rounded-full" />
              ))}
            </View>
          </View>

          {/* Sizes */}
          <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-3">
            <Skeleton className="h-3 w-12" />
            <View className="flex-row flex-wrap gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-12 rounded-full" />
              ))}
            </View>
          </View>

          {/* Notes */}
          <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-10 w-full" />
          </View>

          {/* Footer hint */}
          <View className="items-center">
            <Skeleton className="h-3 w-56" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Full-screen detail skeletons (photo/header + a few field blocks) ──────

export function DetailScreenSkeleton({ withPhoto = true }: { withPhoto?: boolean }) {
  return (
    <View className="flex-1 bg-ink-50">
      {withPhoto ? (
        <Skeleton className="w-full" style={{ height: 380, borderRadius: 0 }} />
      ) : (
        <View className="px-4 pt-6">
          <View className="flex-row items-center gap-3">
            <Skeleton className="w-14 h-14 rounded-full" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </View>
          </View>
        </View>
      )}
      <View className="px-4 py-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} className="bg-white rounded-2xl p-4 border border-sand-100 gap-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </View>
        ))}
      </View>
    </View>
  );
}
