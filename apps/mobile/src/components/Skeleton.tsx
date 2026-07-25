import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated'

export function Skeleton({ className = '', style }: { className?: string; style?: object }) {
  const opacity = useSharedValue(0.3)
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true)
  }, [opacity])
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View className={`rounded-md bg-gray-200 ${className}`} style={[animStyle, style]} />
}

// ── Shape-matched skeletons, one per list/card layout in the app ──────────

export function ProductCardSkeleton() {
  return (
    <View className="flex-1 bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <Skeleton className="w-full" style={{ aspectRatio: 3 / 4, borderRadius: 0 }} />
      <View className="p-2.5 gap-1.5">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </View>
    </View>
  )
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  const rows = Array.from({ length: Math.ceil(count / 2) })
  return (
    <View style={{ padding: 12, gap: 12 }}>
      {rows.map((_, r) => (
        <View key={r} className="flex-row" style={{ gap: 12 }}>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </View>
      ))}
    </View>
  )
}

export function CustomerRowSkeleton() {
  return (
    <View className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center gap-3">
      <Skeleton className="w-12 h-12 rounded-full" />
      <View className="flex-1 gap-1.5">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </View>
    </View>
  )
}

export function CustomerListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={{ padding: 12, gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <CustomerRowSkeleton key={i} />
      ))}
    </View>
  )
}

export function CollectionCardSkeleton() {
  return (
    <View className="bg-white rounded-2xl p-4 border border-gray-100 gap-3">
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
  )
}

export function CollectionListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={{ padding: 12, gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <CollectionCardSkeleton key={i} />
      ))}
    </View>
  )
}

// ── Full-screen detail skeletons (photo/header + a few field blocks) ──────

export function DetailScreenSkeleton({ withPhoto = true }: { withPhoto?: boolean }) {
  return (
    <View className="flex-1 bg-cyan-50">
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
          <View key={i} className="bg-white rounded-2xl p-4 border border-gray-100 gap-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </View>
        ))}
      </View>
    </View>
  )
}
