// Lightweight healthcheck for the Railway web service. The previous healthcheck
// target was `/` (the marketing homepage), which runs a server-side fetch to
// the API for the theme color on every request — a slow/down API hung past the
// 30s healthcheck timeout and Railway reported "Network Healthcheck failure".
// This route returns immediately with no dependencies, so the web service's
// health reflects the web service itself, not the API's availability.
// Wire it up: apps/web/railway.json `deploy.healthcheckPath` → "/api/health".
export function GET() {
  return Response.json({ status: 'ok', ts: Date.now() })
}
