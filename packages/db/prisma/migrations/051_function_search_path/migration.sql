-- Fix Supabase linter: function_search_path_mutable on public.prevent_hard_delete
-- Pin search_path so the trigger function can't be hijacked by a session-level
-- search_path change (schema-injection hardening).

ALTER FUNCTION public.prevent_hard_delete() SET search_path = public, pg_temp;
