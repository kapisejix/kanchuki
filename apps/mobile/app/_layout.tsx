import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { MMKV } from 'react-native-mmkv'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const storage = new MMKV()
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 2 },
  },
})

export default function RootLayout() {
  useEffect(() => {
    const token = storage.getString('auth_token')
    if (!token) {
      router.replace('/auth/phone')
    }
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="product/add" options={{ presentation: 'modal' }} />
            <Stack.Screen name="product/[id]" />
            <Stack.Screen name="customer/add" options={{ presentation: 'modal' }} />
            <Stack.Screen name="collection/new" options={{ presentation: 'modal' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
