# Dead Code Cleanup

**Status:** ✅ Done 2026-09-28 — all 4 candidates deleted, verified clean (re-grepped, zero dangling references).
**How found:** grepped every hit for each candidate across `apps/*` + `packages/*` (src only, tests excluded) and confirmed zero live callers / zero backend route. Not a knip/ts-prune run (none installed) — manual.

---

## 1. `fashion_dna` AI-config purpose — orphaned since the 2026-08-31 teardown

**File:** `apps/api/src/routes/admin-settings/ai-config.ts:39-44`

```ts
fashion_dna: {
  model: 'text-embedding-3-small',
  temperature: 0,
  max_tokens: 0,
  timeout_ms: 30000,
},
```

Fashion DNA was removed in migration `082` (2026-08-31, `chore/remove-unwanted-features`). Grepped `fashion_dna` across `apps/api/src` + `apps/mobile` (excl. tests) — **this entry is the only hit**. Nothing reads `DEFAULT_AI_CONFIG.fashion_dna` or `AI_CONFIG_SETTING_KEY`'s `fashion_dna` key. `try_on` (fashion-vtone) in the same object is live — don't touch that one.

**Delete:** the 6-line entry. Check the admin AI-config UI page doesn't render a hardcoded row for it first (`apps/web/src/app/admin` — grep `fashion_dna` there before removing).

---

## 2. Lookbook Generator client bindings — feature removed, client never was

**File:** `apps/mobile/src/lib/api/growth.ts`
- Types: lines 582–627 (`LookbookFormat`, `LookbookStatus`, `Lookbook`, `LookbookStats`, `LookbookCreatePayload`, `LookbookUpdatePayload`)
- Functions: lines 1266–1319 (`lookbooks`, `lookbook`, `lookbookStats`, `createLookbook`, `updateLookbook`, `deleteLookbook`, `generateLookbook`, `shareLookbook`, `viewLookbook`)

CLAUDE.md lists "lookbooks" under Removed (2026-08-31). Confirmed:
- `grep -rl "Lookbook" apps/mobile/app apps/mobile/src` outside `growth.ts` → **zero hits**. No screen ever imports these.
- `grep -rl "growth/lookbooks" apps/api/src/routes` → **zero hits**. No backend route exists — these functions would 404 if ever called.

**Delete:** both blocks, ~85 lines total, no other file touches them.

---

## 3. Festival Background Library client bindings — same shape as #2

**File:** `apps/mobile/src/lib/api/growth.ts`
- Types: lines 629–665ish (`FestivalBackground`, `FestivalBackgroundStats`)
- Functions: lines 1321–1365 (`backgrounds`, `background`, `backgroundStats`, `backgroundOccasions`, `applyBackground`, `backgroundApplyStatus`)

Marketing docs' 2026-09-23 code-checked audit (`docs/MARKETING.md`, Phase 4 #6 of the reorg plan) ruled Festival Backgrounds **REMOVED**, not built. Confirmed same way as #2: no screen references `FestivalBackground`/`background(...)`, no backend route under `growth/backgrounds`.

**Delete:** both blocks, ~80 lines.

> Do #2 and #3 as one PR — they're adjacent in the same file and share the "Phase 4/6 features that got cut before a screen was built" story.

---

## 4. Stale admin-role copy — mentions a section that doesn't exist

**File:** `apps/web/src/app/admin/team-members/page.tsx:61`

```ts
MARKETING_MANAGER: 'Admin dashboard access (Retailers, Customers, Catalog, Lookbooks, Social, Team, Reports). Excludes API keys, Payments, Settings, and Operations.',
```

Not dead code (string renders), but "Lookbooks" names a removed admin section — the sentence describes access that doesn't exist. Fix in the same PR as #2: drop "Lookbooks," from the string.

---

## Checked and ruled OUT (don't re-investigate)

- **`apps/api/src/routes/**` orphan-route scan** — every non-test route file has ≥1 importer somewhere in the tree (barrel files in `growth/`, `retailers/`, `billing/`, `public/`, `webhooks/` all wire through). No orphaned route files on `main`.
- **`services/training/Dockerfile`** — single file, referenced in `docs/DEPLOY.md`/`docs/BUILD-LOG.md`. Looks thin but is documented as the (superseded-but-kept) training image; not touching without an owner call since `docs/references/history/superseded/catvton-training.md` already covers why it's frozen, not deleted.
- **`dist/**/*fashion-dna*` in `apps/api/dist` and `packages/ai/dist`** — stale build output referencing deleted source, not source dead code. Regenerated on next build; not worth a PR line item.
- **`PlanFeatureKey.PARTNER_NETWORK` enum value** — intentionally retained per migration `082`'s own closing note (CLAUDE.md #46/47). Leave it.
- **`@deprecated`/"not dead code" comments** in `packages/shared/src/constants/index.ts:78`, `apps/api/src/routes/admin/admin-plans.ts:342`, `admin-referral.ts:115` — all three are self-documented intentional retentions (DB CHECK constraint pairing, non-toggleable legacy plan values). Not candidates.
- **Untracked local clutter** (`tools/sam2/`, `VibeSec-Skill/`, `.freebuff/`, `strix_runs/`, `.backups/`, `scripts/models/`) — none are git-tracked, so none are "dead code" in the shipped sense. Delete locally if you want disk space back; out of scope for this doc.

---

## Next step

Delete #1–#4 in one small PR (they're all "removed feature, client/config never caught up"), re-run `pnpm --filter @kanchuki/api typecheck` + the mobile app's typecheck script after, since removing exported types can break a stray import this grep missed.
