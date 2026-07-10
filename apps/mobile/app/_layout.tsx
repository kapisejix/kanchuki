import '../global.css'
import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { AppState, Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { getToken } from '../src/lib/api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ── Reduce network churn on slow connections ──
      staleTime: 60_000, // 1 min — don't refetch immediately on mount
      gcTime: 300_000, // 5 min — keep data in cache after unmount
      retry: 2, // retry twice before showing error
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false, // mobile doesn't need this — AppState handles it
      refetchOnReconnect: true, // refetch when network comes back
    },
  },
})

export default function RootLayout() {
  useEffect(() => {
    void getToken().then((token) => {
      if (!token) router.replace('/auth/phone')
    })
  }, [])

  // ── Pause/resume queries based on app foreground/background ──
  useEffect(() => {
    if (Platform.OS === 'web') return
    const sub = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active')
    })
    return () => sub.remove()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth/phone" options={{ headerShown: false }} />
            <Stack.Screen name="auth/otp" options={{ headerShown: false }} />
            <Stack.Screen name="product/add" options={{ presentation: 'modal' }} />
            <Stack.Screen name="product/bulk" options={{ presentation: 'modal' }} />
            <Stack.Screen name="product/[id]" />
            <Stack.Screen name="customer/add" options={{ presentation: 'modal' }} />
            <Stack.Screen name="tryon/in-store" options={{ presentation: 'fullScreenModal' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
