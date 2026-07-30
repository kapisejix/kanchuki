import { getToken, setToken, clearRequestCache } from './api'
import { getItem, setItem, deleteItem } from './storage'

// F-020: while a team member is uploading a retailer's catalog on-site, the
// app's normal auth_token is temporarily swapped for the delegated session
// token, so the existing retailer product screens (product/add, bulk-onboard,
// ...) work unmodified — the API layer doesn't know or care which kind of
// token it's holding. The team member's own login is restored on exit.

const BACKUP_KEY = 'team_auth_token_backup'
const INFO_KEY = 'catalog_delegate_info'

export type CatalogDelegateInfo = {
  shop_name: string
  ticket_id: string
}

export async function enterCatalogSession(params: {
  token: string
  shop_name: string
  ticket_id: string
}): Promise<void> {
  const currentToken = await getToken()
  if (currentToken) await setItem(BACKUP_KEY, currentToken)
  await setItem(INFO_KEY, JSON.stringify({ shop_name: params.shop_name, ticket_id: params.ticket_id }))
  await setToken(params.token)
  clearRequestCache()
}

export async function exitCatalogSession(): Promise<void> {
  const backup = await getItem(BACKUP_KEY)
  if (backup) await setToken(backup)
  await deleteItem(BACKUP_KEY)
  await deleteItem(INFO_KEY)
  clearRequestCache()
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
