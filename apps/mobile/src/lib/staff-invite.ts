import { normalizeIndianPhone } from '@kanchuki/shared'

/**
 * Tokenized staff invite (docs/tasks/staff-invite-tokens.md §6.4) — the share
 * message after a staff member is added. The payload is now the invite LINK
 * (the phone is no longer the payload — the token never authenticates, and
 * delivery stays retailer-shares-the-link, no server SMS). The copy is pinned
 * here so the screen and the test share one source of truth.
 */
export function buildStaffInviteMessage(
  name: string,
  role: string,
  shopName?: string | null,
  url?: string | null,
): string {
  const shop = shopName?.trim() ? shopName.trim() : 'store'
  const link = url?.trim() ? url.trim() : ''
  const roleLabel = role === 'manager' ? 'manager' : 'team member'
  return `${name}, you've been added to ${shop} as ${roleLabel}. Tap to join: ${link}`
}

/**
 * WhatsApp deep link that opens the retailer's OWN WhatsApp app with the
 * invite message pre-filled to the member's number — the free, client-side
 * delivery route (staff-invite-tokens.md §3.1 / D4). No MSG91 (cost + DLT
 * registration), no Meta Cloud API (₹0.38/conversation + template approval),
 * no server round-trip: wa.me hands the message to the local WhatsApp app
 * (or WhatsApp Web when the app isn't installed) and the retailer taps send.
 * Same pattern as collection/[id].tsx openChat.
 */
export function buildWhatsAppInviteUrl(phone: string, message: string): string {
  const digits = `91${normalizeIndianPhone(phone)}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}