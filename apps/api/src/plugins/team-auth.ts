import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

// ─── Password hashing (scrypt, stdlib — no bcrypt dep needed) ─────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ─── Session token (JWT, signed with jose — already a dependency) ──

export interface TeamTokenClaims {
  sub: string; // TeamMember.id
  role: string;
}

function secret(): Uint8Array {
  const s = process.env.TEAM_JWT_SECRET;
  if (!s) throw new Error('TEAM_JWT_SECRET not configured');
  return new TextEncoder().encode(s);
}

export async function signTeamToken(claims: TeamTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret());
}

export async function verifyTeamToken(token: string): Promise<TeamTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.role !== 'string') return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

// ─── Catalog-upload delegated session (F-020) ──────────────────────
// A short-lived, ticket-scoped token so the team member assigned to a paid
// on-site catalog-upload visit (F-019) can act on that one retailer's
// products from their own phone — without ever seeing the retailer's real
// login. Reuses TEAM_JWT_SECRET rather than a new DB-backed session table:
// the JWT's exp claim gives expiry for free, and auth.ts re-checks the
// SupportTicket's live status on every request, so reassigning/closing the
// ticket revokes access immediately even before the token naturally expires.

const CATALOG_UPLOAD_SCOPE = 'catalog_upload';
const CATALOG_UPLOAD_TOKEN_TTL = '8h'; // one field-visit day; re-issue from the ticket if it runs long

export interface CatalogUploadTokenClaims {
  retailer_id: string;
  ticket_id: string;
  team_member_id: string;
}

export async function signCatalogUploadToken(
  claims: CatalogUploadTokenClaims,
): Promise<string> {
  return new SignJWT({
    scope: CATALOG_UPLOAD_SCOPE,
    tid: claims.ticket_id,
    tm: claims.team_member_id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.retailer_id)
    .setIssuedAt()
    .setExpirationTime(CATALOG_UPLOAD_TOKEN_TTL)
    .sign(secret());
}

export async function verifyCatalogUploadToken(
  token: string,
): Promise<CatalogUploadTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (
      payload.scope !== CATALOG_UPLOAD_SCOPE ||
      !payload.sub ||
      typeof payload.tid !== 'string' ||
      typeof payload.tm !== 'string'
    ) {
      return null;
    }
    return { retailer_id: payload.sub, ticket_id: payload.tid, team_member_id: payload.tm };
  } catch {
    return null;
  }
}
