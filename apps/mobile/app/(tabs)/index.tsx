import { COLORS } from '@kanchuki/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  BarChart3,
  Camera,
  Eye,
  FolderKanban,
  Link2,
  Megaphone,
  MessageCircle,
  Package,
  PackagePlus,
  QrCode,
  Ruler,
  Search,
  Settings,
  ShoppingBag,
  Users,
} from 'lucide-react-native';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { HomeScreenSkeleton } from '../../src/components/Skeleton';
import { categoryApi, ordersApi, retailerApi } from '../../src/lib/api';
import { useTheme } from '../../src/lib/theme';

type RankedProduct = {
  product: {
    id: string;
    category: string | null;
    primary_color: string | null;
    photo_url: string | null;
  };
  count: number;
};
type Stats = {
  total_products_available: number;
  total_customers: number;
  active_collections: number;
  views_this_month: number;
  enquiries_this_month: number;
  top_viewed_products: RankedProduct[];
  top_enquired_products: RankedProduct[];
};

type RetailerMe = {
  shop_name: string;
  plan: string;
  plan_status: string;
};

export default function HomeScreen() {
  const { primaryColor, colors } = useTheme();
  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
  });

  const {
    data: statsData,
    isLoading: statsLoading,
    refetch,
  } = useQuery({
    queryKey: ['retailer', 'stats'],
    queryFn: () => retailerApi.getStats(),
  });

  const { data: ordersData } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', 'list'],
    queryFn: () => categoryApi.list(),
  });

  const me = (meData as { data: RetailerMe } | undefined)?.data;
  const stats = (statsData as { data: Stats } | undefined)?.data;
  const allOrders = ordersData?.data ?? [];
  const pendingOrders = allOrders.filter(
    (o) => o.status === 'PENDING_PAYMENT' || o.status === 'PAID',
  ).length;
  const categories = categoriesData?.data ?? [];
  const isLoading = meLoading || statsLoading;

  if (isLoading) {
    return <HomeScreenSkeleton />;
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
              14-day free trial active · View plans
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
            icon={<MessageCircle size={16} color={colors.turmeric[500]} />}
            label="Enquiries"
            value={stats?.enquiries_this_month ?? 0}
            color={colors.turmeric[500]}
            onPress={() => router.push('/analytics')}
          />
        </View>
        <View className="flex-row gap-3 mt-3">
          <StatCard
            icon={<Package size={16} color={colors.turmeric[500]} />}
            label="Products"
            value={stats?.total_products_available ?? 0}
            color={colors.turmeric[500]}
            onPress={() => router.push('/catalog')}
          />
          <StatCard
            icon={<Users size={16} color={colors.danger} />}
            label="Customers"
            value={stats?.total_customers ?? 0}
            color={colors.danger}
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

      {/* ── Catalog & Products ── */}
      <View className="px-4 pt-4">
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-6 h-6 rounded-lg items-center justify-center" style={{ backgroundColor: `${primaryColor}1A` }}>
            <Package size={14} color={primaryColor} />
          </View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
            Catalog & Products
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-3">
          <QuickAction
            icon={<Camera size={22} color={primaryColor} />}
            label="Add Product"
            sublabel="Photo + AI tagging"
            onPress={() => router.push('/product/add')}
            accent={colors.ink[50]}
          />
          <QuickAction
            icon={<FolderKanban size={22} color={primaryColor} />}
            label={`${categories.length} ${categories.length === 1 ? 'Category' : 'Categories'}`}
            sublabel="Manage categories"
            onPress={() => router.push('/category')}
            accent={colors.ink[50]}
          />
          <QuickAction
            icon={<PackagePlus size={22} color={colors.rust[600]} />}
            label="Bulk Onboard"
            sublabel="Rack-by-rack batch upload"
            onPress={() => router.push('/product/bulk-onboard')}
            accent={colors.rust[50]}
          />
          <QuickAction
            icon={<Ruler size={22} color={colors.danger} />}
            label="Size Charts"
            sublabel="S–10XL per category"
            onPress={() => router.push('/size-chart')}
            accent={colors.dangerSurface}
          />
          <QuickAction
            icon={<QrCode size={22} color={colors.rust[600]} />}
            label="Store QR Code"
            sublabel="Scan to view your catalog"
            onPress={() => router.push('/store-profile')}
            accent={colors.rust[50]}
          />
        </View>
      </View>

      {/* ── Customers & Sales ── */}
      <View className="px-4 pt-5">
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-6 h-6 rounded-lg items-center justify-center" style={{ backgroundColor: `${colors.turmeric[500]}1A` }}>
            <Users size={14} color={colors.turmeric[500]} />
          </View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
            Customers & Sales
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-3">
          <QuickAction
            icon={<Users size={22} color={colors.turmeric[500]} />}
            label="Add Customer"
            sublabel="Save preferences"
            onPress={() => router.push('/customer/add')}
            accent={colors.turmeric[50]}
          />
          <QuickAction
            icon={<Link2 size={22} color={colors.danger} />}
            label="New Collection"
            sublabel="Share on WhatsApp"
            onPress={() => router.push('/collection/new')}
            accent={colors.dangerSurface}
          />
          <QuickAction
            icon={<ShoppingBag size={22} color={colors.turmeric[500]} />}
            label="Orders"
            sublabel={pendingOrders > 0 ? `${pendingOrders} pending` : 'Manage fulfillment'}
            onPress={() => router.push('/(tabs)/orders')}
            accent={colors.turmeric[50]}
          />
        </View>
      </View>

      {/* ── Growth & Marketing ── */}
      <View className="px-4 pt-5">
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-6 h-6 rounded-lg items-center justify-center" style={{ backgroundColor: `${colors.rust[600]}1A` }}>
            <Megaphone size={14} color={colors.rust[600]} />
          </View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
            Growth & Marketing
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-3">
          <QuickAction
            icon={<Megaphone size={22} color={colors.turmeric[500]} />}
            label="Growth Tools"
            sublabel="Campaigns · Referrals · More"
            onPress={() => router.push('/growth')}
            accent={colors.turmeric[50]}
          />
          <QuickAction
            icon={<Search size={22} color={primaryColor} />}
            label="AI Search"
            sublabel="Hindi / Hinglish voice-ready"
            onPress={() => router.push('/ai-search')}
            accent={colors.ink[50]}
          />
          <QuickAction
            icon={<BarChart3 size={22} color={primaryColor} />}
            label="Analytics"
            sublabel="Views, enquiries & trends"
            onPress={() => router.push('/analytics')}
            accent={colors.ink[50]}
          />
        </View>
      </View>

      {/* ── Settings ── */}
      <View className="px-4 pt-5 pb-2">
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-6 h-6 rounded-lg items-center justify-center" style={{ backgroundColor: `${colors.sand[600]}1A` }}>
            <Settings size={14} color={colors.sand[600]} />
          </View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
            Settings
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-3">
          <QuickAction
            icon={<Settings size={22} color={colors.sand[600]} />}
            label="Settings"
            sublabel="Profile · Billing · Staff"
            onPress={() => router.push('/settings')}
            accent={colors.sand[100]}
          />
        </View>
      </View>

      {/* Bottom padding */}
      <View className="h-8" />
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  onPress: () => void;
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
  );
}

function QuickAction({
  icon,
  label,
  sublabel,
  onPress,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onPress: () => void;
  accent: string;
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
  );
}
