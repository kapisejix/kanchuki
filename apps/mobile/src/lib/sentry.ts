// Sentry crash reporting — auto-captures JS crashes, native crashes, and
// unhandled promise rejections. Initialized once at app startup.
// See docs/TECH-STACK.md — Sentry is the designated error tracker.
import * as Sentry from "@sentry/react-native";
import { Platform } from "react-native";
import Constants from "expo-constants";

// DSN from Sentry wizard — also overridable via env var for flexibility
const DSN =
  process.env["EXPO_PUBLIC_SENTRY_DSN"] ??
  "https://00b667de666711845ef98265a9a9f0c8@o4511960130387968.ingest.de.sentry.io/4511960168988752";

/** Initialize Sentry — call once before any component renders. */
export function initSentry(): void {
  Sentry.init({
    dsn: DSN,
    // Only enable in production builds — never in dev
    enabled: !__DEV__,

    // Attach release + distribution for source-map symbolication
    release: Constants.expoConfig?.version ?? "0.1.0",
    dist: `${Platform.OS}-${Constants.expoConfig?.version ?? "0"}`,

    // Performance monitoring — sample 20% of transactions (keep costs low)
    tracesSampleRate: 0.2,

    // Session Replay — 10% of sessions, 100% on error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [
      Sentry.mobileReplayIntegration(),
      Sentry.feedbackIntegration(),
    ],

    // Native crash handling + session tracking
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30_000,

    // Logs enabled for richer debugging context
    enableLogs: true,

    // Don't send PII — respect retailer privacy (SECURITY.md §12)
    sendDefaultPii: false,

    // Before send hook — strip sensitive data
    beforeSend(event) {
      // Never send auth tokens or API keys
      if (event.request?.headers) {
        delete event.request.headers["Authorization"];
        delete event.request.headers["x-admin-key"];
      }
      // Strip retailer phone numbers from breadcrumbs
      if (event.breadcrumbs) {
        for (const crumb of event.breadcrumbs) {
          if (crumb.data && typeof crumb.data === "object") {
            // Mask any phone-like strings in breadcrumb data
            for (const [key, val] of Object.entries(crumb.data)) {
              if (typeof val === "string" && /^\d{10}$/.test(val)) {
                (crumb.data as Record<string, unknown>)[key] = "***MASKED***";
              }
            }
          }
        }
      }
      return event;
    },

    // Log level in dev for debugging
    debug: __DEV__,
  });
}

/** Set the logged-in retailer's ID as a Sentry user context. */
export function setSentryUser(retailerId: string, shopName?: string): void {
  Sentry.setUser({
    id: retailerId,
    ...(shopName ? { username: shopName } : {}),
  });
}

/** Clear user context on logout. */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/** Add a breadcrumb for navigation events. */
export function addSentryBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: "info",
  });
}

/** Capture a non-fatal exception (e.g. caught API error). */
export function captureException(error: unknown, context?: string): void {
  if (__DEV__) return; // Don't report in dev
  Sentry.withScope((scope) => {
    if (context) scope.setExtra("context", context);
    Sentry.captureException(error);
  });
}

export { Sentry };
