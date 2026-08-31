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
import { categoryApi, retailerApi } from '../../src/lib/api';
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
  city?: string | null;
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

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', 'list'],
    queryFn: () => categoryApi.list(),
  });

  const me = (meData as { data: RetailerMe } | undefined)?.data;
  const stats = (statsData as { data: Stats } | undefined)?.data;
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
      {/* ── Top Retailer Header & Identity ── */}
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View
            className="w-10 h-10 rounded-2xl bg-tyrian-800 border border-fuchsia-500/30 items-center justify-center shadow-md"
            style={{
              shadowColor: '#BB3F95',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 6,
              elevation: 3,
            }}
          >
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-lavender-200 font-bold text-sm"
            >
              {(me?.shop_name ?? 'R').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text
              style={{
                fontFamily: 'Marcellus_400Regular',
                fontSize: 16,
                lineHeight: 24,
                letterSpacing: 0.32,
                fontWeight: '800',
              }}
              className="text-base leading-6 tracking-[0.02em] font-extrabold text-spaceCadet-900 font-marcellus"
            >
              {me?.shop_name || 'Your Store'}
            </Text>
            <Text className="text-[10px] uppercase tracking-wider text-fuchsia-600 font-extrabold">
              {me?.city ? `${me.city.toUpperCase()} • ` : ''}{me?.plan ?? 'PRO STORE'}
            </Text>
          </View>
        </View>

        <AnimatedPressable
          onPress={() => router.push('/settings')}
          className="w-9 h-9 rounded-2xl bg-white border border-lavender-200 items-center justify-center shadow-sm"
          accessibilityLabel="Open settings"
        >
          <Settings size={16} color="#560A39" />
        </AnimatedPressable>
      </View>

      {/* ── Signature Gradient Hero (#231F48 to #560A39) ── */}
      <View className="px-4 pb-3">
        <LinearGradient
          colors={['#231F48', '#560A39']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 28,
            padding: 20,
            shadowColor: '#231F48',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.28,
            shadowRadius: 18,
            elevation: 8,
          }}
        >
          <View className="flex-row justify-between items-start mb-2">
            <Text className="text-[10px] uppercase tracking-wider font-extrabold text-lavender-200/80">
              Active Catalog Overview
            </Text>
            <View className="px-2 py-0.5 rounded-full bg-fuchsia-500/30 border border-fuchsia-400">
              <Text className="text-white text-[10px] font-extrabold">+18.4%</Text>
            </View>
          </View>

          <View className="flex-row items-baseline gap-2 mb-1">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-3xl font-extrabold text-white tracking-tight"
            >
              {stats?.views_this_month ?? 0}
            </Text>
            <Text className="text-xs text-lavender-200/80 font-medium">Customer Views</Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: 16,
              marginTop: 14,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255, 255, 255, 0.15)',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text className="text-[9px] text-lavender-200/70 font-extrabold uppercase tracking-wider block">
                WHATSAPP ENQUIRIES
              </Text>
              <Text className="text-white font-extrabold text-sm mt-0.5">
                {stats?.enquiries_this_month ?? 0} Sent
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-[9px] text-lavender-200/70 font-extrabold uppercase tracking-wider block">
                ACTIVE PRODUCTS
              </Text>
              <Text className="text-white font-extrabold text-sm mt-0.5">
                {stats?.total_products_available ?? 0} in Stock
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* ── Quick Tools ── */}
      <View className="px-4 pt-2 pb-2">
        <Text className="text-[11px] font-extrabold text-heliotrope-600 uppercase tracking-wider mb-2 px-1">
          Quick Tools
        </Text>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <QuickAction
              icon={<Package size={20} color="#BB3F95" />}
              label="Active Products"
              sublabel={`${stats?.total_products_available ?? 0} in stock`}
              onPress={() => router.push('/catalog')}
              accent="#E0E1F6"
            />
            <QuickAction
              icon={<QrCode size={20} color="#560A39" />}
              label="Store QR Code"
              sublabel="Scan to view catalog"
              onPress={() => router.push('/store-profile')}
              accent="#E0E1F6"
            />
          </View>
          <View className="flex-row gap-3">
            <QuickAction
              icon={<MessageCircle size={20} color="#BB3F95" />}
              label="Social Media"
              sublabel="Connect & post"
              onPress={() => router.push('/growth/integrations')}
              accent="#E0E1F6"
            />
            <QuickAction
              icon={<BarChart3 size={20} color="#560A39" />}
              label="Analytics"
              sublabel="Views, enquiries & stats"
              onPress={() => router.push('/analytics')}
              accent="#E0E1F6"
            />
          </View>
        </View>
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
      <View className="px-4 pt-3 pb-2">
        <Text className="text-[11px] font-bold text-heliotrope-600 uppercase tracking-wider mb-2.5 px-1">
          Store Performance
        </Text>
        <View className="flex-row gap-3">
          <StatCard
            icon={<Eye size={16} color="#BB3F95" />}
            label="Views"
            value={stats?.views_this_month ?? 0}
            color="#231F48"
            onPress={() => router.push('/analytics')}
          />
          <StatCard
            icon={<MessageCircle size={16} color="#BB3F95" />}
            label="Enquiries"
            value={stats?.enquiries_this_month ?? 0}
            color="#231F48"
            onPress={() => router.push('/analytics')}
          />
        </View>
        <View className="flex-row gap-3 mt-3">
          <StatCard
            icon={<Package size={16} color="#BB3F95" />}
            label="Active Products"
            value={stats?.total_products_available ?? 0}
            color="#231F48"
            onPress={() => router.push('/catalog')}
          />
          <StatCard
            icon={<Users size={16} color="#BB3F95" />}
            label="Customers"
            value={stats?.total_customers ?? 0}
            color="#231F48"
            onPress={() => router.push('/customers')}
          />
        </View>
      </View>

      {/* Trending products */}
      {(stats?.top_viewed_products?.length ?? 0) > 0 && (
        <View className="px-4 py-2">
          <Text className="text-[11px] font-bold text-heliotrope-600 uppercase tracking-wider mb-2.5 px-1">
            Trending Products
          </Text>
          <View className="gap-2.5">
            {stats!.top_viewed_products.map((r) => (
              <AnimatedPressable
                key={r.product.id}
                onPress={() => router.push(`/product/${r.product.id}`)}
                className="bg-white rounded-3xl p-3.5 border border-lavender-200 flex-row items-center justify-between shadow-sm"
              >
                <Text className="text-xs font-bold text-spaceCadet-900 font-marcellus">
                  {r.product.category ?? 'Product'} · {r.product.primary_color ?? '—'}
                </Text>
                <View className="px-2.5 py-1 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20">
                  <Text className="text-[11px] font-bold text-fuchsia-600">{r.count} views</Text>
                </View>
              </AnimatedPressable>
            ))}
          </View>
        </View>
      )}

      {/* ── Catalog & Products ── */}
      <View className="px-4 pt-4">
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-6 h-6 rounded-lg items-center justify-center bg-fuchsia-500/15">
            <Package size={14} color="#BB3F95" />
          </View>
          <Text className="text-[11px] font-bold text-heliotrope-600 uppercase tracking-wider">
            Catalog & Products
          </Text>
        </View>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <QuickAction
              icon={<Camera size={20} color="#BB3F95" />}
              label="Add Product"
              sublabel="Photo + AI tagging"
              onPress={() => router.push('/product/add')}
              accent="#E0E1F6"
            />
            <QuickAction
              icon={<FolderKanban size={20} color="#560A39" />}
              label={`${categories.length} ${categories.length === 1 ? 'Category' : 'Categories'}`}
              sublabel="Manage categories"
              onPress={() => router.push('/category')}
              accent="#E0E1F6"
            />
          </View>
          <View className="flex-row gap-3">
            <QuickAction
              icon={<PackagePlus size={20} color="#BB3F95" />}
              label="Bulk Onboard"
              sublabel="Rack-by-rack upload"
              onPress={() => router.push('/product/bulk-onboard')}
              accent="#E0E1F6"
            />
            <QuickAction
              icon={<QrCode size={20} color="#560A39" />}
              label="Store QR Code"
              sublabel="Scan to view catalog"
              onPress={() => router.push('/store-profile')}
              accent="#E0E1F6"
            />
          </View>
        </View>
      </View>

      {/* ── Customers & Sales ── */}
      <View className="px-4 pt-5">
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-6 h-6 rounded-lg items-center justify-center bg-fuchsia-500/15">
            <Users size={14} color="#BB3F95" />
          </View>
          <Text className="text-[11px] font-bold text-heliotrope-600 uppercase tracking-wider">
            Customers & Sales
          </Text>
        </View>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <QuickAction
              icon={<Users size={20} color="#560A39" />}
              label="Add Customer"
              sublabel="Save preferences"
              onPress={() => router.push('/customer/add')}
              accent="#E0E1F6"
            />
            <QuickAction
              icon={<Link2 size={20} color="#BB3F95" />}
              label="New Collection"
              sublabel="Share on WhatsApp"
              onPress={() => router.push('/collection/new')}
              accent="#E0E1F6"
            />
          </View>
          <View className="flex-row gap-3">
            <QuickAction
              icon={<ShoppingBag size={20} color="#560A39" />}
              label="Orders"
              sublabel={'Manage your store'}
              onPress={() => router.push('/(tabs)/orders')}
              accent="#E0E1F6"
            />
            <View className="flex-1" />
          </View>
        </View>
      </View>

      {/* ── Growth & Marketing ── */}
      <View className="px-4 pt-5">
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-6 h-6 rounded-lg items-center justify-center bg-fuchsia-500/15">
            <Megaphone size={14} color="#BB3F95" />
          </View>
          <Text className="text-[11px] font-bold text-heliotrope-600 uppercase tracking-wider">
            Growth & Marketing
          </Text>
        </View>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <QuickAction
              icon={<Megaphone size={20} color="#BB3F95" />}
              label="Growth Tools"
              sublabel="AI Campaigns · Referrals"
              onPress={() => router.push('/growth')}
              accent="#E0E1F6"
            />
            <QuickAction
              icon={<Search size={20} color="#560A39" />}
              label="AI Search"
              sublabel="Voice-ready inventory"
              onPress={() => router.push('/ai-search')}
              accent="#E0E1F6"
            />
          </View>
          <View className="flex-row gap-3">
            <QuickAction
              icon={<BarChart3 size={20} color="#BB3F95" />}
              label="Analytics"
              sublabel="Views, enquiries & stats"
              onPress={() => router.push('/analytics')}
              accent="#E0E1F6"
            />
            <View className="flex-1" />
          </View>
        </View>
      </View>

      {/* ── Settings ── */}
      <View className="px-4 pt-5 pb-2">
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-6 h-6 rounded-lg items-center justify-center bg-fuchsia-500/15">
            <Settings size={14} color="#BB3F95" />
          </View>
          <Text className="text-[11px] font-bold text-heliotrope-600 uppercase tracking-wider">
            Settings
          </Text>
        </View>
        <View className="flex-row gap-3">
          <QuickAction
            icon={<Settings size={20} color="#560A39" />}
            label="Settings"
            sublabel="Store Profile · Staff · Sync"
            onPress={() => router.push('/settings')}
            accent="#E0E1F6"
          />
          <View className="flex-1" />
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
      className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm"
      style={{
        shadowColor: '#231F48',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      <View
        className="w-8 h-8 rounded-xl items-center justify-center mb-2 bg-lavender-100"
      >
        {icon}
      </View>
      <Text
        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
        className="text-2xl font-bold text-spaceCadet-900"
      >
        {value.toLocaleString('en-IN')}
      </Text>
      <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">{label}</Text>
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
      className="flex-1 bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm"
      style={{
        shadowColor: '#231F48',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      <View
        className="w-10 h-10 rounded-2xl items-center justify-center mb-2.5"
        style={{ backgroundColor: accent }}
      >
        {icon}
      </View>
      <Text
        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
        className="text-xs font-bold text-spaceCadet-900"
      >
        {label}
      </Text>
      <Text className="text-[10px] text-heliotrope-500 mt-0.5 font-medium">{sublabel}</Text>
    </AnimatedPressable>
  );
}
