// Next.js instrumentation hook — runs once per server/edge runtime at boot.
// Enabled via `experimental.instrumentationHook` in next.config.mjs (Next 14.2).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
