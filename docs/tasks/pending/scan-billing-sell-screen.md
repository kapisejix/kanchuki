# Scan & Sell billing screen (multi-item counter sale)

**Opened:** 2026-11-14 · **Status:** 🟨 Approved 2026-11-14 (owner answered all §10 questions), nothing built · **F-number:** F-047 (proposed, unassigned) · **Priority:** closes the "stale catalog after an in-shop sale" gap for busy counters

> **Start here:** §10 holds the owner's decisions, §11 is the step-by-step task list (tick each box as it lands), §13 is the prompt for a fresh session.

Builds on F-025 Scan-to-Sell (`docs/PRO-REQUIREMENTS.md` §15, `apps/mobile/app/product/scan.tsx`) and per-size stock (`docs/tasks/pending/product-stock-quantity.md`, migration 137). Read both before building.

---

## 1. What the retailer wants (owner words, condensed)

Retailer adds a product, SKU is generated, retailer writes the SKU on the physical article. When the retailer or a team member sells articles, they open a **billing screen**, scan each article's SKU (or type it if the scan fails), see the list of everything scanned, and tap one button to **sell all**. Every listed article is then marked sold in the catalog.

Purpose: keep the catalog true after in-shop sales. Not a GST invoice, not a payment tool.

## 2. What already exists (do not rebuild)

| Piece | Where | Reuse |
|---|---|---|
| SKU generated per product, unique per retailer | `apps/api/src/lib/sku.ts`, `@@unique([retailer_id, sku])` | as is |
| SKU exact-match lookup | `GET /v1/products?sku=` (uppercased, **no owner gate**, staff can use) | as is |
| Camera barcode/QR scan + manual SKU box | `apps/mobile/app/product/scan.tsx` (`expo-camera`, qr/ean/code128/code39/upc/pdf417) | extract the camera + manual-entry part, keep the scan loop |
| "Print Tag" SKU+QR label | product detail screen (`react-native-qrcode-svg`) | as is, so the written/printed SKU matches what the scanner reads |
| Mark one product sold | `PATCH /v1/products/:id/status` (`products-crud.ts:366`, zeroes stock when SOLD) | logic reused server-side |
| Per-size stock | `product_stock`, `lib/product-stock.ts` (`writeStock`: total 0 -> SOLD, >0 on SOLD -> AVAILABLE) | the sale decrements this |
| Offline queue | `apps/mobile/src/lib/mutation-queue.ts` (single product + status only) | needs a new entry type, see §6 |
| Staff access | status route is un-gated; `staff-can.ts` | new route must stay un-gated for staff |

**Gap F-025 leaves:** one product per scan, then it jumps into the product detail screen. Selling 4 articles = 4 scan -> open -> tap SOLD -> back loops. This feature replaces that with one scan session and one confirm.

## 3. The core design question: article vs product vs size

An SKU identifies a **product (design)**, not one physical piece. A product can hold several sizes and several units (`product_stock`: e.g. S:1, M:3, L:2, all under one SKU like `LS0042`). So "sell this SKU" is ambiguous:

- Selling a M of `LS0042` must **not** mark the whole product SOLD, only reduce M by 1.
- The product becomes SOLD only when the **total across all sizes hits 0** (this rule already exists in `writeStock`).

Decision proposed (needs owner confirm, §10 Q1): **each scan adds one unit of that SKU to the bill.**
- Product has one size or is unsized (`FREE`): line is added directly, qty 1.
- Product has several sizes in stock: after the scan a small size chooser appears (only sizes with quantity > 0). Retailer taps the size sold. Scanning the same SKU+size again increments the line qty (capped at stock).
- Product **not tracked** (no stock rows, old products): treated as qty 1, sale marks the product SOLD, exactly like today's toggle.

This keeps behaviour identical to what the retailer sees on the product screen, and nothing marks a design sold while units remain.

## 4. User flow

1. Entry: new **"Sell"** button on the Catalog tab header (next to the existing scan icon) and a Home shortcut. Existing scan icon stays (F-025 single scan for "just look this up").
2. Billing screen opens in **camera-on-top, bill-list-below** layout. Camera keeps scanning continuously.
3. Each successful scan: haptic + short toast "Added LS0042", row appears in the list. Same SKU scanned within ~1.5 s is ignored (debounce, a tag in frame fires repeatedly).
4. Scan fails or tag is unreadable: type SKU in the input at the bottom, tap Add (same lookup).
5. SKU not in catalog: inline red row "LS0099 not found", never silently dropped; retailer can remove it.
6. List row shows: photo thumbnail, name, SKU, size, qty stepper (- / +), price, remove (x). Footer: article count, **total price** (sum of `price_min`, informational only, see §10 Q3).
7. Already `SOLD` / zero stock product scanned: row shown with a warning "Already sold" and excluded from the sale (retailer can remove). Prevents double-selling the same article from a stale list.
8. **"Mark N items sold"** button (disabled when the list is empty or any row has an unresolved size). Confirm sheet: "Mark 4 articles as sold? This updates your catalog." -> Confirm.
9. Result screen: "4 marked sold" with any per-line failures listed (e.g. stock changed meanwhile). Buttons: Done, New bill.
10. Leaving the screen with an unsold list asks "Discard this bill?" (list is in memory only).

## 5. API

One new route so a whole bill is **one atomic request** (4 separate PATCHes can half-apply):

`POST /v1/products/sell`

```
{ client_bill_id: string,            // uuid from the phone, idempotency key
  lines: [{ product_id, size, quantity }]   // size = 'FREE' for unsized/untracked
}
```

Server, in one `$transaction`:
- for each line: ownership check (`retailer_id` from the session, same product-ownership rule as RC-139), product not soft-deleted.
- tracked product: `UPDATE product_stock SET quantity = quantity - n WHERE product_id = ? AND size = ? AND quantity >= n` (the atomic decrement the stock spec was designed for). 0 rows updated -> line fails with `INSUFFICIENT_STOCK`.
- after decrement: recompute total, set `products.status = SOLD` when total is 0 (reuse the `writeStock` tail, extract a shared `applyStatusFromTotal(tx, productId)` rather than copy it).
- untracked product: set `status = SOLD` (as the status route does today).
- Response: per-line `{ product_id, size, ok, remaining_total, status, error? }`. Partial success is allowed per line (one stale line must not block the other three); each product's writes stay inside one transaction so no half-written product.

Rules:
- **No owner-only gate.** Staff must sell at the counter. Copy the existing status route's access, not the trash routes' (the exact trap PRO-REQUIREMENTS §15 warns about). Confirm delegate behaviour (§10 Q5).
- Limits: max 100 lines per request, rate limit like other product writes, zod schema with `@kanchuki/shared` size constants (no hand-copied lists, RC-128).
- Idempotency: `client_bill_id` stored (see §7) so an offline replay or a double-tap cannot decrement twice.
- Redis public-cache for storefronts must be invalidated for touched products (same hook the status route uses; verify when building).
- No schema change needed for the decrement itself.

## 6. Mobile

- New screen `apps/mobile/app/product/sell.tsx` (name TBD), built from the `scan.tsx` camera block. Use `KeyboardScreen` for the manual field (RC-116/RC-042 guard requires it for any screen with a `TextInput`) and `useScreenInsets`.
- Bill state in `useReducer`, in memory. Lookup per scan reuses `productApi.list({ sku, limit: 1 })`; add a small in-session SKU->product cache so a repeat scan costs nothing.
- Guard double-submit with a `useRef` busy flag (RC-015/RC-135 pattern), not state alone.
- Errors through `showError`/`apiMessage` (RC-117/RC-122), never a bare `catch {}` (RC-136 shape).
- **Offline:** the SKU lookup needs the network today. For a counter with poor signal:
  - v1: scan works only for products already in the cached catalog list (react-query persisted cache, `offline-persister.ts`); lookup tries cache first, then network. Confirming a sale while offline queues the **whole bill** as one `PendingSellMutation { client_bill_id, lines }` in `mutation-queue.ts` (new entry kind beside `PendingStatusMutation`), replayed by `useSyncQueue`, 4xx dropped per `isRetryable`. The idempotency key makes the replay safe.
  - Cache may be stale, so the replay result can include per-line failures; surface them ("2 of 4 items could not be updated"), not silently.
- Success: invalidate the products list query and each touched product detail so the Catalog shows SOLD / lower stock immediately.
- Accessibility: labels on scan frame, stepper, remove, confirm; 44 pt touch targets; respect Reduce Motion.

## 7. Data / audit decision (open)

Minimal v1 needs **no new table**: decrement + status only. But three things need a durable record:
1. **Idempotency** of `client_bill_id` (offline replay).
2. **Who sold what, when** (staff accountability, "undo last bill", disputes).
3. Future hooks: sales analytics, GST invoice for offline sales (explicitly deferred in F-025), enquiry -> sold attribution.

**Decided: add table `product_sales`** (migration number = next free one, check `packages/db/prisma/migrations`; owner applies it, never the agent).

| Column | Type | Notes |
|---|---|---|
| `id` | text pk | cuid |
| `retailer_id` | text | RLS column |
| `bill_id` | text | = `client_bill_id` from the phone |
| `product_id` | text FK -> products | |
| `size` | text | size sold, or `FREE` |
| `quantity` | int CHECK > 0 | |
| `unit_price` | int nullable | paise, snapshot of the product's `price_min` at sale time (not editable in v1) |
| `sold_by_staff_id` | text nullable, no FK | `Staff.id` (retailer staff; `TeamMember` is the platform team). null = owner. **Built as `sold_by_staff_id`, migration 158.** |
| `undone_at` | timestamptz nullable | set by Undo, rows are never deleted |
| `created_at` | timestamptz | |

- `UNIQUE (retailer_id, bill_id, product_id, size)` (built; retailer-scoped because `bill_id` comes from the phone) is the idempotency guard: a replayed bill hits the constraint and returns the stored result instead of decrementing again.
- **Redis layer (§10 Q4b):** before the transaction, `SET sell:{retailer_id}:{bill_id} NX EX 86400`. Key already exists -> return the stored result (or 409 "bill in progress" if still running). Reuse the shared short-fail ioredis pattern (`awaitRedisReady()`, RC-155 era handshake race) and treat Redis errors as "skip the fast check", never as "allow a second sale". On a failed transaction delete the key so the retailer can retry.
- Index `(retailer_id, created_at)`, index `(product_id)` (built; the `(bill_id)` index is covered by the unique key's prefix).
- RLS on `retailer_id` (project convention: every retailer table). No DELETE grant for `kanchuki_app` (RC-049); Undo sets `undone_at` and adds the stock back.
- Check `docs/DATABASE.md` first and update it in the same session.

## 8. Edge cases to handle explicitly

- Same article scanned twice by mistake (qty 2 of a size with only 1 left): capped at stock, line shows "Only 1 in stock".
- Two staff selling the last piece at once: the `quantity >= n` conditional update means exactly one wins, the other gets `INSUFFICIENT_STOCK`.
- Soft-deleted product, or an SKU belonging to another retailer: not found (ownership filter), never leaked.
- SKU written in lower case / with spaces: trim + uppercase before lookup (existing behaviour).
- Camera permission denied: manual SKU entry still works (screen must not be camera-only).
- Product `RESERVED` / `NOT_SURE`: allowed to sell, status goes to SOLD.
- Re-listing a sold product afterwards: existing Edit stock flow already does it (stock > 0 -> AVAILABLE).
- Long bills (50+ lines): `FlatList`, footer pinned.

## 9. Out of scope (v1)

GST invoice / PDF / WhatsApp bill to customer, payment mode, discounts, customer attach, returns/exchange, printing the bill, customer-side stock display, multi-store. The price total on screen is informational only. Each is a natural follow-up once `product_sales` exists.

## 10. Owner decisions (2026-11-14)

| # | Question | Decision |
|---|---|---|
| 1 | Unit model | **Scan = one unit of a size**; size chooser when the design has several sizes in stock. |
| 2 | Offline selling | **Cached products only** in v1 (lookup cache first, then network); bill queued and replayed. Never-synced products are not sellable offline. |
| 3 | Price line | **Yes to the default:** footer shows the total of listed prices, informational only. Price is **not editable** per line in v1; `product_sales.unit_price` stores a snapshot of the product's `price_min` at sale time. |
| 4 | Audit table | **Both options:** (a) add the durable `product_sales` table (§7) **and** (b) a Redis idempotency key `sell:{retailer_id}:{bill_id}` (24 h TTL) as a fast first check, so a double-tap or replay is rejected before touching Postgres. The table's `UNIQUE (bill_id, product_id, size)` stays the source of truth if Redis is down (fail-open to Postgres, never fail-open to a double sale). |
| 5 | Who can sell | Owner, manager, salesperson **yes**; catalog-upload and support delegates **no** (shared `isDelegate()` check, RC-142/RC-068). |
| 6 | Undo | **Yes**, 10-minute "Undo last bill" (restores stock from `product_sales`). |
| 7 | Plan gating | **All plans**, no `plan_features` key. |

Clarified by the owner 2026-11-14: the "both options" answer was for Q4, not Q3.

## 11. Task list (do in order, one task per PR, tick when merged)

Ground rules for every task: branch from `main` (`feat/f-047-<task>`), invoke the listed skills **before** writing code, tests first where marked, run tests/tsc/biome **locally** before every push (GitHub Actions minutes are used up), no deploys or migrations by the agent, check `docs/root-cause/root-cause issues.md` before editing. API tests: `pnpm --filter @kanchuki/api test`; mobile: `pnpm --filter @kanchuki/mobile test` + `tsc --noEmit`.

### T0. Approve + number the feature  ·  ~15 min
- [ ] Owner assigns the F-number (proposed F-047), confirm §10 table has no wrong assumption.
- Skills: none. Output: this doc's header updated.

### T1. Migration + schema `product_sales`  ·  ~0.5 day  ·  ✅ done 2026-11-14 (PR #261)
- [x] Read `docs/DATABASE.md`, `docs/SECURITY.md` (RLS + grants), RC-049/RC-162 (grants are invisible to types and tests).
- [x] Add Prisma model + SQL migration (table, UNIQUE, indexes, CHECK quantity > 0, RLS policy, `GRANT SELECT, INSERT, UPDATE` to `kanchuki_app`, no DELETE).
- [x] Update `docs/DATABASE.md` (table + writer map: `POST /products/sell`, `POST /products/sell/:billId/undo`).
- [x] Owner applies the migration in prod, then reads back the grants (agent only proposes the SQL). Applied 2026-11-14; read back: `kanchuki_app` INSERT/SELECT/UPDATE, `kanchuki_purge` DELETE, RLS on, policy `backend_roles_full_access`.
- Skills: `ecc:database-migrations`, `ecc:postgres-patterns`, `supabase:supabase-postgres-best-practices`; agent `ecc:database-reviewer` on the SQL; memory note: every retailer table needs RLS.
- Done when: migration reviewed, applied by owner, grants verified, DATABASE.md updated.

### T2. Shared logic: `applyStatusFromTotal`  ·  ~0.25 day  ·  ✅ done 2026-11-14
- [x] Extract the "total 0 -> SOLD, >0 on SOLD -> AVAILABLE" tail of `writeStock` (`apps/api/src/lib/product-stock.ts`) into one function used by both `writeStock` and the new sell code. No behaviour change. (`applyStatusFromTotal(tx, productId)`, takes the open transaction client; the sell route in T3 must call it inside its per-product `$transaction`.)
- [x] Existing stock tests stay green; add a test pinning both callers use it. (Pinned for `writeStock` now; **T3 must add the same source pin for the sell route**, since it does not exist yet.) Full API suite 3081 passed, mutation-checked.
- Skills: `superpowers:test-driven-development`, `ecc:tdd-workflow`; agent `ecc:code-simplifier`.

### T3. API `POST /v1/products/sell`  ·  ~1 day
- [ ] **Tests first** (red, then green): atomic decrement race (two requests, last unit, one wins), ownership (foreign/soft-deleted product = not found), untracked product -> SOLD, multi-size partial stock, per-line `INSUFFICIENT_STOCK`, idempotent replay of the same `bill_id` (both with Redis up and with Redis down, Postgres UNIQUE still blocks), Redis key removed after a failed transaction, staff allowed, **delegate refused** (403 via shared `isDelegate()`), 100-line cap, `unit_price` snapshot stored, source-pin test that the route has no owner-only gate.
- [ ] Implement in `apps/api/src/routes/products/` (new file, registered with the others): zod schema with `@kanchuki/shared` size constants, one `$transaction` per product, conditional `UPDATE ... WHERE quantity >= n`, insert `product_sales` rows, invalidate the public cache for touched products, per-route rate limit.
- [ ] Update `docs/API.md`.
- Skills: `superpowers:test-driven-development`, `ecc:api-design`, `ecc:backend-patterns`, `ecc:redis-patterns` (cache invalidation), `ecc:security-review`. Agents: `ecc:typescript-reviewer`, `ecc:silent-failure-hunter`, `ecc:security-reviewer`.
- Done when: all tests green locally, mutation-checked (remove the `quantity >= n` guard and the idempotency guard, confirm tests fail), reviewers' findings fixed.

### T4. API Undo `POST /v1/products/sell/:billId/undo`  ·  ~0.5 day
- [ ] Tests first: undo within 10 min restores stock + status AVAILABLE, second undo is a no-op, after 10 min refused, other retailer's bill = not found, who may undo (same roles as sell).
- [ ] Implement: set `undone_at`, add quantities back in one transaction, re-run `applyStatusFromTotal`.
- Skills: `superpowers:test-driven-development`, `ecc:api-design`; agent `ecc:silent-failure-hunter`.

### T5. Mobile: extract scanner block  ·  ~0.5 day
- [ ] Pull the camera + manual-SKU input out of `apps/mobile/app/product/scan.tsx` into a shared component (`src/components/SkuScanner.tsx`); `scan.tsx` uses it, behaviour unchanged, existing tests green.
- [ ] Add scan debounce (same code within ~1.5 s ignored).
- Skills: `vercel-react-native-skills`, `ecc:react-testing`, `ecc:frontend-a11y`; agent `ecc:react-reviewer`. Keep `KeyboardScreen` (RC-116/042 guard).

### T6. Mobile: bill state + sell screen  ·  ~1.5 days
- [ ] Reducer tests first: add line, same SKU+size increments (capped at stock), remove, unresolved-size blocks confirm, already-sold row excluded, not-found row.
- [ ] Build `apps/mobile/app/product/sell.tsx`: camera on top, bill list (`FlatList`) below, size chooser sheet, qty stepper, footer total (informational), confirm sheet, result screen with per-line failures, 10-minute Undo button, "Discard this bill?" on exit.
- [ ] Entry points: "Sell" on Catalog header + Home shortcut. `useRef` busy guard for confirm (RC-015/135), errors via `showError`/`apiMessage` (RC-117), no bare `catch {}`. Invalidate products list + touched details on success. Add `productApi.sell` / `undoSale` client methods and types.
- [ ] Hindi/English labels follow existing i18n state (check `docs/tasks/pending/multi-language-i18n.md`, do not hardcode if the screen's neighbours are translated).
- Skills: `superpowers:test-driven-development`, `vercel-react-native-skills`, `ecc:react-testing`, `ecc:frontend-a11y`, `emil-design-eng` + `impeccable` (UI polish pass, touch targets, Reduce Motion), `ecc:make-interfaces-feel-better`. Agents: `ecc:react-reviewer`, `ecc:silent-failure-hunter`.

### T7. Mobile: offline queue for bills  ·  ~0.5 day
- [ ] Tests first in `mutation-queue.test.ts`: enqueue `PendingSellMutation`, replay on reconnect, 4xx dropped via `isRetryable`, replay is idempotent (same `bill_id`), queue cleared on sign-out.
- [ ] Add the entry kind + replay in `useSyncQueue`; lookup tries the persisted catalog cache before the network; surface per-line replay failures as a notice (never silent).
- Skills: `superpowers:test-driven-development`, `ecc:error-handling`; agent `ecc:silent-failure-hunter`. Guard: RC-115 (online manager) + RC-107 (clear on sign-out).

### T8. Whole-feature review + verification  ·  ~0.5 day
- [ ] `/code-review` on the branch stack, `ecc:security-review` pass (ownership, delegate, idempotency, rate limit), `/simplify` pass.
- [ ] Run API security tests (`npx vitest run src/routes/security.test.ts`), full API + mobile suites, `tsc`, biome, all local.
- [ ] Root-cause check: if any bug is found and fixed, add an RC-### entry + tracker row.
- Skills: `superpowers:verification-before-completion`, `ecc:verification-loop`, `ecc:code-review`, `simplify`, `ecc:security-review`. Agent: `agent-skills:test-engineer` for coverage gaps.

### T9. Owner device test + docs + close-out  ·  ~0.5 day
- [ ] Owner: new EAS build, then test: scan 3 articles (one multi-size), type one SKU by hand, scan an unknown SKU, sell, undo within 10 min, sell while offline then reconnect, two phones selling the last piece, staff login sells, catalog-upload delegate is refused.
- [ ] Same-session docs: CLAUDE.md index row (status honest: what was and was not device-tested), `docs/BUILD-LOG.md` entry, `docs/PRO-REQUIREMENTS.md` (F-number + section), `docs/DATABASE.md`, move this file to `docs/tasks/done/` when finished.
- Skills: `ecc:update-docs`, `superpowers:finishing-a-development-branch`.

**Estimate:** ~5.5 days of build + owner steps (migration apply, EAS build, device test).

## 12. Risks

- Retailers skip writing SKUs on articles -> feature unused. Mitigation: Print Tag label already exists; nudge on product save.
- Stale offline cache sells something already sold -> per-line failure messages, never silent.
- Wrong size picked -> stock drifts. Mitigation: size chooser shows only sizes in stock; undo (§10 Q6).

## 13. Prompt for a new session

```
Read E:\Kanchuki\CLAUDE.md and docs/tasks/pending/scan-billing-sell-screen.md (F-047 Scan & Sell billing screen). The owner approved it; the §10 decisions are final. Work the §11 task list strictly in order, starting with T1 (product_sales migration + schema). For each task: invoke the listed skills first, write tests before code, run tests/tsc/biome locally (GitHub Actions is out of minutes), one branch + PR per task, and tick the task's box in the doc when it lands. Do not run migrations, deploys or touch prod; for T1 prepare the SQL and tell me what to apply. Check docs/DATABASE.md and docs/root-cause/root-cause issues.md before editing. Present the T1 plan and the migration SQL for approval before applying any change.
```
