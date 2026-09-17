import { describe, expect, it } from 'vitest'
import { DEFAULT_RETURN_TO, readReturnTo, RETURN_TO_PARAM, sanitizeReturnTo } from '../return-to'

describe('sanitizeReturnTo', () => {
  describe('accepts same-origin paths', () => {
    it('keeps a plain path', () => {
      expect(sanitizeReturnTo('/my-stores')).toBe('/my-stores')
    })

    it('keeps a deep path', () => {
      expect(sanitizeReturnTo('/meera-sarees/collections/festive')).toBe(
        '/meera-sarees/collections/festive',
      )
    })

    it('keeps a query string', () => {
      expect(sanitizeReturnTo('/my-profile?tab=orders')).toBe('/my-profile?tab=orders')
    })

    it('keeps a fragment', () => {
      expect(sanitizeReturnTo('/my-profile?tab=orders#top')).toBe('/my-profile?tab=orders#top')
    })

    it('decodes a percent-encoded path (what encodeURIComponent produces)', () => {
      expect(sanitizeReturnTo('%2Fmy-stores')).toBe('/my-stores')
    })

    it('accepts the root path', () => {
      expect(sanitizeReturnTo('/')).toBe('/')
    })

    it('trims surrounding whitespace', () => {
      expect(sanitizeReturnTo('  /my-stores  ')).toBe('/my-stores')
    })

    it('allows a same-origin path that merely carries an absolute-looking param', () => {
      // The nested URL is the destination page's business, not ours — the value
      // we navigate to is still /my-stores.
      expect(sanitizeReturnTo('/my-stores?next=https://evil.example')).toBe(
        '/my-stores?next=https://evil.example',
      )
    })
  })

  describe('rejects cross-origin and malformed targets', () => {
    const rejected: Array<[string, unknown]> = [
      ['protocol-relative host', '//evil.example'],
      ['backslash-smuggled host', '/\\evil.example'],
      ['backslash-smuggled protocol-relative', '/\\/evil.example'],
      ['absolute https URL', 'https://evil.example'],
      ['absolute http URL', 'http://evil.example'],
      ['javascript scheme', 'javascript:alert(1)'],
      ['data scheme', 'data:text/html,<script>alert(1)</script>'],
      ['percent-encoded protocol-relative host', '%2F%2Fevil.example'],
      ['double-encoded protocol-relative host', '%252F%252Fevil.example'],
      ['encoded backslash host', '/%5Cevil.example'],
      ['missing leading slash', 'my-stores'],
      ['bare host', 'evil.example'],
      ['leading CRLF', '\r\n//evil.example'],
      ['embedded CRLF', '/my-stores\r\nX-Injected: 1'],
      ['whitespace-only', '   '],
      ['empty', ''],
      ['null', null],
      ['undefined', undefined],
      ['number', 42],
      ['array (repeated param)', ['/my-stores', '//evil.example']],
      ['over-length', `/${'a'.repeat(600)}`],
    ]

    for (const [label, input] of rejected) {
      it(`falls back for ${label}`, () => {
        expect(sanitizeReturnTo(input)).toBe(DEFAULT_RETURN_TO)
      })
    }
  })

  it('keeps an unparseable escape as a same-origin path rather than discarding it', () => {
    // A lone `%` is undecodable but still a path on our own origin, so it is
    // not a redirect risk — and a legitimate path may contain a literal `%`.
    expect(sanitizeReturnTo('/my-%stores')).toBe('/my-%stores')
  })

  it('never returns a value that leaves the origin, for a fuzz-ish sweep', () => {
    const hostile = [
      '//evil.example/x',
      '/\\evil.example',
      '\\/evil.example',
      'https:/evil.example',
      'https:evil.example',
      '////evil.example',
      '%2f%2fevil.example',
      '%5c%5cevil.example',
      '/%2f%2fevil.example',
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'jAvAsCrIpT:alert(1)',
      '/\tevil.example',
      '//evil.example#/my-stores',
      'http://evil.example/%2f%2f',
    ]
    for (const raw of hostile) {
      const out = sanitizeReturnTo(raw)
      expect(out.startsWith('/')).toBe(true)
      expect(out.startsWith('//')).toBe(false)
      expect(out.includes('\\')).toBe(false)
      // Resolving the output against any origin must stay on that origin.
      expect(new URL(out, 'https://kanchuki.app').origin).toBe('https://kanchuki.app')
    }
  })

  it('honours a custom fallback', () => {
    expect(sanitizeReturnTo('//evil.example', '/')).toBe('/')
  })
})

describe('readReturnTo', () => {
  it('reads the return_to parameter', () => {
    const params = new URLSearchParams(`${RETURN_TO_PARAM}=%2Fmy-profile`)
    expect(readReturnTo((k) => params.get(k))).toBe('/my-profile')
  })

  it('falls back when the parameter is absent', () => {
    const params = new URLSearchParams('other=1')
    expect(readReturnTo((k) => params.get(k))).toBe(DEFAULT_RETURN_TO)
  })

  it('falls back for a hostile parameter', () => {
    const params = new URLSearchParams(`${RETURN_TO_PARAM}=//evil.example`)
    expect(readReturnTo((k) => params.get(k))).toBe(DEFAULT_RETURN_TO)
  })
})
