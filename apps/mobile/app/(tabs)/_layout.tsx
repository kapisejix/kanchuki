import { Tabs } from 'expo-router'
import { Home, Grid3X3, Users, Link2, MoreHorizontal } from 'lucide-react-native'

const PRIMARY = '#7C3AED'
const MUTED = '#9CA3AF'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: MUTED,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#F3F4F6',
          height: 60,
          paddingBottom: 8,
        },
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#111827',
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
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
