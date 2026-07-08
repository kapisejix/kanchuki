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

**Next:**
- Build CatVTON Python microservice (`services/tryon/`)
- Update `packages/ai/src/tryon.ts` to support self-hosted CatVTON
- Fine-tune CatVTON for Indian ethnic wear after deployment (Step 2)
- Deploy to production (Railway API + CatVTON on RunPod)
