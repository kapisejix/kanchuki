# Progress Log

One file, update at end of each work session: what's done, what's next, what's blocked. Check `git log -1` and this file first thing each session.

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
  - `packages/ai/src/tryon.ts` — FASHN API service (trigger, poll, save result)
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

**VTO Strategy Change:**
- Decided to replace paid FASHN API ($0.075/try-on) with **self-hosted CatVTON** ($0.005/try-on)
- CatVTON Python microservice not yet built — this is the next task
- Decision documented in PLAN.md, TECH-STACK.md

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
- The `packages/ai/src/tryon.ts` already supports dual-engine: CatVTON (primary, self-hosted) with FASHN API fallback.

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
