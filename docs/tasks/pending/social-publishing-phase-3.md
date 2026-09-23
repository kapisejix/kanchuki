# F-031 Social Publishing — Phase 3/4 (open items) — PENDING
> Extracted 2026-09-23 from `docs/PRO-REQUIREMENTS.md` (lines 1623–1655). Pending — not built.

Phase 1–2 (Facebook + Instagram + composer) are built — see `docs/tasks/done/social-create-post-composer.md`.

### 23.5 Phased build plan

**Phase 1 — Facebook foundation (simplest API, no business-account barrier):**
- Meta OAuth connect for a Facebook Page (retailer picks which Page; token stored via F-012 encrypted secrets)
- Token expiry tracking + one-tap re-auth
- Single-product post: select product → preview → post to Facebook Page
- Post history (what was posted, when, link to the live post)
- Meta app review submission for `pages_manage_posts` (parallel with build)

**Phase 2 — Instagram + richer posts: ✅ BUILT + LIVE 2026-09-04** — the Social Create-Post Composer (`docs/tasks/social-create-post-composer.md`) supersedes this phase's piecemeal scope with one shipped whole:
- Instagram Business connect + **multi-target fan-out**: one composer screen posts to *every* connected FB/IG account (`POST /v1/retailers/me/social/posts`, per-target dispatch, partial-success results)
- Multi-product **carousel** posts (migrations 090/092) + single photo/video + link-card posts
- **Auto-generated captions**: templated server-side captions + admin-curated **Post Templates** (plan-gated, `usage_count`) + **Caption AI** (`POST /v1/growth/social/caption-suggest` — `@kanchuki/ai`, debounced composer prefill, always fail-open)
- Per-platform CTA: Instagram → no clickable caption links handled per-platform; Facebook → clickable collection link (server-owned link resolution)
- 5 composer entry points: Settings → Social Media Post button, product detail header, AI Studio result, collection detail header, Growth hub tile
- **Review findings 1–5 all fixed (2026-09-05, task doc §12):** (1+2) idempotency — the fan-out route dedupes on `socialPost` rows in addition to the Redis marker (a concurrent twin or Redis-down retry replays instead of double-posting; a P2002 reconcile upgrades FAILED twin rows when our publish actually landed — no 500), and the composer reuses `client_post_id` across retries of an unchanged payload (re-mints only after a definitive outcome); (3) IG posts store the real Graph `permalink` (shared `fetchIgPermalink`, fail-open — never fabricated `/p/<media-id>`); (4) only `MetaApiError` messages persist/surface (DB/network internals sanitized to a generic line) and a live post is never recorded FAILED when the history-row write blips (Phase 2 `createPostedRowWithRetry` → transient 500 + idempotent retry); (5) IG captions clamped to 2,200 chars at the platform boundary (`clampIgCaption`, code-point aware) and IG video→photo fallbacks record the photo actually posted in the media snapshot.
- **Non-API fallback for personal-account retailers**: still open (personal IG has no Business API path — documented tradeoff)

**Phase 3 — Automation & attribution:**
- ~~"Post to all connected accounts"~~ — **delivered by the fan-out composer** (2026-09-04); Google Business Profile sharing stays with F-022's shared engine when that ships
- Opt-in auto-post on new arrivals (mirror of F-022; default OFF, preview-first, never silently auto-post) — still open
- UTM-tagged collection links (`?utm_source=instagram&utm_campaign=...`) for visit attribution — still open

**Phase 4 — Stretch (decide later):** Instagram Stories link sticker, YouTube Shorts, scheduling (draft + pick time).

### 23.6 Usability requirements

- Settings → Social Media: Meta-branded connect flow (login popup → pick Page) with zero developer jargon; status shown (connected account name, post count)
- Composer: product multi-select grid (reuse existing pickers) → live post preview (caption + image) → editable caption → Post
- Post success: "Posted ✓ View on Instagram" linking to the live post
- Failure states: token expired → "Reconnect to continue posting" (one tap, no data loss); API error → human-readable message + retry
- **Every post is a deliberate retailer action** (or an explicit preview-first auto-publish toggle). No surprise posting.

