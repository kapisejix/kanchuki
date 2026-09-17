import type { BrowserContext } from '@playwright/test'

// ── Fixture photos ────────────────────────────────────────────────
//
// Every spec serves stub products and designs whose photo URLs point at a host
// that does not exist (`cdn-e2e.r2.dev`), because the bytes are irrelevant to
// what the assertion is about — the *layout* is. But "the bytes don't matter"
// is only true if the image still loads. Two distinct paths reach that host,
// and leaving either one unserved produces the same silent failure:
//
//   1. Next.js `<Image>` routes remote URLs through its own optimizer
//      (`/_next/image?url=...`), which fetches the fixture host from **inside
//      `next start`** — where browser-side routing cannot reach it.
//   2. The designs permalink deliberately renders the watermarked file with a
//      plain `<img>` (`[store]/designs/[id]/page.tsx`, with the eslint-disable
//      and its reason), so the optimiser never re-encodes it. That request goes
//      straight from the browser to the fixture host.
//
// Unserved, the optimizer answers 500 and the browser logs a failed fetch. The
// tempting fix — allowlist it in `watchClientErrors` — is the wrong one,
// because `<img>` keeps its width/height box when the photo fails: the element
// is visible, it contributes nothing to `scrollWidth`, and a "the catalog holds
// up on phone" test passes while the shopper looks at a broken photo. A green
// assertion that checks less than it reads like is worse than a red one.
//
// So both paths are served here, `expectRenderedImage` (responsive.ts) asserts
// real decoded pixels, and `src/__tests__/e2e-api-stub.test.ts` fails if a spec
// hands the browser fixture photos without calling this.

/** 64×80 1-bit PNG — a real, decodable image, small enough to inline. */
const TINY_PNG: Buffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABQCAIAAAAm3eQSAAAAkElEQVR4nO3PUQkAIBTAwBfROEY0liH8OITBAtzmrP11wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjx2AbehQdI93DrPAAAAAElFTkSuQmCC',
  'base64',
)

const FX_HOST = 'https://cdn-e2e.r2.dev'

/**
 * Make every fixture photo load: the Next optimizer, and the raw host the
 * plain-`<img>` surfaces request directly.
 */
export async function stubFixtureImages(context: BrowserContext): Promise<void> {
  const png = async (route: Parameters<Parameters<BrowserContext['route']>[1]>[0]) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG })
  }
  await context.route('**/_next/image*', png)
  // Match the fixture host only — a broader `**/*.jpg` would also swallow the
  // app's own assets and hide a genuinely missing one.
  await context.route(`${FX_HOST}/**`, png)
}
