import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { prisma } from './client.js'

// F-012: encrypted, admin-managed replacement for .env third-party
// credentials. ENCRYPTION_MASTER_KEY itself must stay in env — it is what
// decrypts everything stored here, so it can never live in the table it
// unlocks (see schema.prisma comment on IntegrationSetting).

function masterKey(): Buffer {
  const raw = process.env['ENCRYPTION_MASTER_KEY']
  if (!raw) throw new Error('ENCRYPTION_MASTER_KEY not configured')
  // SHA-256 so any passphrase length works, not just a raw 32-byte secret.
  return createHash('sha256').update(raw).digest()
}

/** AES-256-GCM. Output: base64(iv).base64(authTag).base64(ciphertext) */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`
}

export function decryptSecret(encrypted: string): string {
  const [ivB64, tagB64, dataB64] = encrypted.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted secret')
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

/** Display-safe preview. Never reveals enough to reconstruct the secret. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return '••••'
  return `${'•'.repeat(Math.min(plaintext.length - 4, 20))}${plaintext.slice(-4)}`
}

// ponytail: 30s in-memory cache avoids a DB round trip on every R2/Razorpay
// call. Admin CRUD routes call invalidateSecret() so edits apply immediately
// instead of waiting out the TTL. Per-process cache — fine for this app's
// single-API-instance deploy; add pub/sub invalidation if that changes.
const cache = new Map<string, { value: string | undefined; at: number }>()
const CACHE_MS = 30_000

export function invalidateSecret(keyName: string): void {
  cache.delete(keyName)
}

/** DB-stored, admin-managed value if active, else the .env var of the same name. */
export async function getSecret(keyName: string): Promise<string | undefined> {
  const hit = cache.get(keyName)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value

  const row = await prisma.integrationSetting.findFirst({
    where: { key_name: keyName, is_active: true },
  })
  const value = row ? decryptSecret(row.encrypted_value) : process.env[keyName]
  cache.set(keyName, { value, at: Date.now() })
  return value
}
