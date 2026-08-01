# Kanchuki — Hosting & App Store Launch Guide

Brief reference: where to host web (frontend + admin), where to host API/DB, and steps to launch mobile app on Play Store + App Store. Cheap vs best comparison included. No implementation steps here — see `docs/DEPLOY.md` for the actual Railway deploy commands (already locked-in choice).

---

## 1. What needs hosting

| Piece | What it is | Notes |
|---|---|---|
| Web frontend (customer PWA + marketing site) | Next.js 14 app, `apps/web` | SSR needed, not static-only |
| Web admin panel | Same Next.js app, `apps/web/src/app/admin/*` | Not a separate deploy — same service as web frontend |
| Backend API | Node.js + Fastify, `apps/api` | Needs long-running server (not serverless-only) |
| Retailer mobile app | React Native (Expo), `apps/mobile` | Not "hosted" — built + submitted to app stores |
| Database | PostgreSQL 16 + pgvector | Supabase (primary) |
| Deletion Vault DB | Separate Postgres, INSERT-only | Currently Railway Postgres |
| Redis | Cache/queue/session | Upstash |
| Image storage | Cloudflare R2 | Object storage, not a "server" |
| VTO engine | Fashion V-Tone v1.5, CPU-only | Self-hosted alongside API, currently Railway |

---

## 2. Web frontend + admin — hosting comparison

Admin panel lives inside the same Next.js app, so it hosts on the same service — no separate cost/step.

| Host | Cost (small scale) | Fit for Next.js SSR | Notes |
|---|---|---|---|
| **Railway** (current pick) | ~$5–20/mo | Good | Already wired, one project hosts API+Web+DB together, simplest ops for a 2-service monorepo |
| **Vercel** | Free tier, then ~$20/mo (Pro) | Best-in-class (built by Next.js authors) | Fastest SSR/ISR, but pricier at scale, no built-in Postgres/Redis — you'd still need Supabase+Upstash |
| **Cloudflare Pages/Workers** | Cheapest at scale (generous free tier) | Good, needs Next-on-Cloudflare adapter | Best India latency (Cloudflare edge PoPs), but SSR adapter adds setup friction |
| **Render** | ~$7–25/mo | Good | Similar to Railway, slightly less polished DX |

**Recommendation:** stay on Railway (already deployed, zero migration cost, one dashboard for API+Web+DB). Reconsider Vercel only if SSR latency becomes a real complaint — not now, MVP traffic doesn't need it.

---

## 3. Backend API — hosting comparison

| Host | Cost (small scale) | Notes |
|---|---|---|
| **Railway** (current pick) | ~$5–20/mo | Same project as Web, PostgreSQL/Redis plugins available, good India-adjacent latency via Singapore region |
| **Render** | ~$7–25/mo | Comparable, free tier sleeps (bad for API — cold starts kill mobile app UX) |
| **Fly.io** | Pay-as-you-go, cheap at low scale | Good global edge placement, more ops knowledge needed (Dockerfile-first) |
| **DigitalOcean App Platform** | ~$5–12/mo | Predictable pricing, less automatic than Railway |
| Raw VPS (Hetzner/DO Droplet) | Cheapest ($4–6/mo) | You manage everything — Docker, SSL, restarts, monitoring. Not worth it pre-PMF |

**Recommendation:** Railway. Cheapest-that's-actually-cheap is a VPS, but the ops overhead isn't worth it until traffic/cost forces the move — revisit only past ~500 active retailers.

---

## 4. Database, Cache, Storage — already decided, no change needed

- **Primary DB:** Supabase Postgres (includes Auth + pgvector) — free tier covers MVP, paid tier ~$25/mo when needed.
- **Deletion Vault DB:** separate Railway Postgres instance, INSERT-only role — already provisioned (`docs/INFRA-SETUP.md`).
- **Redis:** Upstash — free tier covers MVP queue/cache volume.
- **Image storage:** Cloudflare R2 — cheapest object storage with zero egress fees (important since product photos get viewed a lot).

These are already the cheap-and-best picks for this project size — no comparison needed.

---

## 5. Mobile app — this is NOT a "hosting" decision

React Native/Expo apps aren't hosted on a server the way a website is. Two separate things happen:

1. **The app binary** gets built (via Expo Application Services / EAS Build, cloud build service, ~$0–29/mo depending on build volume) and submitted to Google Play + Apple App Store as a package.
2. **The app's backend** is just your existing API (Railway) — the mobile app talks to `api.kanchuki.app` like the web app does. No separate mobile server needed.

**EAS (Expo Application Services)** is the standard path: handles code signing, builds, and store submission from one CLI, without needing a Mac for iOS builds. Free tier has monthly build limits; paid plan (~$29/mo) removes queue waits — fine to start free.

---

## 6. Launching on Google Play Store (Android)

| Step | What to do | Cost/time |
|---|---|---|
| 1. Google Play Console account | Register as developer (individual or org) | $25 one-time fee |
| 2. App listing | Title, description, screenshots (min 2, phone + optional tablet), feature graphic, privacy policy URL (required — host a simple page) | Free |
| 3. Content rating questionnaire | Fill in Play Console — determines age rating | Free |
| 4. Data safety form | Declare what data the app collects (photos, phone number for OTP, location if used) — required, Google checks this against actual app behavior | Free |
| 5. Build production binary | EAS Build produces a signed `.aab` (Android App Bundle) | Included in EAS |
| 6. Upload + internal testing track | Upload the `.aab`, test with a small internal group first | Free |
| 7. Submit for review | Move to production track, submit | Free |
| 8. Review time | Typically 1–3 days for new apps (can be longer for first submission) | — |

Total hard cost: **$25 one-time**. Everything else is free/time.

---

## 7. Launching on Apple App Store (iOS)

| Step | What to do | Cost/time |
|---|---|---|
| 1. Apple Developer Program enrollment | Individual or Organization (org needs D-U-N-S number, takes longer) | **$99/year** |
| 2. App Store Connect listing | Name, description, screenshots (per device size — iPhone 6.7", 6.5", iPad if supported), privacy policy URL, privacy "nutrition label" (data collection disclosure) | Free |
| 3. Build production binary | EAS Build produces a signed `.ipa` — no Mac needed, EAS handles Apple certs/provisioning | Included in EAS |
| 4. TestFlight beta (recommended) | Upload build, test with internal/external testers before public release — catches rejections early | Free, part of the process |
| 5. Submit for App Review | Submit via App Store Connect | Free |
| 6. Review time | Typically 1–3 days, first submission sometimes longer; Apple's review is stricter than Google's — expect at least one rejection round for things like missing privacy details or demo account for login-gated apps | — |
| 7. Demo account for reviewers | Since retailer app needs phone OTP login, provide Apple reviewers a way in (test phone number with fixed OTP, or a reviewer bypass) — **without this, near-guaranteed rejection** | Plan this before submitting |

Total hard cost: **$99/year**.

---

## 8. Cost summary — cheapest path to "live on both stores + hosted"

| Item | Cheapest viable option | Monthly-equivalent cost |
|---|---|---|
| Web + Admin + API hosting | Railway | ~$10–20/mo combined |
| Database | Supabase free tier | $0 (until scale) |
| Redis | Upstash free tier | $0 |
| Image storage | Cloudflare R2 | ~$0–2/mo at MVP volume |
| Mobile builds | EAS free tier | $0 (limited monthly builds) |
| Google Play | One-time | $25 once |
| Apple Developer | Annual | $99/year (~$8.25/mo) |
| **Total to launch** | — | **~$15–30/mo + $124 one-time-ish** |

This matches what's already locked in `CLAUDE.md`'s Tech Stack table — no change recommended, this doc is the "why," not a new decision.
