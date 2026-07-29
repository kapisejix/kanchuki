import { useState, useEffect } from 'react'
import { AppState } from 'react-native'
import { Tabs } from 'expo-router'
import { Home, Grid3X3, Users, Link2, BarChart3, ShoppingBag } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ordersApi } from '../../src/lib/api'
import { useTheme } from '../../src/lib/theme'

const MUTED = '#ABA39C'

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  const { primaryColor } = useTheme()
  const [pendingCount, setPendingCount] = useState(0)

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
    void fetchPendingCount()
    const interval = setInterval(() => void fetchPendingCount(), 30_000)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchPendingCount()
    })
    return () => {
      clearInterval(interval)
      sub.remove()
    }
  }, [])

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: primaryColor,
        tabBarInactiveTintColor: MUTED,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#F2EEE9',
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#14100D',
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
          headerTitle: 'Kanchuki',
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
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => <ShoppingBag color={color} size={size} />,
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="collections"
        options={{
          title: 'Collections',
          tabBarIcon: ({ color, size }) => <Link2 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
