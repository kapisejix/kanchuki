// Cross-platform build wrapper: `next build` MUST run with NODE_ENV=production.
//
// Why this file exists (root-caused 2026-08-11):
// Next's CLI only defaults NODE_ENV when it's unset
// (dist/bin/next: `NODE_ENV = process.env.NODE_ENV || defaultEnv`). The repo's
// `.env` files set NODE_ENV="development" (root `.env` / `apps/api/.env`, for
// the API dev server), and when a parent shell has sourced one of them, that
// inherited value reaches `next build` on this dev box. With NODE_ENV=development,
// Next's build uses the DEVELOPMENT React renderer
// (react-dom-server.browser.development.js), whose stricter Html-context check
// crashes prerendering the built-in error pages:
//
//   Error: <Html> should not be imported outside of pages/_document.
//   Error occurred prerendering page "/500" / "/404" / "/_not-found".
//
// (the prod renderer has no such check — which is why Railway/CI, which don't
// set NODE_ENV, always built fine). Forcing NODE_ENV=production here makes the
// cold build deterministic on any machine, regardless of inherited env.
//
// Windows-safe: `NODE_ENV=production next build` is bash-only syntax and would
// break under cmd.exe — this wrapper works on both.
//
// Note: this guards the canonical `pnpm build` / `turbo build` entry points
// (what CI, Railway and devs run). A bare `pnpm exec next build` bypasses the
// package.json script and inherits the polluted NODE_ENV — always build via
// `pnpm build`.
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

process.env.NODE_ENV = 'production'

const require = createRequire(import.meta.url)
// Resolve next's CLI from THIS workspace (pnpm virtual store, not a global).
const nextBin = require.resolve('next/dist/bin/next')

// Forward any extra args (e.g. `--debug`) after `build`.
const result = spawnSync(process.execPath, [nextBin, 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  console.error('build.mjs: failed to spawn next build:', result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
