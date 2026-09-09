/**
 * staffCan(role, feature) — client mirror of the server allowlist
 * (apps/api/src/plugins/auth.ts staffCanAccess). ONE source of truth for the
 * feature→role map, imported by every screen that needs role gating so the
 * client can't drift from what the API actually enforces.
 *
 * role === null means the real owner (or a catalog-delegate token) — owner
 * can do everything; every staff role starts deny-by-default and opts in.
 */
export type StaffFeature =
  | 'catalog.view'
  | 'catalog.edit'
  | 'categories.edit'
  | 'collections'
  | 'size-charts'
  | 'customers.add'
  | 'qr-slug'
  | 'growth'
  | 'analytics'
  | 'social'
  | 'ai-studio'
  | 'settings.account'

// Server: MANAGER_ALLOWED_ROUTES + SALESPERSON_ALLOWED_ROUTES.
// Salesperson: GET products/categories, POST customers, GET retailers/me.
// Manager: + write products/categories/collections/size-charts, qr-slug.
// Everything not listed (growth, analytics, social, billing, KYC, staff
// mgmt, account delete, WhatsApp API) is owner-only on the server — mirror
// that here so staff never tap into a guaranteed 403.
const ROLE_FEATURES: Record<Exclude<StaffFeature, 'catalog.view' | 'customers.add'>, 'owner' | 'manager'> = {
  'catalog.edit': 'manager',
  'categories.edit': 'manager',
  collections: 'manager',
  'size-charts': 'manager',
  'qr-slug': 'manager',
  growth: 'owner',
  analytics: 'owner',
  social: 'owner',
  'ai-studio': 'owner',
  'settings.account': 'owner',
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