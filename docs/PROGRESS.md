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
