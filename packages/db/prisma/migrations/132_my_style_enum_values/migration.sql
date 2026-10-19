-- 132_my_style_enum_values
--
-- F-045 My Style (docs/tasks/pending/my-style.md §4.1) — the one enum value that
-- meters a customer's photo/style analyses. Deliberately ENUM-ONLY; 133 seeds the
-- customer_resource_limits row that uses it.
--
-- PostgreSQL 55P04: a value added via ALTER TYPE ... ADD VALUE cannot be USED in
-- the same transaction that added it, and Prisma runs each migration file as one
-- transaction. 133's seed INSERTs 'STYLE_ANALYSIS', so folding this into it would
-- abort with `unsafe use of new value of enum type`. Same split as 118/119 and
-- 128/129.
--
-- checkCustomerQuota() fails OPEN when no limit row exists, so the row in 133 is
-- what stops an unseeded environment from running unlimited paid Vision calls.

ALTER TYPE "QuotaResourceType" ADD VALUE IF NOT EXISTS 'STYLE_ANALYSIS';
