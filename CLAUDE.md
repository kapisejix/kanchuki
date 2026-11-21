# Kanchuki

AI fashion SaaS for Indian clothing stores. Full memory: `docs/PROJECT-MEMORY.md` (scope, stack, feature index, RC table, policy). Read relevant part before work. Status and RC rows go there.

**Needs approval:** applying code changes; editing policy, stack lock, key constraints; SECURITY.md §12-18.

**NEVER:** change prod env vars; read prod secrets; run `railway up` or trigger deploys (GitHub push only); run migrations or write prod DB; edit CI/CD config; run destructive SQL (`DROP`, `TRUNCATE`, `DELETE` without WHERE).

**Always:** check PRO-REQUIREMENTS before features, DATABASE before schema, SECURITY before user data/photos. INR only; GST invoices required. AI calls via BullMQ, never in request handlers. Log shipped work in `docs/BUILD-LOG.md`.
