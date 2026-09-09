/**
 * FR-6.1 (docs/tasks/team-member-access-control.md) — the invite signal shown
 * after a staff member is created. Client-side only: deliberately NO SMS send
 * (cost + DLT registration per the FR). The message copy is pinned here so the
 * screen and the test share one source of truth.
 */
export function buildStaffInviteMessage(
  name: string,
  phone: string,
  shopName?: string | null,
): string {
  const shop = shopName?.trim() ? shopName.trim() : 'store'
  return `${name} can now log in to the ${shop} app with their phone number ${phone}.`
}