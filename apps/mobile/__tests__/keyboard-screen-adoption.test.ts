import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripComments } from '@kanchuki/shared/testing'

/**
 * Keyboard-wrapper adoption guard.
 *
 * The platform behaviour that lifts a screen above the software keyboard
 * (`padding` on iOS, `height` on Android) used to be copy-pasted into every
 * screen that owned a `TextInput`. When it is duplicated, a screen that copies
 * an older shape silently keeps the wrong behaviour on one platform and
 * nothing fails — the app still renders, the input is just hidden.
 *
 * So the rule is: `app/` may not mention `KeyboardAvoidingView` at all. Every
 * screen goes through `src/components/KeyboardScreen.tsx`, which is the single
 * place the platform decision lives. If a screen genuinely needs a different
 * behaviour it passes `behavior` to the wrapper.
 */

const APP_DIR = join(__dirname, '..', 'app')
const WRAPPER_REL = 'src/components/KeyboardScreen.tsx'
const WRAPPER_ABS = join(__dirname, '..', WRAPPER_REL)
const WRAPPER_TEST_REL = 'src/components/KeyboardScreen.test.tsx'

/**
 * Screens still allowed to render a raw `KeyboardAvoidingView`.
 *
 * Each entry needs a reason that says why the shared wrapper cannot express
 * it. The guard asserts the file still contains the raw view, so a stale entry
 * (the migration finished but the exemption was left behind) fails too.
 */
const EXCLUDED: Record<string, string> = {
  'app/staff/retailer-onboard.tsx':
    "Pins Android to `behavior={undefined}` (iOS-only `padding`) — a deliberate choice for this screen, not the shared default.",
}

/** Slash-normalised path of `file` relative to `apps/mobile`. */
function relToRoot(file: string): string {
  return relative(join(__dirname, '..'), file).split('\\').join('/')
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [full] : []
  })
}

// Comment-stripped source, so a tombstone comment explaining WHY the raw view is
// banned stays legal. The stripper is shared and tested in its own right
// (`@kanchuki/shared/testing`, RC-041); this file used to carry the naive
// version whose docblock rationalised the damage — "a truncated line only ever
// makes the guard quieter for that one line, never wrongly red". Quieter is the
// entire failure: `KeyboardAvoidingView` on a line that also holds a URL would
// have been invisible to every arm below.

/** Every `.tsx` under `app/`, with its comment-stripped source. */
function appSources(): Array<{ path: string; source: string }> {
  return walk(APP_DIR).map((file) => ({
    path: relToRoot(file),
    source: stripComments(readFileSync(file, 'utf8')),
  }))
}

const RAW_VIEW = /\bKeyboardAvoidingView\b/
const PLATFORM_TERNARY = /Platform\.OS\s*===\s*['"]ios['"]\s*\?\s*['"]padding['"]/

describe('mobile keyboard wrapper adoption', () => {
  const sources = appSources()
  const excluded = Object.keys(EXCLUDED)

  it('finds screen sources to scan', () => {
    // Without this a broken directory walk would make every assertion below
    // vacuously pass.
    expect(sources.length).toBeGreaterThan(30)
  })

  it('keeps the raw KeyboardAvoidingView out of every screen but the exceptions', () => {
    const offenders = sources.filter((s) => RAW_VIEW.test(s.source)).map((s) => s.path)
    expect(offenders.sort()).toEqual(excluded.sort())
  })

  it('has no stale exceptions', () => {
    for (const path of excluded) {
      const file = join(APP_DIR, '..', path)
      expect(existsSync(file), `${path} is exempt but no longer exists`).toBe(true)
      expect(
        RAW_VIEW.test(stripComments(readFileSync(file, 'utf8'))),
        `${path} is exempt but no longer uses the raw view — delete the exemption`,
      ).toBe(true)
    }
  })

  it('never re-derives the platform behaviour inside a screen', () => {
    const offenders = sources
      .filter((s) => PLATFORM_TERNARY.test(s.source))
      .map((s) => s.path)
    expect(offenders.sort()).toEqual(excluded.sort())
  })

  it('imports the wrapper wherever it renders it', () => {
    const importing = sources
      .filter((s) => /import\s*\{[^}]*\bKeyboardScreen\b/.test(s.source))
      .map((s) => s.path)
    for (const path of importing) {
      const source = sources.find((s) => s.path === path)?.source ?? ''
      expect(source, `${path} imports KeyboardScreen but never renders it`).toContain(
        '<KeyboardScreen',
      )
      // `app/a/b/file.tsx` sits two directories under apps/mobile.
      const depth = path.split('/').length - 1
      const expected = `${'../'.repeat(depth)}src/components/KeyboardScreen`
      expect(source, `${path} imports KeyboardScreen from the wrong path`).toContain(
        `from '${expected}'`,
      )
    }
    expect(importing.length).toBeGreaterThan(30)
  })

  it('renders the wrapper only from files that import it', () => {
    const rendering = sources
      .filter((s) => s.source.includes('<KeyboardScreen'))
      .map((s) => s.path)
    for (const path of rendering) {
      const source = sources.find((s) => s.path === path)?.source ?? ''
      expect(source, `${path} renders KeyboardScreen without importing it`).toMatch(
        /import\s*\{[^}]*\bKeyboardScreen\b/,
      )
    }
  })

  it('decides the platform behaviour in exactly one place', () => {
    const source = stripComments(readFileSync(WRAPPER_ABS, 'utf8'))
    expect(source).toMatch(/Platform\.OS\s*===\s*'ios'\s*\?\s*'padding'\s*:\s*'height'/)
  })

  it('keeps the wrapper covered by its own test', () => {
    const test = readFileSync(join(__dirname, '..', WRAPPER_TEST_REL), 'utf8')
    // The Android branch is the one that silently regresses: nothing fails if
    // it collapses to 'padding', the input just disappears behind the keyboard.
    expect(test).toMatch(/toBe\('height'\)/)
  })
})
