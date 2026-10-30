# Kanchuki — Documentation Index

**Last reorganized:** 2026-09-25 (`93c07efc` — the 2026-09-23 subfolders, `references/` included, were merged into the top-level `docs/*.md` files; plan: `tasks/done/reorganize-files-folders-structure.md`). Folder map below re-checked 2026-10-25.

This file is the map. If you are looking for something and it is not listed here, search the top-level `docs/*.md` files. The old frozen `references/history/` snapshot is no longer in the tree; read it from git with `git show 93c07efc^:docs/references/history/<file>`. Where the old paths went: "Old paths — removed" at the bottom.

---

## Main docs (kept at `docs/` root)

| File | What it is |
|---|---|
| `PRO-REQUIREMENTS.md` | Scope + feature-status index (every F-### with status and a link to its spec in `tasks/`). Full pre-shrink PRD (git only): `git show 93c07efc^:docs/references/history/superseded/PRO-REQUIREMENTS-full-2026-09-24.md`. |
| `PLAN.md` | Roadmap — phase status, post-launch priorities, scaling, milestones. Full pre-shrink plan (git only): `git show 93c07efc^:docs/references/history/superseded/PLAN-full-2026-09-24.md`. |
| `BUILD-LOG.md` | **The one and only history log** — append-only, chronological, file-level detail for every shipped feature and incident. Split 2026-09-26 (150k-char doc limit): this file is now the index (Parts table), full detail lives in `docs/build-log/part-N.md`. **New entries append to the latest `part-N.md`, not here** — split a new `part-N+1.md` once the latest one nears 100k chars and add its row to the index. |
| `TECH-STACK.md` | Locked technology choices with rationale. |
| `DATABASE.md` | Schema, indexes, relationships + the DB structure report. |
| `DESIGN.md` | UI/UX design doc, Emil Kowalski design direction, design review, design-inspiration references. |
| `MARKETING.md` | Marketing & Sales Enablement, India retailer growth roadmap, hyperlocal ideas, launch GTM, website copy. |
| `API.md` | REST API contracts, endpoints, auth. |
| `SECURITY.md` | Security model, OWASP, data privacy, governance. **§12–18 requires human review to edit.** |
| `SCALING.md` | Scaling plan for the 1M-retailer / 5M-customer target. |
| `DEPLOY.md` | The correct deploy flow (GitHub push → Railway auto-deploy). Never `railway up` from a laptop. |
| `PLAY-STORE-RELEASES.md` | Release/versionCode history. ⚠️ **Never move this file** — the CI gate `scripts/check-android-version-code.mjs` reads it at this exact path. |

## Folders

| Folder | What it holds |
|---|---|
| `tasks/` | Work board. `pending/` = open work, `done/` = specs of built features, `archived/` = retired, not built. See `tasks/README.md`. |
| `root-cause/` | The `RC-###` root-cause tracker + the pre-production regression checklist. **Read this before editing any area.** See `root-cause/README.md`. |
| `build-log/` | `part-N.md` — the full detail behind `BUILD-LOG.md`'s Parts table. |
| `runbooks/` | Owner-only operational runbooks (RazorpayX setup, try-on launch, F-043 launch checklist). |
| `ai-studio/` | AI photo/video generation: bench HTML catalogs, ghost-mannequin research, and the model/product/background image sets (images are **local-only, gitignored**). See `ai-studio/README.md`. |
| `design-screens/` | UI reference screenshots (referenced from `DESIGN.md`). |
| `superpowers/` | `plans/` — implementation plans written during agent sessions. |

---

## Rules

1. **New task** → add a file to `tasks/pending/`. Start it with a one-line `**Status:**` header.
2. **Task finished** → move the file to `tasks/done/`, flip its `**Status:**` header, append the detail table to the latest `docs/build-log/part-N.md` (see `BUILD-LOG.md`'s Parts table), and update the row in `CLAUDE.md`'s What's-Built index.
3. **Found a bug?** → fix it, then add a new `RC-###` entry to `root-cause/root-cause issues.md` (one entry per **root cause**, not per symptom), add its row to the RC table in `CLAUDE.md`, and reference the RC ID in the commit message.
4. **Before editing any feature area** → read `root-cause/README.md` and its regression checklist for that area.
5. **Old history snapshots (`references/history/`, git only) are never current truth.** They record what was believed at the time. Live status lives in `BUILD-LOG.md` + `CLAUDE.md`.
6. **Feature status has one source of truth: the code.** Docs claim status; `git log` and the code decide. Stale status headers have repeatedly caused wrong reports — check the code.
7. **`BUILD-LOG.md` is the only history log.** `PROGRESS.md` is frozen (git only: `git show 93c07efc^:docs/references/history/sessions/PROGRESS.md`) and gets no new entries.

---

## Old paths — removed

The reorganization first laid this structure down as **copies**, then deleted the originals once every one of them had a proven successor: **236 files removed, 0 unresolved.** 215 were byte-identical copies, 13 were merged into `marketing/marketing-sales-enablement.md` (itself merged into `MARKETING.md` on 2026-09-25), and 8 were renamed or edited on the way. The per-file accounting is in `tasks/done/reorganize-files-folders-structure.md`. On 2026-09-25 (`93c07efc`) the subfolders were merged again into the top-level files listed above. 11 files never moved and are still where they always were.

Every reference in the repo — code comments, scripts and docs — now points here, and `git grep` is clean apart from two deliberate exceptions:

- **`ai-studio/history/`** (and the old `references/history/`, now git only) — frozen records, so they legitimately still name the paths of their time.
- **`packages/db/prisma/migrations/*/migration.sql`** — a handful of SQL comments still name old paths. These files are **immutable**: Prisma checksums every applied migration, and editing one can hard-fail the next `migrate deploy`. A stale path in a comment is worth far less than a blocked migration, so they were deliberately left alone.

If you find a stale path anywhere else, fix it — it is a leftover, not a policy.
