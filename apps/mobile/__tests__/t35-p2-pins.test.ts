import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
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

describe('RC-128: FREE_SIZE and the stock max have one home (@kanchuki/shared)', () => {
  const apiStock = stripComments(
    readFileSync(join(__dirname, '..', '..', 'api', 'src', 'lib', 'product-stock.ts'), 'utf8'),
  )
  const shared = stripComments(
    readFileSync(join(__dirname, '..', '..', '..', 'packages', 'shared', 'src', 'constants', 'index.ts'), 'utf8'),
  )

  it('shared declares both constants', () => {
    expect(shared).toContain("export const FREE_SIZE = 'FREE'")
    expect(shared).toMatch(/export const MAX_STOCK_QUANTITY = 99_?999/)
  })

  it('StockEditor and the API import them instead of redeclaring', () => {
    const editor = read('src/components/product-detail/StockEditor.tsx')
    for (const src of [editor, apiStock]) {
      expect(src).toMatch(/import \{[^}]*FREE_SIZE[^}]*\} from '@kanchuki\/shared'/)
      expect(src).toMatch(/import \{[^}]*MAX_STOCK_QUANTITY[^}]*\} from '@kanchuki\/shared'/)
      expect(src).not.toMatch(/(const|let) (FREE_SIZE|MAX_QTY|MAX_STOCK_QUANTITY)\b/)
    }
  })
})

describe('T3.6 c: console output cannot carry secrets and release builds strip it', () => {
  it('babel strips console in production but keeps console.error', () => {
    const src = readFileSync(join(__dirname, '..', 'babel.config.js'), 'utf8')
    expect(src).toMatch(/production:\s*\{[^}]*transform-remove-console/)
    expect(src).toMatch(/exclude:\s*\[\s*'error'\s*\]/)
  })

  it('no unguarded console call passes a token, otp, phone or credential', () => {
    // no \b: must also catch camelCase identifiers like authToken or phoneNumber
    const SECRET = /(token|otp|phone|bearer|secret|authorization|password|jwt)/i
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) scan(p)
      }
    }
    const scan = (file: string) => {
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        if (!/console\.(log|warn|error|info|debug)\(/.test(line) || line.includes('__DEV__')) return
        // string literals are labels ("[msg91] ...", "otp send failed"), only identifiers count
        const text = lines.slice(i, i + 8).join(' ').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""')
        // a call can span lines and the repo omits semicolons: cut at the balanced close paren
        let depth = 0
        let end = text.length
        for (let k = text.search(/console\.\w+\(/); k < text.length; k++) {
          if (text[k] === '(') depth++
          if (text[k] === ')' && --depth === 0) {
            end = k
            break
          }
        }
        if (SECRET.test(text.slice(0, end))) offenders.push(`${file}:${i + 1}`)
      })
    }
    walk(join(__dirname, '..', 'app'))
    walk(join(__dirname, '..', 'src'))
    expect(offenders).toEqual([])
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
