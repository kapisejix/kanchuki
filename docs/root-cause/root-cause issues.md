# Root Cause — Issue Tracker

> **Purpose:** every bug that ships must be recorded here with its ROOT CAUSE (not its symptom).
> Each entry gets a stable ID (`RC-###`) so it can be referenced from commit messages,
> CLAUDE.md, PRs, and future code. If the same root cause explains multiple symptoms,
> keep ONE entry and list the symptoms under it — the fix is what matters, not the surface.
>
> **Format:** one entry per root cause. Symptom → Root cause → Fix → Proof (tests / commit).
> Append new entries at the TOP of the list (newest first).

---

## RC-006 — Suits Designs permalink links "go nowhere" from the product detail sheet

- **Component:** `apps/web/src/app/c/[slug]/components/ProductDetailSheet.tsx`
- **Commit:** `590c2185`
- **Symptom:** clicking a Suits Designs thumb inside the customer product detail sheet appeared to do nothing — the design page never opened.
- **Root cause:** the sheet pushes a history entry on mount (`window.history.pushState({ kanchukiProductSheet: true })`) and its unmount cleanup called `window.history.back()` **unconditionally**. When a Next.js `<Link>` navigated to `/{store}/designs/{id}`, Next pushed a NEW history entry and unmounted the sheet — the cleanup then immediately popped that new entry, undoing the navigation. The link "worked" but the sheet's cleanup cancelled it before the page painted.
- **Fix:** the cleanup now only rolls back when the sheet's own pushed entry is still the top-most history state:
  ```ts
  if (!poppedByUser && window.history.state?.kanchukiProductSheet === true) {
    window.history.back()
  }
  ```
  A real Link navigation replaces the top state, so `kanchukiProductSheet` is gone and the rollback is skipped.
- **Prevention lesson:** any component that manipulates history in an unmount cleanup must check it still owns the top entry. This is a class of bug — audit other components that call `history.back()` in cleanup.

---

## RC-005 — Related product thumbnails on the product detail sheet do nothing

- **Component:** `apps/web/src/app/c/[slug]/components/ProductDetailSheet.tsx` + `CollectionView.tsx`
- **Commit:** `590c2185`
- **Symptom:** tapping a "Related Products" card on the customer product detail sheet went nowhere.
- **Root cause:** the related-product `<button>` onClick only called `onClose()` — it closed the sheet but never opened the related product. There was no navigation handler at all; the click path was literally a no-op dressed as a close.
- **Fix:** added an `onSelectProduct?: (product: PublicProduct) => void` prop (same in-place swap AIStylist's `onProductTap` uses) and wired it to `setSelectedProduct` in CollectionView. Related cards now swap the sheet to the tapped product. Also added a per-product state reset effect (photo index, variant, zoom, detail) so a swapped product never inherits stale view state from the previous one.
- **Prevention lesson:** when a UI affordance exists, verify the click path actually ends in a navigation/state change — "closes the thing it's inside" is almost never the intended behaviour for a card that shows another entity.

---

## RC-004 — Category delete 500s ("Failed to delete category" on the category screen)

- **Component:** `apps/api/src/routes/categories.ts` — `DELETE /v1/categories/:id`
- **Commit:** `21be0e92`
- **Symptom:** deleting a category failed with a 500 / "Failed to delete category".
- **Root cause:** the route called `prisma.productCategory.delete({ where: { id } })` through the main `kanchuki_app` client, but `product_categories` is a hard-delete table under SECURITY §19 — `kanchuki_app` has DELETE revoked and (once triggers cover it) a `BEFORE DELETE` guardrail fires without the session flag. The main client has no DELETE privilege, so the delete throws. Same class of bug that hit products-trash and products-variants earlier.
- **Fix:** same pattern as `products-trash.ts` / `products-variants.ts` — run the hard delete through `getPurgePrisma()` (scoped `kanchuki_purge` role) with `SET app.allow_hard_delete = 'true';` inside the transaction, and write an audit-log row on the main client after.
- **Proof:** `apps/api/src/routes/categories.test.ts` — new regression tests assert the delete goes through the purge client with the guardrail flag, never through the main client.

---

## RC-003 — Mobile AI Campaign screen swallows the real API error ("Failed to generate campaign")

- **Component:** `apps/mobile/app/growth/ai-campaign.tsx`
- **Commit:** `70e057a8`
- **Symptom:** every failure on the AI Campaign Assistant screen showed the same generic "Failed to generate campaign", so the retailer couldn't tell whether to upgrade, retry, or reword the prompt.
- **Root cause:** `handleGenerate`'s catch block discarded the thrown error and passed only the hardcoded fallback string to `showError`. The API already sends a specific, user-safe message for every predictable failure (plan/quota gate, AI-provider outage, unparseable AI reply) — it was simply never surfaced.
- **Fix:** surface `ApiError.message` when the thrown error is an `ApiError`; keep the generic string only as a true fallback:
  ```ts
  const apiMsg = err instanceof ApiError && err.message ? err.message : null
  showError(err, apiMsg ?? 'Failed to generate campaign')
  ```
- **Prevention lesson:** a catch block that replaces the error with a constant string is a bug — the real error is your best debugging signal and often a user-actionable message.

---

## RC-002 — Festival resolution never matches → FESTIVAL campaign drafts can't be saved

- **Component:** `apps/api/src/routes/growth/growth-ai-campaign.ts` — `POST /v1/growth/ai-campaign`
- **Commit:** `70e057a8`
- **Symptom:** AI-generated FESTIVAL drafts always came back with `festival_id: null`; the mobile save flow then blocked saving ("Pick a festival for the campaign") because the festival was never resolved.
- **Root cause:** the route tried to match the festival by `name: { equals: prompt.split(' ').slice(0, 3).join(' '), mode: 'insensitive' }` — i.e. it looked for a festival whose name exactly equals the literal first three words of the prompt (e.g. `"Create a Diwali"`). No festival is ever named that, so the lookup always returned null. The AI has no festival-table access (it always returns `festival_id: null`), so festival_id stayed null and FESTIVAL drafts were unsaveable.
- **Fix:** match any festival whose name appears anywhere in the prompt, newest-starting first:
  ```ts
  const lowerPrompt = prompt.toLowerCase()
  const match = candidates.find((f) => lowerPrompt.includes(f.name.toLowerCase()))
  ```
- **Proof:** `growth-ai-campaign.test.ts` — "resolves festival_id by matching the festival name anywhere in the prompt" (`"Create a Diwali collection…"` → Diwali id), "leaves festival_id null when no calendar festival name appears", "does not query the festival table for non-FESTIVAL intents".
- **Prevention lesson:** an exact-equality match against a substring of user input is a smell. When matching free text to a controlled vocabulary, match *contains*, not *equals*.

---

## RC-001 — AI Campaign Assistant 500s on malformed AI intent replies

- **Component:** `packages/ai/src/campaign-assistant.ts` (`parseCampaignIntent`), route `apps/api/src/routes/growth/growth-ai-campaign.ts`
- **Commit:** `70e057a8`
- **Symptom:** `POST /v1/growth/ai-campaign` intermittently 500'd with "Failed to generate campaign" on the AI Campaign Assistant screen.
- **Root cause:** `parseCampaignIntent` used the free-text `ask()` path with no schema enforcement, so provider models routinely returned shapes the DB route could not safely dereference:
  - missing `product_criteria` / `audience` objects (route reads `intent.product_criteria.category` directly),
  - nested JSON-as-string (`"product_criteria": "{...}"`),
  - enums outside the union (`campaign_type: "HOLIDAY"`),
  - numbers serialised as strings,
  - comma-joined arrays (`"colors": "pink,black"`).
  Any one of those threw inside the route → unhandled 500 → the generic mobile fallback (see RC-003).
- **Fix:** added `normalizeCampaignIntent()` in `packages/ai/src/campaign-assistant.ts` — a never-throwing coercion that re-parses stringified nested objects, coerces enums/numbers/arrays, caps `limit` at 20, and defaults anything invalid to safe values (`PROMOTION`/`casual`/empty objects). `parseCampaignIntent` now always returns a well-typed `CampaignIntent`.
- **Proof:** `packages/ai/src/campaign-assistant.test.ts` — 7 new tests covering pass-through, enum coercion, unknown-enum defaults, stringified nested objects, audience-source filtering, missing objects, and limit capping. AI package 91/91 tests green.
- **Prevention lesson:** never trust a free-text LLM response's shape at the boundary. Normalize/validate on the way in, so downstream code only ever sees the typed contract.