// ─── Admin panel access — which surfaces only a SUPER_ADMIN may reach ──
//
// WHY THIS FILE EXISTS (RC-034)
//
// This rule used to live in three hand-maintained places that had silently
// drifted apart:
//
//   apps/api/src/routes/admin-auth.ts           8 segments   ← the ONLY boundary
//   apps/web/src/app/admin/layout.tsx          14 segments   (page access)
//   apps/web/src/app/admin/components/Sidebar  14 entries    (nav visibility)
//
// The API's list was the only one that actually *enforced* anything, and it
// failed OPEN: the check was `path.startsWith(...)` against a fixed set, so any
// new admin route was reachable by a plain ADMIN key until somebody remembered
// to add it. Nothing failed, nothing logged — the surface was simply open.
//
// The measured result before this file: EIGHT surfaces the web UI hides were
// reachable by a plain ADMIN key — `commission`, `addon-purchases`, `ai-usage`,
// `audit-log`, `plan-features`, `plan-limits`, `resource-packs`,
// `storage-report` — plus `referral-settings` (which was in the Sidebar only, so
// it was hidden from the nav yet both directly navigable AND callable), plus
// `plan-pricing`, `invoices` and `deletion-vault`, which were in NO list at all.
// `payments` was in the API list and matches no route, so it protected nothing.
// `deletion-vault` is a hard-delete of retailer/customer data; `plan-pricing` is
// what every retailer is charged.
//
// THE SHAPE OF THE FIX
//
// One list, consumed by all three surfaces, so a surface is protected everywhere
// by construction instead of in whichever places somebody edited. And because the
// API list fails open by design, "which segments exist" is DERIVED from the route
// sources by `apps/api/src/routes/admin-access.test.ts`, which fails until every
// registered `/v1/admin/<segment>` is classified below as one thing or the other.
// Adding an admin route now forces a decision instead of defaulting to "open".
//
// EVERYTHING IS CLASSIFIED, INCLUDING THE PERMITTED
//
// `STANDARD_ADMIN_ADMIN_SEGMENTS` is not decoration. Without it the guard can
// only ask "is this sensitive?" — an open-ended question whose lazy answer is
// "no". With both lists present the question is "which of these two is it?", and
// the failure message names the segment nobody decided about.

/**
 * Admin surfaces only a Super Admin may reach — money, credentials, tax records,
 * platform config, and anything destructive.
 *
 * Consumers must match on the whole first path segment after `/admin/`, never a
 * bare `startsWith` (see {@link adminPathSegment}) — `startsWith` matches
 * `/admin/commission-x` for `commission`, and the reverse mistake (matching only
 * the exact path) leaves deeper routes open.
 */
export const SUPER_ADMIN_ONLY_ADMIN_SEGMENTS = [
  // ── Money: what retailers are charged, and what the platform earns ──
  'addon-purchases',
  'billing',
  'commission',
  'plan-features',
  'plan-limits',
  'plan-pricing',
  'resource-packs',
  'referral-settings',
  // ── Tax and legal documents ──
  'gst',
  'gst-profile',
  'invoices',
  // ── Credentials and provider configuration ──
  'ai-providers',
  'integrations',
  'settings',
  // ── Infrastructure and destructive operations ──
  'backup',
  'backups',
  'database',
  'deletion-vault',
  'deployment-gate',
  'deployments',
  'operations',
  'query',
  'schema',
  'storage-report',
  // ── Platform-wide audit + cost telemetry ──
  'ai-usage',
  'audit-log',
  'audit-logs',
] as const;

/**
 * Admin surfaces a standard (non-Super) ADMIN may reach — day-to-day operations
 * that carry no pricing, credential or destructive power.
 *
 * Listed explicitly, one per decision, because the guard's job is to make this
 * list impossible to extend by accident. A comment on a surprising entry is the
 * cheapest possible place to record why it is here.
 */
export const STANDARD_ADMIN_ADMIN_SEGMENTS = [
  'activity', // audit-logging of day-to-day admin actions
  'aggregators', // retailer aggregator sync config — ops, not pricing
  'alerts', // admin alert feed (admin-settings/notifications.ts, GET /alerts)
  'background-images', // studio backdrop library (content)
  'bug-reports', // triage inbox
  'catalog-upload-tiers', // staff upload service tiers — see note below
  'contact-submissions', // contact-form inbox
  'csrf-token', // token mint for the admin UI itself, needed before any role is known
  'customers', // customer records (retailer-scoped support work)
  'default-attributes', // taxonomy defaults
  'default-categories', // taxonomy defaults
  'design-references', // unstitched design gallery (content)
  'discovery', // retailer discovery listing (content + ops)
  'festivals', // festival calendar used by campaigns
  'login', // must stay reachable — the guard skips it explicitly
  'notify', // POST /notify/test — sends a test notification (diagnostic)
  'photo-cleanup', // photo tools incl. the admin-only generation bench
  'photo-cleanup-test', // the generation bench page (same surface as photo-cleanup)
  'post-templates', // social post templates (content)
  'ratings', // ratings & reviews moderation — web page segment
  'reporting', // support reporting rollups (admin-settings/ticket-reporting.ts)
  // NOTE `reports`: /admin/reports/gst is TAX data, but its only fetches are
  // /v1/admin/gst/*, and `gst` IS super-admin-only above. A standard admin who
  // opens that page gets an empty report rather than the figures. If you ever
  // move GST data behind a standard-admin route, move `reports` up with it.
  'reports', // admin reporting overview
  'retailers', // retailer records — the core of support work
  'reviews', // product ratings moderation — API side of `ratings`
  'session', // session introspection for the admin UI shell
  'showcase-design-categories', // suits-designs taxonomy — API side
  'showcase-designs', // suits-designs content — API side
  'social', // connected FB/IG accounts
  'social-templates', // social template content
  'stats', // DASHBOARD REQUIRED — /admin renders it unconditionally
  'studio-styles', // AI Studio scenes/styles (content)
  // FLAGGED `team-members`: staff/sales-team account management (invite + edit
  // members, via /v1/team/* rather than /v1/admin/*). It was reachable by a
  // standard ADMIN before this list existed and still is, so this change is not
  // a regression — but it is credential-adjacent. Move it to the super-admin
  // list above if you want it locked down.
  'team-members', // staff account management — web page segment
  'suits-design-categories', // suits-designs taxonomy — web page segment
  'suits-designs', // suits-designs content — web page segment
  'support-tickets', // support ticket inbox — web page segment
  'survey', // survey submissions inbox — web page segment
  'survey-submissions', // survey inbox — API side of `survey`
  'usage', // DASHBOARD REQUIRED — /admin renders it unconditionally
  'whatsapp-catalog', // catalog-sync monitor
] as const;

/** `/v1/admin/<segment>` routes exempt from auth entirely — must stay excluded by construction. */
export const ADMIN_AUTH_EXEMPT_SEGMENTS = ['login'] as const;

export type SuperAdminOnlyAdminSegment = (typeof SUPER_ADMIN_ONLY_ADMIN_SEGMENTS)[number];

/**
 * First path segment after `/admin/`, or null when the path is not an admin path.
 *
 * Accepts both path spaces this rule is applied to — the API's `/v1/admin/...`
 * (where the URL may also carry a query string) and the web's `/admin/...` — and
 * normalises case, because the check must not be defeatable by requesting
 * `/v1/admin/COMMISSION` and must not accidentally over-match a sibling segment.
 *
 * Returns null for a bare `/admin`/`/admin/`, which is not a route in either app.
 */
export function adminPathSegment(pathWithQuery: string | null | undefined): string | null {
  if (!pathWithQuery) return null;
  // Strip query and hash FIRST: `request.url` on the API includes `?foo=bar`, and
  // a naive split on '/' would make '/v1/admin/commission?x=1' still work but
  // '/v1/admin/commission?a/b' produce a bogus segment.
  const withoutQuery = pathWithQuery.split('#')[0]?.split('?')[0] ?? '';
  const lower = withoutQuery.toLowerCase();
  // The API mounts the admin tree at /v1/admin; the web app serves /admin.
  const adminPath = lower.startsWith('/v1/admin/') ? lower.slice(3) : lower;
  if (!adminPath.startsWith('/admin/')) return null;
  const segment = adminPath.slice('/admin/'.length).split('/')[0];
  return segment ? segment : null;
}

/** True when `pathWithQuery` names a Super-Admin-only admin surface. */
export function isSuperAdminOnlyAdminPath(pathWithQuery: string | null | undefined): boolean {
  const segment = adminPathSegment(pathWithQuery);
  if (!segment) return false;
  return (SUPER_ADMIN_ONLY_ADMIN_SEGMENTS as readonly string[]).includes(segment);
}
