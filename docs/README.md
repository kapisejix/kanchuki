# Kanchuki — Documentation Index

**Last reorganized:** 2026-09-23 (`docs/reorganize` branch, plan: `tasks/reorganize-files-folders-structure.md`).

This file is the map. If you are looking for something and it is not listed here, it is either in `references/history/` (frozen, never current truth) or it is an old path still awaiting the deletion phase — see "Old paths" at the bottom.

---

## Main docs (kept at `docs/` root)

| File | What it is |
|---|---|
| `PRO-REQUIREMENTS.md` | The product requirements — user stories, acceptance criteria, feature IDs (F-###). **Being shrunk** to a scope + feature-status index that links `tasks/`. |
| `PLAN.md` | Phase-by-phase roadmap and timelines. **Being shrunk**; removed features still need dropping. |
| `BUILD-LOG.md` | **The one and only history log** — append-only, chronological, file-level detail for every shipped feature and incident. Every build appends here. |
| `TECH-STACK.md` | Locked technology choices with rationale. |
| `API.md` | REST API contracts, endpoints, auth. |
| `SECURITY.md` | Security model, OWASP, data privacy, governance. **§12–18 requires human review to edit.** |
| `SCALING.md` | Scaling plan for the 1M-retailer / 5M-customer target. |
| `DEPLOY.md` | The correct deploy flow (GitHub push → Railway auto-deploy). Never `railway up` from a laptop. |
| `PLAY-STORE-RELEASES.md` | Release/versionCode history. ⚠️ **Never move this file** — the CI gate `scripts/check-android-version-code.mjs` reads it at this exact path. |

## Folders

| Folder | What it holds |
|---|---|
| `tasks/` | Work board. `pending/` = open work, `done/` = specs of built features. See `tasks/README.md`. |
| `root-cause/` | The `RC-###` root-cause tracker + the pre-production regression checklist. **Read this before editing any area.** See `root-cause/README.md`. |
| `ai-studio/` | AI photo/video generation: bench HTML catalogs, ghost-mannequin research, and the model/product/background image sets (images are **local-only, gitignored**). See `ai-studio/README.md`. |
| `marketing/` | The merged Marketing & Sales Enablement reference, the India growth roadmap, hyperlocal marketing ideas. |
| `database/` | `DATABASE.md` (schema, indexes, relationships) + the DB structure report. |
| `design/` | `DESIGN.md`, `emil-design.md`, the design review, and `screens/` (UI reference screenshots). |
| `customers/` | Customer-side specs: the customer profile, and the shopper-passport identity architecture. |
| `content/` | Website copy. Code comments reference these paths. |
| `references/` | Everything reference-only: `guides/`, `research/`, `design-inspiration/`, `adrs/`, `history/` (frozen). See `references/README.md`. |

---

## Rules

1. **New task** → add a file to `tasks/pending/`. Start it with a one-line `**Status:**` header.
2. **Task finished** → move the file to `tasks/done/`, flip its `**Status:**` header, append the detail table to `BUILD-LOG.md`, and update the row in `CLAUDE.md`'s What's-Built index.
3. **Found a bug?** → fix it, then add a new `RC-###` entry to `root-cause/root-cause issues.md` (one entry per **root cause**, not per symptom), add its row to the RC table in `CLAUDE.md`, and reference the RC ID in the commit message.
4. **Before editing any feature area** → read `root-cause/README.md` and its regression checklist for that area.
5. **`references/history/` is never current truth.** It is a frozen snapshot of what was believed at the time. Live status lives in `BUILD-LOG.md` + `CLAUDE.md`.
6. **Feature status has one source of truth: the code.** Docs claim status; `git log` and the code decide. Stale status headers have repeatedly caused wrong reports — check the code.
7. **`BUILD-LOG.md` is the only history log.** `PROGRESS.md` is frozen into `references/history/sessions/` and gets no new entries.

---

## Old paths — removed

The reorganization first laid this structure down as **copies**, then deleted the originals once every one of them had a proven successor: **236 files removed, 0 unresolved.** 215 were byte-identical copies, 13 were merged into `marketing/marketing-sales-enablement.md`, and 8 were renamed or edited on the way. The per-file accounting is in `tasks/reorganize-files-folders-structure.md`. 11 files never moved and are still where they always were.

Every reference in the repo — code comments, scripts and docs — now points here, and `git grep` is clean apart from two deliberate exceptions:

- **`references/history/`** (and `ai-studio/history/`) — frozen records, so they legitimately still name the paths of their time.
- **`packages/db/prisma/migrations/*/migration.sql`** — a handful of SQL comments still name old paths. These files are **immutable**: Prisma checksums every applied migration, and editing one can hard-fail the next `migrate deploy`. A stale path in a comment is worth far less than a blocked migration, so they were deliberately left alone.

If you find a stale path anywhere else, fix it — it is a leftover, not a policy.
