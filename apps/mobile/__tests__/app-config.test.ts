import { join } from 'node:path'
import { ANDROID_PACKAGE, APP_SCHEME, IOS_BUNDLE_ID } from '@kanchuki/shared'
import { getConfig } from '@expo/config'
import { describe, expect, it } from 'vitest'

/**
 * Since 2026-09-25 the app's identity (URL scheme + application ids) is
 * single-sourced in `@kanchuki/shared`: `app.json` no longer repeats it, and
 * `app.config.ts` imports it — from shared's *source*, through a sucrase hook,
 * because Expo transpiles only the config file itself and the built `dist/` is
 * gitignored and not built on the release path.
 *
 * That import cannot be type-checked and it cannot be verified by reading the two
 * files side by side, because what matters is what the **resolver** produces:
 * `expo prebuild` takes the result and generates the application id in Gradle and
 * Xcode. So this evaluates the real config with `@expo/config` — the function the
 * `expo config` and `expo prebuild` CLIs call — and asserts what the build gets.
 * A wrong value here is an unbuildable app, not a dead link (RC-041).
 *
 * Deliberately not `expo config` in a subprocess: same answer, ~10s slower, and
 * it depends on the CLI starting in the environment running the suite.
 */

const PROJECT_ROOT = join(__dirname, '..')

const { exp } = getConfig(PROJECT_ROOT, { skipSDKVersionRequirement: true })

describe('resolved Expo config', () => {
  it('gets the app identity from the shared constant', () => {
    expect(exp.scheme).toBe(APP_SCHEME)
    expect(exp.android?.package).toBe(ANDROID_PACKAGE)
    expect(exp.ios?.bundleIdentifier).toBe(IOS_BUNDLE_ID)
  })

  it('still merges buildInfo on top of the static config', () => {
    // The identity fields moved into `app.config.ts`, which is also the file that
    // merges `extra.buildInfo`. If the move had left both `app.config.js` and
    // `app.config.ts` in place, Expo reads only the `.ts` — and if that rename
    // dropped the merge, the Settings footer would lose the only evidence of
    // which commit a build came from, silently (nothing else asserts it).
    const buildInfo = exp.extra?.buildInfo as Record<string, unknown> | undefined
    expect(buildInfo).toBeDefined()
    expect(typeof buildInfo?.sha).toBe('string')
    expect(typeof buildInfo?.builtAt).toBe('string')
    expect(typeof buildInfo?.channel).toBe('string')
  })
})
