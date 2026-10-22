import { describe, expect, it } from 'vitest'
import { safeHttpUrl } from './safe-url'

describe('safeHttpUrl', () => {
  it('passes http(s) URLs through unchanged', () => {
    expect(safeHttpUrl('https://shop.example.com/a?b=1')).toBe('https://shop.example.com/a?b=1')
    expect(safeHttpUrl('http://shop.example.com')).toBe('http://shop.example.com')
  })

  it.each([
    'javascript:alert(document.cookie)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.example.com',
    'not a url',
    '',
    null,
    undefined,
  ])('drops %s', (u) => {
    expect(safeHttpUrl(u as string | null | undefined)).toBeUndefined()
  })
})
