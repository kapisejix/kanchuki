// Sentry crash reporting & telemetry — auto-captures JS crashes, native crashes,
// screen transitions, user interactions (touches/taps), and unhandled promise rejections.
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// DSN from Sentry wizard / config
const DSN =
  process.env['EXPO_PUBLIC_SENTRY_DSN'] ??
  'https://1cf3b3ac98fe5853c643c2a7cb22ab96@o4511960130387968.ingest.de.sentry.io/4511960286494800';

/** Initialize Sentry — call once before any component renders. */
export function initSentry(): void {
  Sentry.init({
    dsn: DSN,
    // Enable Sentry telemetry
    enabled: true,

    // Attach release + distribution for source-map symbolication
    release: Constants.expoConfig?.version ?? '0.1.0',
    dist: `${Platform.OS}-${Constants.expoConfig?.version ?? '0'}`,

    // Performance monitoring — sample 100% in preview/dev, 20% in production
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,

    // Session Replay — 10% of sessions, 100% on error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Tracing & User Interaction Integrations
    integrations: [
      Sentry.reactNativeTracingIntegration(),
      Sentry.mobileReplayIntegration(),
      Sentry.feedbackIntegration(),
    ],

    // User interaction & UI tracing
    enableUserInteractionTracing: true,
    enableAutoPerformanceTracing: true,
    enableNativeFramesTracking: true,
    enableStallTracking: true,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30_000,

    // Attach UI context on errors
    attachScreenshot: true,
    attachViewHierarchy: true,

    // Logs enabled for richer debugging context
    enableLogs: true,

    // Don't send raw PII — respect privacy
    sendDefaultPii: false,

    // Before send hook — strip sensitive tokens and secrets
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['Authorization'];
        delete event.request.headers['x-admin-key'];
      }
      if (event.breadcrumbs) {
        for (const crumb of event.breadcrumbs) {
          if (crumb.data && typeof crumb.data === 'object') {
            for (const [key, val] of Object.entries(crumb.data)) {
              if (typeof val === 'string' && /^\d{10}$/.test(val)) {
                (crumb.data as Record<string, unknown>)[key] = '***MASKED***';
              }
            }
          }
        }
      }
      return event;
    },

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

/** Add a breadcrumb for navigation, actions, or state transitions. */
export function addSentryBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: 'info',
  });
}

/** Track a custom business event or user action. */
export function trackSentryEvent(name: string, properties?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({
    category: 'custom_event',
    message: name,
    data: properties,
    level: 'info',
  });
}

/** Capture a handled error with rich diagnostic context. */
export function captureSentryError(error: unknown, context?: Record<string, unknown>): void {
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export function captureException(error: unknown, context?: unknown): string {
  if (typeof context === 'string') {
    return Sentry.captureException(error, { extra: { componentStack: context } });
  }
  return Sentry.captureException(error, context as any);
}

export { Sentry };
