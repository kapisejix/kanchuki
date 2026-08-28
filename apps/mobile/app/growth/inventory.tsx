import { useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { AlertTriangle, ChevronLeft, PackageSearch, TrendingUp, UserX, Zap } from 'lucide-react-native'
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { growthApi, type InventoryAlert } from '../../src/lib/api/growth'

const KIND_META: Record<
  InventoryAlert['kind'],
  { label: string; icon: React.ReactNode; badge: string; chipBg: string }
> = {
  DEAD_STOCK: {
    label: 'Dead stock',
    icon: <UserX size={16} color="#d97706" />,
    badge: 'bg-amber-500/10',
    chipBg: 'bg-amber-500/10',
  },
  HIGH_VELOCITY: {
    label: 'High velocity',
    icon: <Zap size={16} color="#16a34a" />,
    badge: 'bg-emerald-500/10',
    chipBg: 'bg-emerald-500/10',
  },
  TOP_PERFORMER: {
    label: 'Top performer',
    icon: <TrendingUp size={16} color="#BB3F95" />,
    badge: 'bg-fuchsia-500/10',
    chipBg: 'bg-fuchsia-500/10',
  },
  UNLISTED: {
    label: 'Never listed',
    icon: <AlertTriangle size={16} color="#e11d48" />,
    badge: 'bg-rose-500/10',
    chipBg: 'bg-rose-500/10',
  },
}

function AlertCard({ alert }: { alert: InventoryAlert }) {
  const meta = KIND_META[alert.kind]
  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
      <View className="flex-row items-center gap-2 mb-2">
        <View className={`w-8 h-8 rounded-xl items-center justify-center ${meta.badge}`}>
          {meta.icon}
        </View>
        <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider">
          {meta.label}
        </Text>
      </View>
      <Text
        style={{ fontFamily: 'Marcellus_400Regular' }}
        className="text-base font-bold text-spaceCadet-900"
        numberOfLines={1}
      >
        {alert.product_name ?? alert.sku ?? 'Product'}
      </Text>
      <Text className="text-xs text-heliotrope-500 leading-relaxed mt-1 font-medium">{alert.message}</Text>
      <View className="flex-row flex-wrap gap-2 mt-3">
        {alert.views_30d > 0 && (
          <View className={`rounded-full px-3 py-1 ${meta.chipBg}`}>
            <Text className="text-[10px] font-bold text-spaceCadet-900">{alert.views_30d} views</Text>
          </View>
        )}
        {alert.enquiries_30d > 0 && (
          <View className="rounded-full px-3 py-1 bg-lavender-100 border border-lavender-200">
            <Text className="text-[10px] font-bold text-fuchsia-700">
              {alert.enquiries_30d} enquiries
            </Text>
          </View>
        )}
        {alert.sales_30d > 0 && (
          <View className="rounded-full px-3 py-1 bg-emerald-50 border border-emerald-200">
            <Text className="text-[10px] font-bold text-emerald-700">
              {alert.sales_30d} sold
            </Text>
          </View>
        )}
        {alert.days_since_interaction != null && (
          <View className="rounded-full px-3 py-1 bg-lavender-50 border border-lavender-200">
            <Text className="text-[10px] font-bold text-heliotrope-500">
              {alert.days_since_interaction}d quiet
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

export default function InventoryScreen() {
  const insets = useSafeAreaInsets()

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'inventory-alerts'],
    queryFn: () => growthApi.inventoryAlerts(),
  })
  const alerts = data?.data.alerts ?? []
  const counts = data?.data.counts ?? { dead_stock: 0, high_velocity: 0, top_performer: 0, unlisted: 0 }

  const sections: { key: InventoryAlert['kind']; title: string; items: InventoryAlert[] }[] = [
    { key: 'HIGH_VELOCITY', title: 'Moving Fast — Stock Up', items: alerts.filter((a) => a.kind === 'HIGH_VELOCITY') },
    { key: 'TOP_PERFORMER', title: 'This Month’s Winners', items: alerts.filter((a) => a.kind === 'TOP_PERFORMER') },
    { key: 'DEAD_STOCK', title: 'Quiet Designs — Consider Clearing', items: alerts.filter((a) => a.kind === 'DEAD_STOCK') },
    { key: 'UNLISTED', title: 'Never Viewed — Share With VIPs', items: alerts.filter((a) => a.kind === 'UNLISTED') },
  ]

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
            className="text-xl font-bold text-spaceCadet-900"
          >
            Inventory Intelligence
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        {/* Signature Gradient Summary Hero Card */}
        <LinearGradient
          colors={['#231F48', '#560A39']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-3xl p-5 mb-5 shadow-sm"
        >
          <View className="flex-row items-center gap-2 mb-1">
            <View className="w-2 h-2 rounded-full bg-fuchsia-400" />
            <Text className="text-[10px] text-fuchsia-300 font-bold uppercase tracking-wider">
              Signal-Based Insights
            </Text>
          </View>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-white text-lg font-bold mt-1"
          >
            {alerts.length} {alerts.length === 1 ? 'Design' : 'Designs'} Worth Acting On
          </Text>
          <View className="flex-row gap-2 mt-4">
            <View className="flex-1 bg-white/10 rounded-2xl p-3 items-center border border-white/10">
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-xl font-bold text-white"
              >
                {counts.high_velocity + counts.top_performer}
              </Text>
              <Text className="text-[10px] font-bold text-white/70 uppercase tracking-wider mt-0.5">selling</Text>
            </View>
            <View className="flex-1 bg-white/10 rounded-2xl p-3 items-center border border-white/10">
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-xl font-bold text-white"
              >
                {counts.dead_stock}
              </Text>
              <Text className="text-[10px] font-bold text-white/70 uppercase tracking-wider mt-0.5">dead stock</Text>
            </View>
            <View className="flex-1 bg-white/10 rounded-2xl p-3 items-center border border-white/10">
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-xl font-bold text-white"
              >
                {counts.unlisted}
              </Text>
              <Text className="text-[10px] font-bold text-white/70 uppercase tracking-wider mt-0.5">unlisted</Text>
            </View>
          </View>
        </LinearGradient>

        {isLoading ? (
          <View className="bg-white rounded-3xl p-8 border border-lavender-200 items-center">
            <ActivityIndicator color="#BB3F95" />
          </View>
        ) : alerts.length === 0 ? (
          <View className="bg-white rounded-3xl p-8 border border-lavender-200 items-center">
            <View
              className="w-14 h-14 rounded-3xl items-center justify-center mb-3 bg-lavender-100 border border-lavender-200"
            >
              <PackageSearch size={26} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-lg font-bold text-spaceCadet-900"
            >
              All Signals Healthy
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1 leading-relaxed max-w-[260px] font-medium">
              No inventory issues detected. Insights populate as designs receive views, customer inquiries, and sales.
            </Text>
          </View>
        ) : (
          <View className="gap-6">
            {sections.map(
              (s) =>
                s.items.length > 0 && (
                  <View key={s.key}>
                    <Text
                      style={{ fontFamily: 'Marcellus_400Regular' }}
                      className="text-base font-bold text-spaceCadet-900 px-1 mb-3"
                    >
                      {s.title}
                    </Text>
                    <View className="gap-3">
                      {s.items.map((a) => (
                        <AlertCard key={a.product_id} alert={a} />
                      ))}
                    </View>
                  </View>
                ),
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
