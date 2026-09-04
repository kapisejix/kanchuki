// Sentry error monitoring for the API. MUST be imported before any other
// module in index.ts so the SDK can patch http/fastify/pg before they load.
//
// No-op until SENTRY_DSN is set in the environment: Sentry.init() with an
// undefined dsn disables the SDK entirely, so captureException() calls
// elsewhere become harmless no-ops. Set SENTRY_DSN in the API Railway env
// (project: kanchuki-api on the same Sentry org as mobile) to turn it on.
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  // 10% perf traces in prod is plenty for a Fastify API at pilot scale.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Never ship raw request bodies / cookies / auth to Sentry.
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request?.headers) {
      for (const h of ['authorization', 'cookie', 'x-admin-key', 'x-team-token']) {
        delete event.request.headers[h];
      }
    }
    return event;
  },
});

export { Sentry };
