/**
 * staffCan(role, feature) — client mirror of the server allowlist
 * (apps/api/src/plugins/auth.ts staffCanAccess). ONE source of truth for the
 * feature→role map, imported by every screen that needs role gating so the
 * client can't drift from what the API actually enforces.
 *
 * role === null means the real owner (or a catalog-delegate token) — owner
 * can do everything; every staff role starts deny-by-default and opts in.
 */
// Only the features a screen actually gates today. The server allowlist
// (staffCanAccess) is the real enforcement — everything not listed here is
// owner-only there too, so a staff session that reaches an ungated screen
// still gets a 403 on write. Add a feature when a screen starts gating it;
// don't front-run with entries nothing calls.
export type StaffFeature =
  | 'catalog.view'
  | 'catalog.edit'
  | 'collections'
  | 'customers.add'
  | 'growth'
  | 'analytics'
  | 'social'
  | 'social.schedule' // view calendar/status, caption edit, skip/retry, pause/resume
  | 'social.schedule.plan' // create/confirm/end a plan, slide edits (owner only)
  | 'enquiries' // F-044 inbox: read, take, set status — every role (D2)
  | 'enquiries.assign' // reassign an enquiry (owner + manager)

// 'manager' = manager (and any non-salesperson staff role) may; 'owner' =
// only the retailer owner. catalog.view / customers.add / enquiries are
// allowed for every role and handled in staffCan directly.
const ROLE_FEATURES: Record<
  Exclude<StaffFeature, 'catalog.view' | 'customers.add' | 'enquiries'>,
  'owner' | 'manager'
> = {
  'catalog.edit': 'manager',
  collections: 'manager',
  // Mirrors MANAGER_ALLOWED_ROUTES (apps/api/src/plugins/auth.ts): campaigns,
  // promotions, analytics, social post + track. Connect/disconnect, billing,
  // settings and staff management stay owner-only on the server.
  growth: 'manager',
  analytics: 'manager',
  social: 'manager',
  'social.schedule': 'manager',
  'social.schedule.plan': 'owner',
  'enquiries.assign': 'manager',
}

export function staffCan(role: string | null | undefined, feature: StaffFeature): boolean {
  if (!role || role === 'owner') return true
  if (feature === 'catalog.view' || feature === 'customers.add' || feature === 'enquiries') {
    return true
  }
  if (role === 'salesperson') return false
  // manager (or any non-salesperson staff role) — check the map.
  return ROLE_FEATURES[feature] === 'manager'
}

/** Plain-language capability summary shown under each member's name. */
export const ROLE_SUMMARY: Record<string, string> = {
  manager:
    'Can manage products, collections, campaigns and social posts, and view analytics. Customer phone numbers are hidden. No settings or billing.',
  salesperson:
    'Can view the catalog, add customers and handle customer enquiries. Customer phone numbers are hidden. Cannot edit products, create collections or run campaigns.',
}