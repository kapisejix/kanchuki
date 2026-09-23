# AI Studio — AI Photo & Video Generation

Everything about the AI Studio/photo pipeline that is *not* the spec itself. The spec is `../tasks/pending/ai-photo-generation.md` (the single source of truth for F-032 and F-034).

> ⚠️ **All images in this folder are gitignored** (`docs/ai-studio/**/*.jpg|jpeg|png|webp` + `**/out/` in the root `.gitignore`). They are local working assets, not source. The HTML catalogs and `.md` files *are* tracked. This is deliberate — the image sets are large binaries.

## Bench catalogs (HTML, tracked)

Open these directly in a browser. They are self-contained (Tailwind via CDN, no build step).

| File | What it is |
|---|---|
| `AI Studio Effects.html` | The preset catalog — every scene/pose/lighting/frame/presentation combination the studio can compose, per garment class and audience. Loads photos from `effect-photos/`. |
| `AI Models and Scenes.html` | The model-set + scene reference board (demographic person-swap work). Loads `models/*.png`. |
| `AI Motion Styles.html` | The AI image→video preset catalog (F-034, admin-test-only for now). Uses external Unsplash stills — no local dependency. |
| `AI Cost Comparison.html` | Vendor cost comparison + bench results. Reads a **sibling** `bench-results.js`, written by `scripts/save-bench.mjs`. Until a bench run happens, that script 404s and the results section renders empty (by design — never fake data). |
| `ghost-mannequin-research.html` / `.md` | The Snappyit/ghost-mannequin vendor evaluation. Conclusion: Snappyit has **no public API**; a local LaMa-inpainting version now does the hollow-gap-fill step. |

## Image folders (local-only, gitignored)

| Folder | What it holds |
|---|---|
| `effect-photos/models/` | 8 audience model tiles (`woman-30`, `man-70`, `teen-girl-16`, `kid-boy-4`, …) — the `<img>` targets for `AI Studio Effects.html`. |
| `effect-photos/products/` | 23 garment photos with simulated AI tags, one per category/audience, used as bench inputs. |
| `effect-photos/previews/` | **Empty on purpose.** Bench outputs land here (`<CODE>.jpg`). A missing file renders a "no photo yet" placeholder in the catalog — never a fabricated image. |
| `models/` | The 6 transparent-PNG model figures used by `AI Models and Scenes.html`. |
| `photoshoots/backgrounds/` | The backdrop library set (the local mirror of what's in Admin → Background images). |
| `photoshoots/models/` | Model/reference photos (couples, kids, outdoor, male-with-car, …). |
| `photoshoots/style-output/` | One output per studio style, named `studio-<Style Name>.jpg` — the visual reference for what each style produces. |
| `photoshoots/samples/` | Raw sample product/person photos used as pipeline inputs. |

## Scripts that read/write this folder

These currently point at the **old** paths and are on the post-deletion `sed` list (see `../tasks/reorganize-files-folders-structure.md` → Phase 8 "After-delete work list"):

| Script | Currently | Will become |
|---|---|---|
| `scripts/save-bench.mjs` | `docs/tasks/effect-photos/preview/`, `docs/tasks/bench-results.json`, `docs/tasks/bench-results.js` | `docs/ai-studio/...` |
| `scripts/studio-shoot-demo.mjs` | `OUT_DIR = 'docs/photoshoots/out'` | `docs/ai-studio/photoshoots/out` |
| `scripts/batch-clean-photos.py` | comment pointing at `docs/photo-feature/ghost-mannequin-research.md` | `docs/ai-studio/ghost-mannequin-research.md` |

`history/` holds the frozen pre-merge photo-feature documents (the 5 files merged into the spec, plus the older progress logs). Not current truth.
