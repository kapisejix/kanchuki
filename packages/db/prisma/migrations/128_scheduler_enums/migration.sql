-- 128_scheduler_enums
--
-- F-043 Social Post Scheduler (docs/tasks/pending/post-scheduler.md) — the enum
-- values only. 129 creates the tables and seeds rows that use them.
--
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be USED in
-- the same transaction that added it, and Prisma runs each migration file as one
-- transaction, so the seed rows in 129 must live in a later file (same split as
-- 118/119, 094/095).
--
--   SOCIAL_SCHEDULER      PlanFeatureKey      on/off per plan, fails CLOSED (no row = OFF)
--   SCHEDULED_POST        QuotaResourceType   posts published per month (counted at publish, Task 2)
--   ACTIVE_SCHEDULE_PLAN  QuotaResourceType   max concurrently ACTIVE/PAUSED plans PER PLATFORM (LIFETIME period; the
--                                             route compares the live plan count to the limit — no
--                                             usage_counters row is ever written for it)

ALTER TYPE "PlanFeatureKey" ADD VALUE IF NOT EXISTS 'SOCIAL_SCHEDULER';
ALTER TYPE "QuotaResourceType" ADD VALUE IF NOT EXISTS 'SCHEDULED_POST';
ALTER TYPE "QuotaResourceType" ADD VALUE IF NOT EXISTS 'ACTIVE_SCHEDULE_PLAN';
