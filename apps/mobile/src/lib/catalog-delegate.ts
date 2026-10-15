import { getToken, setToken, clearRequestCache } from './api'
import { getItem, setItem, deleteItem } from './storage'

// F-020: while a team member is uploading a retailer's catalog on-site, the
// app's normal auth_token is temporarily swapped for the delegated session
// token, so the existing retailer product screens (product/add, bulk-onboard,
// ...) work unmodified — the API layer doesn't know or care which kind of
// token it's holding. The team member's own login is restored on exit.
//
// Support sessions (docs/tasks/pending/support-session-access.md) reuse the
// exact same swap; `support` on the stored info is what tells the banner and
// the route guard it is one.

const BACKUP_KEY = 'team_auth_token_backup'
const INFO_KEY = 'catalog_delegate_info'

export type SupportScope = 'DEMO' | 'GROWTH' | 'MAINTENANCE'

export type SupportInfo = {
  grant_id: string
  scope: SupportScope
  expires_at: string
}

export type CatalogDelegateInfo = {
  shop_name: string
  ticket_id: string
  support?: SupportInfo
}

// The root layout opens the retailer route group while a support session is
// active, so it must learn about enter/exit immediately, not on next navigation.
const listeners = new Set<() => void>()
export function onDelegateChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
function notify(): void {
  for (const fn of listeners) fn()
}

async function enter(token: string, info: CatalogDelegateInfo): Promise<void> {
  // Never overwrite an existing backup — it is the team member's real login.
  const existing = await getItem(BACKUP_KEY)
  if (!existing) {
    const currentToken = await getToken()
    if (currentToken) await setItem(BACKUP_KEY, currentToken)
  }
  await setItem(INFO_KEY, JSON.stringify(info))
  await setToken(token)
  clearRequestCache()
  notify()
}

export async function enterCatalogSession(params: {
  token: string
  shop_name: string
  ticket_id: string
}): Promise<void> {
  await enter(params.token, { shop_name: params.shop_name, ticket_id: params.ticket_id })
}

export async function enterSupportSession(params: {
  token: string
  shop_name: string
  ticket_id: string
  support: SupportInfo
}): Promise<void> {
  await enter(params.token, {
    shop_name: params.shop_name,
    ticket_id: params.ticket_id,
    support: params.support,
  })
}

export async function exitCatalogSession(): Promise<void> {
  const backup = await getItem(BACKUP_KEY)
  if (backup) await setToken(backup)
  await deleteItem(BACKUP_KEY)
  await deleteItem(INFO_KEY)
  clearRequestCache()
  notify()
}

export async function getCatalogDelegateInfo(): Promise<CatalogDelegateInfo | null> {
  const raw = await getItem(INFO_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CatalogDelegateInfo
  } catch {
    return null
  }
}
