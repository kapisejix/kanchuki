// Sentry — browser runtime. Loaded automatically by @sentry/nextjs.
// No-op until NEXT_PUBLIC_SENTRY_DSN is set (client can only read NEXT_PUBLIC_*).
// NEXT_PUBLIC_* is inlined at `next build` — a rebuild is required after the
// env var changes on the Railway service (a redeploy of the old image won't do).
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Session Replay: off by default, capture only around errors.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  sendDefaultPii: false,
})
