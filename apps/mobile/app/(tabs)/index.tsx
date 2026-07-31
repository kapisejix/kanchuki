import { View, Text, ScrollView, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Camera, Users, Link2, Eye, MessageCircle, Package, ShoppingBag, Ruler, QrCode, Settings, FolderKanban } from 'lucide-react-native'
import { ordersApi, retailerApi, categoryApi } from '../../src/lib/api'
import { HomeScreenSkeleton } from '../../src/components/Skeleton'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

type RankedProduct = {
  product: { id: string; category: string | null; primary_color: string | null; photo_url: string | null }
  count: number
}
type Stats = {
  total_products_available: number
  total_customers: number
  active_collections: number
  views_this_month: number
  enquiries_this_month: number
  top_viewed_products: RankedProduct[]
  top_enquired_products: RankedProduct[]
}

type RetailerMe = {
  shop_name: string
  plan: string
  plan_status: string
}

export default function HomeScreen() {
  const { primaryColor } = useTheme()
  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
  })

  const { data: statsData, isLoading: statsLoading, refetch } = useQuery({
    queryKey: ['retailer', 'stats'],
    queryFn: () => retailerApi.getStats(),
  })

  const { data: ordersData } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(),
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', 'list'],
    queryFn: () => categoryApi.list(),
  })

  const me = (meData as { data: RetailerMe } | undefined)?.data
  const stats = (statsData as { data: Stats } | undefined)?.data
  const allOrders = ordersData?.data ?? []
  const pendingOrders = allOrders.filter(
    (o) => o.status === 'PENDING_PAYMENT' || o.status === 'PAID',
  ).length
  const categories = categoriesData?.data ?? []
  const isLoading = meLoading || statsLoading

  if (isLoading) {
    return <HomeScreenSkeleton />
  }

  return (
    <ScrollView
      className="flex-1 bg-ink-50"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} />}
    >
      {/* Greeting hero */}
      <View className="bg-ink-600 px-4 pt-4 pb-8 rounded-b-3xl">
        <View className="flex-row items-center gap-3">
          <View className="w-12 h-12 rounded-2xl bg-white/15 items-center justify-center">
            <Text className="text-white font-bold text-lg">
              {(me?.shop_name ?? 'S').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text className="text-ink-100 text-sm">Welcome back 👋</Text>
            <Text className="text-white text-2xl font-bold mt-0.5">
              {me?.shop_name ?? 'Your Store'}
            </Text>
          </View>
        </View>
        {me?.plan_status === 'TRIAL' && (
          <AnimatedPressable
            onPress={() => router.push('/billing')}
            className="mt-4 bg-white/15 px-3 py-1.5 rounded-lg self-start"
          >
            <Text className="text-white text-xs font-medium">
              14-day free trial active · Tap to subscribe
            </Text>
          </AnimatedPressable>
        )}
      </View>

      {/* Quick Stats */}
      <View className="px-4 pt-4 pb-2 -mt-4">
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
          This Month
        </Text>
        <View className="flex-row gap-3">
          <StatCard
            icon={<Eye size={16} color={primaryColor} />}
            label="Views"
            value={stats?.views_this_month ?? 0}
            color={primaryColor}
            onPress={() => router.push('/analytics')}
          />
          <StatCard
            icon={<MessageCircle size={16} color="#946A4B" />}
            label="Enquiries"
            value={stats?.enquiries_this_month ?? 0}
            color="#946A4B"
            onPress={() => router.push('/analytics')}
          />
        </View>
        <View className="flex-row gap-3 mt-3">
          <StatCard
            icon={<Package size={16} color="#946A4B" />}
            label="Products"
            value={stats?.total_products_available ?? 0}
            color="#946A4B"
            onPress={() => router.push('/catalog')}
          />
          <StatCard
            icon={<Users size={16} color="#E3262D" />}
            label="Customers"
            value={stats?.total_customers ?? 0}
            color="#E3262D"
            onPress={() => router.push('/customers')}
          />
        </View>
      </View>

      {/* Trending products */}
      {(stats?.top_viewed_products?.length ?? 0) > 0 && (
        <View className="px-4 py-2">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Trending This Month
          </Text>
          <View className="gap-2">
            {stats!.top_viewed_products.map((r) => (
              <AnimatedPressable
                key={r.product.id}
                onPress={() => router.push(`/product/${r.product.id}`)}
                className="bg-white rounded-2xl p-3 border border-sand-100 flex-row items-center justify-between"
              >
                <Text className="text-sm text-sand-700">
                  {r.product.category ?? 'Product'} · {r.product.primary_color ?? '—'}
                </Text>
                <Text className="text-xs font-semibold text-ink-600">{r.count} views</Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>
      )}

      {/* Quick Actions */}
      <View className="px-4 py-2">
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
          Quick Actions
        </Text>
        <View className="flex-row flex-wrap gap-3">
          <QuickAction
            icon={<Camera size={22} color={primaryColor} />}
            label="Add Product"
            sublabel="Photo + AI tagging"
            onPress={() => router.push('/product/add')}
            accent="#FFF1F1"
          />
          <QuickAction
            icon={<FolderKanban size={22} color={primaryColor} />}
            label={`${categories.length} ${categories.length === 1 ? 'Category' : 'Categories'}`}
            sublabel="Add Category"
            onPress={() => router.push('/category')}
            accent="#FFF1F1"
          />
          <QuickAction
            icon={<Users size={22} color="#946A4B" />}
            label="Add Customer"
            sublabel="Save preferences"
            onPress={() => router.push('/customer/add')}
            accent="#F8F0E8"
          />
          <QuickAction
            icon={<Link2 size={22} color="#E3262D" />}
            label="New Collection"
            sublabel="Share on WhatsApp"
            onPress={() => router.push('/collection/new')}
            accent="#FFF1F1"
          />
          <QuickAction
            icon={<ShoppingBag size={22} color="#946A4B" />}
            label="Orders"
            sublabel={`${pendingOrders} pending · Manage fulfillment`}
            onPress={() => router.push('/(tabs)/orders')}
            accent="#F8F0E8"
          />
          <QuickAction
            icon={<Ruler size={22} color="#E3262D" />}
            label="Size Charts"
            sublabel="S–10XL per category"
            onPress={() => router.push('/size-chart')}
            accent="#FFF1F1"
          />
          <QuickAction
            icon={<QrCode size={22} color="#A24854" />}
            label="Store QR Code"
            sublabel="Scan to view your catalog"
            onPress={() => router.push('/store-profile')}
            accent="#FDF2F3"
          />
          <QuickAction
            icon={<Settings size={22} color="#847B75" />}
            label="Settings"
            sublabel="Profile · Billing · Staff"
            onPress={() => router.push('/settings')}
            accent="#F2EEE9"
          />
        </View>
      </View>

      {/* Bottom padding */}
      <View className="h-8" />
    </ScrollView>
  )
}

function StatCard({
  icon,
  label,
  value,
  color,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
  onPress: () => void
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      className="flex-1 bg-white rounded-2xl p-4 border border-sand-100"
    >
      <View
        className="w-7 h-7 rounded-lg items-center justify-center mb-2"
        style={{ backgroundColor: `${color}1A` }}
      >
        {icon}
      </View>
      <Text className="text-2xl font-bold" style={{ color }}>
        {value.toLocaleString('en-IN')}
      </Text>
      <Text className="text-xs text-sand-500 mt-0.5">{label}</Text>
    </AnimatedPressable>
  )
}

function QuickAction({
  icon,
  label,
  sublabel,
  onPress,
  accent,
}: {
  icon: React.ReactNode
  label: string
  sublabel: string
  onPress: () => void
  accent: string
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      className="w-[47%] bg-white rounded-2xl p-4 border border-sand-100"
    >
      <View
        className="w-10 h-10 rounded-xl items-center justify-center mb-3"
        style={{ backgroundColor: accent }}
      >
        {icon}
      </View>
      <Text className="text-sm font-semibold text-sand-900">{label}</Text>
      <Text className="text-xs text-sand-400 mt-0.5">{sublabel}</Text>
    </AnimatedPressable>
  )
}
