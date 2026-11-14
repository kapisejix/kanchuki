-- 157: design_templates — add the 1.91:1 landscape format (1200x628, Facebook landscape post).
-- NOT APPLIED by the agent; the owner applies it BEFORE the API that accepts the value is deployed
-- (admin create/update validates against the shared list, so an unapplied enum = 500 on save).
--
-- Enum value only; no table change, no data touched. Existing designs keep their format.
-- Rollback: Postgres cannot drop an enum value; leave it (inert while no row uses it).

ALTER TYPE "DesignFormat" ADD VALUE IF NOT EXISTS 'LANDSCAPE_1_91_1';
