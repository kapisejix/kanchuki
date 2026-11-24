import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// F-046: the Play AAB is built by .github/workflows/android-release.yml, not EAS, so the EAS-only
// GOOGLE_SERVICES_JSON env var never reaches it. Without google-services.json the AAB builds
// fine and Android push silently never registers. Source pins on the workflow text; nothing here
// runs a build.
const yml = readFileSync(
  join(__dirname, '..', '..', '..', '.github', 'workflows', 'android-release.yml'),
  'utf8',
)

const stepStart = yml.indexOf('- name: Write google-services.json')
const prebuildStart = yml.indexOf('- name: Expo prebuild')
const step = stepStart === -1 ? '' : yml.slice(stepStart, yml.indexOf('\n      - ', stepStart + 1))
const run = step.slice(step.indexOf('run:'))

describe('android-release.yml provides google-services.json for FCM (F-046)', () => {
  it('has the step, after pnpm install and before expo prebuild', () => {
    expect(stepStart).toBeGreaterThan(-1)
    expect(stepStart).toBeGreaterThan(yml.indexOf('pnpm install --frozen-lockfile'))
    expect(stepStart).toBeLessThan(prebuildStart)
  })

  it('reads the secret through env, never interpolated into the shell script', () => {
    expect(step).toMatch(
      /env:\s*\n\s*GOOGLE_SERVICES_JSON_BASE64: \$\{\{ secrets\.GOOGLE_SERVICES_JSON_BASE64 \}\}/,
    )
    expect(run).not.toContain('secrets.')
  })

  it('fails the release when the secret is missing (a release without push must not look fine)', () => {
    expect(run).toMatch(/-z "\$GOOGLE_SERVICES_JSON_BASE64"[\s\S]*exit 1/)
  })

  it('writes the file under RUNNER_TEMP, not into the repo, and exports its path for app.config.ts', () => {
    expect(run).toContain('$RUNNER_TEMP/google-services.json')
    expect(run).toMatch(/GOOGLE_SERVICES_JSON=\$RUNNER_TEMP\/google-services\.json" >> "\$GITHUB_ENV"/)
  })

  it('checks the package name against the shared app identity, not a copied literal (RC-041)', () => {
    expect(run).toContain('@kanchuki/shared/constants/app-identity')
    expect(run).toContain('ANDROID_PACKAGE')
    expect(yml).not.toContain('app.kanchuki.retailer')
  })
})
