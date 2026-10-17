# F-044 Enquiry Basket → Team Inbox — Release 1 build plan

Spec: `docs/tasks/pending/enquiry-basket-team-inbox-and-instore-tryon.md` (§3, §8, decisions §11.1, release plan §11.7).

## State (2026-10-17)

| Task | Status | Branch / commit |
|---|---|---|
| T1 E7 try-on role pin (test) | ✅ pushed, in PR #95 | `feat/enquiry-r1-t1-staff-test` `eb631d8a` |
| T2 E6 customer try-on off | ✅ pushed, PR #95 (→ main) | `feat/enquiry-r1-t2-customer-tryon-off` `f637773a` |
| T3 E1 product_ids + RC-066 mask | ✅ pushed, PR #96 (→ T2 branch, stacked) | `feat/enquiry-r1-t3-enquiry-products` `40c08d62` |
| T4 E2 web "Send my picks" | ✅ pushed, PR #97 (→ T3 branch, stacked) | `feat/enquiry-r1-t4-send-picks` `36fc9bf7` |
| T5 E3 inbox + Take | ✅ pushed, PR #98 (→ T4 branch, stacked) | `feat/enquiry-r1-t5-inbox` `757ca746` |
| T6 E4-lite badge | ✅ pushed, PR #99 (→ T5 branch, stacked) | `feat/enquiry-r1-t6-badge` `783f4f86` |
| T7 E5 whatsapp_number routing + RC-067 | ✅ built (PR stacked on T6) | `feat/enquiry-r1-t7-whatsapp-target` |

- Migration `130_enquiry_inbox` APPLIED in prod 2026-10-17 by owner (verified: 3 columns, backfill unbackfilled=0, `kanchuki_app` privilege true). It was a precondition for T3 deploy (enquire writes `product_ids`).
- Gate baseline: `security.test.ts` + `staff-access.test.ts` = 20 passed. Full API suite: 1784 passed; `src/lib/retired-tryon-guard.test.ts` times out under full-suite load only (8/8 alone) — known flake, not ours.
- Error helper `validationError` returns **422** (not 400); tests assert 422.

## Worktree mechanics

- Stack each task on the previous branch:
  `git worktree add ../enquiry-r1-tN -b feat/enquiry-r1-tN-<name> <prev branch>` (run from current worktree), then `EnterWorktree` with the path.
- New worktree needs: `pnpm install --frozen-lockfile --prefer-offline`, then
  `pnpm --filter @kanchuki/shared --filter @kanchuki/db --filter @kanchuki/ai build`.
  After schema edits: `pnpm --filter @kanchuki/db exec prisma generate` + `pnpm --filter @kanchuki/db build` (no DB touched).
- GateGuard hook blocks the first Edit/Write per file until facts are stated (importers, affected symbols, data files, user instruction). State them, retry.

## Owner answers (closed — do not reopen)

- D1–D8 as in spec §11.1.
- Q1: owner Take stores `retailer.id` in `assigned_staff_id` (no FK); name shown = `retailer.owner_name ?? 'Owner'`. Staff Take stores `Staff.id` (add `request.staffId` decoration in `auth.ts` staff branch).
- Q2: passport `POST /try-on/withdraw` stays live. Only `GET /passport/try-on/consent` 404s (done in T2).
- Q3: T7 routes enquiries to `retailer.whatsapp_number ?? phone` (enquire route + public collection payload), plus copy + warning when `whatsapp_number` empty.
- Q4: F-044 (PRO-REQUIREMENTS §41 exists, has a per-task status table).
- Q5: RC-066 row added to CLAUDE.md (done in T3).

## Remaining tasks (one PR each; show diff, wait for "apply"; stop + report after each, wait for "next")

### T4 — E2 customer web "Send my picks to the store"
- Web proxies `apps/web/src/app/api/c/[slug]/enquire/route.ts` and `apps/web/src/app/api/[store]/[collection]/enquire/route.ts` — mirror the sibling `view/route.ts`, pass status + JSON through.
- `WishlistView.tsx`: button "Send my picks to the store" → ONE POST with localStorage ids ∪ passport `/api/passport/wishlist` rows for this retailer; open `whatsapp_url`; non-200 → old client `wa.me` link (pseudo-slug pages 404; also covers T3's 422 for a since-deleted product); sync `useRef` in-flight guard (RC-015); disabled at 0 picks.
- Tests: proxy forwards status/body; empty → disabled; double click → 1 fetch; 404 fallback; other retailer's passport items excluded.
- Gates: web typecheck + lint + the new tests.

### T5 — E3 Enquiries inbox + Take
- `apps/api/src/routes/collections.ts`, static routes registered BEFORE `/:id`:
  - `GET /enquiries` — retailer-scoped, newest first, masked phone (reuse `maskEnquiry` already in collections.ts), products with names/photo, `assigned_to {id,name}`.
  - `GET /enquiries/unread-count` → `{ count }` of NEW only.
  - `POST /enquiries/:id/take` — `updateMany` CAS `where assigned_staff_id: null` → 200; other retailer → 404; already mine → 200; taken by someone else → 409 `ENQUIRY_TAKEN` "Being handled by <name>".
  - `PATCH /enquiries/:id/assign` — owner + manager only.
- `auth.ts` salesperson allowlist, exact lines only: `POST /v1/collections/enquiries/:id/take`, `PATCH /v1/collections/:id/enquiries/:enquiryId`. Manager needs nothing new (`*`). Default-deny stays.
- Mobile: api fns in `apps/mobile/src/lib/api/collections.ts`, new `apps/mobile/app/enquiries.tsx`, `staff-can.ts` keys `'enquiries'` + `'enquiries.assign'`.
- Tests: concurrent take → one 200 one 409; same actor twice 200; owner take; salesperson assign 403; cross-retailer 404; masking; staff-access default-deny still holds.
- ecc:security-review.

### T6 — E4-lite home badge
- `apps/mobile/app/(tabs)/index.tsx`: poll unread-count every 30000 ms only while focused.
- Tests: counts NEW only, drops after SEEN, payload keys exactly `['count']`, interval cleared on unmount.

### T7 — E5 WhatsApp target
- Route enquiries to `retailer.whatsapp_number ?? phone` in the enquire route + public collection payload; shared Business number / linked-devices copy; warning when `whatsapp_number` empty. Tests for both targets.

## Per task

superpowers:test-driven-development (fail first, quote RED), superpowers:verification-before-completion (quote real output), ecc:code-review before PR.
Gates: `pnpm --filter @kanchuki/api typecheck`; in `apps/api`: `npx vitest run src/routes/security.test.ts src/plugins/staff-access.test.ts`; new tests; web/mobile typecheck + lint when touched.
Docs same PR: task file §11.7 progress line, `docs/tasks/README.md` F-044 row, PRO-REQUIREMENTS §41 status row, BUILD-LOG `docs/build-log/part-6.md`, RC entry + CLAUDE.md row if a bug is fixed.

## Hard rules

No migrations applied, no deploys, no `railway up`, no prod access, no full customer phone to staff via API, no phone in logs/payloads, staff allowlist stays default-deny. Ask before push/PR.
