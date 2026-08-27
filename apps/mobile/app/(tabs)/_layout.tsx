import { useState, useEffect } from 'react'
import { AppState, View, ActivityIndicator, Image } from 'react-native'
import { Tabs, router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Home, Grid3X3, Plus, TrendingUp, Link2 } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { ordersApi, retailerApi } from '../../src/lib/api'
import { useTheme } from '../../src/lib/theme'

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  const { primaryColor, colors } = useTheme()
  const [pendingCount, setPendingCount] = useState(0)
  const [checkoutEnabled, setCheckoutEnabled] = useState(false)

  // Gate: retailer must finish the registration/onboarding form before the
  // dashboard renders — otherwise a dropped-off signup (or any later relaunch)
  // lands straight on the tabs. Same query key as (tabs)/index.tsx's own
  // getMe() call, so this doesn't cost an extra network round trip.
  const {
    data: meData,
    isLoading: meLoading,
    isFetching: meFetching,
  } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
    // A cached `false` from the persisted offline cache must always be
    // re-verified against the DB before the gate redirects — staleTime 0
    // forces the mount refetch (cheap: getMe has a 60s request-cache TTL,
    // and the onboarding PATCH just cleared that cache).
    staleTime: 0,
  })
  const onboardingCompleted = (meData?.data as { onboarding_completed?: boolean } | undefined)
    ?.onboarding_completed

  // Redirect only once the query has fully settled. Waiting for isFetching
  // means a stale cached `false` (e.g. the persisted offline cache from a
  // dropped-off signup) that triggers a background refetch can't bounce a
  // user who just completed onboarding back to step 1 — the refetch lands
  // first and renders the dashboard.
  useEffect(() => {
    if (!meLoading && !meFetching && onboardingCompleted === false) {
      router.replace('/onboarding')
    }
  }, [meLoading, meFetching, onboardingCompleted])

  // Fetch pending order count for the badge on the Orders tab.
  // Refetches on app foreground so the badge stays current.
  const fetchPendingCount = async () => {
    try {
      const data = await ordersApi.list()
      const orders = data.data ?? []
      const count = orders.filter(
        (o) => o.status === 'PENDING_PAYMENT' || o.status === 'PAID',
      ).length
      setPendingCount(count)
    } catch {
      // Silently fail — keep previous count so badge doesn't flicker off
    }
  }

  useEffect(() => {
    // Skip while the onboarding gate is still deciding — no point badging a
    // dashboard that isn't about to render.
    if (meLoading || meFetching || onboardingCompleted === false) return
    void fetchPendingCount()
    const interval = setInterval(() => void fetchPendingCount(), 30_000)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchPendingCount()
    })
    return () => {
      clearInterval(interval)
      sub.remove()
    }
  }, [meLoading, meFetching, onboardingCompleted])

  // Gate: hide Orders tab if retailer's plan doesn't include checkout.
  // Server-side CHECKOUT_CART feature is the authority; this is a client-side
  // shortcut to avoid showing a tab that would 403 on every action.
  useEffect(() => {
    const plan = (meData?.data as { plan?: string } | undefined)?.plan
    // CHECKOUT_CART is enabled for GROWTH and PRO plans (admin-configurable
    // via PlanFeature table — if a new plan is added, update this check).
    setCheckoutEnabled(plan === 'GROWTH' || plan === 'PRO')
  }, [meData])

  if (meLoading || onboardingCompleted === false) {
    return (
      <View className="flex-1 items-center justify-center bg-cotton">
        <ActivityIndicator color={primaryColor} />
      </View>
    )
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: primaryColor,
        tabBarInactiveTintColor: colors.sand[400],
        tabBarStyle: {
          backgroundColor: colors.cotton,
          borderTopColor: colors.sand[100],
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
        headerStyle: { backgroundColor: colors.cotton },
        headerTintColor: colors.charcoal,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          headerTitleAlign: 'center',
          headerTitle: () => (
            <Image
              source={require('../../assets/kanchuki-full-logo.png')}
              style={{ width: 140, height: 28 }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Catalog',
          tabBarIcon: ({ color, size }) => <Grid3X3 color={color} size={size} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: primaryColor,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 10,
                shadowColor: primaryColor,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 6,
                elevation: 6,
              }}
            >
              <Plus color="#ffffff" size={26} strokeWidth={2.5} />
            </View>
          ),
          tabBarButton: (props) => (
            <AnimatedPressable
              {...(props as any)}
              onPress={() => router.push('/product/add')}
            />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="growth"
        options={{
          title: 'Growth',
          tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="collections"
        options={{
          title: 'Collections',
          tabBarIcon: ({ color, size }) => <Link2 color={color} size={size} />,
        }}
      />
      {/* Hidden tabs — accessible via direct link / router.push, but omitted from footer bar */}
      <Tabs.Screen
        name="orders"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          href: null,
        }}
      />
    </Tabs>
  )
}
