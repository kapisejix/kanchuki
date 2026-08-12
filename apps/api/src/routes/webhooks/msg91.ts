// MSG91 "Get Events and Actions via Webhook" receiver (2026-08-12).
//
// The MSG91 dashboard requires a POST URL in the Events and Actions section
// before it lets you proceed with the client-side (widget) integration. MSG91
// posts OTP/SMS lifecycle events here as JSON: OTP sent/delivered/failed/
// verified/expired, delivery reports (telNum, status, failureReason), etc.
//
// What this endpoint DOES with the events: records them to the admin-visible
// AuditLog feed (best-effort — ops can see SMS delivery failures without
// polling the MSG91 dashboard). The OTP flow itself never depends on these
// events: login verification happens synchronously via the widget Verify
// Access Token API, so a missed webhook can't break authentication.
//
// MSG91 contract notes (from the platform docs):
//   - Payload is JSON; the endpoint must answer within 8 seconds.
//   - Retries: up to 5 attempts on 5xx/429/timeout — we respond 2xx on
//     receipt so MSG91 never retries a delivered event (idempotent by design:
//     duplicate AuditLog rows are cheap and harmless).
//   - Persistent 4xx responses auto-pause the webhook in the dashboard.
//   - There is NO cryptographic signature — MSG91 authenticates webhook calls
//     via the custom Headers you configure in the dashboard. We require a
//     shared secret on the x-msg91-webhook-secret header, compared
//     timing-safely, and fail closed when it's absent or unconfigured.
//
// Dashboard setup:
//   URL:     https://api.kanchuki.app/v1/public/webhooks/msg91/events
//   Header:  x-msg91-webhook-secret: <value of MSG91_WEBHOOK_SECRET env>
//   Method:  POST
//
// ─── User Existence API (same dashboard section, optional) ────────
// GET https://api.kanchuki.app/v1/public/msg91/user-exists?identifier=<phone>
//
// MSG91 calls this BEFORE sending an OTP and BLOCKS sending when the
// response says user_found: false (used by closed user groups). Kanchuki
// does NOT use this feature: onboarding is self-serve OTP-first — every
// new retailer signs up through the same send-OTP flow (the API creates
// the retailer on first verified login), so a real existence check would
// block new signups AND expose a phone-enumeration oracle. The field is
// optional and should be left blank. This endpoint exists only as a
// harmless fallback in case the dashboard forces a URL (like the webhook
// field does): it always answers user_found: true, so OTP sending behaves
// exactly as if the field were empty.
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

const WEBHOOK_SECRET_ENV = 'MSG91_WEBHOOK_SECRET';

function secretMatches(request: FastifyRequest): boolean {
  const expected = process.env[WEBHOOK_SECRET_ENV];
  const supplied = request.headers['x-msg91-webhook-secret'];
  if (!expected || typeof supplied !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

// MSG91 sends the identifier with the country code (e.g. 919876543210) —
// never store or log a raw number; mask everything but the last 4 digits.
function maskPhone(value: unknown): string | undefined {
  const digits = firstString(value)?.replace(/\D/g, '');
  if (!digits) return undefined;
  return `****${digits.slice(-4)}`;
}

export const msg91WebhookRoutes: FastifyPluginAsync = async (server) => {
  // ── POST /public/webhooks/msg91/events ──────────────────────────
  // MSG91 → server. No JWT (the /v1/public prefix is auth-exempt in
  // plugins/auth.ts) — authentication is the shared-secret header.
  server.post('/public/webhooks/msg91/events', async (request, reply) => {
    if (!process.env[WEBHOOK_SECRET_ENV]) {
      request.log.warn(
        `${WEBHOOK_SECRET_ENV} is not set — MSG91 webhook requests are being rejected.`,
      );
      return reply.status(503).send({
        error: { code: 'SERVICE_UNAVAILABLE', status: 503 },
      });
    }
    if (!secretMatches(request)) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', status: 401 },
      });
    }

    const body = asRecord(request.body);
    if (!body) {
      // 422 matches MSG91's documented webhook response codes
      // ("422 Invalid Request Body").
      return reply.status(422).send({
        error: { code: 'INVALID_PAYLOAD', status: 422 },
      });
    }

    // Defensive field extraction — MSG91 event shapes vary by channel
    // (SMS/WhatsApp/Email) and event type. Never fail on an unknown shape.
    const requestId = firstString(body.requestId, body.request_id, body.campaignId);
    const eventName =
      firstString(body.eventName, body.event, body.upperCaseEventName, body.type) ??
      'event';
    const status = firstString(body.status, body.deliveryStatus);
    const failureReason = firstString(body.failureReason, body.reason);
    const phone = maskPhone(body.telNum ?? body.mobile ?? body.identifier);
    const deliveredAt = firstString(body.deliveryTime, body.updatedAt);

    // Best-effort, fire-and-forget: a logging failure must never fail the
    // webhook (that would make MSG91 retry a received event). Duplicate rows
    // from MSG91 retries are harmless — the dashboard stops retrying once we
    // 2xx, so this is effectively once per event.
    prisma.auditLog
      .create({
        data: {
          actor_type: 'msg91',
          action: eventName,
          resource_type: 'sms_event',
          resource_id: requestId ?? 'unknown',
          metadata: {
            phone,
            status,
            failure_reason: failureReason,
            delivered_at: deliveredAt,
          },
          ip_address: request.ip,
        },
      })
      .catch((err) =>
        request.log.error({ err, requestId }, 'Failed to record MSG91 webhook event'),
      );

    return reply.send({ received: true });
  });

  // ── GET /public/msg91/user-exists ──────────────────────────────
  // MSG91 widget → server (optional config). No JWT (/v1/public is
  // auth-exempt); the request is a plain GET with the identifier appended
  // as a query parameter. Response strictly follows MSG91's contract:
  //   { "user_found": true, "identifier": "<echoed>" }
  // Always true by design — see the header comment for why a real check
  // would break self-serve signup. Echo the identifier back verbatim
  // (bounded length); nothing is stored or logged.
  server.get('/public/msg91/user-exists', async (request, reply) => {
    const query = asRecord(request.query);
    const identifier = firstString(query?.identifier);
    if (!identifier) {
      return reply.status(400).send({
        error: { code: 'INVALID_PARAM', status: 400, message: 'identifier is required' },
      });
    }
    return {
      user_found: true,
      identifier: identifier.trim().slice(0, 200),
    };
  });
};
