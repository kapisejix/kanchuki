# Admin Photo-Cleanup API — Live Trial Report (2026-08-07)

**What was trialled:** the exact API calls the admin photo-cleanup page makes
(`POST /v1/admin/photo-cleanup/run` + presign uploads) against 4 of the user's
real WhatsApp photos, with 7 option combos. Driver: `trial.py` in this folder.
**Environment:** local API (:3001) with live DB / R2 / Redis.

## Runs

| Label | Input | Combo | API result | Server time |
|---|---|---|---|---|
| c-w2 | w2 mannequin bust | composite + shine, flat bg | OK | 46s |
| g-w2 | w2 mannequin bust | ghost-mannequin + shine, flat bg | OK | 120s (LaMa load) |
| c-w5 | w5 hanger + hook | composite + shine, flat bg | OK | 50s |
| b-w5 | w5 hanger + hook | blur 30 (keeps own bg) | OK | 21s |
| c-w7 | w7 folded on bedsheet | composite + shine, flat bg | OK | 20s |
| x-w7 | w7 folded on bedsheet | composite + crop (12% pad) + shine | OK | 16s |
| m-w1 | w1 wooden hanger + vases | composite + shine, mood-board bg | OK | 22s |

All 7 succeeded end-to-end (CSRF → presign → upload → script → R2 → ≤80KB
compress). No crashes, no 500s.

## Failure modes remaining (measured)

| Output | border std (backdrop) | grey in fg (top/mid/bot) | corner residue | Failure mode |
|---|---|---|---|---|
| c-w2 | 3.3 ✅ | **37% / 12% / 47%** | 0% ✅ | **Mannequin bust + floor stand survive** |
| g-w2 | 3.3 ✅ | **37% / 12% / 46%** | 0% ✅ | **Ghost mode = no-op here** (fills only backdrop-colored gaps; the mannequin occupies them) |
| c-w5 | 3.3 ✅ | **20% / 8% / 32%** | 0% ✅ | **Hanger + hook survive at top** |
| b-w5 | 10.4 (own bg) | 76% / 18% / 75% | 100% | **Blur mode keeps the watermark/timestamp** (own bg kept by design — needs crop first) |
| c-w7 | 18.0 ⚠️ | 11% / 5% / 23% | **48.5%** | **Bedsheet remnant survives** (sheet touches garment → kept as "foreground") |
| x-w7 | 78.6 (garment fills frame) | **7% / 5% / 6%** ✅ | 57.9% (shadow) | **Crop largely fixes the folded case** — sheet grey drops to ~5% |
| m-w1 | 53.0 ⚠️ | **66% / 20% / 86%** | 94.5% | **Props survive: wooden hanger + vases + plants all kept as foreground** (rembg can't separate them; busy backdrop + touching props = unsupported) |

## Working as intended

- Backdrop replacement: border-std 3.3 (uniform) on composite runs.
- Watermark removal: 0% corner residue on composite runs (background swap kills it).
- ≤80KB compression wiring: all outputs 71–79KB.
- Crop param: x-w7 shows the intended effect (grey drops 23%→6%).
- Blur mode executes fast (21s) — but see failure above re: watermark.

## Trial-harness quirks (not product bugs)

- Cloudflare error 1010 blocks Python's default User-Agent on `*.r2.dev`
  downloads — browsers always send a real UA, so the real admin page is
  unaffected.
- CSRF pair must be minted fresh per process (in-memory cookie jar) — the
  page does this automatically via `admin-fetch`.

## Verdict

The API plumbing is solid and production-worthy. Every remaining failure
mode is a **segmentation** problem, not an infra problem — exactly what
SAM2 + masked inpainting (report §5.1, build item #1) targets. Blur mode
and busy backdrops with touching props should be discouraged for
watermarked/cluttered raws.
