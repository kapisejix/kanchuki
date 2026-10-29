import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from '@kanchuki/shared/testing'

// Source pins for the T3.5 P2 batch (RC-120, RC-121, RC-122). They pin the shape of the fix,
// not the runtime behaviour: nothing here renders a screen or touches a device.
const read = (rel: string) =>
  stripComments(readFileSync(join(__dirname, '..', rel), 'utf8'))

describe('RC-120: OTP resend guards on a sync ref, not state', () => {
  const src = read('app/auth/otp.tsx')
  const start = src.indexOf('const handleResend')
  const body = src.slice(start, src.indexOf('return (', start))

  it('rejects a second tap while the first is in flight', () => {
    expect(body).toMatch(/resendingRef\.current\)\s*return/)
    expect(body).toMatch(/resendingRef\.current\s*=\s*true/)
  })

  it('releases the ref in finally', () => {
    expect(body).toMatch(/finally\s*\{[^}]*resendingRef\.current\s*=\s*false/)
  })
})

describe('RC-121: campaign send outlives the 10 s default and a timeout is not "failed"', () => {
  it('sendCampaign sets its own timeout', () => {
    const src = read('src/lib/api/growth.ts')
    const at = src.indexOf('sendCampaign:')
    expect(at).toBeGreaterThan(-1)
    expect(src.slice(at, at + 300)).toMatch(/timeoutMs:\s*\d/)
  })

  it('the send screen tells a timeout/network drop from a real failure', () => {
    const src = read('app/growth/campaign/[id].tsx')
    expect(src).toMatch(/'TIMEOUT'/)
    expect(src).toMatch(/'NETWORK_ERROR'/)
    expect(src).toContain('Still sending?')
  })
})

describe('RC-122: inline setError constants must not hide the 4xx reason', () => {
  it.each([
    ['app/product/catalog-import.tsx', ['Upload failed. Try again.', 'Detection failed. Try again.']],
    ['app/product/bulk-onboard.tsx', ['Something went wrong. Try again.']],
  ])('%s routes its catch text through apiMessage', (rel, fallbacks) => {
    const src = read(rel)
    for (const fb of fallbacks) {
      expect(src, `${rel}: bare setError('${fb}')`).not.toContain(`setError('${fb}')`)
      expect(src).toContain(`apiMessage(err, '${fb}')`)
    }
  })
})

describe('RC-123: team requests carry only the retailer Bearer token', () => {
  it('team-api has no admin_key read and no x-admin-key header', () => {
    const src = read('src/lib/team-api.ts')
    expect(src).not.toContain('admin_key')
    expect(src).not.toContain('x-admin-key')
    expect(src).toContain("headers['Authorization'] = `Bearer ${token}`")
  })
})

describe('RC-124: Android Auto Backup is off so the offline cache stays on the device', () => {
  it('app.json sets expo.android.allowBackup to false', () => {
    const cfg = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8'))
    expect(cfg.expo.android.allowBackup).toBe(false)
  })
})

describe('RC-125: release builds never show the API URL or "check the server" text', () => {
  it('client.ts gates the dev-only timeout and network messages behind __DEV__', () => {
    const src = read('src/lib/api/client.ts')
    expect(src).toMatch(/__DEV__\s*\?\s*`Request timed out/)
    expect(src).toMatch(/__DEV__\s*\?\s*`Network request failed to/)
    expect(src).toContain('The server took too long to respond. Please try again.')
    expect(src).toContain('No internet connection. Check your network and try again.')
  })
})

describe('RC-126: every Modal in category/new.tsx handles Android back / iOS swipe-down', () => {
  it('each <Modal has onRequestClose', () => {
    const src = read('app/category/new.tsx')
    const tags = src.match(/<Modal\b[^>]*>/g) ?? []
    expect(tags.length).toBe(2)
    for (const t of tags) expect(t).toContain('onRequestClose')
  })
})
