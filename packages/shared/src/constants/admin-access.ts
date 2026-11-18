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
 * Admin surfaces only a Super Admin may reach — Finance (money, tax records), Settings
 * (credentials, provider config) and the Query Console (owner decision 2026-11-03; the rest of
 * the former Super-only set is in {@link ADMIN_TIER_ADMIN_SEGMENTS}). Original rationale: money, tax records,
 * platform config, and anything destructive.
 *
 * Consumers must match on the whole first path segment after `/admin/`, never a
 * bare `startsWith` (see {@link adminPathSegment}) — `startsWith` matches
 * `/admin/commission-x` for `commission`, and the reverse mistake (matching only
 * the exact path) leaves deeper routes open.
 *
 * SCOPE — what this list does NOT cover: it governs `/v1/admin/*` and the `/admin/*` web pages.
 * The Reports and Team Members pages fetch from `/v1/team/*`, which this list does not cover:
 * `teamAuthPreHandler` gives a SUPER_ADMIN session unscoped access, and an ADMIN session
 * unscoped READS only (`readsAll`; every write stays Super Admin — RC-161).
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
  'referral', // T9 referral monitoring — leaderboard, payout trigger, irreversible clawback, payout-account entry (money)
  'referral-settings',
  'video-models', // F-034 T6: which Fal video model each plan uses + enable (per-clip spend)
  // ── Tax and legal documents ──
  'gst-profile',
  'hsn-rules', // §6.11 keyword → HSN map used on WhatsApp catalog items (tax data)
  'invoices',
  // ── Credentials and provider configuration ──
  'ai-providers',
  'integrations',
  'settings',
  // ── Raw database access ──
  'query',
  'schema',
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
  'ai-content-reports', // shopper "Report this AI content" queue (Play AI-content policy); phones masked
  'alerts', // admin alert feed (admin-settings/notifications.ts, GET /alerts)
  'background-images', // studio backdrop library (content)
  'bug-reports', // triage inbox
  'catalog-upload-tiers', // staff upload service tiers — see note below
  'color-families', // F-045 colour alias table (content/taxonomy; no pricing, credentials or delete)
  'my-style', // F-045 palettes + trends (content/taxonomy). Its usage/cost report is Super-Admin-gated in the handler
  'contact-submissions', // contact-form inbox
  'csrf-token', // token mint for the admin UI itself, needed before any role is known
  'customers', // customer records (retailer-scoped support work)
  'default-attributes', // taxonomy defaults
  'default-categories', // taxonomy defaults
  'design-references', // unstitched design gallery (content)
  'discovery', // retailer discovery listing (content + ops)
  'engagement', // F-037 Phase 3 behavior analytics — support/investigation data, same tier as 'customers'
  'festivals', // festival calendar used by campaigns
  'gbp', // Google Business Profile link tool (marketing). connect/callback/approval are Super-Admin-gated in the handler
  'login', // must stay reachable — the guard skips it explicitly
  'notify', // POST /notify/test — sends a test notification (diagnostic)
  'photo-cleanup', // photo tools incl. the admin-only generation bench
  'photo-cleanup-test', // the generation bench page (same surface as photo-cleanup)
  'post-templates', // social post templates (content)
  'ratings', // ratings & reviews moderation — web page segment
  'reporting', // support reporting rollups (admin-settings/ticket-reporting.ts)
  'retailers', // retailer records — the core of support work
  'reviews', // product ratings moderation — API side of `ratings`
  'session', // session introspection for the admin UI shell
  'showcase-design-categories', // suits-designs taxonomy — API side
  'showcase-designs', // suits-designs content — API side
  'social', // connected FB/IG accounts
  'stats', // DASHBOARD REQUIRED — /admin renders it unconditionally
  'studio-styles', // AI Studio scenes/styles (content)
  'suits-design-categories', // suits-designs taxonomy — web page segment
  'suits-designs', // suits-designs content — web page segment
  'support-tickets', // support ticket inbox — web page segment
  'survey', // survey submissions inbox — web page segment
  'survey-submissions', // survey inbox — API side of `survey`
  'usage', // DASHBOARD REQUIRED — /admin renders it unconditionally
  'whatsapp-catalog', // catalog-sync monitor
] as const;

/**
 * Surfaces reachable by SUPER_ADMIN and ADMIN only — not by MARKETING_MANAGER or SUPPORT_MANAGER
 * (who otherwise share the standard tier). Owner decision 2026-11-03: Admin may open every menu
 * except Finance, Settings and the Query Console, which stay in
 * {@link SUPER_ADMIN_ONLY_ADMIN_SEGMENTS}. These were Super-Admin-only before (RC-034 / H3-2).
 *
 * Several are destructive or infrastructure (backup/restore, deletion vault, deployments): that
 * is the owner's explicit choice, recorded here so a later edit knows it was decided.
 */
export const ADMIN_TIER_ADMIN_SEGMENTS = [
  'ai-usage', // Reports -> AI Usage
  'audit-log', // Operations -> Audit Log
  'audit-logs',
  'backup', // Operations -> Backup & Restore (destructive: restore)
  'backups',
  'database', // Operations -> DB Health / Backup / Deletion Vault. Its /query page is gated by path below
  'deletion-vault', // Operations -> Deletion Vault (hard-deletes retailer/customer data)
  'ai-custom-designs', // read-only view of retailer AI design prompts + usage (T5)
  'design-templates', // social design templates: create/edit by Super Admin + Admin only (owner D6, 2026-11-04)
  'deployment-gate', // Operations -> Deployment Gate
  'deployments', // Operations -> Deployments
  'gst', // Reports -> GST Reports (the /v1/admin/gst/* data)
  'operations', // Operations -> overview
  'reports', // Reports -> Overview (data is /v1/team/reporting, read-only for Admin)
  'server-memory', // Operations -> Server Memory
  'storage-report', // Reports -> Storage Report
  'support-sessions', // Operations -> Support Sessions
  'team-members', // Team & Support -> Team Members (read-only for Admin; creating/editing stays Super Admin)
  'try-on-usage', // Reports -> Try-On GPU Usage
] as const;

/**
 * Standard-admin surfaces a SUPPORT_MANAGER may also reach (H3-2). Every entry must be
 * in {@link STANDARD_ADMIN_ADMIN_SEGMENTS}; anything else is denied by default, so a
 * support manager can work tickets and retailer/customer records but not content,
 * taxonomy or ops tooling. Money routes under `retailers` are gated in the handlers.
 */
export const SUPPORT_MANAGER_ADMIN_SEGMENTS = [
  'alerts',
  'bug-reports',
  'contact-submissions',
  'csrf-token',
  'customers',
  'reporting',
  'retailers',
  'session',
  'stats', // dashboard renders it unconditionally
  'support-tickets',
  'survey',
  'survey-submissions',
  'usage', // dashboard renders it unconditionally
] as const;

/** Team roles that may use the admin panel at all. Anything else (incl. new roles) is denied. */
export const ADMIN_PANEL_ROLES = [
  'SUPER_ADMIN',
  'ADMIN', // plain admin session JWT from signAdminSession(email, 'ADMIN')
  'MARKETING_MANAGER',
  'SUPPORT_MANAGER',
] as const;

/**
 * Admin-tier surfaces where an ADMIN session may only READ (owner decision 2026-11-03): backup
 * list/metadata and the deletion-vault listing are visible, but creating or restoring a backup
 * is Super Admin only. Enforced by HTTP method in the admin gate, so a new write route under
 * these segments is refused for Admin by default. Every entry must be in
 * {@link ADMIN_TIER_ADMIN_SEGMENTS}.
 */
export const ADMIN_READ_ONLY_ADMIN_SEGMENTS = ['backup', 'backups', 'deletion-vault'] as const;

/** `/v1/admin/<segment>` routes exempt from auth entirely — must stay excluded by construction. */
export const ADMIN_AUTH_EXEMPT_SEGMENTS = ['login'] as const;

export type SuperAdminOnlyAdminSegment = (typeof SUPER_ADMIN_ONLY_ADMIN_SEGMENTS)[number];

/** Returned by {@link adminPathSegment} for a malformed escape; never a real segment. */
export const INVALID_ADMIN_SEGMENT = '\u0000invalid';

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
  return adminPathParts(pathWithQuery)?.[0] ?? null;
}

/** Path segments after `/admin/` (decoded, lower-cased), or null; one-element INVALID on a bad escape. */
function adminPathParts(pathWithQuery: string | null | undefined): string[] | null {
  if (!pathWithQuery) return null;
  // Strip query and hash FIRST: `request.url` on the API includes `?foo=bar`, and
  // a naive split on '/' would make '/v1/admin/commission?x=1' still work but
  // '/v1/admin/commission?a/b' produce a bogus segment.
  const withoutQuery = pathWithQuery.split('#')[0]?.split('?')[0] ?? '';
  // H3-1: the router percent-decodes before matching, so `/admin/%70lan-pricing` runs the
  // plan-pricing handler. Decode here too. A malformed escape fails closed (see below).
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return [INVALID_ADMIN_SEGMENT];
  }
  const lower = decoded.toLowerCase();
  // The API mounts the admin tree at /v1/admin; the web app serves /admin.
  const adminPath = lower.startsWith('/v1/admin/') ? lower.slice(3) : lower;
  if (!adminPath.startsWith('/admin/')) return null;
  const parts = adminPath.slice('/admin/'.length).split('/');
  return parts[0] ? parts : null;
}

/**
 * True when `pathWithQuery` names a Super-Admin-only admin surface: Finance, Settings, the Query
 * Console. The web Query Console lives under the shared `database` segment (which Admin may open
 * for DB Health / Backup / Deletion Vault), so `/admin/database/query` is matched by path.
 */
export function isSuperAdminOnlyAdminPath(pathWithQuery: string | null | undefined): boolean {
  const parts = adminPathParts(pathWithQuery);
  const segment = parts?.[0];
  if (!segment) return false;
  if (segment === INVALID_ADMIN_SEGMENT) return true; // fail closed
  if (segment === 'database' && parts?.[1] === 'query') return true;
  return (SUPER_ADMIN_ONLY_ADMIN_SEGMENTS as readonly string[]).includes(segment);
}

/** True when the path is an Admin+Super surface that MARKETING_MANAGER / SUPPORT_MANAGER must not reach. */
export function isAdminTierAdminPath(pathWithQuery: string | null | undefined): boolean {
  const segment = adminPathSegment(pathWithQuery);
  if (!segment) return false;
  return (ADMIN_TIER_ADMIN_SEGMENTS as readonly string[]).includes(segment);
}

/** Role-aware reach for the web layout and sidebar (the API gate applies the same two checks). */
export function adminRoleCanReach(role: string, pathWithQuery: string | null | undefined): boolean {
  if (role === 'SUPER_ADMIN') return true;
  if (isSuperAdminOnlyAdminPath(pathWithQuery)) return false;
  if (isAdminTierAdminPath(pathWithQuery)) return role === 'ADMIN';
  return true;
}

/** True when a SUPPORT_MANAGER may reach this admin path (allow-list; unknown/invalid = no). */
export function isSupportManagerAdminPath(pathWithQuery: string | null | undefined): boolean {
  const segment = adminPathSegment(pathWithQuery);
  if (!segment) return false;
  return (SUPPORT_MANAGER_ADMIN_SEGMENTS as readonly string[]).includes(segment);
}

/** True when ADMIN may only read this path (see {@link ADMIN_READ_ONLY_ADMIN_SEGMENTS}). */
export function isAdminReadOnlyAdminPath(pathWithQuery: string | null | undefined): boolean {
  const segment = adminPathSegment(pathWithQuery);
  if (!segment) return false;
  return (ADMIN_READ_ONLY_ADMIN_SEGMENTS as readonly string[]).includes(segment);
}
