# Major Task 1 — API (`apps/api`, `packages/db|ai|shared`)

Scope: bugs, errors, type errors, dead code. Each small task ≤10 min.

| ID | Small task | Do | Output |
| --- | --- | --- | --- |
| T1.1 | Typecheck + lint baseline | `rtk pnpm --filter @kanchuki/api typecheck`; `rtk lint`; same for `packages/db`, `ai`, `shared`. Group errors by file. | `reports/T1.1-api-typecheck-lint.md` |
| T1.2 | Test suite health | `rtk vitest run` in `apps/api`. List failing/skipped/flaky tests. Run `src/routes/security.test.ts` and `admin.login.test.ts` separately. | `reports/T1.2-api-tests.md` |
| T1.3 | Auth + access guards | Walk `routes/auth.ts`, `admin-auth.ts`, `plugins/`, team/staff/support-sessions. Check every route has the right guard (owner / manager / salesperson / super-admin). RC-034 and RC-068 shapes: hand-copied checks. Use Serena `find_referencing_symbols` on the guard helpers. | `reports/T1.3-api-auth-guards.md` |
| T1.4 | Jobs / crons | `src/jobs/`: BullMQ repeat options (RC-062 `repeat.limit`), CAS claims, retries, error swallowing, jobs that write through roles without DELETE (RC-049). | `reports/T1.4-api-jobs.md` |
| T1.5 | Dead code | `npx knip` in `apps/api` and `packages/*`. Unused exports/files/deps, orphan routes, post-teardown leftovers (checkout, VTO v1, Fashion DNA, bookings). Confirm each with Serena before listing. | `reports/T1.5-api-dead-code.md` |
| T1.6 | DB access + RLS | Read-only. Prisma queries that `delete` via app role (RC-049). Supabase `get_advisors` (security) + `list_tables` for tables with no RLS. Raw SQL (`$queryRaw`) string-built queries. | `reports/T1.6-api-db.md` |
| T1.7 | Silent failures | Run `ecc:silent-failure-hunter` over `routes/` + `lib/`: empty catches, fabricated success (RC-051/056/060 shape), unchecked fetch status, missing timeouts (RC-011/079). | `reports/T1.7-api-silent-failures.md` |
| T1.8 | Money + uploads + webhooks | Razorpay callbacks/webhooks (HMAC, idempotency, amount checks — RC-071/076), presign routes (`content_length`, rate limit — RC-075/080), MSG91/Meta/Razorpay webhook secrets. | `reports/T1.8-api-money-uploads.md` |

## Done when

Every T1.x has a report file, P0/P1 fixes applied or ticketed, `typecheck` + `vitest` green (or failures explained).
