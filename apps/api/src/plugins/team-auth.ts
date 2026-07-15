import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

// ─── Password hashing (scrypt, stdlib — no bcrypt dep needed) ─────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

// ─── Session token (JWT, signed with jose — already a dependency) ──

export interface TeamTokenClaims {
  sub: string // TeamMember.id
  role: string
}

function secret(): Uint8Array {
  const s = process.env['TEAM_JWT_SECRET']
  if (!s) throw new Error('TEAM_JWT_SECRET not configured')
  return new TextEncoder().encode(s)
}

export async function signTeamToken(claims: TeamTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret())
}

export async function verifyTeamToken(token: string): Promise<TeamTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (!payload.sub || typeof payload['role'] !== 'string') return null
    return { sub: payload.sub, role: payload['role'] }
  } catch {
    return null
  }
}
