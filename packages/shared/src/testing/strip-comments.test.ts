import { describe, expect, it } from 'vitest'
import { stripComments } from './strip-comments.js'

/**
 * The stripper every source-scanning guard depends on.
 *
 * The arm that matters is `keeps a real link when a commented one sits above it`.
 * The naive "slash-slash to end of line", applied globally, treated the `//` in
 * `intent://` as a comment opener and deleted the rest of the line — which is
 * exactly the text a scan is looking for. That left `deep-links.test.ts`'s source
 * arms vacuously green: they reported "no hand-written link" whether or not one
 * was there. Found by falsifying them; RC-041.
 *
 * These tests assert on the strings the guards really scan for (`intent://`,
 * `https://`, `kanchuki://`) rather than a stand-in token, because the bug was
 * about those exact characters.
 */
describe('stripComments', () => {
  it('strips a line comment on its own line', () => {
    expect(stripComments('// a note\nconst a = 1;')).toBe('\nconst a = 1;')
  })

  it('strips a trailing comment', () => {
    expect(stripComments('const a = 1; // a note')).toBe('const a = 1; ')
  })

  it('strips a trailing comment with no space before it', () => {
    // The `(^|\s)` form — used by two guards before this file — left this one in,
    // so a banned string mentioned there only failed the build later.
    expect(stripComments('x();// a note')).toBe('x();')
  })

  it('keeps the character at the seam instead of joining two tokens', () => {
    // `$1` going missing would turn `foo` + a comment + `bar` into `foobar` — a
    // token nobody wrote, which could match a pattern or mask one.
    expect(stripComments('const a = 1; // c')).toBe('const a = 1; ')
    expect(stripComments('foo// c\nbar')).toBe('foo\nbar')
  })

  it('strips a block comment, including one spanning lines', () => {
    expect(stripComments('a/* x */b')).toBe('ab')
    expect(stripComments('a\n/* x\ny */b')).toBe('a\nb')
  })

  it('strips a docblock at line start', () => {
    // The common case: every guard here scans files full of these.
    expect(stripComments('/**\n * prose\n */\nconst a = 1;')).toBe('\nconst a = 1;')
  })

  it('keeps intent:// — the exact string the RC-041 guard scans for', () => {
    const source = "const url = 'intent://join?token=x#Intent;scheme=kanchuki;package=x;end'"
    expect(stripComments(source)).toBe(source)
  })

  it('keeps https:// and kanchuki://', () => {
    expect(stripComments("const u = 'https://api.kanchuki.app/v1'")).toBe(
      "const u = 'https://api.kanchuki.app/v1'",
    )
    expect(stripComments("const d = 'kanchuki://join?token=x'")).toBe(
      "const d = 'kanchuki://join?token=x'",
    )
  })

  it('keeps a real link when a commented-out one sits above it', () => {
    // THE REGRESSION ARM. With the naive stripper both links vanished and this
    // count was 0 — the guard's source arms could not fail. Exactly one link is
    // real, so exactly one must survive.
    const source = [
      '// old shape: intent://join?token=x#Intent;scheme=kanchuki;package=gone;end',
      "const live = 'intent://join?token=y#Intent;scheme=kanchuki;package=x;end'",
    ].join('\n')
    const stripped = stripComments(source)
    expect(stripped.match(/intent:\/\//g)).toHaveLength(1)
    expect(stripped).toContain('token=y')
    expect(stripped).not.toContain('token=x')
  })

  it('drops a commented-out link entirely, so prose about a link is not a link', () => {
    const source = '// see kanchuki://join for the scheme\nconst a = 1;'
    expect(stripComments(source)).not.toContain('kanchuki://')
  })

  it('never treats a // immediately after a colon as a comment — a documented limit', () => {
    // That adjacency IS the scheme case (`intent://`, `https://`), so it cannot
    // be fixed without knowing which strings are URLs. The cost is that text
    // written as `x:// note` keeps its comment: a banned string there fails the
    // scan loudly rather than passing silently.
    expect(stripComments('x:// not-a-comment')).toBe('x:// not-a-comment')
  })

  it('still strips a comment that follows a colon and a space', () => {
    // `label: // note` — the colon is two characters back, so the character
    // before `//` is the space and the comment goes. Its own arm because the
    // first draft of the module docblock claimed the opposite, and the test
    // caught it.
    expect(stripComments('label: // note')).toBe('label: ')
  })

  describe('order', () => {
    it('block-first eats live code when a line comment contains a block opener', () => {
      // The rake two callers hit, and the reason `line-first` exists. The `/*`
      // inside the line comment opens a block that runs to the NEXT `*/`, so
      // `const keep = 1;` — real code, not a comment — is consumed. A scan
      // looking for `keep` would then report nothing on a tree where it is
      // plainly present: the vacuous-green shape, one layer down from the one
      // this module was written for.
      const source = [
        '// registered under /v1/public/*; see the mount list',
        'const keep = 1; /* a real block */',
        'const alsoKeep = 2;',
      ].join('\n')

      expect(stripComments(source)).not.toContain('const keep = 1;')

      // Line-first cuts the comment before any block is opened.
      const lineFirst = stripComments(source, 'line-first')
      expect(lineFirst).toContain('const keep = 1;')
      expect(lineFirst).toContain('const alsoKeep = 2;')
    })

    it('both orders agree when neither rake is present', () => {
      // The common case, and the reason the default is not a correctness claim
      // about either order: for ordinary source the two are the same string.
      const source = [
        '// a note that mentions intent://join',
        '/** doc */',
        'const url = "kanchuki://join?token=x";',
      ].join('\n')
      expect(stripComments(source, 'line-first')).toBe(stripComments(source))
    })

    it('both orders still keep a live link that a comment above it mentions', () => {
      // The RC-041 regression arm, run through both orders: whichever pass goes
      // first, exactly one real link survives.
      const source = [
        '// old shape: intent://join?token=x#Intent;scheme=kanchuki;package=gone;end',
        "const live = 'intent://join?token=y#Intent;scheme=kanchuki;package=x;end'",
      ].join('\n')
      for (const order of ['block-first', 'line-first'] as const) {
        const stripped = stripComments(source, order)
        expect(stripped.match(/intent:\/\//g), order).toHaveLength(1)
        expect(stripped, order).toContain('token=y')
        expect(stripped, order).not.toContain('token=x')
      }
    })
  })
})
