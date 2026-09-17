import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

// ── The customer e2e suite's stub API ─────────────────────────────
//
// Every customer spec serves the public API from :3001, because those pages
// are server-rendered: `fetchProfile()`/`fetchAllProducts()`/`fetchDirectory()`
// run inside `next start`, where browser-side request interception cannot
// reach them. So the stub is not a convenience — it is the only way to control
// what those pages see.
//
// ⚠️ CORS is applied HERE, by the wrapper, to every response — success, 404
// and OPTIONS preflight alike. That is deliberate, not decoration:
//
//   The /stores directory fetches *from the browser* straight to the API
//   origin (`${NEXT_PUBLIC_API_URL}/v1/public/stores`). localhost:3100 →
//   127.0.0.1:3001 is cross-origin, so Chrome drops any response missing
//   `Access-Control-Allow-Origin`: the fetch rejects, the page falls back to
//   its error state, and nothing in the output says "CORS" — it looks like the
//   page itself is broken.
//
// That is not hypothetical. It shipped that way on 2026-09-17 and cost a
// debugging cycle: the /stores spec's stub sent no CORS header, the directory
// rendered its error state, and the one component that *did* work (the entry
// point) was the one going through the same-origin `/api/passport/*` proxy
// instead. Which is the whole trap — the passport specs never needed CORS
// because every one of their calls is same-origin, so the pattern that gets
// copied when adding a browser-side fetch is the one that silently breaks.
//
// Hence: build stubs with `createStubServer`, never a bare `createServer`.
// `src/__tests__/e2e-api-stub.test.ts` fails the build if a spec goes around
// this helper, and pins the headers by making real requests against it.

export const API_STUB_PORT = 3001
// 127.0.0.1, not localhost: `next start`'s SSR fetch must not resolve to ::1
// and miss the IPv4 listener. playwright.customer.config.ts pins both
// NEXT_PUBLIC_API_URL (build-time, browser) and API_URL (runtime, server) to
// this exact origin for the same reason.
export const API_STUB_ORIGIN = `http://127.0.0.1:${API_STUB_PORT}`

export type StubHandler = (req: IncomingMessage, res: ServerResponse) => void

/**
 * A stub server whose responses always carry the CORS headers a cross-origin
 * browser fetch needs. Route logic stays in the spec; only the plumbing lives
 * here, so the header cannot be forgotten by a new route.
 */
export function createStubServer(handler: StubHandler): Server {
  return createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '600')

    // Preflight — answer it here so no route has to think about it. A GET with
    // no custom headers does not trigger this, but a future POST might.
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    handler(req, res)
  })
}

/** JSON response helper — CORS already applied by `createStubServer`. */
export function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export async function listenStub(server: Server | null): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (!server) return reject(new Error('listenStub called with no server'))
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${API_STUB_PORT} is in use — the customer e2e suite needs it free to stub the public API. Stop any dev server on :${API_STUB_PORT} and re-run.`,
          ),
        )
      } else {
        reject(err)
      }
    })
    server.listen(API_STUB_PORT, '127.0.0.1', resolve)
  })
}

export async function closeStub(server: Server | null): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve) => {
    try {
      server.close(() => resolve())
    } catch {
      resolve() // never listened (beforeAll failed) — nothing to close
    }
  })
}
