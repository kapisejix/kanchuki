import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from '@kanchuki/shared/testing'
import { describe, expect, it } from 'vitest'
import {
  ANDROID_PACKAGE as SOURCE_ANDROID_PACKAGE,
  APP_SCHEME as SOURCE_APP_SCHEME,
} from '@kanchuki/shared/constants/app-identity'
import {
  ANDROID_PACKAGE,
  APP_SCHEME,
  androidIntentUrl,
  appLink,
} from '@/lib/deep-links'

/**
 * RC-041: the web app's `intent://` link named an Android package that does not
 * exist (`in.kanchuki.app`), so "Open with Android app" on the staff-invite
 * bridge could never open Kanchuki. Nothing had cross-checked the string against
 * anything, and nothing exercised the link — the plain scheme link above it
 * works, which is the path casual testing takes.
 *
 * The constants now live once, in `@kanchuki/shared` (`constants/app-identity.ts`),
 * which the API and the mobile app read too. This suite therefore asserts two
 * things about *web*:
 *
 *   1. web resolves them at all, and to the values the app is actually published
 *      under. That comparison is against shared's **source**, not the manifest:
 *      `apps/mobile/app.json` stopped holding the scheme and the application id
 *      on 2026-09-25 (its dynamic config imports them instead), while `apps/web`
 *      still resolves `@kanchuki/shared` through the built `dist` — gitignored,
 *      so a stale build would serve web an old package name while the app used
 *      the new one. That is RC-035, where a gitignored artifact hid exactly this;
 *   2. no file under `src/` hand-writes a link, a package literal, or the RC-041
 *      value. `lib/deep-links.ts` is now a pure re-export and holds none of them,
 *      so any hit at all is a hand-written link.
 *
 * The stripper is shared and tested (`@kanchuki/shared/testing`). This file used
 * to carry the naive one, which deleted the `//` in `intent://` — the exact
 * string arm 2 searches for — so arm 2 could never fail. It was found by
 * falsifying: a hand-written link was typed back into a page and the arm stayed
 * green.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_SRC = join(HERE, '..', '..')

const toPosix = (p: string) => p.split(sep).join('/')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Every non-test source under `src/`, comment-stripped. */
function sources(): Array<{ path: string; source: string }> {
  return walk(WEB_SRC).map((file) => ({
    path: toPosix(relative(WEB_SRC, file)),
    source: stripComments(readFileSync(file, 'utf8')),
  }))
}

describe('deep links', () => {
  it('resolves the values the source module declares, not a stale dist', () => {
    // The built entry (`@kanchuki/shared` → `dist`) and the source entry
    // (`@kanchuki/shared/constants/app-identity` → `src`) are two different files,
    // which is the whole point: if `dist` is stale, web ships a link naming a
    // package the app is not published under, and every other app disagrees.
    // The mobile side pins what the manifest resolves to —
    // `apps/mobile/__tests__/app-config.test.ts` — so this arm owns the one
    // failure mode that is web's alone.
    expect(APP_SCHEME).toBe(SOURCE_APP_SCHEME)
    expect(ANDROID_PACKAGE).toBe(SOURCE_ANDROID_PACKAGE)
  })

  it('keeps the package a syntactically valid Android application id', () => {
    expect(ANDROID_PACKAGE).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
  })

  it('builds a custom-scheme link', () => {
    expect(appLink('join', { token: 'abc_123' })).toBe('kanchuki://join?token=abc_123')
  })

  it('builds a targeted Android intent naming the real package', () => {
    expect(androidIntentUrl('join', { token: 'abc_123' })).toBe(
      `intent://join?token=abc_123#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};end`,
    )
  })

  it('omits absent params instead of emitting them empty', () => {
    expect(appLink('onboarding')).toBe('kanchuki://onboarding')
    expect(appLink('onboarding', { ref: undefined })).toBe('kanchuki://onboarding')
    expect(androidIntentUrl('oauth/callback', { code: 'c', state: undefined })).toBe(
      `intent://oauth/callback?code=c#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};end`,
    )
  })

  it('encodes values that would otherwise break out of the query', () => {
    // `state` and `code` arrive from a Meta redirect, so they are the params
    // that can actually contain `&`, `=`, `#` or `/`.
    expect(appLink('oauth/callback', { code: 'a&b=c', state: 'x/y#z' })).toBe(
      'kanchuki://oauth/callback?code=a%26b%3Dc&state=x%2Fy%23z',
    )
  })

  it('joins multiple params with &', () => {
    expect(appLink('oauth/callback', { code: 'c', state: 's' })).toBe(
      'kanchuki://oauth/callback?code=c&state=s',
    )
  })

  it('builds every link through the shared module', () => {
    const offenders = sources()
      .filter(
        (f) =>
          f.source.includes('intent://') ||
          f.source.includes('kanchuki://') ||
          /package\s*=/.test(f.source),
      )
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('holds no copy of the package literal', () => {
    // Zero, not one: `lib/deep-links.ts` is a re-export, so the literal's only
    // home is `@kanchuki/shared` and the manifest it is pinned to.
    const holders = sources()
      .filter((f) => f.source.includes(ANDROID_PACKAGE))
      .map((f) => f.path)
    expect(holders).toEqual([])
  })

  it('never reintroduces the RC-041 package', () => {
    // The exact string that shipped. A constant lookup cannot produce it, so
    // this can only come back by being typed out again.
    const offenders = sources()
      .filter((f) => f.source.includes('in.kanchuki.app'))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })
})
