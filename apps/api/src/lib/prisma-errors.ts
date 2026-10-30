const EXPECTED = new Set(['P2025', 'P2002']);

// `.catch(nullOnMissing)`: null only for "row not found" (P2025) / "duplicate" (P2002);
// any other error (DB down, permission denied, bad value) is a real failure and rethrows.
export const nullOnMissing = (e: unknown): null => {
  if (EXPECTED.has((e as { code?: string } | null)?.code ?? '')) return null;
  throw e;
};
