import '../global.css'
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter'
import type { PlatformTheme } from '@kanchuki/shared'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { Stack, router, useRootNavigationState } from 'expo-router'
import { vars } from 'nativewind'
import { useEffect, useRef, useState } from 'react'
import { AppState, Platform, Text, TextInput, View } from 'react-native'
import * as ExpoSplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

// Keep the native splash screen visible until fonts + palette are loaded.
// Must be called at module level (before any component renders).
ExpoSplashScreen.preventAutoHideAsync()
import { getToken } from '../src/lib/api'
import { CatalogDelegateBanner } from '../src/components/CatalogDelegateBanner'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { NetworkBanner } from '../src/components/NetworkBanner'
import { useSyncQueue } from '../src/hooks/useSyncQueue'
import { persistQueryCache, restoreQueryCache } from '../src/lib/offline-persister'
import { getItem } from '../src/lib/storage'
import { loadPersistedPalette, ThemeProvider, useTheme } from '../src/lib/theme'

// ponytail: RN has no CSS-style View→Text font inheritance, and NativeWind's
// className "inheritance" only covers CSS vars — not fontFamily. Patching the
// default here is the one-place fix instead of adding font-sans to every Text
// in the app; individual screens can still override with className="font-sans-*".
;(Text as unknown as { defaultProps: Record<string, unknown> }).defaultProps = {
  ...(Text as unknown as { defaultProps?: Record<string, unknown> }).defaultProps,
  style: [{ fontFamily: 'Inter_400Regular' }, (Text as any).defaultProps?.style],
}
;(TextInput as unknown as { defaultProps: Record<string, unknown> }).defaultProps = {
  ...(TextInput as unknown as { defaultProps?: Record<string, unknown> }).defaultProps,
  style: [{ fontFamily: 'Inter_400Regular' }, (TextInput as any).defaultProps?.style],
}

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

// Rendered inside ThemeProvider so useTheme() resolves. Sets the six brand
// CSS vars via nativewind's vars() so every bg-ink-600/text-ink-600/
// border-ink-600/bg-cotton/text-charcoal/bg-rust-600/… class in the app
// tree below picks up the admin-configured palette live — no per-screen
// edits needed. The var fallbacks match the defaults in tailwind.config.js.
function AppShell() {
  const {
    primaryColor,
    accentColor,
    tertiaryColor,
    backgroundColor,
    textColor,
    surfaceColor,
    colors,
  } = useTheme()
  return (
    <View
      className="flex-1 bg-cotton"
      style={vars({
        '--color-ink-600': primaryColor,
        '--color-rust-600': accentColor,
        '--color-turmeric-600': tertiaryColor,
        '--color-cotton': backgroundColor,
        '--color-charcoal': textColor,
        '--color-sand-100': surfaceColor,
      })}
    >
      <NetworkBanner />
      <CatalogDelegateBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          // RN style props can't read CSS vars — use the reactive theme values.
          headerStyle: { backgroundColor: colors.cotton },
          headerTintColor: colors.charcoal,
          headerTitleStyle: { fontWeight: '700', fontSize: 17, fontFamily: 'Inter_700Bold' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/phone" options={{ headerShown: false }} />
        <Stack.Screen name="auth/otp" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="staff" options={{ headerShown: false }} />
        <Stack.Screen name="product/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="product/scan" options={{ presentation: 'modal' }} />
        <Stack.Screen name="product/bulk" options={{ presentation: 'modal' }} />
        <Stack.Screen name="product/[id]" />
        <Stack.Screen name="customer/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="tryon/in-store" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="orders/[id]" />
        <Stack.Screen name="growth/index" />
        <Stack.Screen name="growth/campaigns" />
        <Stack.Screen name="growth/campaign-new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="growth/campaign/[id]" />
        <Stack.Screen name="growth/referrals" />
        <Stack.Screen name="growth/promotions" />
        <Stack.Screen name="growth/promotion-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="growth/suppliers" />
        <Stack.Screen name="growth/supplier-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="growth/supplier/[id]" />
        <Stack.Screen name="growth/bookings" />
        <Stack.Screen name="growth/booking-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="growth/inventory" />
        <Stack.Screen name="growth/videos" />
        <Stack.Screen name="growth/translate" />
        <Stack.Screen name="growth/analytics" />
        <Stack.Screen name="ai-search" />
      </Stack>
    </View>
  )
}

export default function RootLayout() {
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appStateRef = useRef(AppState.currentState)
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  })

  // Hydrate the persisted per-user palette BEFORE the first render so the
  // app launches already-themed — the admin's last-saved palette shows
  // instantly (a SecureStore read, not a network fetch). Gating render on
  // readiness (like fonts) means there is never a default-theme flash.
  // ThemeProvider also re-syncs in the background and reacts to account
  // switches on shared devices.
  const [paletteReady, setPaletteReady] = useState(false)
  const [initialPalette, setInitialPalette] = useState<PlatformTheme | null>(null)
  useEffect(() => {
    let cancelled = false
    const boot = (async () => {
      const retailerId = await getItem('retailer_id').catch(() => null)
      return loadPersistedPalette(retailerId).catch(() => null)
    })()
    // ponytail: SecureStore.getItemAsync can hang indefinitely on some Android
    // Keystore states (no reject, just never settles) — without this timeout
    // the fontsLoaded/paletteReady render gate below stays blank white forever.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
    Promise.race([boot, timeout]).then((cached) => {
      if (!cancelled) {
        setInitialPalette(cached)
        setPaletteReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // ── Rehydrate offline cache on mount ──────────────────────────
  useEffect(() => {
    restoreQueryCache(queryClient).catch(() => {
      // Non-fatal — offline cache unavailable, app works without it
    })
  }, [])

  // ── Auth redirect ─────────────────────────────────────────────
  // router.replace() before the navigator's ref attaches throws "Couldn't
  // find a navigation context" — wait for rootNavigationState.key first.
  const rootNavigationState = useRootNavigationState()
  useEffect(() => {
    if (!rootNavigationState?.key) return
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
  }, [rootNavigationState?.key])

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

  // ponytail: previously gated first paint on fontsLoaded/paletteReady. A
  // stuck SecureStore.getItemAsync call on some Android Keystore states
  // blocks the JS thread itself (not just its own promise), so even the
  // setTimeout-based race above never got a chance to fire and the app
  // never painted. Never block first paint on an unreliable native call —
  // render immediately with defaults, theme/fonts apply once ready.
  //
  // Use expo-splash-screen to keep the native splash visible until both
  // fonts AND palette are ready, then hide it so the themed UI appears
  // without a flash.
  useEffect(() => {
    if (fontsLoaded && paletteReady) {
      ExpoSplashScreen.hideAsync()
    }
  }, [fontsLoaded, paletteReady])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SyncQueueGate />
          <ErrorBoundary>
            <ThemeProvider initialPalette={initialPalette}>
              <AppShell />
            </ThemeProvider>
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
