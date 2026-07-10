import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Camera, Users, Link2, Search, Eye, MessageCircle, Package } from 'lucide-react-native'
import { retailerApi } from '../../src/lib/api'

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
  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
  })

  const { data: statsData, isLoading: statsLoading, refetch } = useQuery({
    queryKey: ['retailer', 'stats'],
    queryFn: () => retailerApi.getStats(),
  })

  const me = (meData as { data: RetailerMe } | undefined)?.data
  const stats = (statsData as { data: Stats } | undefined)?.data
  const isLoading = meLoading || statsLoading

  return (
    <ScrollView
      className="flex-1 bg-cyan-50"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} />}
    >
      {/* Greeting hero */}
      <View className="bg-cyan-600 px-4 pt-4 pb-8 rounded-b-3xl">
        <View className="flex-row items-center gap-3">
          <View className="w-12 h-12 rounded-2xl bg-white/15 items-center justify-center">
            <Text className="text-white font-bold text-lg">
              {(me?.shop_name ?? 'S').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text className="text-cyan-100 text-sm">Welcome back 👋</Text>
            <Text className="text-white text-2xl font-bold mt-0.5">
              {me?.shop_name ?? 'Your Store'}
            </Text>
          </View>
        </View>
        {me?.plan_status === 'TRIAL' && (
          <TouchableOpacity
            onPress={() => router.push('/billing')}
            className="mt-4 bg-white/15 px-3 py-1.5 rounded-lg self-start"
          >
            <Text className="text-white text-xs font-medium">
              14-day free trial active · Tap to subscribe
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Stats */}
      <View className="px-4 pt-4 pb-2 -mt-4">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          This Month
        </Text>
        <View className="flex-row gap-3">
          <StatCard
            icon={<Eye size={16} color="#0891B2" />}
            label="Views"
            value={stats?.views_this_month ?? 0}
            color="#0891B2"
            onPress={() => router.push('/analytics')}
          />
          <StatCard
            icon={<MessageCircle size={16} color="#22C55E" />}
            label="Enquiries"
            value={stats?.enquiries_this_month ?? 0}
            color="#22C55E"
            onPress={() => router.push('/analytics')}
          />
        </View>
        <View className="flex-row gap-3 mt-3">
          <StatCard
            icon={<Package size={16} color="#F59E0B" />}
            label="Products"
            value={stats?.total_products_available ?? 0}
            color="#F59E0B"
            onPress={() => router.push('/catalog')}
          />
          <StatCard
            icon={<Users size={16} color="#3B82F6" />}
            label="Customers"
            value={stats?.total_customers ?? 0}
            color="#3B82F6"
            onPress={() => router.push('/customers')}
          />
        </View>
      </View>

      {/* Trending products */}
      {(stats?.top_viewed_products?.length ?? 0) > 0 && (
        <View className="px-4 py-2">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Trending This Month
          </Text>
          <View className="gap-2">
            {stats!.top_viewed_products.map((r) => (
              <TouchableOpacity
                key={r.product.id}
                onPress={() => router.push(`/product/${r.product.id}`)}
                className="bg-white rounded-2xl p-3 border border-gray-100 flex-row items-center justify-between"
              >
                <Text className="text-sm text-gray-700">
                  {r.product.category ?? 'Product'} · {r.product.primary_color ?? '—'}
                </Text>
                <Text className="text-xs font-semibold text-cyan-600">{r.count} views</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Quick Actions */}
      <View className="px-4 py-2">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Quick Actions
        </Text>
        <View className="flex-row flex-wrap gap-3">
          <QuickAction
            icon={<Camera size={22} color="#0891B2" />}
            label="Add Product"
            sublabel="Photo + AI tagging"
            onPress={() => router.push('/product/add')}
            accent="#ECFEFF"
          />
          <QuickAction
            icon={<Search size={22} color="#22C55E" />}
            label="Search Products"
            sublabel="Natural language"
            onPress={() => router.push('/catalog?search=1')}
            accent="#F0FDF4"
          />
          <QuickAction
            icon={<Users size={22} color="#F59E0B" />}
            label="Add Customer"
            sublabel="Save preferences"
            onPress={() => router.push('/customer/add')}
            accent="#FFFBEB"
          />
          <QuickAction
            icon={<Link2 size={22} color="#3B82F6" />}
            label="New Collection"
            sublabel="Share on WhatsApp"
            onPress={() => router.push('/collection/new')}
            accent="#EFF6FF"
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
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-1 bg-white rounded-2xl p-4 border border-gray-100"
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
      <Text className="text-xs text-gray-500 mt-0.5">{label}</Text>
    </TouchableOpacity>
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
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="w-[47%] bg-white rounded-2xl p-4 border border-gray-100"
    >
      <View
        className="w-10 h-10 rounded-xl items-center justify-center mb-3"
        style={{ backgroundColor: accent }}
      >
        {icon}
      </View>
      <Text className="text-sm font-semibold text-gray-900">{label}</Text>
      <Text className="text-xs text-gray-400 mt-0.5">{sublabel}</Text>
    </TouchableOpacity>
  )
}
