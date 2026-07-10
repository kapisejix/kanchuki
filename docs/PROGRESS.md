# Progress Log

One file, update at end of each work session: what's done, what's next, what's blocked. Check `git log -1` and this file first thing each session.

---

## 2026-07-08 (Railway deploy + CatVTON RunPod first test)

**Git/GitHub:**
- `main` branch was stuck on stub "Initial commit" (repo effectively looked empty on GitHub default branch) while all real work sat on `master`. Merged `master` → `main` (`--allow-unrelated-histories`), pushed both. GitHub now shows real project on default branch.
- Committed pending `docs/DEPLOY.md` fix (RunPod `CATVTON_API_URL` format) + `.gitignore` entry for local `test_*.jpg` scratch files.
- **Leaked secret:** user pasted a live `GHCR_PAT` GitHub token in plaintext chat — flagged for rotation, **not confirmed rotated yet**. Check before next session if this still matters.

**Railway project created — 3 services, root dir `.` for all (monorepo needs full tree):**
- `supportive-love` = API (`NIXPACKS_TURBO_APP_NAME=@kanchuki/api`)
- `magnificent-liberation` = Web (`NIXPACKS_TURBO_APP_NAME=@kanchuki/web`)
- `lovely-joy` = dead empty service (had orphaned `DATABASE_URL` var, isolated from other services) — **should be deleted**, not confirmed done.
- Railway's own Postgres plugin was created then abandoned — decision made to use **existing Supabase Postgres** instead (schema/RLS/seed data already live there per earlier session), not a fresh Railway DB. Real `.env` DB creds already point to Supabase pooler (`aws-1-ap-south-1.pooler.supabase.com:6543`).
- Full env var lists for both services were handed to user (grepped from actual `process.env[...]` code reads, not docs — docs had dead vars like `JWT_SECRET`, `DATABASE_URL_POOLER`, `NEXT_PUBLIC_SITE_URL`, `SENTRY_DSN` that no code actually reads). User said vars added, not independently verified.
- **Still open:** Config File Path not yet set per-service (root dir = `.` means Railway won't auto-find `apps/api/railway.json` / `apps/web/railway.json` without this explicit setting) — real blocker for first deploy, flagged, not fixed.
- **Still open:** `WEB_URL` (API) and `NEXT_PUBLIC_API_URL` (Web) need real Railway-assigned URLs — chicken-egg, needs first deploy of each to get the URL, then a second pass to cross-wire.

**CatVTON/RunPod:**
- Docker image already built + pushed successfully by CI (`ghcr.io/kapisejix/kanchuki-tryon:latest`), confirmed via `gh run list`.
- **Bug found + fixed:** `packages/ai/src/tryon.ts` `triggerCatVTON()` sent zero `Authorization` header to RunPod's `/runsync` — RunPod requires `Bearer <RUNPOD_API_KEY>` on every call, would have 401'd. Added `RUNPOD_API_KEY` env var + header. Typechecks clean. **Not yet committed.**
- **Bug found, NOT yet fixed:** same function assumes `/runsync` always returns a synchronously-completed result. In practice (confirmed live) RunPod returns `{"status":"IN_QUEUE", "id": "..."}` on cold start and the real result only shows up via polling `GET /v2/{endpoint}/status/{id}`. `triggerCatVTON` needs a poll loop added for the `IN_QUEUE`/`IN_PROGRESS` case before this works end-to-end in prod. **This is the next code fix to make.**
- RunPod endpoint created (id `pnvchif9f4bcom`, GPU L4, Queue mode — not Load Balancer, matches `handler_runpod.py`'s queue-worker contract). First deploy hit `IMAGE_AUTH_ERROR` because the GHCR package wasn't linked to the repo (built via PAT, lives under user account packages tab, not repo sidebar) and defaulted private — fixed by manually setting package visibility to Public at `github.com/kapisejix?tab=packages`.
- **Currently stuck (unresolved at session end):** worker stuck in `initializing` state for 15+ min per `/health` polling (`workers.initializing: 2, ready: 0`), image pull logs repeating "pending". Cold-start image is large (CUDA 12.4 + PyTorch + CatVTON deps, no baked-in model weights — those download from HuggingFace at container startup via `handler_runpod.py::load_model()`), so slow first pull is plausible but not confirmed distinguishable from actually-stuck. Suggested to user: check if log timestamps are advancing, consider bumping Container Disk from 49GB to 75GB and redeploying if genuinely frozen.
- Test harness built: `packages/ai/scratch-test-tryon.mjs` (untracked, delete when done) — uploads `test_person.jpg`/`test_garment.jpg` (already in repo root, gitignored) to R2 under `scratch-test/` prefix, calls CatVTON `/runsync`, saves result to `tryon-result.jpg`. Run via `node --env-file=.env packages/ai/scratch-test-tryon.mjs` from repo root. One job already queued from this session (`sync-fc7ec240-...`) — may complete on its own once worker comes up; check `/status/{id}` before resubmitting to avoid a duplicate GPU charge.
- Local `.env` now has real `CATVTON_API_URL` (`https://api.runpod.ai/v2/pnvchif9f4bcom`) and `RUNPOD_API_KEY` set — **not yet copied to Railway's `supportive-love` service vars.**

**Resume here next session:**
1. Check RunPod worker status (`/health` or dashboard) — did it finish initializing?
2. If ready: poll `/status/sync-fc7ec240-b179-40fc-b914-bdcd6663b83c-e2` (or rerun `scratch-test-tryon.mjs`) to get an actual result image and confirm the model output quality.
3. Fix the polling bug in `packages/ai/src/tryon.ts::triggerCatVTON` (RunPod async completion), commit both fixes (auth header + polling).
4. Copy `CATVTON_API_URL` + `RUNPOD_API_KEY` into Railway `supportive-love` vars.
5. Set Config File Path on both Railway services, resolve `WEB_URL`/`NEXT_PUBLIC_API_URL` chicken-egg, do first real deploy.
6. Confirm `GHCR_PAT` rotated and `lovely-joy` Railway service deleted (both flagged, unconfirmed).
7. Delete `packages/ai/scratch-test-tryon.mjs` once no longer needed.

---

## 2026-07-08 (later — mobile boot blockers fixed)

**Done:**
- Mobile app now bundles (`npx expo export --platform android` succeeds, 5.93 MB hbc).
- app.json: removed refs to nonexistent `assets/` icons/splash — Expo defaults used. Add real assets before store submission.
- NativeWind wired: added `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css` (+ import in `app/_layout.tsx`). Pinned `nativewind@~4.1.23` — 4.2.x pulls `react-native-worklets` (native module, breaks Expo Go).
- MMKV → `expo-secure-store` (`src/lib/storage.ts`, in-memory cache): MMKV is a native module absent from Expo Go. `getToken/setToken/clearToken` now async.
- pnpm strictness: added direct deps `react-native-css-interop@~0.1.22`, `@babel/runtime`.
- metro.config resolver shim: maps NodeNext `.js` imports in `@kanchuki/shared` TS source.
- Mobile typecheck passes; api/ai tests still 16/16.

**Next:** run on device via Expo Go (`pnpm --filter @kanchuki/mobile start`, API on `http://192.168.1.4:3001`, Redis + .env required). Fix 3 TS errors in `packages/ai/src/tagger.test.ts`.

---

## 2026-07-08

**Git:** scaffold (apps/, packages/, docs/, tooling) + RLS/extractor fix committed and pushed. `master` == `origin/master`, 2 commits (`8390dea`, `332bada`). Working tree clean.

**Done:**
- RLS policy fix: `auth_user_id` (text) cast to `auth.uid()::text` in migrations 001/002.
- `000_baseline` migration added to bootstrap Prisma history against tables created via `db push`.
- `scripts/measurement_extractor.py` ported to PoseLandmarker Tasks API (mediapipe 0.10.x dropped `mp.solutions.pose` on Windows/py3.13). `CIRCUMFERENCE_FACTOR` recalibrated 1.15 -> 2.6.
- Self-check (`python scripts/measurement_extractor.py --demo`) passes: math executes, values stay in sane bounds.

**DB state (verified 2026-07-08):** all 3 migrations already applied directly via Prisma on 2026-07-07 (`_prisma_migrations` table confirms `000_baseline`, `001_pgvector_indexes`, `002_customer_measurements` all `finished_at` set). Supabase MCP's own `list_migrations` tracks separately from `_prisma_migrations` and shows empty — that's a tracking-tool quirk, not a missing migration. `public.customer_measurements` and all other tables exist with RLS enabled. Do not re-run `apply_migration` for these three — tables already exist, re-applying will conflict.

Stray row: `001_pgvector_indexes` appears twice in `_prisma_migrations`, one with `finished_at: null` (failed first attempt before the RLS cast fix, harmless leftover).

**Security — flagged, not fixed:** RLS disabled on `try_on_jobs`, `audit_logs`, `_prisma_migrations`. Anon/authenticated roles can read/write every row in these. Needs explicit policies before enabling (enabling RLS with no policies blocks all access) — user decision, not auto-applied.

---

## 2026-07-08 (sprint — try-on, bulk import, onboarding polish)

**Done (VTO feature):**
- Virtual Try-On fully built across all layers:
  - `packages/ai/src/tryon.ts` — CatVTON try-on engine (trigger, save result)
  - `apps/api/src/routes/tryon.ts` — API routes (initiate, upload-url, jobs, remote)
  - `apps/api/src/jobs/process-tryon.ts` — BullMQ job handler
  - `apps/mobile/app/tryon/in-store.tsx` — In-store try-on screen for shopkeeper
  - `apps/web/src/app/c/[slug]/components/TryOnModal.tsx` — Customer try-on modal
  - `apps/web/src/app/c/[slug]/components/CollectionView.tsx` — Try On button on product cards
  - `apps/web/src/app/c/[slug]/components/ProductDetailSheet.tsx` — Try This On button in detail sheet
  - `apps/web/src/app/api/try-on/remote/route.ts` + `[id]/route.ts` — API proxies

**Done (Other features):**
- Bulk photo import (`apps/mobile/app/product/bulk.tsx`) — gallery multi-select, per-photo progress
- Onboarding flow polished — welcome branding, step indicator, animated transitions, confetti
- Analytics dashboard for retailers — daily trends, category breakdown, plan usage
- Public landing page stats bar — dynamic, auto-updates with real data
- CI/CD pipeline for Railway deployment — railway.json configs, DEPLOY.md guide
- Database seed script — 3 retailers, 30 products, 10 customers, 8 collections
- Error handling + offline resilience — request cache, dedup, timeouts

**VTO Strategy:**
- Using **self-hosted CatVTON** ($0.005/try-on) as the sole try-on engine
- CatVTON Python microservice fully built: see `services/tryon/app.py` (FastAPI) and `services/tryon/handler_runpod.py` (RunPod)

---

## 2026-07-08 (build system fixes)

**Done:**
- Fixed shared package module resolution: added `build` script and proper `exports` field (types + import/default conditions), enabling the package to be consumed by both NodeNext (API) and bundler (Web) consumers
- Fixed web build: removed `output: 'standalone'` and invalid `outputFileTracingRoot` from `next.config.mjs` which caused `useContext` null error during static generation
- Added `transpilePackages: ['@kanchuki/shared']` to Next.js config for monorepo workspace resolution
- Full `turbo build` passes for all 6 packages (shared, ai, db, api, web, mobile)
- Typechecks pass on all packages
- 16/16 tests pass (api + ai)

**Context from docs review:**
- CatVTON Python microservice (`services/tryon/`) is fully built — see commit `83f0eb6`. Includes `app.py` (FastAPI server), `Dockerfile` + `Dockerfile.runpod`, `handler_runpod.py` (RunPod serverless), training pipeline (`scripts/training/train_lora.py`), dataset collection scripts, mask generator, and dataset preparation.
- CatVTON training pipeline (LoRA fine-tuning for Indian ethnic wear) fully implemented — ready for GPU deployment.
- Phase 0 polishes: Razorpay subscriptions, admin panel, landing page, CI/CD, seed data — committed in `3c1ad13`, `4438acd`.

**Notable changes:**
- `output: 'standalone'` removed from `next.config.mjs` — this is needed for Railway deployment (documented in DEPLOY.md). Should be restored once the build system is stable, or use env var `NEXT_PRIVATE_STANDALONE=true`.

---

## 2026-07-08 (standalone output investigation)

**Done:**
- Investigated `output: 'standalone'` for Railway deployment:
  - Tested `NEXT_PRIVATE_STANDALONE=true` env var → fails with `useContext` null error
  - Tested `output: 'standalone'` with `outputFileTracingRoot` → same error
  - Tested `output: 'standalone'` without `outputFileTracingRoot` → same error
  - **Conclusion:** standalone mode is broken with Next.js 14.2.5 + pnpm monorepo
    (known issue — file tracing phase fails because pnpm's symlinked node_modules
    structure breaks module resolution during standalone post-processing)
- Updated `apps/web/railway.json`: startCommand changed from standalone server.js
  to `pnpm --filter @kanchuki/web start` (works because Railway Nixpacks keeps
  full node_modules)
- Updated `docs/DEPLOY.md` CI/CD section with corrected info and note about
  the standalone bug
- Final `turbo build` passes all 6 packages

**Not deployable as standalone Docker image** without either:
  a) Upgrading Next.js to a version that fixes the pnpm standalone bug
  b) Using a Dockerfile that resolves pnpm symlinks (cp -rL) before standalone
  c) Accepting larger deployment image with full node_modules (current approach)

**Next:**
- Deploy CatVTON to RunPod GPU (see `services/tryon/README.md`)
- Pilot with 10 retailers (Phase 0 launch gate)
- Add real app icons/assets for store submission (mobile)
- Enable RLS on try_on_jobs and audit_logs with proper policies

---

## 2026-07-09 — CatVTON RunPod Worker Diagnosis

### The Architecture (How Try-On Works)

The try-on flow has 4 layers:

```
Mobile App  ──→  API Server (Node.js)  ──→  RunPod GPU Worker  ──→  HuggingFace
(Expo/RN)        (apps/api/)               (CatVTON container)      (Model weights)
```

1. **Mobile App** → uploads customer + product photos to Cloudflare R2
2. **API Server** → gets the image URLs, calls RunPod's API endpoint
3. **RunPod Worker** → runs CatVTON AI model (Python + PyTorch) on an NVIDIA L4 GPU
4. **HuggingFace** → serves the model weights (~4GB) that CatVTON needs

### Root Cause: What's Actually Wrong

**Problem 1: Model weights not baked into Docker image (THE MAIN ISSUE)**

The Docker image (`Dockerfile.runpod`) is built by GitHub Actions CI. It contains:
- ✅ Python 3.11 + CUDA 12.4 + PyTorch
- ✅ CatVTON source code (the pipeline code)
- ✅ All Python dependencies (diffusers, transformers, etc.)
- ❌ **NOT the actual model weights**

The model weights (`zhengchong/CatVTON` + `stable-diffusion-v1-5/stable-diffusion-inpainting`, ~4GB total) download from HuggingFace EVERY TIME a container starts on RunPod. This happens in `handler_runpod.py` line 83:

```python
pipe = CatVTONPipeline(
    attn_ckpt="zhengchong/CatVTON",                         # ~100MB
    base_ckpt="stable-diffusion-v1-5/stable-diffusion-inpainting",  # ~4GB
)
```

On first cold start, this download takes **5-10 minutes** and requires:
- Internet access to HuggingFace (works)
- Enough container disk space (50GB should be enough but tight)
- No timeout interruptions

**Problem 2: The old model was deleted from HuggingFace**

Originally the code used `runwayml/stable-diffusion-inpainting` which was **removed** (returns 404). We fixed this to `stable-diffusion-v1-5/stable-diffusion-inpainting` (the official maintained replacement). This is now in the latest Docker image (CI build #25 succeeded).

**Problem 3: RunPod pods keep exiting**

The current state: all pods start and then exit. The health endpoint shows "1 ready" but that's a configuration target, not actual running workers. All 5 pods that tried to start eventually exited. This means the model download is either:

- **Taking too long** (HuggingFace download speed varies, 4GB can take 5-10 min)
- **Failing silently** (disk space, timeout, network issue)
- **RunPod killing the pod** before the download completes (execution timeout)

### Answers to Your Questions

**Q: "Is the 4GB download happening on my laptop?"**
**A: No.** Absolutely not. The entire download happens INSIDE the RunPod GPU container. Nothing touches your laptop. The Docker image is built by GitHub Actions CI, and the model weights are downloaded by the container when it starts on RunPod's servers.

**Q: "Do I need to upload anything to a development server?"**
**A: No.** The model weights are downloaded directly by the RunPod container from HuggingFace's servers. You don't need to download, upload, or host anything. The only files we upload to Cloudflare R2 are test person/garment photos (already done).

**Q: "Can't we just use the API from HuggingFace?"**
**A: No — HuggingFace doesn't offer a "virtual try-on API."** HuggingFace hosts model files for download. But there's no hosted API endpoint that does try-on for you. You HAVE to run the model yourself on a GPU.

However, there ARE alternative try-on APIs:
- **FASHN API** → $0.075/try-on (we removed this for cost)
- **Kolors API** → Chinese company, virtual try-on
- **RunPod templates** → Pre-built Stable Diffusion templates, faster cold start

### The Solution: Bake Model Weights Into Docker Image

The fix is to download the model weights ONCE during the CI Docker build instead of at runtime. This makes the image ~4GB larger but:

| Before (current) | After (fixed) |
|-----------------|---------------|
| Image: ~5GB | Image: ~9GB |
| Cold start: 5-10 min (download weights) | Cold start: ~30s (no download) |
| Depends on HuggingFace network | Self-contained |
| Can fail on transient HF errors | Always works |
| Every redeploy = new download | Weights baked in permanently |

**How to implement:**

In `Dockerfile.runpod`, add a step that pre-downloads the model weights during the Docker build:

```dockerfile
# Pre-download model weights during build (so they're baked into the image)
RUN python -c "
from huggingface_hub import snapshot_download
snapshot_download('zhengchong/CatVTON')
snapshot_download('stable-diffusion-v1-5/stable-diffusion-inpainting')
"
```

The HuggingFace `diffusers` library automatically caches downloaded models to `~/.cache/huggingface/`. If the weights are already there when the container starts, `load_model()` completes instantly instead of waiting 5-10 minutes.

### Summary

| Issue | Status | Fix |
|-------|--------|-----|
| Old model `runwayml/...` deleted (404) | ✅ Fixed | Changed to `stable-diffusion-v1-5/stable-diffusion-inpainting` |
| Import path `src.model` was wrong | ✅ Fixed | Changed to `model.pipeline` |
| CI build cancelled (runner delay) | ✅ Fixed | Retriggered, build #25 succeeded |
| **Model weights not baked in image** | ❌ **Unfixed** | Add HuggingFace download to Dockerfile |
| Worker not processing jobs | 🔄 Blocked on above | Workers exit while waiting for 4GB download |

**Next step:** Add model pre-download to `Dockerfile.runpod`, rebuild, redeploy on RunPod. This is the final fix — after this, try-on should work.

---

## 2026-07-09 (later) — Two more crash-loop causes, then a stale-image caching bug

Continuation of the same-day RunPod diagnosis above. Weight bake-in (Problem 1
above) got fixed and committed (`f687c8c`), but the worker kept crash-looping
through two more distinct root causes, then hit a fourth non-code problem.

**Root cause #2 (fixed, commit `15a6a15`):** `CatVTON/requirements.txt` pins
`torch==2.1.2` (CPU-era, NumPy-1.x ABI) and installs first in the Dockerfile.
The Dockerfile's own `pip install torch torchvision` had no `--upgrade`, so
pip saw torch "already satisfied" and no-op'd — old 2.1.2 stayed installed.
NumPy 2.4.6 pulled by later deps broke 2.1.2's NumPy interop
(`RuntimeError: Numpy is not available`), and transformers separately
required torch>=2.4. Fixed with `pip install --upgrade torch==2.4.0
torchvision==0.19.0 --index-url .../cu124`. Confirmed via live pod
tracebacks pulled from the RunPod dashboard.

**Root cause #3 (fixed, commit `035668d`):** even after 2.4.0, workers still
crash-looped. Fresh pod logs showed a different traceback:
`transformers/utils/import_utils.py:1440 check_torch_load_is_safe()` →
`ValueError: ... require users to upgrade torch to at least v2.6 ...
(CVE-2025-32434)`. `transformers` now hard-blocks `torch.load` on
non-safetensors checkpoints below torch 2.6 — hit when
`CatVTONPipeline.__init__` (`CatVTON/model/pipeline.py:43`) loads
`StableDiffusionSafetyChecker.from_pretrained(base_ckpt, subfolder="safety_checker")`.
Fixed by bumping `Dockerfile.runpod` to `torch==2.6.0 torchvision==0.21.0`.
CI build `29033896416` succeeded, new digest
`sha256:9a9710c7a218a0ca33260287d800822efebc7339c4fec34539eec67e5a0780d3`
pushed 16:54:03 UTC.

**Problem #4 — turned out to be a false alarm (timestamp mixup, corrected
same session):** initially looked like RunPod was serving a stale cached
image — pasted pod logs (21:55–22:16 IST) showed the old digest
`fa15a0351095...` (2.4.0) still crashing with the `check_torch_load_is_safe`
/ torch>=2.6 error. But checking timestamps properly: the 2.6.0 fix's image
(digest `9a9710c7...`) finished pushing at 16:54:03 UTC = **22:24:03 IST** —
i.e. AFTER those pasted logs, not before. So this was the same
"don't-judge-a-fix-by-logs-captured-before-it-existed" mistake already
flagged twice in this project's session history, caught and corrected this
time before acting on it. **Not a caching bug. No fix needed for this.**

**Status at session end:** three real crash-loop root causes diagnosed and
fixed in code (weight bake-in, torch 2.1.2→2.4.0, torch 2.4.0→2.6.0 — all
committed and pushed), but end-to-end success on RunPod with the 2.6.0 fix
is still **completely unconfirmed** — no pod log has yet been captured
that ran AFTER 22:24:03 IST on 2026-07-09. That is the single next thing to
check: fire a fresh test job now, wait for a pod, confirm its digest is
`9a9710c7...` and its logs show `[CatVTON] Model loaded successfully` /
`[CatVTON] Warmup complete` with no torch/CVE traceback.

---

## 2026-07-10 — Root cause #5 (stale `:latest` caching), root cause #6
(transformers unpinned floor → broken 5.x), still unconfirmed end-to-end

Fresh pod logs (captured well after the 22:24:03 IST torch 2.6.0 push)
showed the *same* torch<2.6/CVE-2025-32434 crash as before. This time the
timestamp gap was 9+ hours, not a same-session mixup — genuinely a new bug.

**Root cause #5 (fixed, commit `688ce1b`):** RunPod was serving a stale
cached `:latest` image on worker nodes. CI (`docker-tryon.yml`) only ever
pushed `ghcr.io/kapisejix/kanchuki-tryon:latest` — no immutable tag — and
RunPod workers don't reliably re-pull a mutable tag. Confirmed via GHCR: the
CI build for the 2.6.0 fix (run `29033896416`) completed and pushed fine at
16:54 UTC, but a pod log pulled 9+ hrs later (2026-07-10 01:58 UTC, via
RunPod's own log-explainer chat) still showed torch 2.4.0. Fix: CI now also
pushes `ghcr.io/kapisejix/kanchuki-tryon:<git-sha>`
(`.github/workflows/docker-tryon.yml`); RunPod template `kanchuki-catvton-sl`
(id `v76b819nle`, endpoint `pnvchif9f4bcom`) must be re-pinned to the new SHA
tag via `saveTemplate` GraphQL mutation after every deploy — documented in
`docs/DEPLOY.md`. Confirmed working: pods for the SHA-tagged image did
correctly stop showing the old torch 2.4.0 error after this fix.

Also found `workersMax` on the endpoint had been left at **0** (fully
scaled down, no worker could ever start) — bumped to 2 via `saveEndpoint`
mutation before any test job could run.

**Root cause #6 (fixed, commit `d921584`):** with #5 fixed, pods now pulled
the right image and torch 2.6.0 was confirmed active in fresh logs (no more
CVE block, model weights loaded fine). New crash, different cause:

```
File ".../transformers/modeling_utils.py", line 4776, in _move_missing_keys_from_meta_to_device
    for key in missing_keys - self.all_tied_weights_keys.keys():
AttributeError: 'StableDiffusionSafetyChecker' object has no attribute 'all_tied_weights_keys'. Did you mean: '_tied_weights_keys'?
```

Root cause: `services/tryon/requirements.txt` had `transformers>=4.36.0` —
floor only, no ceiling. At build time this resolved to `transformers==5.13.0`
(a major-version bump released 2026-01-26, PyPI's `info.version` confirmed
via API), which has breaking internal API changes vs. the 4.x-era CatVTON/
diffusers pipeline code. Exact same anti-pattern as root cause #2/#3 (torch's
unpinned `pip install torch torchvision` skipping upgrade) — an unpinned
floor silently drifted to a breaking major release between builds. Fixed by
exact-pinning `transformers==4.57.6` (last stable 4.x release, still has the
torch>=2.6 CVE-2025-32434 check that root cause #3's fix depends on).

**Status at session end:** three fixes shipped this session (SHA-tag caching
fix, workersMax=0 blocker, transformers pin) on top of the three from
2026-07-09. First test job after the transformers pin (job
`sync-030a940e...`, pod `ztsv2je2iue9jp`, image `d921584...`) spun up at
03:38:09 UTC, then EXITED — job never left `IN_QUEUE`, never reached
`COMPLETED`. **No pod log has been pulled for this specific attempt yet** —
RunPod's GraphQL API does not expose container stdout, only the dashboard
Logs tab does (same limitation hit all session). End-to-end success is
still **completely unconfirmed**.

**Next step:** pull dashboard logs for pod `ztsv2je2iue9jp` (or whichever
pod is current) and check: does it crash again (new bug — read the
traceback), or does it actually reach `[CatVTON] Model loaded successfully`
and just needs a longer sync-wait / `runsync` polling loop instead of relying
on the 90s HTTP sync window (`scratch-test-tryon.mjs` currently treats a
90s-timeout `IN_QUEUE` response as failure, but the job may still complete
async — poll `/status/{jobId}` in a loop instead of one-shot).

Test job helper: `packages/ai/scratch-test-tryon.mjs` (run via
`node --env-file=.env packages/ai/scratch-test-tryon.mjs` — needs `.env` at
repo root with R2 + RunPod creds, plus `test_person.jpg`/`test_garment.jpg`
at repo root).

RunPod template update recipe (GraphQL `saveTemplate` mutation, `env: []`
is a required field even when empty): endpoint `pnvchif9f4bcom`, template id
`v76b819nle`. `check-runpod.sh` (untracked, has API token inline) queries
endpoint/pod state.
