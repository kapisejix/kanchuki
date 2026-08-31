import { useEffect } from 'react'
import { View, ActivityIndicator, Image } from 'react-native'
import { Tabs, router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Home, Grid3X3, Plus, TrendingUp, Link2 } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { retailerApi } from '../../src/lib/api'
import { useTheme } from '../../src/lib/theme'

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  const { primaryColor, colors } = useTheme()

  // Gate: retailer must finish the registration/onboarding form before the
  // dashboard renders — otherwise a dropped-off signup (or any later relaunch)
  // lands straight on the tabs. Same query key as (tabs)/index.tsx's own
  // getMe() call, so this doesn't cost an extra network round trip.
  const {
    data: meData,
    isLoading: meLoading,
    isFetching: meFetching,
    isError: meError,
  } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
    staleTime: 60_000,
  })
  const onboardingCompleted = (meData?.data as { onboarding_completed?: boolean } | undefined)
    ?.onboarding_completed

  // Redirect only once the query has fully settled. Waiting for isFetching
  // means a stale cached `false` (e.g. the persisted offline cache from a
  // dropped-off signup) that triggers a background refetch can't bounce a
  // user who just completed onboarding back to step 1 — the refetch lands
  // first and renders the dashboard.
  useEffect(() => {
    if (!meLoading && !meFetching) {
      if (meError) {
        // getMe failed — token cleared (logout) or invalid. Go to Login, NOT
        // the onboarding/Setup-Shop screen (that's only for a real signup that
        // hasn't finished the form).
        router.replace('/auth/phone')
      } else if (onboardingCompleted === false) {
        router.replace('/onboarding')
      }
    }
  }, [meLoading, meFetching, meError, onboardingCompleted])

  // Only block the first load. A background refetch (staleTime expiry) must not
  // unmount <Tabs> — doing so swallowed the tap that triggered it, forcing a
  // second tap to actually navigate.
  if (meLoading || onboardingCompleted === false || meError) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F8F7FC]">
        <ActivityIndicator color={primaryColor} />
      </View>
    )
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#BB3F95',
        tabBarInactiveTintColor: '#928EB2',
        tabBarStyle: {
          backgroundColor: '#231F48',
          borderTopColor: 'rgba(224, 225, 246, 0.12)',
          height: 64 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
        },
        headerStyle: { backgroundColor: '#F8F7FC' },
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 16,
          lineHeight: 24,
          letterSpacing: 0.32,
          fontFamily: 'Marcellus_400Regular',
        },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} strokeWidth={1.8} />,
          headerTitleAlign: 'center',
          headerTitle: () => (
            <Image
              source={require('../../assets/kanchuki-full-logo.png')}
              style={{ width: 105, height: 21 }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Catalog',
          tabBarIcon: ({ color, size }) => <Grid3X3 color={color} size={size} strokeWidth={1.8} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: (props) => {
            const { style, ...rest } = props as any
            return (
              <AnimatedPressable
                {...rest}
                onPress={() => router.push('/product/add')}
                  style={[
                  style,
                  {
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    alignSelf: 'center',
                    top: -26,
                  },
                ]}
                accessibilityLabel="Add New Product"
                accessibilityRole="button"
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: '#BB3F95',
                    justifyContent: 'center',
                    alignItems: 'center',
                    shadowColor: '#BB3F95',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.5,
                    shadowRadius: 8,
                    elevation: 8,
                    borderWidth: 3,
                    borderColor: '#231F48',
                  }}
                >
                  <Plus color="#ffffff" size={26} strokeWidth={2.5} />
                </View>
              </AnimatedPressable>
            )
          },
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
