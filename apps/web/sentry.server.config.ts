// Sentry — Node server runtime (RSC, route handlers, server actions).
// No-op until a DSN is set: Sentry.init({ dsn: undefined }) disables the SDK.
// Set SENTRY_DSN in the web Railway env (project: kanchuki-web) to turn on.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  sendDefaultPii: false,
})
