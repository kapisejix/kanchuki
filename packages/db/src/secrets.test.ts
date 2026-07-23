import { beforeEach, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, maskSecret } from './secrets.js'

beforeEach(() => {
  process.env['ENCRYPTION_MASTER_KEY'] = 'test-master-key-do-not-use-in-prod'
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a plaintext value', () => {
    const plaintext = 'rzp_live_abc123XYZ'
    const encrypted = encryptSecret(plaintext)
    expect(encrypted).not.toContain(plaintext)
    expect(decryptSecret(encrypted)).toBe(plaintext)
  })

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-value')
    const b = encryptSecret('same-value')
    expect(a).not.toBe(b)
  })

  it('rejects tampered ciphertext (GCM auth tag check)', () => {
    const encrypted = encryptSecret('sensitive-value')
    const [iv, tag, data] = encrypted.split('.')
    const tampered = `${iv}.${tag}.${data?.slice(0, -4)}AAAA`
    expect(() => decryptSecret(tampered)).toThrow()
  })
})

describe('maskSecret', () => {
  it('keeps only the last 4 characters visible', () => {
    expect(maskSecret('sk_live_abcdwxyz')).toBe('••••••••••••wxyz')
  })

  it('fully masks short values instead of leaking them whole', () => {
    expect(maskSecret('abc')).toBe('••••')
  })
})
