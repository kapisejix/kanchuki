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

type EnumLike = {
  name: string;
  dbName?: string | null;
  values: readonly { name: string; dbName?: string | null }[];
};

/** "enum Type.VALUE" for each enum value the model has and the DB lacks. A missing type lists every value. */
export function missingEnumValues(
  enums: readonly EnumLike[],
  actual: Map<string, Set<string>>,
): string[] {
  const missing: string[] = [];
  for (const e of enums) {
    const type = e.dbName ?? e.name;
    const have = actual.get(type);
    for (const v of e.values) {
      if (!have?.has(v.dbName ?? v.name)) missing.push(`enum ${type}.${v.dbName ?? v.name}`);
    }
  }
  return missing.sort();
}

export type SchemaDrift = { ok: boolean; missing: string[]; checkedAt: number };

let cached: SchemaDrift | null = null;
let lastReported = '';

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
 * Migrations are applied by hand after deploy, so the boot check goes stale both ways.
 * Re-run it on a timer; unref'd so it never keeps the process alive.
 */
export function startSchemaDriftRecheck(everyMs = 15 * 60_000): void {
  setInterval(() => void checkSchemaDrift(), everyMs).unref();
}

/**
 * Read-only: two SELECTs on information_schema. Never throws — a DB that cannot be asked is
 * reported by /health's own DB check, and an unknown answer must not look like drift.
 */
export async function checkSchemaDrift(): Promise<SchemaDrift | null> {
  try {
    const [rows, enumRows] = await Promise.all([
      prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = current_schema()`,
      prisma.$queryRaw<{ typname: string; enumlabel: string }[]>`
        SELECT t.typname, e.enumlabel FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = current_schema()`,
    ]);
    const group = (pairs: [string, string][]) => {
      const out = new Map<string, Set<string>>();
      for (const [k, v] of pairs) out.set(k, (out.get(k) ?? new Set<string>()).add(v));
      return out;
    };
    const actual = group(rows.map((r) => [r.table_name, r.column_name]));
    const actualEnums = group((enumRows ?? []).map((r) => [r.typname, r.enumlabel]));
    const missing = [
      ...missingColumns(expectedColumns(Prisma.dmmf.datamodel.models), actual),
      ...missingEnumValues(Prisma.dmmf.datamodel.enums ?? [], actualEnums),
    ];
    cached = { ok: missing.length === 0, missing, checkedAt: Date.now() };
    // Alert on change only, so the periodic recheck does not repeat the same Sentry event.
    const signature = missing.join('|');
    if (signature !== lastReported) {
      lastReported = signature;
      if (!cached.ok) {
        const shown = missing.slice(0, 20).join(', ');
        console.error(
          `[schema-drift] ${missing.length} model column/enum value(s) missing in the database: ${shown}`,
        );
        Sentry.captureMessage(
          `Schema drift: ${missing.length} Prisma column/enum value(s) missing in DB`,
          {
            level: 'error',
            tags: { area: 'schema-drift' },
            extra: { missing: missing.slice(0, 50) },
          },
        );
      }
    }
    return cached;
  } catch (err) {
    console.warn('[schema-drift] check could not run:', err);
    return null;
  }
}
