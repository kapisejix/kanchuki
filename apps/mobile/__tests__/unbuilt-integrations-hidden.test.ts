import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripComments } from '@kanchuki/shared/testing'

/**
 * Screens for integrations that have no backend behind them must not be
 * reachable. Marketplace Sync wrote CONNECTED with no marketplace call
 * (RC-056); the API now returns 501, and no screen may link to it.
 *
 * Remove a route from HIDDEN only when its backend really exists.
 */
const HIDDEN: Record<string, string> = {
  '/growth/aggregators': 'RC-056 — no marketplace adapter or sync job exists',
}

const ROOT = join(__dirname, '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return files(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

describe('unbuilt integrations are not linked from any screen', () => {
  const sources = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))].map((f) => ({
    rel: relative(ROOT, f).split('\\').join('/'),
    code: stripComments(readFileSync(f, 'utf8')),
  }))

  for (const [route, reason] of Object.entries(HIDDEN)) {
    it(`nothing navigates to ${route} (${reason})`, () => {
      const hits = sources
        .filter(({ code }) => code.includes(`'${route}'`) || code.includes(`"${route}"`))
        .map(({ rel }) => rel)
      expect(hits).toEqual([])
    })
  }
})
