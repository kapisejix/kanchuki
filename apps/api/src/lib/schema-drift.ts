import { Prisma, prisma } from '@kanchuki/db';
import * as Sentry from '@sentry/node';

/**
 * RC-160 guard: the deployed Prisma model names columns the live database may not have yet
 * (migrations are applied by the owner, by hand). A whole-row query then 500s with P2022.
 * This compares the model with information_schema and reports what is missing.
 *
 * Names only ever go to logs / Sentry — never to the anonymous /health body (H8-4).
 */

type ModelLike = {
  name: string;
  dbName?: string | null;
  fields: readonly { name: string; dbName?: string | null; kind: string }[];
};

/** Columns the Prisma model expects, keyed by table. Relation fields have no column. */
export function expectedColumns(models: readonly ModelLike[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of models) {
    const cols = m.fields
      .filter((f) => f.kind === 'scalar' || f.kind === 'enum' || f.kind === 'unsupported')
      .map((f) => f.dbName ?? f.name);
    out.set(m.dbName ?? m.name, cols);
  }
  return out;
}

/** "table.column" for each missing column, or "table (missing table)". Sorted. */
export function missingColumns(
  expected: Map<string, string[]>,
  actual: Map<string, Set<string>>,
): string[] {
  const missing: string[] = [];
  for (const [table, cols] of expected) {
    const have = actual.get(table);
    if (!have) {
      missing.push(`${table} (missing table)`);
      continue;
    }
    for (const c of cols) if (!have.has(c)) missing.push(`${table}.${c}`);
  }
  return missing.sort();
}

export type SchemaDrift = { ok: boolean; missing: string[]; checkedAt: number };

let cached: SchemaDrift | null = null;

/** Last result of {@link checkSchemaDrift}; null until the first check settles. */
export function getSchemaDrift(): SchemaDrift | null {
  return cached;
}

/**
 * What /health says about drift. Only "drift" + the opt-in flag fails the probe: Railway then
 * keeps the previous revision serving, so new code that expects a column the DB lacks never goes
 * live. "unknown" (check not run / DB unaskable) never fails it. Names are not part of the body.
 */
export function schemaHealth(
  drift: SchemaDrift | null,
  blocksHealth: boolean,
): { status: 'ok' | 'drift' | 'unknown'; failsHealth: boolean } {
  if (!drift) return { status: 'unknown', failsHealth: false };
  if (drift.ok) return { status: 'ok', failsHealth: false };
  return { status: 'drift', failsHealth: blocksHealth };
}

/**
 * Read-only: one SELECT on information_schema. Never throws — a DB that cannot be asked is
 * reported by /health's own DB check, and an unknown answer must not look like drift.
 */
export async function checkSchemaDrift(): Promise<SchemaDrift | null> {
  try {
    const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema()`;
    const actual = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = actual.get(r.table_name) ?? new Set<string>();
      set.add(r.column_name);
      actual.set(r.table_name, set);
    }
    const missing = missingColumns(expectedColumns(Prisma.dmmf.datamodel.models), actual);
    cached = { ok: missing.length === 0, missing, checkedAt: Date.now() };
    if (!cached.ok) {
      const shown = missing.slice(0, 20).join(', ');
      console.error(
        `[schema-drift] ${missing.length} model column(s) missing in the database: ${shown}`,
      );
      Sentry.captureMessage(`Schema drift: ${missing.length} Prisma column(s) missing in DB`, {
        level: 'error',
        tags: { area: 'schema-drift' },
        extra: { missing: missing.slice(0, 50) },
      });
    }
    return cached;
  } catch (err) {
    console.warn('[schema-drift] check could not run:', err);
    return null;
  }
}
