import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { AlertTriangle, ChevronLeft, PackageSearch, TrendingUp, UserX, Zap } from 'lucide-react-native'
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { growthApi, type InventoryAlert } from '../../src/lib/api/growth'
import { useTheme } from '../../src/lib/theme'

const KIND_META: Record<
  InventoryAlert['kind'],
  { label: string; icon: React.ReactNode; badge: string; chipBg: string }
> = {
  DEAD_STOCK: {
    label: 'Dead stock',
    icon: <UserX size={16} color="#b45309" />,
    badge: 'bg-sand-100',
    chipBg: 'bg-sand-50',
  },
  HIGH_VELOCITY: {
    label: 'High velocity',
    icon: <Zap size={16} color="#059669" />,
    badge: 'bg-emerald-50',
    chipBg: 'bg-emerald-50',
  },
  TOP_PERFORMER: {
    label: 'Top performer',
    icon: <TrendingUp size={16} color="#b45309" />,
    badge: 'bg-turmeric-50',
    chipBg: 'bg-turmeric-50',
  },
  UNLISTED: {
    label: 'Never listed',
    icon: <AlertTriangle size={16} color="#b91c1c" />,
    badge: 'bg-rust-50',
    chipBg: 'bg-rust-50',
  },
}

function AlertCard({ alert }: { alert: InventoryAlert }) {
  const meta = KIND_META[alert.kind]
  return (
    <View className="bg-white rounded-2xl p-4 border border-sand-100">
      <View className="flex-row items-center gap-2 mb-1.5">
        <View className={`w-8 h-8 rounded-lg items-center justify-center ${meta.badge}`}>
          {meta.icon}
        </View>
        <Text className="text-[10px] font-bold text-sand-500 uppercase tracking-wide">
          {meta.label}
        </Text>
      </View>
      <Text className="text-sm font-semibold text-sand-900" numberOfLines={1}>
        {alert.product_name ?? alert.sku ?? 'Product'}
      </Text>
      <Text className="text-xs text-sand-500 leading-4 mt-1">{alert.message}</Text>
      <View className="flex-row gap-2 mt-2.5">
        {alert.views_30d > 0 && (
          <View className={`rounded-full px-2.5 py-1 ${meta.chipBg}`}>
            <Text className="text-[10px] font-semibold text-sand-600">{alert.views_30d} views</Text>
          </View>
        )}
        {alert.enquiries_30d > 0 && (
          <View className="rounded-full px-2.5 py-1 bg-sand-100">
            <Text className="text-[10px] font-semibold text-sand-600">
              {alert.enquiries_30d} enquiries
            </Text>
          </View>
        )}
        {alert.sales_30d > 0 && (
          <View className="rounded-full px-2.5 py-1 bg-emerald-50">
            <Text className="text-[10px] font-semibold text-emerald-700">
              {alert.sales_30d} sold
            </Text>
          </View>
        )}
        {alert.days_since_interaction != null && (
          <View className="rounded-full px-2.5 py-1 bg-sand-50">
            <Text className="text-[10px] font-semibold text-sand-500">
              {alert.days_since_interaction}d quiet
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

export default function InventoryScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'inventory-alerts'],
    queryFn: () => growthApi.inventoryAlerts(),
  })
  const alerts = data?.data.alerts ?? []
  const counts = data?.data.counts ?? { dead_stock: 0, high_velocity: 0, top_performer: 0, unlisted: 0 }

  const sections: { key: InventoryAlert['kind']; title: string; items: InventoryAlert[] }[] = [
    { key: 'HIGH_VELOCITY', title: 'Moving fast — stock up', items: alerts.filter((a) => a.kind === 'HIGH_VELOCITY') },
    { key: 'TOP_PERFORMER', title: 'This month\u2019s winners', items: alerts.filter((a) => a.kind === 'TOP_PERFORMER') },
    { key: 'DEAD_STOCK', title: 'Quiet designs — consider clearing', items: alerts.filter((a) => a.kind === 'DEAD_STOCK') },
    { key: 'UNLISTED', title: 'Never viewed — share them', items: alerts.filter((a) => a.kind === 'UNLISTED') },
  ]

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
          <Text className="text-base font-bold text-sand-900">Inventory Alerts</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        {/* Summary row */}
        <View className="bg-ink-600 rounded-2xl p-4 mb-4">
          <Text className="text-xs text-turmeric-300 font-semibold uppercase tracking-wide">
            Signal-based insights
          </Text>
          <Text className="text-white text-sm font-semibold mt-1">
            {alerts.length} {alerts.length === 1 ? 'product' : 'products'} worth acting on this month
          </Text>
          <View className="flex-row gap-2 mt-3">
            <View className="flex-1 bg-white/10 rounded-xl px-3 py-2">
              <Text className="text-lg font-bold text-white">{counts.high_velocity + counts.top_performer}</Text>
              <Text className="text-[10px] text-white/60">selling</Text>
            </View>
            <View className="flex-1 bg-white/10 rounded-xl px-3 py-2">
              <Text className="text-lg font-bold text-white">{counts.dead_stock}</Text>
              <Text className="text-[10px] text-white/60">dead stock</Text>
            </View>
            <View className="flex-1 bg-white/10 rounded-xl px-3 py-2">
              <Text className="text-lg font-bold text-white">{counts.unlisted}</Text>
              <Text className="text-[10px] text-white/60">unlisted</Text>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View className="bg-white rounded-2xl p-6 border border-sand-100 items-center">
            <ActivityIndicator color={primaryColor} />
          </View>
        ) : alerts.length === 0 ? (
          <View className="bg-white rounded-2xl p-6 border border-sand-100 items-center">
            <View
              className="w-12 h-12 rounded-2xl items-center justify-center mb-3"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <PackageSearch size={22} color={primaryColor} />
            </View>
            <Text className="text-sm font-semibold text-sand-700">All clear</Text>
            <Text className="text-xs text-sand-400 text-center mt-1 leading-4">
              No inventory signals yet — insights appear as products get views, enquiries and sales.
            </Text>
          </View>
        ) : (
          <View className="gap-6">
            {sections.map(
              (s) =>
                s.items.length > 0 && (
                  <View key={s.key}>
                    <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide px-1 mb-2.5">
                      {s.title}
                    </Text>
                    <View className="gap-2.5">
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
