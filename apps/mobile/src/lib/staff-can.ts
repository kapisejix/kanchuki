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

// 'manager' = manager (and any non-salesperson staff role) may; 'owner' =
// only the retailer owner. catalog.view / customers.add are allowed for
// every role and handled in staffCan directly.
const ROLE_FEATURES: Record<
  Exclude<StaffFeature, 'catalog.view' | 'customers.add'>,
  'owner' | 'manager'
> = {
  'catalog.edit': 'manager',
  collections: 'manager',
  growth: 'owner',
  analytics: 'owner',
  social: 'owner',
}

export function staffCan(role: string | null | undefined, feature: StaffFeature): boolean {
  if (!role || role === 'owner') return true
  if (feature === 'catalog.view' || feature === 'customers.add') return true
  if (role === 'salesperson') return false
  // manager (or any non-salesperson staff role) — check the map.
  return ROLE_FEATURES[feature] === 'manager'
}

/** Plain-language capability summary shown under each member's name. */
export const ROLE_SUMMARY: Record<string, string> = {
  manager:
    'Can add & edit products, categories, collections and size charts, and add customers.',
  salesperson: 'Can view the catalog and add customers. Cannot edit products or create collections.',
}