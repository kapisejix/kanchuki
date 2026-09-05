import "../global.css";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Marcellus_400Regular } from "@expo-google-fonts/marcellus";
import type { PlatformTheme } from "@kanchuki/shared";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as ExpoSplashScreen from "expo-splash-screen";
import { vars } from "nativewind";
import { useEffect, useRef, useState } from "react";
import { AppState, Platform, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CatalogDelegateBanner } from "../src/components/CatalogDelegateBanner";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { NetworkBanner } from "../src/components/NetworkBanner";
import { useSyncQueue } from "../src/hooks/useSyncQueue";
import { AuthProvider, useAuth } from "../src/lib/auth-context";
import {
  persistQueryCache,
  restoreQueryCache,
} from "../src/lib/offline-persister";
import { Sentry, initSentry } from "../src/lib/sentry";
import { getItem } from "../src/lib/storage";
import {
  loadPersistedPalette,
  ThemeProvider,
  useTheme,
} from "../src/lib/theme";

// Initialize Sentry crash reporting as early as possible — must run
// before any component renders so it can capture startup crashes.
initSentry();

// Keep the native splash screen visible until fonts + palette are loaded.
// Must be called at module level (before any component renders).
ExpoSplashScreen.preventAutoHideAsync();

// ponytail: RN has no CSS-style View→Text font inheritance, and NativeWind's
// className "inheritance" only covers CSS vars — not fontFamily. Patching the
// default here is the one-place fix instead of adding font-sans to every Text
// in the app; individual screens can still override with className="font-sans-*".
(Text as unknown as { defaultProps: Record<string, unknown> }).defaultProps = {
  ...(Text as unknown as { defaultProps?: Record<string, unknown> })
    .defaultProps,
  style: [
    { fontFamily: "Inter_400Regular" },
    (Text as any).defaultProps?.style,
  ],
};
(
  TextInput as unknown as { defaultProps: Record<string, unknown> }
).defaultProps = {
  ...(TextInput as unknown as { defaultProps?: Record<string, unknown> })
    .defaultProps,
  style: [
    { fontFamily: "Inter_400Regular" },
    (TextInput as any).defaultProps?.style,
  ],
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A-1: serve stale cache immediately when offline instead of pausing queries
      networkMode: "offlineFirst",
      // ── Reduce network churn on slow connections ──
      staleTime: 60_000, // 1 min — don't refetch immediately on mount
      gcTime: 24 * 60 * 60 * 1000, // 24h — survive background kill for offline use
      retry: (failureCount, error) => {
        const status = (error as any)?.status ?? (error as any)?.response?.status
        const code = (error as any)?.code
        if (status === 401 || status === 403 || status === 404 || code === 'UNAUTHORIZED') {
          return false
        }
        return failureCount < 2
      },
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false, // mobile doesn't need this — AppState handles it
      refetchOnReconnect: true, // refetch when network comes back
    },
    mutations: {
      // A-1: mutations queue (don't fail immediately) when offline
      networkMode: "offlineFirst",
    },
  },
});

// A-5: replay queued offline product-status mutations on reconnect.
// Rendered inside QueryClientProvider so useQueryClient() resolves.
function SyncQueueGate() {
  useSyncQueue();
  return null;
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
  } = useTheme();
  const { status, isStaff } = useAuth();

  // Never mount the Stack before the session is hydrated: with every
  // Stack.Protected guard still false the navigator has zero routeNames and
  // crashes on getInitialState. The native splash stays up until then (see
  // AppContent's hide gate).
  if (status === "loading") return null;

  const isAuthed = status === "authenticated";

  return (
    <View
      className="flex-1 bg-cotton"
      style={vars({
        "--color-ink-600": primaryColor,
        "--color-rust-600": accentColor,
        "--color-turmeric-600": tertiaryColor,
        "--color-cotton": backgroundColor,
        "--color-charcoal": textColor,
        "--color-sand-100": surfaceColor,
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
          headerTitleStyle: {
            fontWeight: "700",
            fontSize: 17,
            fontFamily: "Inter_700Bold",
          },
          headerShadowVisible: false,
        }}
      >
        {/* Authenticated retailer-only routes (dashboard, onboarding, plan
            select, settings, billing, growth, …). Guards are structural: when
            a guard flips, expo-router filters the route OUT of the navigation
            state, so auth screens can never sit in the back stack beneath
            these — hardware back pops to nothing (the dashboard's
            double-tap-to-exit handler) instead of to Login. */}
        <Stack.Protected guard={isAuthed && !isStaff}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="plan-select" options={{ headerShown: false }} />
          <Stack.Screen name="ai-search" />
          <Stack.Screen name="analytics" />
          <Stack.Screen name="billing" />
          <Stack.Screen name="store-profile" />
          <Stack.Screen name="social/create" />
          <Stack.Screen name="growth/index" />
          <Stack.Screen name="growth/campaigns" />
          <Stack.Screen
            name="growth/campaign-new"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen name="growth/campaign/[id]" />
          <Stack.Screen name="growth/promotions" />
          <Stack.Screen
            name="growth/promotion-form"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen name="growth/inventory" />
          <Stack.Screen name="growth/videos" />
          <Stack.Screen name="growth/translate" />
          <Stack.Screen name="growth/analytics" />
          <Stack.Screen name="growth/aggregators" />
          <Stack.Screen name="growth/ai-campaign" />
          <Stack.Screen name="growth/gst" />
          <Stack.Screen name="growth/integrations" />
          <Stack.Screen name="growth/integrations/facebook" />
          <Stack.Screen name="growth/integrations/fb-ads" />
          <Stack.Screen name="growth/integrations/gmb" />
          <Stack.Screen name="growth/integrations/google-ads" />
          <Stack.Screen name="growth/integrations/instagram" />
          <Stack.Screen name="growth/integrations/pinterest" />
          <Stack.Screen name="growth/integrations/whatsapp" />
          <Stack.Screen name="growth/integrations/x" />
          <Stack.Screen name="growth/integrations/youtube" />
          <Stack.Screen name="growth/ratings" />
          <Stack.Screen name="growth/templates" />
          <Stack.Screen name="settings/index" />
          <Stack.Screen name="settings/catalog-upload" />
          <Stack.Screen name="settings/deleted-products" />
          <Stack.Screen name="settings/social" />
          <Stack.Screen name="settings/staff" />
          <Stack.Screen name="settings/whatsapp-catalog" />
        </Stack.Protected>

        {/* Staff dashboard (nested stack: index, catalog-tickets, retailer-onboard).
            Guarded by staff role so staff land here and can't be pushed into the
            retailer tab stack. Declared before the shared catalog block so a
            staff cold-start auto-focuses /staff, not a product screen. */}
        <Stack.Protected guard={isStaff}>
          <Stack.Screen name="staff" options={{ headerShown: false }} />
        </Stack.Protected>

        {/* Shared authenticated catalog screens — retailers AND staff both use
            these (staff run delegated on-site catalog uploads from
            staff/catalog-tickets → product/add | product/bulk-onboard). */}
        <Stack.Protected guard={isAuthed}>
          <Stack.Screen name="product/add" options={{ presentation: "modal" }} />
          <Stack.Screen name="product/scan" options={{ presentation: "modal" }} />
          <Stack.Screen name="product/bulk" options={{ presentation: "modal" }} />
          <Stack.Screen name="product/bulk-onboard" />
          <Stack.Screen name="product/catalog-import" />
          <Stack.Screen name="product/[id]" />
          <Stack.Screen name="product/[id]/add-color" />
          <Stack.Screen name="product/[id]/add-photos" />
          <Stack.Screen name="collection/new" />
          <Stack.Screen name="collection/[id]" />
          <Stack.Screen name="category/new" />
          <Stack.Screen name="category/[id]" />
          <Stack.Screen name="category/[id]/add-products" />
          <Stack.Screen name="customer/add" options={{ presentation: "modal" }} />
          <Stack.Screen name="customer/[id]" />
        </Stack.Protected>

        {/* Auth screens — reachable ONLY while logged out. Once a session
            exists the guard flips and these routes are removed from the
            navigation state entirely: hardware back can never return to them. */}
        <Stack.Protected guard={!isAuthed}>
          <Stack.Screen name="auth/phone" options={{ headerShown: false }} />
          <Stack.Screen name="auth/otp" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

function RootLayoutInner() {
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Marcellus_400Regular,
  });

  // Hydrate the persisted per-user palette BEFORE the first render so the
  // app launches already-themed — the admin's last-saved palette shows
  // instantly (a SecureStore read, not a network fetch). Gating render on
  // readiness (like fonts) means there is never a default-theme flash.
  // ThemeProvider also re-syncs in the background and reacts to account
  // switches on shared devices.
  const [paletteReady, setPaletteReady] = useState(false);
  const [initialPalette, setInitialPalette] = useState<PlatformTheme | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    const boot = (async () => {
      const retailerId = await getItem("retailer_id").catch(() => null);
      return loadPersistedPalette(retailerId).catch(() => null);
    })();
    // ponytail: SecureStore.getItemAsync can hang indefinitely on some Android
    // Keystore states (no reject, just never settles) — without this timeout
    // the fontsLoaded/paletteReady render gate below stays blank white forever.
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 3000),
    );
    Promise.race([boot, timeout]).then((cached) => {
      if (!cancelled) {
        setInitialPalette(cached);
        setPaletteReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Rehydrate offline cache on mount ──────────────────────────
  useEffect(() => {
    restoreQueryCache(queryClient).catch(() => {
      // Non-fatal — offline cache unavailable, app works without it
    });
  }, []);

  // ── Persist cache on background + pause/resume queries ────────
  useEffect(() => {
    if (Platform.OS === "web") return;

    const sub = AppState.addEventListener("change", (nextState) => {
      // Pause/resume focus for React Query
      focusManager.setFocused(nextState === "active");

      // Save cache when app goes to background/inactive
      if (
        appStateRef.current === "active" &&
        (nextState === "background" || nextState === "inactive")
      ) {
        // Debounce: clear any pending save timer
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
          void persistQueryCache(queryClient);
        }, 2000);
      }

      appStateRef.current = nextState;
    });

    return () => sub.remove();
  }, []);

  // ponytail: previously gated first paint on fontsLoaded/paletteReady. A
  // stuck SecureStore.getItemAsync call on some Android Keystore states
  // blocks the JS thread itself (not just its own promise), so even the
  // setTimeout-based race above never got a chance to fire and the app
  // never painted. Never block first paint on an unreliable native call —
  // render immediately with defaults, theme/fonts apply once ready.
  //
  // The native splash stays visible until fonts, palette AND the auth
  // session are all resolved (see AppContent) so the themed, guarded UI
  // appears without a flash.

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppContent
            appReady={fontsLoaded && paletteReady}
            initialPalette={initialPalette}
          />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Rendered inside AuthProvider so it can read the session status. Owns the
// splash-hide gate (fonts + palette + auth all ready) and the provider tree
// that AppShell's guarded Stack needs.
function AppContent({
  appReady,
  initialPalette,
}: {
  appReady: boolean
  initialPalette: PlatformTheme | null
}) {
  const { status } = useAuth();

  useEffect(() => {
    if (appReady && status !== "loading") {
      ExpoSplashScreen.hideAsync();
    }
  }, [appReady, status]);

  return (
    <QueryClientProvider client={queryClient}>
      <SyncQueueGate />
      <ErrorBoundary>
        <ThemeProvider initialPalette={initialPalette}>
          <AppShell />
        </ThemeProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

// Wrap with Sentry for automatic crash reporting + performance monitoring.
// Sentry.wrap() adds its own error boundary that reports to Sentry before
// our custom ErrorBoundary handles the UI fallback.
export default Sentry.wrap(RootLayoutInner);
