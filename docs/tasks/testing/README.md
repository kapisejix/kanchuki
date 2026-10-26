# Testing & Security Audit — Task Board

Created 2026-10-25. Goal: find bugs, errors, type errors and dead code in **API, Web (incl. admin + customer passport), Mobile**, then attack the project as a hacker would.

**Rule: one task = one session = ≤10 minutes.** Finish, write the report, close the session, open a new one.

## Files

| File | What |
| --- | --- |
| `00-master-prompt.md` | The prompt to paste at the start of every session |
| `task-1-api.md` | Major task 1 — API (`apps/api`, `packages/*`) — 8 small tasks |
| `task-2-web.md` | Major task 2 — Web (`apps/web`: storefront, passport, admin) — 8 small tasks |
| `task-3-mobile.md` | Major task 3 — Mobile (`apps/mobile`) — 7 small tasks |
| `task-4-hacker.md` | Hacker-mode attack sessions (H1–H8), one per surface |
| `hacker-playbook.md` | What an attacker would try, per surface (hypotheses to verify) |
| `reports/` | Output folder. One report per small task, e.g. `reports/T1.3-api-auth-guards.md` |
| `reports/00-hacker-report.md` | Final merged hacker report (built from H1–H8) |

## How to run a task

1. New session. Paste `00-master-prompt.md`, then add one line: `Run task T1.3`.
2. Agent reads the task block, does only that, writes `reports/<id>-<slug>.md`.
3. Agent lists fixes as diffs and **waits for "apply"** (CLAUDE.md approval gate).
4. After "apply": agent fixes, re-runs the check, appends result to the same report. Ends session.

## Order

T1.1 → T2.1 → T3.1 first (typecheck/lint baselines, so later tasks start from a known state). Then the rest in any order. Hacker tasks last, or any time on a **local/staging** target.

## Hard limits (from CLAUDE.md)

- Never attack production. Local dev or staging only.
- No prod env vars, no migrations, no `railway up`, no destructive SQL.
- Findings that include real secrets: redact the value, record only the file/line.
- Every bug fix gets an `RC-###` entry (`docs/root-cause/root-cause issues.md`) + row in CLAUDE.md tracker. Next free ID: RC-084.

## Tools per task type

| Need | Use |
| --- | --- |
| Diff/branch bug review | `/code-review` (add `--fix` only after you approve) |
| Over-engineering / dead weight | `/ponytail-audit`, `/simplify` |
| Dead code | `npx knip` (per app), `ecc:refactor-cleaner` agent |
| Silent failures | `ecc:silent-failure-hunter` agent |
| Security review | `/security-review`, `ecc:security-reviewer`, `agent-skills:security-auditor`, skills `api-security-testing`, `owasp-top-10-testing`, `web-app-penetration-testing` |
| Browser checks | Playwright MCP (`mcp__plugin_ecc_playwright__*`) |
| Symbol / reference search | Serena MCP |
| DB policy / RLS | Supabase MCP `get_advisors`, `list_tables` (read-only; project `thpqcylmcxokajxoerjx`) |
| Deploy/log state | Railway MCP read-only tools (`get_logs`, `list_deployments`) |
