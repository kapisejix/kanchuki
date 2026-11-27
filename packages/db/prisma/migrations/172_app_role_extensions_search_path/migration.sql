-- RC-193: `[jobs] generate-embedding failed: type "vector" does not exist` (42704).
-- pgvector lives in schema `extensions`. kanchuki_app had no USAGE on it and no
-- role search_path (read-only check 2026-11-27: has_schema_privilege = false,
-- rolconfig = null), so unqualified `::vector` casts and the `<=>` operator fail.
-- Takes effect on NEW connections: restart the API/worker after applying.
-- kanchuki_migrator / kanchuki_purge also lack USAGE; not granted (not needed for
-- current queries). Add if a migration or purge path ever touches vector columns.

GRANT USAGE ON SCHEMA extensions TO kanchuki_app;
ALTER ROLE kanchuki_app SET search_path = "$user", public, extensions;
