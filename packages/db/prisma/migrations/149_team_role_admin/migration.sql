-- 149: TeamRole gains ADMIN (RC-161). NOT APPLIED by the agent; the owner applies it.
--
-- Code has allowed a plain ADMIN since PR #225 (change plan / extend trial), but the enum
-- had no such value, so no ADMIN account could ever be created. ADMIN is the standard
-- admin tier: everything outside SUPER_ADMIN_ONLY_ADMIN_SEGMENTS, plus change-plan,
-- extend-trial, limit overrides. Team members and reports stay Super Admin only.
--
-- ENUM VALUE ONLY. PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be
-- used in the same transaction that added it, and Prisma runs each file as one
-- transaction. No row uses it here; the owner creates the first ADMIN member afterwards
-- from Admin -> Team Members.
--
-- ORDER: apply this BEFORE deploying the API that reads/creates ADMIN. The schema-drift
-- guard reports `enum TeamRole.ADMIN` until it is applied.
--
-- Rollback: Postgres cannot drop an enum value; leave it (inert with no rows).

ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'ADMIN';
