import '../global.css'
import { useEffect, useRef } from 'react'
import { Stack, router } from 'expo-router'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { AppState, Platform, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { getToken } from '../src/lib/api'
import { getItem } from '../src/lib/storage'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { NetworkBanner } from '../src/components/NetworkBanner'
import { restoreQueryCache, persistQueryCache } from '../src/lib/offline-persister'
import { useSyncQueue } from '../src/hooks/useSyncQueue'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A-1: serve stale cache immediately when offline instead of pausing queries
      networkMode: 'offlineFirst',
      // ── Reduce network churn on slow connections ──
      staleTime: 60_000,   // 1 min — don't refetch immediately on mount
      gcTime: 24 * 60 * 60 * 1000, // 24h — survive background kill for offline use
      retry: 2,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false, // mobile doesn't need this — AppState handles it
      refetchOnReconnect: true,    // refetch when network comes back
    },
    mutations: {
      // A-1: mutations queue (don't fail immediately) when offline
      networkMode: 'offlineFirst',
    },
  },
})

// A-5: replay queued offline product-status mutations on reconnect.
// Rendered inside QueryClientProvider so useQueryClient() resolves.
function SyncQueueGate() {
  useSyncQueue()
  return null
}

export default function RootLayout() {
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appStateRef = useRef(AppState.currentState)

  // ── Rehydrate offline cache on mount ──────────────────────────
  useEffect(() => {
    restoreQueryCache(queryClient).catch(() => {
      // Non-fatal — offline cache unavailable, app works without it
    })
  }, [])

  // ── Auth redirect ─────────────────────────────────────────────
  useEffect(() => {
    getToken()
      .then(async (token) => {
        if (!token) {
          router.replace('/auth/phone')
          return
        }
        // Check if this is a staff member — if so, redirect to staff dashboard
        const staffRole = await getItem('staff_role').catch(() => null)
        if (staffRole) {
          router.replace('/staff')
        }
      })
      .catch(() => {
        // SecureStore unavailable — treat as unauthenticated
        router.replace('/auth/phone')
      })
  }, [])

  // ── Persist cache on background + pause/resume queries ────────
  useEffect(() => {
    if (Platform.OS === 'web') return

    const sub = AppState.addEventListener('change', (nextState) => {
      // Pause/resume focus for React Query
      focusManager.setFocused(nextState === 'active')

      // Save cache when app goes to background/inactive
      if (
        appStateRef.current === 'active' &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        // Debounce: clear any pending save timer
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
        persistTimerRef.current = setTimeout(() => {
          void persistQueryCache(queryClient)
        }, 2000)
      }

      appStateRef.current = nextState
    })

    return () => sub.remove()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SyncQueueGate />
          <ErrorBoundary>
            <View className="flex-1">
              <NetworkBanner />
              <Stack
                screenOptions={{
                  headerShown: false,
                  headerStyle: { backgroundColor: '#ffffff' },
                  headerTintColor: '#111827',
                  headerTitleStyle: { fontWeight: '700', fontSize: 17 },
                  headerShadowVisible: false,
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="auth/phone" options={{ headerShown: false }} />
                <Stack.Screen name="auth/otp" options={{ headerShown: false }} />
                <Stack.Screen name="product/add" options={{ presentation: 'modal' }} />
                <Stack.Screen name="product/bulk" options={{ presentation: 'modal' }} />
                <Stack.Screen name="product/[id]" />
                <Stack.Screen name="customer/add" options={{ presentation: 'modal' }} />
                <Stack.Screen name="tryon/in-store" options={{ presentation: 'fullScreenModal' }} />
                <Stack.Screen name="orders/[id]" />
              </Stack>
            </View>
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
