// Staff invite tokens (docs/tasks/done/staff-invite-tokens.md) — single-use,
// onboarding-only tokens that carry "this is a team join, not a new signup"
// from the invite link into the first OTP verify. The token NEVER
// authenticates (D1); login stays phone + OTP. The raw token is never stored
// or logged — only its sha256 hash, so a DB leak can't be replayed and a
// leaked share-link can't be brute-forced from the hash column.
import { createHash, randomBytes } from 'node:crypto';
import { appLink } from '@kanchuki/shared';

// 7-day invite lifetime (spec §3.1). Expired invites lazily read as
// 'expired' and can be refreshed via Resend.
export const STAFF_INVITE_TTL_DAYS = 7;

/** sha256 hex digest of a raw token — the only form ever persisted. */
export function hashStaffInviteToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate a fresh raw invite token + its sha256 hash.
 * raw = 32 bytes base64url (~43 chars) — 256 bits of entropy, so a token is
 * unguessable (GET …/:token is also rate-limited as a token-guessing surface).
 */
export function generateStaffInviteToken(): { raw: string; tokenHash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, tokenHash: hashStaffInviteToken(raw) };
}

/** expires_at for a fresh invite: now + STAFF_INVITE_TTL_DAYS. */
export function staffInviteExpiry(now = new Date()): Date {
  return new Date(now.getTime() + STAFF_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The share URL carried by the invite. v1 uses the custom scheme deep link
 * (D6) — the web /join page re-opens this from its ?token= query. The raw
 * token only ever appears here (in the retailer's share sheet and the link).
 *
 * The scheme comes from `@kanchuki/shared` rather than being written out here:
 * this was the third hand-written copy of it (after `apps/mobile/app.json` and
 * the web's deep-link module), and it is one of the two the web `/join` bridge
 * has to agree with exactly. `randomBytes(...).toString('base64url')` is
 * `[A-Za-z0-9_-]`, so the builder's percent-encoding is a no-op here and the
 * emitted link is byte-identical to the literal it replaces.
 */
export function buildStaffInviteUrl(raw: string): string {
  return appLink('join', { token: raw });
}

/**
 * Mask a phone for the public join screen — the full number must never cross
 * the wire to the client (§5.3/5.4). Returns "•••••• 3210" shape.
 */
export function maskPhone(phone: string): string {
  const last4 = phone.slice(-4);
  return `•••••• ${last4}`;
}
