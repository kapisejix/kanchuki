import { createServer, type Server } from 'node:http'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  API_STUB_PORT,
  closeStub,
  createStubServer,
  json,
  listenStub,
} from '../../e2e/support/api-stub'

// ── The customer e2e suite's own harness, held to account ─────────
//
// This file guards `e2e/support/*`, which is the part of the suite nothing
// else tests: the specs exercise the app, and the harness is assumed correct.
// Two harness faults have already cost real debugging time in this repo —
// a stub that sent no CORS header (looked like a broken page), and an
// unstubbed image optimizer that 500'd (made photo-grid sizing tests measure
// broken images while staying green). Neither was caught by the e2e run itself,
// because both fail *quietly and in the direction of passing*.
//
// So there are two halves here: real requests against the stub to pin the
// headers it exists to add, and a static scan so a new spec can't quietly
// re-open either hole.

const HERE = dirname(fileURLToPath(import.meta.url))
const E2E_DIR = resolve(HERE, '../../e2e')

function specFiles(): string[] {
  return readdirSync(E2E_DIR)
    .filter((f) => f.startsWith('customer-') && f.endsWith('.spec.ts'))
    .sort()
}

/** Everything the static guards below ask about, read once. */
type Sources = Record<string, string>

function loadSources(): Sources {
  const out: Sources = {}
  for (const file of specFiles()) out[file] = readFileSync(join(E2E_DIR, file), 'utf8')
  return out
}

// ── The guards, as pure functions ─────────────────────────────────
//
// Deliberately pure and separate from the file reading: a guard that scans real
// files can only be shown to fail by breaking the repo, so instead these take
// their input and are pointed at crafted sources in the self-proof block below.
// That way "this check would actually catch it" is asserted on every run rather
// than being a thing somebody verified once.

/** Specs that build a server themselves instead of going through the CORS wrapper. */
function specsWithBareCreateServer(sources: Sources): string[] {
  return Object.entries(sources)
    .filter(([, source]) => /createServer\s*\(/.test(source))
    .map(([file]) => file)
}

/** Specs that hand the browser fixture photos but never stub the optimizer. */
function specsWithUnservedImages(sources: Sources): string[] {
  return Object.entries(sources)
    .filter(([, source]) => source.includes('cdn-e2e.r2.dev') && !source.includes('stubFixtureImages'))
    .map(([file]) => file)
}

// Matches the *call*, not the word. A bare `includes('_next/image')` would also
// fire on a comment that merely explains the path — which is exactly what
// happened the first time this guard ran, against the comment in
// `support/images.ts`'s call site. Guards that fail on prose get weakened or
// deleted, so this one is anchored on `route(...)`.
const OWN_OPTIMIZER_ROUTE = /\.route\(\s*['"`][^'"`]*_next\/image/

/** Specs that route the optimizer directly instead of using the shared helper. */
function specsRoutingOptimizerThemselves(sources: Sources): string[] {
  return Object.entries(sources)
    .filter(([, source]) => OWN_OPTIMIZER_ROUTE.test(source))
    .map(([file]) => file)
}

describe('e2e stub server', () => {
  let server: Server | null = null
  let handlerCalls: string[] = []
  let origin = ''

  beforeAll(async () => {
    handlerCalls = []
    server = createStubServer((req, res) => {
      handlerCalls.push(`${req.method} ${req.url ?? ''}`)
      if (req.url === '/json') return json(res, 200, { ok: true })
      if (req.url === '/missing') return json(res, 404, { error: 'nope' })
      res.statusCode = 200
      res.end('raw')
    })
    // Ephemeral port: this test must not collide with a real spec run, and it
    // must not need :3001 to be free.
    await new Promise<void>((resolve_) => server!.listen(0, '127.0.0.1', resolve_))
    const address = server!.address()
    if (address == null || typeof address === 'string') throw new Error('no port assigned')
    origin = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await closeStub(server)
  })

  it('answers a cross-origin GET with the CORS header the browser requires', async () => {
    const res = await fetch(`${origin}/json`, { headers: { Origin: 'http://localhost:3100' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('answers the OPTIONS preflight itself, without reaching the route handler', async () => {
    handlerCalls = []
    const res = await fetch(`${origin}/json`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('GET')
    // The point of centralising it: a route that never implements OPTIONS is
    // still preflighted correctly.
    expect(handlerCalls, 'the preflight reached the route handler').toEqual([])
  })

  it('puts the header on error responses too, so a 404 is visible to the page', async () => {
    // The failure this prevents is nasty: without CORS on the 404, Chrome
    // reports an opaque network error instead of the status, so the app's
    // error branch and a genuine outage look identical.
    const res = await fetch(`${origin}/missing`, { headers: { Origin: 'http://localhost:3100' } })
    expect(res.status).toBe(404)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('json() sets a JSON content type', async () => {
    const res = await fetch(`${origin}/json`)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ ok: true })
  })

  it('reports a clear error when the fixed port is already taken', async () => {
    // An in-use :3001 is the most common way to run this suite wrong, and the
    // raw EADDRINUSE tells you nothing about which port or what to stop.
    const squatter = createServer()
    await new Promise<void>((r) => squatter.listen(API_STUB_PORT, '127.0.0.1', r))
    try {
      const clash = createStubServer(() => {})
      await expect(listenStub(clash)).rejects.toThrow(/Port 3001 is in use/)
      await closeStub(clash)
    } finally {
      await new Promise<void>((r) => squatter.close(() => r()))
    }
  })
})

describe('e2e harness guards', () => {
  it('holds every customer spec through the CORS-applying stub server', () => {
    const sources = loadSources()
    expect(
      Object.keys(sources).length,
      'no customer specs were found to scan — the guard would pass vacuously',
    ).toBeGreaterThanOrEqual(3)

    expect(
      specsWithBareCreateServer(sources),
      'a spec builds a server with a bare createServer(), so its responses carry no CORS headers — use createStubServer (see e2e/support/api-stub.ts)',
    ).toEqual([])
  })

  it('serves the fixture images wherever a spec hands them to the browser', () => {
    // The trap: `<Image>` requests /_next/image, the optimizer fetches the fake
    // host from inside `next start`, the 500 leaves the <img> box intact — and
    // a sizing test asserting "visible + no overflow" passes against a broken
    // photo.
    const sources = loadSources()
    expect(
      Object.values(sources).some((s) => s.includes('cdn-e2e.r2.dev')),
      'no spec serves fixture photos — the guard would pass vacuously',
    ).toBe(true)

    expect(
      specsWithUnservedImages(sources),
      'a spec serves cdn-e2e.r2.dev photos but never calls stubFixtureImages, so those requests fail and its photo grids are measured broken (see e2e/support/images.ts)',
    ).toEqual([])
  })

  it('keeps the optimizer route in one place, so it cannot drift', () => {
    expect(
      specsRoutingOptimizerThemselves(loadSources()),
      'a spec routes /_next/image itself instead of using support/images.ts — the copies drift and one gets forgotten',
    ).toEqual([])
  })

  // ── Self-proof ─────────────────────────────────────────────────
  // Without this, all three guards above are indistinguishable from checks
  // that always pass. Each predicate is handed a source that has the fault and
  // we assert it names that file.
  describe('the guards can fail', () => {
    it('flags a spec that builds its own server', () => {
      expect(
        specsWithBareCreateServer({
          'good.spec.ts': "import { createStubServer } from './support/api-stub'",
          'bad.spec.ts': "import { createServer } from 'node:http'\nconst s = createServer(h)",
        }),
      ).toEqual(['bad.spec.ts'])
    })

    it('flags fixture photos with no loader stub', () => {
      expect(
        specsWithUnservedImages({
          'good.spec.ts': "const u = 'https://cdn-e2e.r2.dev/a.jpg'\nawait stubFixtureImages(context)",
          'bad.spec.ts': "const u = 'https://cdn-e2e.r2.dev/a.jpg'",
          'unrelated.spec.ts': "const u = 'https://cdn.real.example/a.jpg'",
        }),
      ).toEqual(['bad.spec.ts'])
    })

    it('flags a spec that routes the optimizer itself', () => {
      expect(
        specsRoutingOptimizerThemselves({
          'good.spec.ts': "await stubFixtureImages(context)",
          'bad.spec.ts': "await context.route('**/_next/image*', h)",
          // Prose about the path is not a fault — this guard must not fire on
          // a comment, or it gets weakened to stop the noise.
          'commenting.spec.ts': '// photos go through /_next/image, stubbed centrally',
        }),
      ).toEqual(['bad.spec.ts'])
    })
  })
})
