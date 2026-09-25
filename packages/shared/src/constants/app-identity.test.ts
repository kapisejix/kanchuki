import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '../testing/strip-comments.js'
import {
  ANDROID_PACKAGE,
  APP_SCHEME,
  IOS_BUNDLE_ID,
  androidIntentUrl,
  appLink,
} from './app-identity.js'

/**
 * RC-041 lived in a gap: nothing anywhere cross-checked the scheme or the
 * application id against the app's own manifest. `/join`'s `intent://` named
 * `in.kanchuki.app` for a year, and the only reason nobody noticed is that the
 * plain scheme link beside it worked.
 *
 * So this file is the cross-check, for every surface that names the app:
 *
 *   - the static manifest (`apps/mobile/app.json`) must NOT carry a copy
 *   - the dynamic config (`apps/mobile/app.config.ts`) must import these values
 *   - docs  → the constants (the operator runbooks quote the package by hand)
 *
 * Since 2026-09-25 the mobile side is **single-sourced**: `app.json` no longer
 * repeats the scheme or the application ids, and `app.config.ts` reads them from
 * this module — `require('@kanchuki/shared/constants/app-identity')`, i.e. its *source*,
 * because Expo transpiles only the config file itself and the built `dist/` is
 * not built on the release path. What that import resolves to is pinned where it
 * can actually be evaluated: `apps/mobile/__tests__/app-config.test.ts` runs the
 * real config through `@expo/config` and asserts the values Gradle and Xcode get.
 * The arms below cover the two ways a second copy comes back — someone re-adds it
 * to `app.json`, or the config stops importing it and types the literals again.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const MOBILE = join(REPO_ROOT, 'apps', 'mobile')

/**
 * The three identity fields are deliberately **absent** from the static manifest
 * since 2026-09-25, which is why they are optional here: the assertions below are
 * that they stay absent, and a type that says they exist would contradict them.
 */
interface ExpoManifest {
  expo: {
    scheme?: string
    android: { package?: string; versionCode?: number }
    ios: { bundleIdentifier?: string }
  }
}

const manifest = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')) as ExpoManifest

describe('app identity', () => {
  it('is not repeated in the static manifest', () => {
    // A copy left in `app.json` would not be *wrong* — the dynamic config wins —
    // but it would be a second source that looks authoritative and is read by
    // nothing, which is exactly how RC-041's wrong package survived a year.
    // Asserting absence is the only thing that keeps the count at one.
    expect(manifest.expo.scheme).toBeUndefined()
    expect(manifest.expo.android.package).toBeUndefined()
    expect(manifest.expo.ios.bundleIdentifier).toBeUndefined()
  })

  it('is a syntactically valid Android application id', () => {
    expect(ANDROID_PACKAGE).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
    expect(IOS_BUNDLE_ID).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
  })

  it('is imported by the dynamic app config instead of re-typed there', () => {
    // `app.config.ts` is what `expo prebuild` reads to generate the application
    // id in Gradle and Xcode. Until 2026-09-25 this arm asserted the opposite —
    // that the config did **not** touch these fields — because `app.json` held
    // the values and the config only merged `extra.buildInfo` on top. It owns
    // them now, so the assertion inverts: the import has to be here, and no
    // literal copy may be.
    const config = stripComments(readFileSync(join(MOBILE, 'app.config.ts'), 'utf8'))
    expect(config).toContain('@kanchuki/shared/constants/app-identity')
    expect(config).toMatch(/scheme:\s*APP_SCHEME/)
    expect(config).toMatch(/package:\s*ANDROID_PACKAGE/)
    expect(config).toMatch(/bundleIdentifier:\s*IOS_BUNDLE_ID/)
    // Comments were stripped above, so a literal reaching these lines would be
    // code — the third copy, in the one file that is supposed to consume it.
    expect(config).not.toContain(ANDROID_PACKAGE)
    expect(config).not.toContain(IOS_BUNDLE_ID)
    expect(config).not.toMatch(/scheme:\s*['\"]/)
    // It must still spread the static config in, or `app.json` is bypassed and
    // everything else it holds (plugins, versionCode, permissions) silently
    // vanishes from the build.
    expect(config).toMatch(/\.\.\.config\b/)
  })

  it('builds the custom-scheme link', () => {
    expect(appLink('join', { token: 'abc_123' })).toBe('kanchuki://join?token=abc_123')
    expect(appLink('onboarding')).toBe('kanchuki://onboarding')
  })

  it('builds a targeted Android intent naming the real package', () => {
    expect(androidIntentUrl('join', { token: 'abc_123' })).toBe(
      `intent://join?token=abc_123#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};end`,
    )
  })

  it('omits absent params instead of emitting them empty', () => {
    expect(appLink('onboarding', { ref: undefined })).toBe('kanchuki://onboarding')
    expect(androidIntentUrl('oauth/callback', { code: 'c', state: undefined })).toBe(
      `intent://oauth/callback?code=c#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};end`,
    )
  })

  it('encodes values that would otherwise break out of the query', () => {
    // `code`/`state` arrive from a Meta redirect — the params that can really
    // contain `&`, `=`, `#` or `/`. A base64url invite token cannot, which is
    // why `apps/api`'s invite link is byte-identical before and after moving here.
    expect(appLink('oauth/callback', { code: 'a&b=c', state: 'x/y#z' })).toBe(
      'kanchuki://oauth/callback?code=a%26b%3Dc&state=x%2Fy%23z',
    )
    expect(appLink('oauth/callback', { code: 'c', state: 's' })).toBe(
      'kanchuki://oauth/callback?code=c&state=s',
    )
  })
})

// ─── Docs ──────────────────────────────────────────────────────────
//
// The operator runbooks quote the package name by hand — Meta's dashboard asks
// for it, the Play Console asks for it, and both are filled in by a human
// reading these files. A wrong value here is a support ticket, not a crash, so
// nothing would ever have caught it.
//
// Only the *live* operator docs are scanned. `docs/root-cause/*`, `docs/BUILD-LOG.md`,
// `CLAUDE.md` and `docs/tasks/**` are historical records that quote the broken
// value deliberately — pinning those would forbid writing down what happened.

const OPERATOR_DOCS = ['docs/DEPLOY.md', 'docs/PLAY-STORE-RELEASES.md']

/** Reverse-DNS shaped tokens (3+ segments), i.e. what an application id looks like. */
const APP_ID_SHAPE = /\b[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}\b/g

/**
 * Tokens on a package/bundle line that are *not* application ids — domains and
 * SDK names that read the same way. Each one is here with its reason; none of
 * them is a place the app's identity is asserted.
 */
const NOT_AN_APP_ID = new Set([
  'com.facebook.katana', // Facebook's own Android package — named in the SDK setup, not ours
  // `apps/mobile/app.config.ts` — a **filename**, added 2026-09-25 when the
  // operator doc began citing it as the *source* of the package instead of a
  // manifest field. Three lowercase dot-separated segments is also what a
  // filename looks like, and a filename can never be an application id; on that
  // line the id itself is still read and compared, which is the point.
  'app.config.ts',
])

describe('app identity in the operator docs', () => {
  for (const doc of OPERATOR_DOCS) {
    it(`${doc} names the real package in every package/bundle line`, () => {
      const lines = readFileSync(join(REPO_ROOT, doc), 'utf8').split('\n')
      const offenders: string[] = []
      lines.forEach((line, index) => {
        if (!/package|bundle/i.test(line)) return
        for (const token of line.match(APP_ID_SHAPE) ?? []) {
          if (token === ANDROID_PACKAGE || token === IOS_BUNDLE_ID) continue
          if (NOT_AN_APP_ID.has(token)) continue
          offenders.push(`${doc}:${index + 1} → ${token}`)
        }
      })
      expect(offenders).toEqual([])
    })

    it(`${doc} does not mention the RC-041 package`, () => {
      expect(readFileSync(join(REPO_ROOT, doc), 'utf8')).not.toContain('in.kanchuki.app')
    })
  }
})
