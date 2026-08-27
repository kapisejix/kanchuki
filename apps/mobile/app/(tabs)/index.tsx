import { COLORS } from '@kanchuki/shared';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
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
  Search,
  Settings,
  ShoppingBag,
  Users,
} from 'lucide-react-native';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { GradientButton } from '../../src/components/GradientButton';
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
      className="flex-1 bg-[#F8F7FC]"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} />}
    >
      {/* ── Signature Gradient Hero (#231F48 to #560A39) ── */}
      <View className="px-4 pt-4 pb-2">
        <LinearGradient
          colors={['#231F48', '#560A39']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 32 }}
          className="p-5 shadow-lg"
        >
          {/* Top Retailer Bar */}
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-3">
              <View className="w-11 h-11 rounded-2xl bg-tyrian-800 border border-fuchsia-500/40 items-center justify-center shadow-sm">
                <Text className="text-lavender-200 font-marcellus font-bold text-base">
                  {(me?.shop_name ?? 'R').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text className="text-white text-lg font-bold font-marcellus">
                  {me?.shop_name ?? 'Your Store'}
                </Text>
                <Text className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-wider">
                  {me?.plan ?? 'PRO STORE'} • ACTIVE
                </Text>
              </View>
            </View>

            <AnimatedPressable
              onPress={() => router.push('/settings')}
              className="w-9 h-9 rounded-2xl bg-white/10 border border-white/20 items-center justify-center"
            >
              <Settings size={16} color="#E0E1F6" />
            </AnimatedPressable>
          </View>

          {/* Monthly Stats in Hero */}
          <View className="border-t border-white/15 pt-3">
            <View className="flex-row justify-between items-start mb-1">
              <Text className="text-[10px] uppercase tracking-wider font-bold text-lavender-200/80">
                Active Catalog Overview
              </Text>
              <View className="px-2 py-0.5 rounded-full bg-fuchsia-500/30 border border-fuchsia-400">
                <Text className="text-white text-[10px] font-bold">+18.4%</Text>
              </View>
            </View>

            <View className="flex-row items-baseline gap-2">
              <Text className="text-3xl font-extrabold font-marcellus text-white">
                {stats?.views_this_month ?? 0}
              </Text>
              <Text className="text-xs text-lavender-200 font-medium">Customer Views</Text>
            </View>

            <View className="flex-row gap-4 mt-3 pt-2 border-t border-white/10">
              <View className="flex-1">
                <Text className="text-[9px] text-lavender-200/70 font-bold uppercase tracking-wider">
                  ENQUIRIES
                </Text>
                <Text className="text-white font-bold text-sm">
                  {stats?.enquiries_this_month ?? 0} Sent
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-[9px] text-lavender-200/70 font-bold uppercase tracking-wider">
                  ACTIVE PRODUCTS
                </Text>
                <Text className="text-white font-bold text-sm">
                  {stats?.total_products_available ?? 0} SKUs
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* ── Scan Barcode / QR Primary CTA ── */}
      <View className="px-4 py-2">
        <GradientButton
          label="Scan Barcode / QR"
          onPress={() => router.push('/store-profile')}
          accentBadge={<QrCode size={16} color="white" />}
        />
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
