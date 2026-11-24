import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import {
  BarChart3,
  Camera,
  FolderKanban,
  Link2,
  Megaphone,
  MessageCircle,
  Package,
  PackagePlus,
  QrCode,
  ScanBarcode,
  ScanLine,
  Settings,
} from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import {
  BackHandler,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { GradientButton } from '../../src/components/GradientButton';
import { SetupChecklist } from '../../src/components/SetupChecklist';
import { HomeScreenSkeleton } from '../../src/components/Skeleton';
import { UsageRows } from '../../src/components/UsageCard';
import { SchedulerBanner } from '../../src/components/social/SchedulerBanner';
import { categoryApi, retailerApi } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth-context';
import { META_SOCIAL_ENABLED } from '../../src/lib/meta-social';
import { useScreenInsets } from '../../src/lib/safe-area';
import { staffCan } from '../../src/lib/staff-can';
import { useUnreadEnquiries } from '../../src/lib/use-unread-enquiries';

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
  const { tabScrollPaddingBottom } = useScreenInsets();
  // FR-3.2/3.3: staff see a role-scoped home — write/growth actions that the
  // server allowlist blocks (staffCan mirrors apps/api plugins/auth.ts) are
  // not rendered instead of 403ing on tap.
  const { staffRole } = useAuth();
  const canEditCatalog = staffCan(staffRole, 'catalog.edit');
  const canCollections = staffCan(staffRole, 'collections');
  const canGrowth = staffCan(staffRole, 'growth');
  const canAnalytics = staffCan(staffRole, 'analytics');
  const canSocial = META_SOCIAL_ENABLED && staffCan(staffRole, 'social');
  const unreadEnquiries = useUnreadEnquiries();
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

  // Home is the root tab (nothing to pop back to) — Android's hardware back
  // must not fall through to any wrong screen. Standard double-tap-to-exit.
  // Gated on focus: (tabs) stays mounted underneath any pushed screen
  // (product/add, settings, …), so a plain useEffect listener would keep
  // intercepting hardware back everywhere instead of just on Home.
  const lastBackPressRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackPressRef.current = now;
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  if (isLoading) {
    return <HomeScreenSkeleton />;
  }

  return (
    <ScrollView
      className="flex-1 bg-[#F8F7FC]"
      contentContainerStyle={{ paddingBottom: tabScrollPaddingBottom }}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} />}
    >
      {/* ── Top Retailer Header & Identity ── */}
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-2xl bg-lavender-100 border border-lavender-200 items-center justify-center">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-spaceCadet-900 text-sm"
            >
              {(me?.shop_name ?? 'R').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text
              style={{
                fontFamily: 'Marcellus_400Regular',
                letterSpacing: 0.32,
                fontWeight: '800',
                fontSize: 16,
                lineHeight: 24,
              }}
              className="text-base leading-6 text-spaceCadet-900"
            >
              {me?.shop_name || 'Your Store'}
            </Text>
            <Text className="text-xs text-heliotrope-500">
              {[me?.city?.toUpperCase(), me?.plan, me?.plan_status].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <AnimatedPressable
          onPress={() => router.push('/settings')}
          className="w-9 h-9 rounded-2xl bg-white border border-lavender-200 items-center justify-center shadow-sm"
          accessibilityLabel="Open settings"
        >
          <Settings size={18} color="#231F48" />
        </AnimatedPressable>
      </View>

      <View className="px-5 pb-3">
        <SchedulerBanner />
      </View>

      <SetupChecklist />

      {/* ── Signature Gradient Hero (#231F48 to #560A39) ── */}
      <View className="px-4 pb-3">
        <LinearGradient
          colors={['#231F48', '#560A39']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 16,
            padding: 20,
          }}
        >
          <View className="flex-row justify-between items-start mb-2">
            <Text className="text-xs text-lavender-200">Catalog overview</Text>
          </View>

          <View className="flex-row items-baseline gap-2 mb-1">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-4xl text-white"
            >
              {stats?.views_this_month ?? 0}
            </Text>
            <Text className="text-xs text-lavender-200">customer views this month</Text>
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
              <Text className="text-xs text-lavender-200">WhatsApp enquiries</Text>
              <Text className="text-white font-semibold text-sm mt-0.5">
                {stats?.enquiries_this_month ?? 0} sent
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-xs text-lavender-200">Active products</Text>
              <Text className="text-white font-semibold text-sm mt-0.5">
                {stats?.total_products_available ?? 0} in stock
              </Text>
            </View>
          </View>

          {/* F-010 plan limits left — hidden when nothing is metered or staff lack access */}
          <UsageRows />
        </LinearGradient>
      </View>

      {/* ── Quick Tools ── */}
      <View className="px-4 pt-2 pb-2">
        <Text className="text-sm font-semibold text-spaceCadet-900 mb-2 px-1">Quick tools</Text>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <QuickAction
              icon={<Package size={18} color="#5A3962" />}
              label="Active Products"
              sublabel={`${stats?.total_products_available ?? 0} in stock`}
              onPress={() => router.push('/catalog')}
            />
            <QuickAction
              icon={<QrCode size={18} color="#5A3962" />}
              label="Store QR Code"
              sublabel="Scan to view catalog"
              onPress={() => router.push('/store-profile')}
            />
          </View>
          {(canSocial || canAnalytics) && (
            <View className="flex-row gap-3">
              {canSocial && (
                <QuickAction
                  icon={<MessageCircle size={18} color="#5A3962" />}
                  label="Social Media"
                  sublabel="Connect & post"
                  onPress={() => router.push('/growth/integrations')}
                />
              )}
              {canAnalytics && (
                <QuickAction
                  icon={<BarChart3 size={18} color="#5A3962" />}
                  label="Analytics"
                  sublabel="Views, enquiries & stats"
                  onPress={() => router.push('/analytics')}
                />
              )}
            </View>
          )}
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

      {/* Trending products */}
      {(stats?.top_viewed_products?.length ?? 0) > 0 && (
        <View className="px-4 py-2">
          <Text className="text-sm font-semibold text-spaceCadet-900 mb-2 px-1">
            Trending products
          </Text>
          <View className="gap-2.5">
            {(stats?.top_viewed_products ?? []).map((r) => (
              <AnimatedPressable
                key={r.product.id}
                onPress={() => router.push(`/product/${r.product.id}`)}
                className="bg-white rounded-2xl p-3.5 border border-lavender-200 flex-row items-center justify-between shadow-sm"
              >
                <Text className="text-xs text-spaceCadet-900 font-extrabold font-marcellus">
                  {r.product.category ?? 'Product'} · {r.product.primary_color ?? '—'}
                </Text>
                <Text className="text-xs text-heliotrope-500">{r.count} views</Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>
      )}

      {/* ── Catalog & Products ── */}
      <View className="px-4 pt-4">
        <Text className="text-sm font-semibold text-spaceCadet-900 mb-2 px-1">
          Catalog & products
        </Text>
        <View className="gap-3">
          <View className="flex-row gap-3">
            {canEditCatalog && (
              <QuickAction
                icon={<Camera size={18} color="#5A3962" />}
                label="Add Product"
                sublabel="Photo + AI tagging"
                onPress={() => router.push('/product/add')}
              />
            )}
            <QuickAction
              icon={<FolderKanban size={18} color="#5A3962" />}
              label={`${categories.length} ${categories.length === 1 ? 'Category' : 'Categories'}`}
              sublabel="Manage categories"
              onPress={() => router.push('/category')}
            />
          </View>
          <View className="flex-row gap-3">
            {canEditCatalog && (
              <QuickAction
                icon={<PackagePlus size={18} color="#5A3962" />}
                label="Bulk Onboard"
                sublabel="Rack-by-rack upload"
                onPress={() => router.push('/product/bulk-onboard')}
              />
            )}
            {canCollections && (
              <QuickAction
                icon={<Link2 size={18} color="#5A3962" />}
                label="New Collection"
                sublabel="Share on WhatsApp"
                onPress={() => router.push('/collection/new')}
              />
            )}
          </View>
          {/* F-044 E3 — every role (D2); E4-lite badge = NEW count. */}
          <View className="flex-row gap-3">
            <QuickAction
              icon={<MessageCircle size={18} color="#5A3962" />}
              label="Enquiries"
              sublabel="Customer picks inbox"
              onPress={() => router.push('/enquiries')}
              badge={unreadEnquiries}
            />
            {/* F-047 Scan & Sell — every role the server allows (owner, manager, salesperson), so no staffCan gate. */}
            <QuickAction
              icon={<ScanLine size={18} color="#5A3962" />}
              label="Sell items"
              sublabel="Scan and mark sold"
              onPress={() => router.push('/product/sell')}
            />
          </View>
          {/* F-025 single scan — moved from the Catalog header (owner, 2026-11-24); same route, no staffCan gate there either. */}
          <View className="flex-row gap-3">
            <QuickAction
              icon={<ScanBarcode size={18} color="#5A3962" />}
              label="Scan product"
              sublabel="Find by SKU, mark sold"
              onPress={() => router.push('/product/scan')}
            />
            <View className="flex-1" />
          </View>
          {/* Suits Designs — retailer entry hidden by owner decision
              (2026-09-07). Only admin-uploaded (global) designs show to
              customers. Screens + route stay registered; restore this tile
              to re-enable retailer uploads. */}
          {/* <View className="flex-row gap-3">
            <QuickAction
              icon={<Image size={18} color="#5A3962" />}
              label="Suits Designs"
              sublabel="Design photos for your store"
              onPress={() => router.push('/showcase-designs')}
            />
          </View> */}
        </View>
      </View>

      {/* ── Growth & Marketing ── Analytics tile lives in the top quick actions. */}
      {canGrowth && (
        <View className="px-4 pt-5">
          <Text className="text-sm font-semibold text-spaceCadet-900 mb-2 px-1">
            Growth & marketing
          </Text>
          <View className="flex-row gap-3">
            <QuickAction
              icon={<Megaphone size={18} color="#5A3962" />}
              label="Growth Tools"
              sublabel="AI Campaigns · Referrals"
              onPress={() => router.push('/growth')}
            />
            <View className="flex-1" />
          </View>
        </View>
      )}

      {/* ── Settings ── */}
      <View className="px-4 pt-5 pb-2">
        <Text className="text-sm font-semibold text-spaceCadet-900 mb-2 px-1">Settings</Text>
        <View className="flex-row gap-3">
          <QuickAction
            icon={<Settings size={18} color="#5A3962" />}
            label="Settings"
            sublabel="Store Profile · Staff · Sync"
            onPress={() => router.push('/settings')}
          />
          <View className="flex-1" />
        </View>
      </View>

      {/* Bottom padding */}
      <View className="h-8" />
    </ScrollView>
  );
}

function QuickAction({
  icon,
  label,
  sublabel,
  onPress,
  badge = 0,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      className="flex-1 bg-white rounded-2xl p-4 border border-lavender-200"
    >
      <View className="mb-2">{icon}</View>
      <Text
        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
        className="text-[13px] text-spaceCadet-900"
      >
        {label}
      </Text>
      <Text className="text-xs text-heliotrope-500 mt-0.5">{sublabel}</Text>
      {badge > 0 && (
        <View
          className="absolute top-3 right-3 min-w-[20px] h-5 px-1.5 rounded-full bg-fuchsia-600 items-center justify-center"
          accessibilityLabel={`${badge} new`}
        >
          <Text className="text-[11px] font-semibold text-white">{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
}
