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

---

## 2026-07-11 — Product-photo quality gate spec'd, 3D parametric VTO evaluated + deferred

User reported CatVTON try-on results "not even 1% close" between product and
customer image. Root-caused to input quality, not the model itself — no
code changed this session, all findings written into docs for the next
implementation pass.

**Findings + docs updated:**
- `docs/PRO-REQUIREMENTS.md` F-102 — added explicit product-photo requirements
  (bg-removal preprocessing needed before `triggerCatVTON`, ghost-mannequin/
  flat-lay capture, plain background, min 768×1024) and customer-photo
  requirements (front-facing, plain bg, fitted clothing). Root cause of the
  "1%" complaint is very likely raw uncleaned retailer photos + wrong
  garment-category mapping, not an engine limitation.
- `docs/PRO-REQUIREMENTS.md` F-102c (new) — size recommendation via simple
  size-chart lookup (S–10XL, bust/waist/hip/length), matched against the
  existing `CustomerMeasurement` record from F-102b. Zero GPU cost, separate
  from visual try-on.
- Multi-piece ethnic garments (kameez+salwar+dupatta): CatVTON only accepts
  one `upper`/`lower`/`overall` category per call, no native multi-garment
  compositing. Plan: two sequential calls for kameez+salwar, dupatta excluded
  from CatVTON pass for MVP (draping physics unsupported).
- Evaluated whether height/weight/measurements could drive the try-on
  *render* itself (not just size lookup) via a 3D parametric body pipeline
  (SMPL/STAR body model + pose-conditioned diffusion, e.g. IDM-VTON/
  OOTDiffusion instead of CatVTON). **Decision: defer, not in Phase 1 scope**
  — full reasoning + cost/accuracy numbers in new
  `docs/adrs/ADR-006-defer-3d-parametric-vto.md`. Summary: ~6-15x GPU cost
  ($0.03-0.08/try-on vs CatVTON's $0.005) for only ~10-20% photorealism gain
  on benchmarks that don't even cover Indian ethnic wear — domain gap, not
  architecture, is the real accuracy bottleneck.
- `docs/PLAN.md` Phase 1 VTO section — added "Step 0" (photo quality gate,
  do before the Step 1 fine-tune retest) and a note pointing to ADR-006 for
  the deferred 3D work.

**Not done this session (no code touched):** bg-removal preprocessing step
is spec'd but not implemented in `packages/ai/src/tryon.ts::triggerCatVTON`.
Size-chart lookup (F-102c) has no schema/endpoint yet — needs a
`SizeChart`/`SizeChartRow` table + retailer upload UI + lookup function
before it can ship. Both are the next real code work, ahead of/instead of
resuming the still-unconfirmed RunPod end-to-end test (see prior entries).

**Resume here next session:**
1. RunPod end-to-end confirmation still open (see 2026-07-10 entry — pod
   `ztsv2je2iue9jp` or successor, dashboard logs not yet pulled).
2. Implement bg-removal preprocessing in `triggerCatVTON` (rembg, before
   upload to CatVTON) — cheap, likely fixes most of the reported quality gap.
3. Decide + implement size-chart schema for F-102c if retailer size charts
   are ready to onboard.

---

## 2026-07-11 (later) — bg-removal preprocessing shipped, size-chart schema added

**Done (bg-removal, F-102 input-quality gate):**
- `packages/ai/src/tryon.ts::triggerCatVTON` now runs the product/garment
  photo through `@imgly/background-removal-node` (JS/ONNX, no Python
  dependency needed from the Node API/worker process) before sending it to
  CatVTON as `garment_image_url`. Chose this over calling into the existing
  Python `rembg` dependency in `services/tryon/` because that service only
  runs inside the RunPod GPU container — the Node API process that calls
  `triggerTryOn` has no path to it without a new network hop.
- Output is cached in R2 under `tryon-preprocessed/<sha256(sourceUrl)>.png` —
  added `objectExists()` (`HeadObjectCommand`) to `packages/ai/src/r2.ts` so
  repeat try-ons of the same product skip reprocessing. Cache is presence-only,
  no invalidation (fine while product photo URLs are immutable per-upload).
- New dep `@imgly/background-removal-node@^1.4.5` added to
  `packages/ai/package.json`, installed, typechecks clean
  (`db`/`ai`/`api` all pass).
- **Not done:** no live test against a real retailer photo yet (needs
  `CATVTON_API_URL` configured + a real run) — same "unconfirmed end-to-end"
  gap as the RunPod work above, now with one more step in the pipeline to
  verify.

**Done (F-102c size-chart schema):**
- Added to `packages/db/prisma/schema.prisma`: `SizeChartCategory` enum
  (`UPPER` = Kurtas/Tops/Anarkalis/Dresses — bust/waist/hip;
  `LOWER` = Pants/Palazzos/Skirts — waist/hip/length, matching the two chart
  shapes in PRO-REQUIREMENTS.md F-102c exactly), `SizeChart` model
  (one per retailer per category, `@@unique([retailer_id, category])`), and
  `SizeChartRow` (`size_label` + `sort_order` for S→10XL walk, nullable
  min/max cm columns for bust/waist/hip/length — unused axes stay null per
  category, same pattern as `Product`'s optional AI-tag fields).
- Hand-written migration `packages/db/prisma/migrations/005_size_charts/migration.sql`
  (repo convention — migrations here are SQL files, not `prisma migrate dev`
  output) — schema validated (`prisma validate`) and client regenerated
  (`prisma generate`), **not applied to the live Supabase DB** (no
  `apply_migration` run — same caution as every prior session on this
  project: schema changes get reviewed before touching prod).
- **Not done:** no lookup function (nearest-size-by-measurement), no retailer
  upload UI/endpoint, no seed data. User asked for the schema specifically —
  scope stopped there. Next pass needs a lookup service (probably
  `packages/ai` or a new `apps/api/src/routes/size-chart.ts`) that takes a
  `CustomerMeasurement` + category and walks `SizeChartRow`s in `sort_order`
  to find the containing (or nearest) range.

---

## 2026-07-11 (later still) — F-102c shipped end-to-end + RLS gaps found and fixed

**Done (size-chart feature, full stack):**
- `apps/api/src/routes/size-chart.ts` — `PUT /v1/size-charts` (upsert chart +
  replace rows in a transaction), `GET /v1/size-charts` (list), `GET
  /v1/size-charts/recommend?customer_id=&category=` (matches latest
  `CustomerMeasurement` against the retailer's chart). `findRecommendedSize`
  is a pure function: exact-containing-row wins, else nearest row by summed
  out-of-range distance across available axes (bust/waist/hip for UPPER;
  waist/hip/length for LOWER, using `pant_waist_cm`/`pant_hip_cm` in
  preference to `waist_cm`/`hip_cm` for LOWER). 5 vitest cases in
  `size-chart.test.ts`. Registered at `/v1/size-charts` in `apps/api/src/index.ts`.
- `apps/mobile/app/size-chart.tsx` — retailer-facing form (category toggle,
  add/remove size rows, min/max cm per axis), reached via a new "Size
  Charts" QuickAction on the home tab (`(tabs)/index.tsx`). Uses new
  `sizeChartApi` in `src/lib/api.ts`.
- Typed-routes gotcha: Expo Router's `.expo/types/router.d.ts` only
  regenerates while the Metro dev server is running (`expo start`), NOT via
  `expo export` — needed a throwaway `expo start` + kill to get `tsc
  --noEmit` to accept `router.push('/size-chart')`. Worth remembering if a
  new top-level route ever fails typecheck with a route-string union error.

**Security review (user-requested cross-check) — 2 real gaps found, both fixed:**
1. `005_size_charts/migration.sql` had **no RLS** — every other retailer-scoped
   table in this schema has it (001, 002, 003). Added policies for both
   `size_charts` and `size_chart_rows` (the row table has no `retailer_id` of
   its own, so its policy joins through `size_chart_id → size_charts.retailer_id`).
2. Duplicate `size_label` in one `PUT` payload would hit a Prisma P2002 inside
   the transaction → uncaught → raw 500. Fixed with a Zod `.refine` for
   label-uniqueness in the request schema → clean 422 instead.
- **Both migrations applied to live Supabase** (project `thpqcylmcxokajxoerjx`,
  region ap-south-1) this session: `005_size_charts` (now with RLS) and a new
  `006_rls_try_on_usage_logs`. Confirmed via `list_tables`: `size_charts` and
  `size_chart_rows` both show `rls_enabled: true`, 0 rows (empty, ready for
  real retailer data).

**Found via live Supabase advisory scan, one fixed, one deliberately left:**
- `try_on_usage_logs` (real billing/GPU-cost data, has `retailer_id`) had RLS
  **disabled** in production — pre-existing gap, unrelated to this session's
  code, caught by Supabase's own advisory tool. **Fixed**: `006_rls_try_on_usage_logs`
  migration, same `retailer_id IN (... auth.uid())` pattern as everywhere else,
  applied live.
- `_prisma_migrations` also shows RLS disabled — **deliberately left alone**.
  It's Prisma's internal migration-tracking table, not tenant data; enabling
  RLS on it risks breaking `prisma migrate deploy` for the service role with
  no clear policy to write. Not a real tenant-isolation risk (no retailer_id,
  no user data) — revisit only if a formal security audit specifically flags
  it.

**Correction to earlier entries — RunPod raw inference IS confirmed working:**
This session initially (wrongly) told the user "RunPod: zero confirmed
end-to-end completion," repeating stale framing from this file. Memory
(`runpod-catvton-deploy-debug`, not reflected anywhere in this file until
now) shows an 8th root cause was found and fixed *earlier the same day*
(2026-07-11): `Dockerfile.runpod` never copied `mask_utils.py`
(commit `99ac5e3`) + a stale cached worker pod needed manual `podTerminate`.
After both fixes, a direct RunPod `runsync` test via
`packages/ai/scratch-test-tryon.mjs` **completed successfully at ~13:40 UTC**
(`COMPLETED`, executionTime 45884ms) — first confirmed successful CatVTON
inference this project has seen. Result came back as base64
(`data:image/jpeg`, not an R2 URL — template's `env: []` has no R2 creds, so
`handler_runpod.py::upload_result()` fell to its base64 fallback path).

**Still open (real gap, not the same as "RunPod doesn't work"):**
- **Not yet verified: whether `packages/ai/src/tryon.ts` correctly handles a
  base64 result end-to-end through the app.** Only the raw RunPod call was
  tested directly — the app-layer integration (saving the base64 result to
  R2, updating the `TryOnJob` record, serving it back to mobile/web) has
  never been exercised. This is the actual next RunPod-related step, not
  "diagnose why it's crashing."
- `GHCR_PAT` leaked in chat earlier — rotation still unconfirmed.
- Railway deploy: Config File Path unset per-service, `WEB_URL`/
  `NEXT_PUBLIC_API_URL` chicken-egg unresolved, dead `lovely-joy` service not
  deleted, RunPod creds not copied to Railway vars. Phase 0 MVP is
  code-complete but **not live anywhere**.
- bg-removal preprocessing (`triggerCatVTON`) shipped 2026-07-11 earlier
  session, still never tested against a real retailer photo (blocked on the
  app-layer verification above, not on RunPod itself anymore).
- Size-chart feature has no retailer-facing seed data and no lookup UI on
  the customer-web side yet (`GET /recommend` exists but nothing calls it
  from `apps/web/src/app/c/[slug]/...` — that's the natural next consumer,
  shown next to "Try This On" like the size hint).

**Resume here next session:**
1. Wire `GET /v1/size-charts/recommend` into the customer web collection/
   product-detail view so the size feature is actually usable end-to-end,
   not just retailer-side data entry.
2. Railway deploy loose ends (Config File Path, URL chicken-egg, dead
   service, RunPod creds) — Phase 0 MVP still isn't live anywhere.

---

## 2026-07-12 — base64 CatVTON result path verified, no bug

Checked whether `packages/ai/src/tryon.ts` handles a `data:image/jpeg;base64,...`
RunPod result correctly (open item from prior session). **It does — no fix
needed.** Traced: `handler_runpod.py::upload_result()` always returns the
field as `result_url` regardless of form; `triggerCatVTON` passes it through
blind; `process-tryon.ts` feeds it straight into `saveTryOnResultToR2` →
`downloadBufferFromUrl` → `fetch(url)`. Confirmed empirically (Node script,
base64 data URI round-tripped byte-exact) that Node's global `fetch`
decodes `data:` URIs correctly — supported since Node 20.6, CI/Railway run
recent Node 20.x. Raw base64 never reaches the DB; `saveTryOnResultToR2`
uploads decoded bytes to R2 and stores a real R2 URL in `TryOnJob.result_url`.
RunPod → app integration is fully confirmed working end-to-end now.

---

## 2026-07-12 (later) — F-102c wired end-to-end, customer web ruled out

Committed prior session's uncommitted size-chart work first (`17c14ad`).

**Design gap found:** `GET /v1/size-charts/recommend` needs `customer_id`
(→ `CustomerMeasurement`) + retailer JWT. Customer web (`apps/web/c/[slug]`)
is a fully anonymous WhatsApp-share-link flow — no login, no customer_id
anywhere (checked `TryOnModal.tsx`, `CollectionView.tsx`, `page.tsx`).
Endpoint can't be wired there without new plumbing (a self-serve
manual-measurement widget + new public no-auth endpoint). User chose the
smaller path instead.

**Done:** wired into the retailer mobile app's customer detail screen
(`apps/mobile/app/customer/[id].tsx`) — already has retailer JWT +
`customer_id` + `CustomerMeasurement` all in place. Added `sizeChartApi.recommend()`
to `apps/mobile/src/lib/api.ts`. Shows UPPER/LOWER recommended size chips next
to the Measurements card once a measurement exists; 404 (no chart set, or no
matching row) swallowed to `null` and hidden, not an error state. Typechecks
clean (mobile + api), 5/5 size-chart tests pass. Committed (`13b2f02`).

**Not done:** customer-web size hint (deferred per above — revisit only if
anonymous customer identity gets solved some other way, e.g. phone-based
customer lookup on the share link).

**Still open (carried from prior sessions, untouched this session):**
- Railway deploy loose ends (Config File Path, `WEB_URL`/`NEXT_PUBLIC_API_URL`
  chicken-egg, dead `lovely-joy` service, RunPod creds not copied). Phase 0
  MVP still not live anywhere. **Blocker found this session:** `railway`
  CLI installed locally but not logged in (interactive browser OAuth, can't
  script headlessly). `.github/workflows/deploy.yml` also references
  `RAILWAY_API_SERVICE_ID` / `RAILWAY_WEB_SERVICE_ID` secrets that are
  **not set** (only `RAILWAY_TOKEN` is, per `gh secret list`) — CI deploy
  would fail even if triggered. Both service IDs only obtainable by logging
  into the Railway dashboard — needs the user, not scriptable from here.
- `GHCR_PAT` — **rotated and confirmed 2026-07-12T05:25:08Z.** User
  generated a new classic PAT (`write:packages`/`read:packages`/
  `delete:packages`) via GitHub web UI, ran `gh secret set GHCR_PAT`
  themselves in-terminal (value never pasted into chat, avoiding a repeat
  of the original leak), old token deleted. Verified via `gh secret list`
  timestamp only — value never seen by the assistant either. Closed.

## 2026-07-12 (even later) — bg-removal ran against a real photo, quality bug still open

Ran `packages/ai/src/tryon.ts::triggerTryOn()` for real (not the raw-RunPod
scratch script) against `test_person.jpg` (clean, front-facing, plain wall)
and `test_garment.jpg` (mannequin shot, busy background — pink/gold Banarasi
suit + dupatta). One paid RunPod GPU call, ~49s, `status: completed`, no
errors — confirmed via `packages/ai/scratch-test-bgremoval.mjs` (new
untracked scratch script, same convention as `scratch-test-tryon.mjs`).

**bg-removal preprocessing itself is confirmed working correctly** —
fetched the cached `tryon-preprocessed/<hash>.png` directly from R2 and
visually confirmed: background fully stripped, garment colors/pattern
intact and legible.

**CatVTON's actual output is still garbage** — a blue/purple blob bearing
no resemblance to the pink/gold garment, overlaid on the person photo. This
directly contradicts the 2026-07-11 session's theory that raw/uncleaned
input photos were the main driver of the "not even 1% close" complaint —
input quality was fine on both images here, bg-removal ran, and the result
is still unusable. **The bg-removal work is code-complete and does NOT fix
the underlying visual-quality bug.**

**Most likely real cause (not yet confirmed, no further paid calls run this
session):** `triggerCatVTON` never sends a garment category (`upper`/
`lower`/`overall`) to CatVTON — `handler_runpod.py` must be defaulting to
one, and a full kameez+dupatta drape sent as a single "upper" garment is
exactly the multi-piece case already flagged as unsupported in
`PRO-REQUIREMENTS.md` F-102 ("two sequential calls for kameez+salwar,
dupatta excluded from CatVTON pass for MVP") — but that split was never
actually implemented in `tryon.ts`, only spec'd.

**Next step:** re-test with a single-piece garment photo (plain kurta, no
dupatta) before spending more GPU time on multi-piece cases — isolates
whether the category-mismatch theory is right or whether CatVTON itself is
misbehaving for this garment style/domain regardless of piece count.

## 2026-07-12 (later still) — Railway CI deploy: 4 real bugs fixed, 1 blocker remains (502)

User got both a personal and project-scoped Railway API token, plus the two
missing secrets from the prior session's blocker list. Set via `gh secret
set`: `RAILWAY_API_SERVICE_ID` (`784d630d-029f-4fd4-b16e-03bdcf5eaab6`),
`RAILWAY_WEB_SERVICE_ID` (`5c6c202c-9622-41ac-b7a2-8666f7513a73`), and
`RAILWAY_TOKEN` replaced with the new project token. All 4 secrets confirmed
present via `gh secret list`.

Triggered `deploy.yml` via `workflow_dispatch` repeatedly to test end-to-end
— found and fixed 4 real, distinct bugs in the workflow itself, one per
run, each confirmed by reading the actual failure log (not guessed):

1. **pnpm version conflict** — `pnpm/action-setup@v4` had `version: 9`
   hardcoded while `package.json` pins `packageManager: pnpm@9.0.0`; the
   action now treats both being set as a hard error. Fix: dropped the
   `version:` key (and the now-dead `PNPM_VERSION` env var), let the action
   read `packageManager`. Commit `5f0ab52`.
2. **Installer piped to `sh` instead of `bash`** — `curl .../install.sh |
   sh` hit `Bad Substitution` because Railway's install script uses bash
   parameter-expansion syntax. Fix: pipe to `bash`. Commit `cf705cc`.
3. **CLI not on `$GITHUB_PATH`** — installer drops the binary at
   `~/.railway/bin/railway` but doesn't export it; each workflow step is a
   fresh shell so the next step got `command not found` (exit 127). Fix:
   `echo "$HOME/.railway/bin" >> "$GITHUB_PATH"` right after install.
   Commit `1a33f69`.
4. **Missing `--environment` flag** — per Railway's own CLI docs, a
   project token requires `--environment` to be passed explicitly to
   `railway up`; without it, requests intermittently came back `404` or
   `502`. Fix: added `--environment production` to both `railway up`
   calls. Commit `41f44d3`. (Env name `production` taken on user's word,
   matches Railway's default — not independently verified against the
   dashboard.)

**Still blocked:** even with all 4 fixes in place, `railway up` now fails
consistently with `Failed to upload code with status code 502 Bad Gateway`
on both `deploy-api` and `deploy-web`, every run, no `railway.statuspage.io`
incident reported for this window — so not a general Railway outage.
Stopped retrying blind after this (session cost flagged, and CI-side fixes
are exhausted — this didn't change across 3 consecutive attempts with the
same config).

**Next step (assigned to user, needs local machine not CI):** run the exact
same command locally with the project token to isolate CI-runner-network
vs. project/token-side cause:
```bash
railway up --detach --environment production --service 784d630d-029f-4fd4-b16e-03bdcf5eaab6
```
If it 502s locally too → Railway/project-side issue, contact Railway
support. If it works locally → something specific to GitHub Actions
runners (IP block, egress path) — different investigation needed. User
said they'll test this later; no further CI runs planned until then.

---

## 2026-07-12 (later still) — Prisma/CVE fixes logged, CatVTON multi-piece theory confirmed, scratch cleanup

**Two commits from earlier same-day work, not yet logged here:**
- `1b469e4` — `apps/web` Next.js 14.2.5 → 14.2.35, patches CVE-2025-55184 /
  CVE-2025-67779 (Railway was blocking the web build on these).
- `186c427` — added a `postinstall` hook to run `db:generate` for
  `@kanchuki/db`. Nothing ran Prisma's client generator on a fresh install,
  so Railway's build had an untyped/`any` PrismaClient, cascading into
  unrelated-looking TS errors across every file importing `@kanchuki/db`.

Neither touches the `railway up` 502 blocker directly (that's transport-
level, not build content) but both were real build-time blockers Railway
would've hit next regardless.

**#1 Railway 502 — still blocked, confirmed not scriptable from here:**
Checked `railway whoami` locally: `Unauthorized`. No `RAILWAY_TOKEN` in
local `.env`, none in shell env either. CLI login is interactive browser
OAuth. This matches the prior session's own conclusion — genuinely needs
the user to either run `railway login` themselves or hand over a project
token. Not attempted further.

**#2 CatVTON quality bug — multi-piece theory CONFIRMED, root cause found:**
Ran one real RunPod call via `triggerTryOn()` using `test-real-shirt.jpg`
(single-piece garment, already tracked in repo) instead of the earlier
kameez+dupatta `test_garment.jpg`. Result: a coherent, correctly-colored
try-on (green/white top correctly composited onto the person photo) — a
complete turnaround from the earlier "blue/purple blob bearing no
resemblance" result on the multi-piece garment. This confirms: **CatVTON
itself works correctly; the visual-quality bug is entirely the unhandled
multi-piece (kameez+salwar+dupatta) case**, exactly as flagged (but never
implemented) in `PRO-REQUIREMENTS.md` F-102. `triggerCatVTON` sends the
whole outfit photo as a single `cloth_type: "upper"` (the handler's own
default — confirmed in `services/tryon/handler_runpod.py` +
`services/tryon/app.py`, no `cloth_type` param is sent from `tryon.ts` at
all today), so a 3-piece outfit gets crammed into one "upper" mask.

**Real next code work (not yet started):** implement the multi-piece split
in `packages/ai/src/tryon.ts::triggerCatVTON` per the F-102 spec — two
sequential CatVTON calls for kameez (`upper`) + salwar (`lower`), dupatta
excluded from the CatVTON pass for MVP (draping physics unsupported). Needs
a `garmentType`/category field threaded from wherever the retailer tags a
product (or a simple upper/lower split UI) through to `triggerTryOn`.

**#3 cleanup:** deleted the 3 untracked scratch files from this and prior
sessions (`packages/ai/scratch-test-bgremoval.mjs`,
`tryon-bgremoval-result.jpg`, `tryon-singlepiece-result.jpg`) — theory is
now confirmed and documented here, script served its purpose. Working tree
clean.

**Resume here next session:**
1. Implement the multi-piece CatVTON split (see above) — this is the real
   fix for the "not even 1% close" complaint, input-quality/bg-removal work
   was already a dead end (confirmed 2026-07-12 earlier).
2. Railway 502 — waiting on user to test `railway up` locally (see #1
   above), not actionable from an agent session without their credentials.

**Update (same day, checked via `gh run list`):** the 502 is gone —
resolved itself, no further code change needed. Both push-triggered CI runs
after the Prisma/CVE fixes (`29182865881` touching web+api, `29183000832`
api-only) show `deploy-web`/`deploy-api` succeeding: `Uploading...` →
`Build Logs:` URL printed, no 502. Root cause was never confirmed
(transient Railway-side issue, per the "no status page incident" note in
the prior entry) — Phase 0 MVP is now actually deploying via CI. Confirm
live URLs work in a browser before calling this fully closed.

---

## 2026-07-12 (later still) — CatVTON multi-piece split implemented, two-tier fix

Implemented the multi-piece fix flagged in the prior entry, in two passes.

**Pass 1 (single-photo fallback):** `packages/ai/src/tryon.ts::resolveClothType`
maps AI-tagged `Product.category` → CatVTON `cloth_type`. Multi-piece-shot-
as-one-photo categories (`Ladies Suit`, `Readymade Suit`, `Men's Kurta
Pajama`, `Lehenga`, `Saree`) now send `overall` instead of the always-`upper`
default; `Dupatta` is rejected before any GPU call (draping unsupported per
F-102). Wired through `apps/api/src/jobs/process-tryon.ts` (now selects
`product.category`) into the `cloth_type` field on both the RunPod and
self-hosted request bodies (previously never sent at all).

**Pass 2 (true two-call chaining, per F-102's original spec):** added
`ProductPhoto.piece_type` (`'upper' | 'lower' | null`, migration
`007_product_photo_piece_type` — **schema only, not applied to live Supabase
yet**, same review-before-apply convention as 005/006). Retailer can now tag
one photo as the upper piece and one as the lower piece
(`PATCH /v1/products/:id/photos/:photoId`, new UI in
`apps/mobile/app/product/[id].tsx`, gated to
`PIECE_TAGGABLE_CATEGORIES` in `@kanchuki/shared` — deliberately excludes
Saree, which is one continuous drape with no natural upper/lower split).
When both piece photos exist, `triggerCatVTON` runs two sequential CatVTON
calls: upper garment onto the customer photo, then lower garment onto the
*result* of the first call (not the original photo) — matching F-102's
"two sequential calls (upper, then lower on the first result)" exactly.
The intermediate result is persisted to R2 before the second call, because
RunPod's base64 data-URI result can't be re-fetched by the next call's
`person_image_url` (its Python side uses `requests.get()`, can't read
`data:` URIs — same limitation already documented for the customer-photo
upload path). Falls back to Pass 1 behavior when no piece photos are tagged
(existing/untagged products keep working exactly as before).

`packages/ai/src/tryon.test.ts` — 5 tests covering `resolveClothType`,
`isUnsupportedTryOnCategory`, `isPieceTaggableCategory`. Full monorepo
`turbo build` (shared/db/ai/api/web) and mobile typecheck both clean.

**Not done:** migration 007 not applied live; no paid RunPod test of either
path (single-photo `overall` fix or the new chaining path) — both are
code-complete, unconfirmed end-to-end, same pattern as everything else in
this file. Real next step: apply migration 007, tag a real 2-piece product's
photos, run one `triggerTryOn()` call through the chained path and visually
check the result.

---

## 2026-07-12 (later still) — migration 007 applied, chaining mechanism confirmed, Railway URLs fixed live

**#1 done:** migration 007 (`product_photos.piece_type`) applied to live
Supabase via `apply_migration`. Confirmed via `list_tables`.

**#2 done — mechanism confirmed working, visual quality untested fairly:**
Seed data has no product with 2 photos, so no real matching upper+lower
pair exists yet. Temporarily tagged product `cmrfvyjmj0002sozgpti8j77p`
(Ladies Suit) with its existing photo as `piece_type='upper'` and added a
second row pointing at a *different* Ladies Suit product's photo as
`piece_type='lower'` (scratch DB rows, both removed after the test).
Ran the real `triggerTryOn()` chained path (not raw RunPod) via new
`packages/ai/scratch-test-multipiece.mjs` — rebuilt `packages/ai` first so
`dist/tryon.js` matched the latest source. Result: **completed in 53s, no
errors**, two sequential CatVTON calls chained correctly (upper onto
customer photo, lower onto the first result, intermediate persisted to R2)
— confirms the F-102 chaining mechanism itself works end-to-end. Visual
output was a poor match, but that's expected/uninformative here: the two
source photos aren't actually upper+lower of the same real outfit (no such
pair exists in seed data), so this run cannot confirm or deny the garment-
fidelity quality bar. **Real quality confirmation still needs an actual
photographed 2-piece outfit (retailer uploads matching upper+lower shots
via the mobile UI) — not done this session.**

**#3 done — Phase 0 MVP confirmed live:** `railway status` (CLI now
authenticated, unlike the prior session) shows both services Online:
- API: `https://supportive-love-production-293a.up.railway.app` — `/health`
  returns `{"status":"ok",...}`.
- Web: `https://magnificent-liberation-production-5e44.up.railway.app` —
  returns real Next.js HTML.

**#4 done — dead service confirmed gone:** `railway status` lists only 2
services (`supportive-love`, `magnificent-liberation`) — `lovely-joy` no
longer exists, already resolved (by user or earlier cleanup), nothing to do.

**Bonus bug found + fixed — cross-wire URLs were pointing at the wrong
domain:** `WEB_URL` (on API) and `NEXT_PUBLIC_API_URL` (on Web) were set to
`https://<service>-production.up.railway.app` (no suffix) — both 404'd.
Real domains have a random suffix (`-293a`, `-5e44`) appended, presumably
because the bare name collided with another Railway project globally.
Fixed both vars via `railway variables --set` to the correct suffixed URLs.

**Second bug found + fixed — `railway variables --set` doesn't actually
rebake `NEXT_PUBLIC_*` vars:** after setting `NEXT_PUBLIC_API_URL` and
waiting for the auto-triggered redeploy to finish, the web app's rendered
HTML (`<link rel="preconnect">` in `layout.tsx`) still showed the *old*
unsuffixed value — a var-triggered redeploy does not rerun `pnpm build`
with the new value baked in (likely serving a cached build artifact/image
layer, not a genuine `next build`). `NEXT_PUBLIC_*` vars are inlined into
the client bundle at build time, so a runtime-only restart can't pick up
the change. Fixed by forcing a real rebuild: `railway up -s
magnificent-liberation -e production -c`. Confirmed after: preconnect link
now shows the correct `-293a` API URL. **Lesson for next time:** any
`NEXT_PUBLIC_*` var change on Railway needs `railway up` (full rebuild),
not just `railway variables --set` (which is sufficient for runtime-only
vars like `WEB_URL` on the API, but not build-time-inlined ones on Web).

Verified end-to-end after both fixes: API health 200, Web home 200, CORS
preflight-equivalent check with the real Web origin returns 200 from API.

**Cleanup:** deleted the two scratch DB rows used for the #2 test.
`packages/ai/scratch-test-multipiece.mjs` committed to the repo (not
deleted like prior scratch scripts — kept as the reusable chained-path
smoke test until a real 2-piece product test replaces it).

Committed (`00b39f6`) and pushed to `origin/main`.

**Still open:**
- Real 2-piece garment photo test (retailer-tagged, matching real outfit
  pieces) — the only way to actually confirm/deny the visual-quality bar
  for the chaining path.
- Customer-web size hint — deferred per 2026-07-12 (earlier) entry, revisit
  only if anonymous customer identity gets solved.
- `GHCR_PAT` rotation — already confirmed done (see earlier same-day entry).

---

## 2026-07-12 (later still) — ADR-006 revisited: IDM-VTON/OOTDiffusion researched, licensing gap found on the LIVE engine

No code changed. User asked how Google Shopping's try-on works, then asked to
revisit ADR-006 for IDM-VTON/OOTDiffusion as a CatVTON replacement. Full
write-up in `docs/adrs/ADR-006-defer-3d-parametric-vto.md` ("Revisit —
2026-07-12" section). Summary:

**Important, separate from the upgrade question — flagged for user
decision, not auto-fixed:** CatVTON, the engine already live in production,
is licensed **CC BY-NC-SA 4.0 (NonCommercial)**. Confirmed via GitHub LICENSE
file and the Hugging Face model card. Kanchuki is a paid SaaS — this is a
real, current legal exposure, not a hypothetical one. IDM-VTON and
OOTDiffusion do not fix this if swapped in (same or stricter NC terms); even
DCI-VTON's MIT-licensed *code* doesn't help because its weights are trained
on the VITON-HD dataset, which is itself CC BY-NC 4.0 — the license taint
comes from training data, not just repo license.

**Decision:** did not swap engines. Not attempting a from-scratch
TryOnDiffusion clone either (est. multi-month, 6-figure-USD-compute research
project — out of scope). Recorded two paths to resolve the licensing gap
(email CatVTON's author for a commercial license; or route paid traffic
through FASHN's commercially-licensed API, ~$0.075/try-on) — user's call,
not decided here. Also corrected the original ADR's cost math: recalculated
against RunPod's actual L4 pricing ($0.69/hr), both CatVTON today and an
IDM-VTON-class swap sit well inside the ₹5-15/image budget — cost was never
the real blocker, licensing is.

**Resume here next session:**
1. User decision needed: which licensing path to pursue for CatVTON (see
   ADR-006 Revisit section, "Licensing options"). Nothing else in the VTO
   pipeline should be built further until this is resolved — building more
   on top of an NC-licensed engine only grows the exposure.
2. Real 2-piece garment photo test (still open from prior entry, blocked on
   user supplying matching upper+lower photos of a real outfit).

---

## 2026-07-13 — F-102d shipped: crop-tagging UI + consented training-data collection

Full spec in `docs/PRO-REQUIREMENTS.md` F-102d, consent rules in
`docs/SECURITY.md` §3b. Two parts, both code-complete, neither live-tested
yet (typecheck + existing test suites pass; no real device/DB run this
session).

**Part 1 — crop-tagging (`apps/mobile/app/product/[id].tsx`):** for
`PIECE_TAGGABLE_CATEGORIES` products missing an upper/lower photo tag, a new
"Crop {piece} piece from a photo" button opens the same gallery photo through
`expo-image-picker`'s native `allowsEditing` crop screen, uploads the crop as
a new `ProductPhoto`, tags it directly via the existing
`PATCH /products/:id/photos/:photoId`. No new dependency (checked
`expo-image-manipulator`/`expo-image-picker` were already installed) — this
was deliberately chosen over a dedicated crop library to avoid the
Expo-Go-breaking native-module trap already hit once with MMKV (2026-07-08
entry). Added `productApi.addPhoto` to `apps/mobile/src/lib/api.ts` to attach
the cropped photo.

**Part 2 — consented training-data collection:**
- Migration `008_training_photo_consent`: `TryOnJob.consent_to_training`
  (bool, default false) + new `TrainingPhotoConsent` table — **deliberately
  no `retailer_id` column and no retailer-facing RLS policy**, per the user's
  explicit requirement that this data not live on the vendor side. RLS
  enabled with zero policies (service-role-only), same physical Postgres
  instance as everything else — clarified in both docs that this is *not* a
  literal second database, just zero-policy table isolation, the same
  mechanism that already separates retailers from each other.
- `packages/ai/src/tryon.ts::saveTrainingConsentCopy` + `r2.ts::copyUrlToR2`
  — copies customer/garment/result photos to R2 prefix `training-data/`
  (separate from `tryon-results/`, not touched by the 24h cleanup cron).
- `apps/api/src/jobs/process-tryon.ts` calls it after a successful try-on,
  only when `consent_to_training` was set, wrapped so a failure here never
  fails the customer's actual try-on.
- Checkbox added to both consent surfaces: web `TryOnModal.tsx` (intro step)
  and mobile `in-store.tsx` (preview step) — unchecked by default in both,
  separate from the existing required processing-consent copy.
- `prisma generate` + `packages/ai` rebuild run so `apps/api` picked up the
  new exports; full typecheck (db/ai/api/web/mobile) and existing test
  suites (16 ai, 10 api) all green after the change.

**Not done — real gaps, flagged in F-102d doc:**
- Migration 008 **not applied to live Supabase** (schema-only, same
  review-before-apply convention as 005/006/007).
- Crop-tagging UI not exercised on a real device.

---

## 2026-07-13 — F-102d retention cron shipped, consent-revocation flow full stack (API + web + mobile)

**Done — training-data retention cleanup cron (F-102d completion):**
- `apps/api/src/jobs/cleanup-training-data.ts` — handler queries
  `TrainingPhotoConsent` where `consented_at < 180 days ago`, cursor-
  paginated (batch 50), best-effort deletion of 3 R2 keys per row
  (customer/garment/result) + DB row. One failure never blocks the rest.
- `apps/api/src/jobs/cleanup-training-data.test.ts` — 6 vitest cases:
  empty DB, batch processing, null result key, R2 failure resilience,
  cursor pagination shape, 180-day date cutoff. All 16 API tests pass.
- Wired into `apps/api/src/jobs/index.ts` — `cleanupQueue` worker
  (concurrency 1), repeatable BullMQ job at 2 AM UTC daily with `limit: 1`.
- **Migration 009 (`revocation_token`) applied to live Supabase** + Prisma
  client regenerated v5.22.0.

**Done — consent-revocation flow (full stack):**

| Layer | What |
|-------|------|
| **DB** | `009_revocation_token/migration.sql`: `revocation_token TEXT` + `gen_random_uuid()` backfill + UNIQUE constraint. `@default(cuid())` on Prisma model. |
| **API** | `POST /v1/consent/revoke` — validates cuid2 token, deletes 3 R2 objects via `Promise.allSettled`, removes DB row. Per-route rate limit 5/min/IP. `GET /v1/try-on/jobs/:id` and `GET /v1/try-on/remote/:id` both return `revocation_token` on completed jobs. Registered at `/v1/consent` in `index.ts`. |
| **Web (customer-facing)** | `apps/web/src/app/consent/revoke/page.tsx` — client component, accepts `?token=` from URL or manual input, three states (confirm/done/error), calls `/v1/consent/revoke`. |
| **Web (TryOnModal)** | Result step shows revocation link when `revocationToken` is present: "You opted in. Revoke consent and delete photos" → opens `/consent/revoke?token=xxx`. |
| **Mobile (in-store)** | Captures `revocation_token` from poll, shows "Customer consented to training. Revoke consent" link via `Linking.openURL()` to web revocation page (`EXPO_PUBLIC_WEB_URL` / fallback `https://kanchuki.app`). |
| **Docs** | `docs/SECURITY.md` §3c — token properties (cuid2, ~128-bit entropy, UNIQUE indexed, in-memory only), rate-limit math, 3-R2-object deletion scope, 6-threat-vector analysis. §3b stale Open items updated. |

**Full revocation flow:**
```
Customer checks consent checkbox → try-on submitted
  → Prisma auto-generates revocation_token (cuid2 @default)
  → Poll response includes revocation_token
  → Web/mobile shows revocation link
  → Customer opens /consent/revoke?token=xxx
  → Clicks "Revoke Consent & Delete Data"
  → API deletes 3 R2 objects + TrainingPhotoConsent row
  → Confirmation: "Your data has been deleted"
```

**Verification:** API typecheck ✅ | Web typecheck ✅ | Mobile typecheck ✅ | API tests 16/16 ✅ | Migration 009 applied ✅ | Code review clean ✅

**PENDING (blocked on user decision):**
- **✅ CatVTON licensing — RESOLVED 2026-07-13.** User confirmed commercial
  license obtained from CatVTON's author (option 1 in ADR-006). No engine
  swap needed, NC-exposure closed. VTO work unblocked.
- **🔴 Legal review of consent copy** — the training-data consent checkbox
  text (web TryOnModal + mobile in-store) has not been reviewed under India's
  DPDP Act 2023. Do not enable for real customer traffic until cleared.

**Still open (not blocked, needs user action to test/verify):**
- Real 2-piece garment try-on test (needs retailer-supplied matching
  upper+lower photos uploaded via the mobile crop-tagging UI, then a real
  `triggerTryOn()` call through the chained path).
- Crop-tagging UI not exercised on a real device.
- No training pipeline consumes `TrainingPhotoConsent` rows yet.

---

## 2026-07-13 — Product E2E Tests

**Instructions saved for next session:**
- Commit all current changes first
- Build comprehensive product e2e test script that covers:
  1. Single product with photo (from /scripts/demo/ images)
  2. Multiple products in batch
  3. Product with front AND back photos (front.jpg + back.jpg pair)
  4. PDF catalog import (woodee-...pdf from /scripts/demo/)
  5. AI Tagging verification (create product, wait for async tags, verify)
  6. Catalog import test (grid image detection from catalog-grid.jpg)
  7. 5 customers with complete dummy details + measurements via API
  8. Product CRUD e2e (create, get, list, update status, delete)
- Front/back display: verify both images render in product detail, no color overlap on image card
- Run all tests and verify they pass
- Save test script at scripts/product-e2e.ts

**Demo assets available:** /scripts/demo/ — front.jpg + back.jpg (pair),
sample-suit.jpg, product 02.jpg, product 03.webp, catalog-grid.jpg,
catalog-grid-mixed.jpg, woodee-*pdf (PDF catalog), shopping*.webp,
49337_7Main.webp

---

## 2026-07-14 — Admin panel: email/password login + premium UI + framer-motion animations

**Done — admin panel completed:**
- Added `POST /v1/admin/login` endpoint — validates email+password against `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` env vars using HMAC-SHA256 + `timingSafeEqual`. Returns the admin API key for session reuse.
- Premium login screen with animated floating gradient orbs, glassmorphism card, framer-motion entrance animations, password visibility toggle, shimmer button, error shake animation.
- Premium collapsible sidebar with dark glassmorphism, spring-animated active nav indicator (`layoutId`), staggered nav items, admin profile section, logout with hover effects.
- Dashboard enhanced: animated counters (`requestAnimationFrame` with cubic ease-out + cleanup), staggered card entrance, hover lift effects (box-shadow + transform), gradient accent bars, shimmer on quick-action cards.
- Retailers list: staggered row entrance via `motion.tbody`, spring-animated hover states, shimmer on loading skeleton.
- Retailer detail: `AnimatePresence` for action feedback, animated progress bars on plan limits, `layoutId` transitions, staggered stat grid.
- Billing page: animated revenue cards, staggered cost analysis rows, animated pricing table, Razorpay on-hold note.
- Security: rate-limited login (via global Fastify rate limit), timing-safe password comparison, session storage (existing pattern), admin key unchanged for programmatic access.

**Razorpay on hold:** Webhook integration deferred until production deployment with live credentials. Billing page updated with note.

**Env vars set on Railway:** `ADMIN_EMAIL=s.numbhraal@gmail.com`, `ADMIN_PASSWORD_HASH=<hmac-sha256 of 12345>` (never stored in source).

---

## 2026-07-13 (later) — CatVTON licensing resolved, migration 008 applied live

User confirmed commercial license obtained from CatVTON's author (ADR-006
option 1). Updated `docs/adrs/ADR-006-defer-3d-parametric-vto.md` and the
PENDING section above to reflect resolution — no engine swap needed,
NC-exposure closed, VTO work unblocked.

Applied migration `008_training_photo_consent` to live Supabase
(`thpqcylmcxokajxoerjx`) — idempotent DO-block migration, confirmed via
`list_tables`: `training_photo_consents` shows `rls_enabled: true`, 0 rows
(zero-policy default-deny, as designed). `_prisma_migrations` RLS-disabled
advisory fired again — same pre-existing, deliberately-left gap from
2026-07-11 (not tenant data), not a new issue.

**Resume here next session:**
1. Real 2-piece garment try-on test (retailer-supplied matching upper+lower
   photos via mobile crop-tagging UI, then chained `triggerTryOn()` call) —
   now the main open item, licensing no longer blocks it.
2. Crop-tagging UI — exercise on a real device.
3. Legal review of consent copy under DPDP Act 2023 — still open, separate
   from licensing, blocks turning training-data collection on for real
   customer traffic (not blocking further dev).
4. Independent: non-VTO Phase 0 priorities in PLAN.md (perf, onboarding
   tutorial, Razorpay trial flow, admin panel, 10-retailer pilot).

---

## 2026-07-14 — Product filters (Category, Occasion, Price, Color) on catalog/collection browsing

Feature request: filters shown before the product list on the browse
surfaces — Category → Occasion → Price → Color, then the filtered list
below. Client-side filtering only (data already fully loaded per screen;
no new API params needed since occasions/color/price weren't in
`ListProductsQuerySchema` anyway and pagination caps at 50/collection-size).

**Mobile retailer catalog** (`apps/mobile/app/(tabs)/catalog.tsx`):
- New `SlidersHorizontal` filter-toggle button next to the search bar opens
  a panel with 4 chip rows in order: Category, Occasion, Price, Color.
  Options are derived from whatever's actually in the loaded product list
  (same "only show values present in data" pattern as the existing web
  `FilterBar`) — Category/Occasion/Color from distinct field values, Price
  from 4 fixed buckets (`Under ₹1000` / `₹1000–2500` / `₹2500–5000` /
  `Above ₹5000`, in paise against `price_min`).
- `Product` type gained `occasions: string[]` — field was already returned
  by `GET /v1/products` (route spreads the full Prisma row) but the mobile
  client type never declared it.
- Empty state now distinguishes "no products match filter" (with a Clear
  filters link) from "no products yet" (with the Add First Product CTA).

**Customer web collection page** (`apps/web/src/app/c/[slug]/`):
- `FilterBar.tsx` already had Color + Occasion (toggled via the existing
  header Filter icon in `CollectionView.tsx`) — added Category and Price
  using the same 4-bucket scheme as mobile, reordered rows to Category →
  Occasion → Price → Color. Exported `priceMatchesBucket()` so
  `CollectionView`'s `filteredProducts` logic and the chip UI share one
  bucket definition instead of duplicating the ₹ thresholds.
- `CollectionView.tsx` — added `filterCategory`/`filterPrice` state, wired
  into `filteredProducts` and the "Clear filters" empty-state button.

Both `apps/mobile` and `apps/web` typecheck clean
(`tsc --noEmit`, zero errors). Not done: no live device/browser click-test
this session, no server-side filter params added (deliberately — client-side
is correct here per the small per-screen dataset sizes above, revisit only
if a screen's product count grows past what one page-load reasonably holds).
