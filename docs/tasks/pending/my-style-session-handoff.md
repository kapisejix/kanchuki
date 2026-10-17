# F-045 My Style — session handoff (running log)

**Purpose:** one task per session. Each session reads this file first, does its task, then **updates this file** (status, what shipped, gotchas, the next prompt) before it ends.
**Spec:** `docs/tasks/pending/my-style.md` (decisions D1-D6 in §0, PR map in §6, tests §7, RC rules §8, skills §9).
**Last updated:** 2026-10-17 (after PR-1 merged).

## How to run a session

1. Open a new session, paste the "Next prompt" at the bottom of this file.
2. Agent reads CLAUDE.md, the spec sections it names, and this file.
3. Agent works test-first, shows the diff, waits for owner approval, then commits, pushes and opens the PR.
4. Before the session ends the agent updates **Status board**, **Gotchas** and **Next prompt** here and ships that change (docs-only PR, or inside the task PR).
5. Owner merges. Owner applies any migration by hand (policy). Nothing deploys from an agent.

## Fixed context (do not re-decide)

- Customer web only (`apps/web`). Not the retailer mobile app.
- Enquire only. No online purchase for 3-5 months (D6). No cart, order or payment code.
- Customer try-on is OFF (F-044 E6). My Style must not depend on it.
- Photos are never stored. Only the derived profile is kept.
- Kanchuki pays for AI calls (D1). Ranking is best-match first, distance second (D2).
- Do not edit CLAUDE.md without owner approval. The F-045 index row is still not added; ask the owner.

## Status board

| PR | Branch | Scope | Status |
|---|---|---|---|
| PR-0 | docs/f-045-my-style-spec | Spec, PRO-REQUIREMENTS section 42, tasks index | MERGED (#106, bd87a52c) |
| PR-1 | feat/f-045-schema | Migrations 132/133, Prisma, seeds, guard test, DATABASE.md | MERGED (#107). Migrations APPLIED in prod 2026-10-17 |
| PR-2 | feat/f-045-color-family | normalizeColorFamily, tag-product wiring, backfill job, admin alias CRUD | NEXT |
| PR-3 | feat/f-045-feed-api | Ranking engine, POST /my-style/feed, style-quiz PATCH, StyleQuiz.tsx | not started |
| PR-4 | feat/f-045-web-shell | /my-style page, nav entries, web proxies and allowlist | not started |
| PR-5 | feat/f-045-multistore-enquiry | Grouped shortlist to N per-store enquiries | not started |
| PR-6 | feat/f-045-analyze-api | Analyze job (Claude Vision), POST /analyze, poll, profile/clear, kill-switch | not started |
| PR-7 | feat/f-045-analyze-ui | Capture sheet, palette card, clear my data | not started |
| PR-8 | feat/f-045-admin | Admin palettes, trends, aliases, quota row, usage cost | not started |
| PR-9 | feat/f-045-find-similar | Garment-descriptor mode, embeddings | not started |
| PR-10 | feat/f-045-complete-look | Complete the look, Festival and Trending tabs | not started |
| PR-11 | feat/f-045-tryon-handoff | GATED: needs CUSTOMER_TRY_ON_ENABLED on and F-040 launched | do not start |
| PR-12 | docs/f-045-closeout | BUILD-LOG, status, CLAUDE.md row (owner approval) | after each phase |

## What exists now (verified)

- Migration 132: `QuotaResourceType.STYLE_ANALYSIS`. Migration 133: `products.color_family` (+ index), `customer_accounts.skin_undertone / skin_depth / body_frame / style_profile_at` (CHECK-constrained), tables `color_families` (22 seeded), `style_palettes` (9 seeded), `style_trends` (empty), `customer_resource_limits` STYLE_ANALYSIS = 3/MONTH.
- RLS on the three new tables. No DELETE granted (RC-049): remove means `is_active = false`.
- Guard test: `apps/api/src/lib/my-style-migration.test.ts` (seeds load, every palette uses known families, good and avoid never overlap).
- Writer map and details: `docs/DATABASE.md` section "My Style".

## Gotchas learned (read before coding)

- **Lint is a CI gate.** Run `npx biome check src/` in `apps/api` before pushing. PR-1 failed CI once on formatting. Local Windows runs show CRLF noise on files you did not touch; CI is the truth.
- **doc-table-guard** (`packages/shared/src/testing/doc-table-guard.test.ts`) fails on an unescaped pipe inside a markdown table cell. Write `\|`.
- **Enum values and migrations (55P04):** a new enum value cannot be used in the same transaction that adds it. Split into two migration files. When applying in the Supabase SQL editor, run them as two separate runs.
- **Prisma history:** migrations applied by SQL editor are not in `_prisma_migrations`. If `prisma migrate deploy` is ever used, run `prisma migrate resolve --applied <name>` first.
- **GateGuard hook** asks for facts before the first write or edit of a file. Present the facts, then retry.
- **rtk is not installed in PowerShell.** Use plain git. Commit with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Worktree session:** git commands must run from the worktree root with no `cd` to computed paths.
- Wait for CI (quality, unit-web, build, e2e-web) to go green before telling the owner a PR is ready.

## Owner-only actions pending

- Run the colour backfill job once after PR-2 merges (agent must not trigger it).
- Add the F-045 row to CLAUDE.md (needs owner approval).
- Review seed palettes later in Admin once PR-8 lands.

## Next prompt (PR-2)

Paste into a new session:

```
/caveman:caveman full
/ponytail

Start F-045 My Style, PR-2 (colour family).
First read docs/tasks/pending/my-style-session-handoff.md, then docs/tasks/pending/my-style.md sections 0, 2.2 item 3, 4.1, 6, 7, 8, 9.

Done: PR-0 and PR-1 merged, migrations 132/133 applied in prod. Branch feat/f-045-color-family off main, PR against main.

Tasks (spec section 6, PR-2 row):
1. T2 normalizeColorFamily(primary_color, families) in packages/shared. Pure. Case-insensitive, trim, collapse spaces. Exact name or alias first, longest alias wins ("peacock blue" -> teal). Whole-word keyword fallback. Unmapped -> null, never guess, never throw. Rules only, no LLM. Seed-parity test: default family list in shared must equal the seed in migration 133 (parse the SQL like my-style-migration.test.ts).
2. T3 jobs/tag-product.ts sets color_family using active DB families (small TTL cache). Lookup failure -> leave null and carry on. Tagging must never fail because of this.
3. T4 jobs/color-family-backfill.ts, shape of jobs/embedding-backfill.ts. Batches, idempotent, only color_family IS NULL and primary_color set. No repeat.limit (RC-062). Report counts. Do not trigger on prod.
4. T5 admin CRUD for color_families: list, create, edit aliases, is_active toggle. No delete (RC-049). Validate lowercase, alias not owned by another family, name unique. Classify routes in the single admin access list (RC-034) and test it.
5. Gates: pnpm --filter @kanchuki/api typecheck, API + shared tests, biome check src/ in apps/api. Report failures by name.

Next (do not start): PR-3 feed API. It scores palette fit by matching products.color_family against style_palettes good/avoid, so the normaliser must export a clean (value, families) -> string | null API.

Skills: superpowers:test-driven-development, agent-skills:incremental-implementation, superpowers:subagent-driven-development (T5 is independent), ecc:api-design, ecc:backend-patterns, ecc:error-handling, ecc:redis-patterns, ecc:prisma-patterns, ecc:regex-vs-llm-structured-text, ecc:security-review, agents ecc:typescript-reviewer, ecc:security-reviewer, ecc:silent-failure-hunter, ecc:pr-test-analyzer, superpowers:verification-before-completion, ecc:update-docs.

Rules: ask before adding a dependency. No new any. Do not edit CLAUDE.md. No migrations. No deploys. Keep the PR near 400 lines, else propose a split (T2+T3+T4, then T5). Show the diff and wait for my approval before committing. Then commit, push, open the PR, wait for green CI.
Before ending: update docs/tasks/pending/my-style-session-handoff.md (status board, gotchas, next prompt for PR-3) and docs/DATABASE.md writer map for products.color_family.
```
