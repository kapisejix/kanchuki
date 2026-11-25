// pg ships no types and @types/pg is not installed; only
// apply-commission-migration.ts uses it, so an untyped module is enough.
declare module 'pg';
