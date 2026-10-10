// ── DELETE-permission guards (RC-049, RC-050) ──────────────────────
//
// Two bugs of one shape: a boundary that lives in the database (a GRANT, an FK)
// and that no type signature or unit test can see, so the code typechecks, ships
// and fails only in production.
//
//  RC-049  `kanchuki_app` has DELETE revoked platform-wide (SECURITY §19.1). A route
//          that calls `prisma.<model>.delete()` on a table nobody granted DELETE on
//          500s with 42501 (or, under a swallowed `.catch`, silently does nothing).
//  RC-050  `hardDeleteRetailer()` deletes from a hand-written list inside ONE
//          transaction. A table with a RESTRICT FK that is missing from the list makes
//          `DELETE FROM retailers` throw and rolls the whole delete back.
//
// Both are derived here from the sources of truth — `schema.prisma`, the migration
// SQL, and the purge job — so they cannot drift the way the hand-written inventories
// did. A test (not a `scripts/check-*.sh`) so it needs no CI-pipeline change and also
// fires on every local `pnpm test`, like `retired-tryon-guard.test.ts`.
//
// Static analysis only: it does not connect to a database. A GRANT that a migration
// states but an operator never applied is not visible here (that is what the
// `information_schema.role_table_grants` query in RC-049's proof is for).

import { type Dirent, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '@kanchuki/shared/testing';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const read = (p: string) => readFileSync(join(REPO_ROOT, p), 'utf8');
const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

// ── schema.prisma → models, tables, relations ──────────────────────

type Relation = { parent: string; optional: boolean; onDelete: string | null };
type Model = { name: string; table: string; relations: Relation[] };

function parseSchema(): Model[] {
  const blocks = read('packages/db/prisma/schema.prisma')
    .split(/\n(?=model \w+ \{)/)
    .filter((b) => b.startsWith('model '));
  return blocks.map((body) => {
    const name = /^model (\w+)/.exec(body)?.[1] ?? '';
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? name;
    const relations: Relation[] = [];
    // Owning side only: the line that carries `fields: [...]`.
    for (const m of body.matchAll(/^\s*\w+\s+(\w+)(\?)?\s+@relation\(([^)]*)\)/gm)) {
      const args = m[3] ?? '';
      if (!/fields:\s*\[/.test(args)) continue;
      relations.push({
        parent: m[1] ?? '',
        optional: m[2] === '?',
        onDelete: /onDelete:\s*(\w+)/.exec(args)?.[1] ?? null,
      });
    }
    return { name, table, relations };
  });
}

// Prisma's default: a required relation is Restrict, an optional one is SetNull.
const effectiveOnDelete = (r: Relation) => r.onDelete ?? (r.optional ? 'SetNull' : 'Restrict');
const blocksParentDelete = (r: Relation) => {
  const a = effectiveOnDelete(r);
  return a !== 'Cascade' && a !== 'SetNull';
};

// ── RC-049: ungranted deletes through the app role ─────────────────

function tablesGrantedDeleteToApp(): Set<string> {
  const out = new Set<string>();
  const files = [
    'scripts/setup-role-separation.sql',
    ...readdirSync(join(REPO_ROOT, 'packages/db/prisma/migrations'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `packages/db/prisma/migrations/${d.name}/migration.sql`),
  ].filter((f) => existsSync(join(REPO_ROOT, f)));

  for (const file of files) {
    const text = read(file).replace(/--.*$/gm, ''); // `;` and keywords inside comments are noise
    // Plain statements: GRANT DELETE ON [TABLE] a, "b" TO kanchuki_app;
    for (const m of text.matchAll(
      /GRANT\s+DELETE\s+ON\s+(?:TABLE\s+)?([^;]*?)\s+TO\s+kanchuki_app\b/gi,
    )) {
      for (const raw of (m[1] ?? '').split(',')) {
        const t = raw.replace(/["\s]/g, '');
        if (/^\w+$/.test(t)) out.add(t);
      }
    }
    // Guarded loop form (migration 125): the table names are the quoted ARRAY[...] items.
    if (/format\(\s*'GRANT DELETE ON TABLE %I TO kanchuki_app'/i.test(text)) {
      for (const arr of text.matchAll(/ARRAY\s*\[([^\]]*)\]/g)) {
        for (const q of (arr[1] ?? '').matchAll(/'(\w+)'/g)) out.add(q[1] ?? '');
      }
    }
  }
  return out;
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true }) as Dirent[]) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) listSourceFiles(p, acc);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) acc.push(p);
  }
  return acc;
}

describe('RC-049 — raw deletes on the app role target only tables granted DELETE', () => {
  const models = parseSchema();
  const tableByAccessor = new Map(
    models.map((m) => [m.name.charAt(0).toLowerCase() + m.name.slice(1), m.table]),
  );
  const granted = tablesGrantedDeleteToApp();

  it('the parser sees the known exceptions (a guard that cannot fail reads like one that passes)', () => {
    for (const t of ['background_images', 'product_photos', 'showcase_designs', 'staff_invites']) {
      expect(granted.has(t), `${t} should be parsed as granted to kanchuki_app`).toBe(true);
    }
    expect(tableByAccessor.get('campaign')).toBe('campaigns');
  });

  it('no `prisma.<model>.delete()/deleteMany()` targets a table the app role cannot delete from', () => {
    const apiSrc = join(REPO_ROOT, 'apps/api/src');
    const violations: string[] = [];
    for (const file of listSourceFiles(apiSrc)) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const m of code.matchAll(/\bprisma\.(\w+)\.(delete|deleteMany)\s*\(/g)) {
        const accessor = m[1] ?? '';
        const table = tableByAccessor.get(accessor);
        if (!table || granted.has(table)) continue;
        violations.push(
          `${relative(REPO_ROOT, file).replace(/\\/g, '/')}:${lineOf(code, m.index ?? 0)}  prisma.${accessor}.${m[2]}() → table "${table}" has no DELETE grant for kanchuki_app`,
        );
      }
    }
    expect(
      violations,
      `Route the delete through getPurgePrisma() (+ GRANT to kanchuki_purge), or grant DELETE to kanchuki_app in a migration if the table is non-§19 config.\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});

// ── RC-050: the retailer hard-delete list vs the schema ────────────

describe('RC-050 — hardDeleteRetailer() lists every table that would block `DELETE FROM retailers`', () => {
  const models = parseSchema();
  const listed = new Set(
    [
      ...stripComments(read('apps/api/src/jobs/purge-retailer-now.ts')).matchAll(
        /DELETE FROM (\w+)/g,
      ),
    ].map((m) => m[1] ?? ''),
  );

  it('the parser sees the list (and the root row)', () => {
    expect(listed.has('retailers')).toBe(true);
    expect(listed.size).toBeGreaterThan(20);
  });

  it('every table with a RESTRICT/NoAction FK into a deleted table is itself deleted first', () => {
    const byName = new Map(models.map((m) => [m.name, m]));
    // Rows that disappear: the explicit list, plus anything that cascades from them.
    const gone = new Set(listed);
    for (let grew = true; grew; ) {
      grew = false;
      for (const m of models) {
        if (gone.has(m.table)) continue;
        const cascades = m.relations.some(
          (r) => effectiveOnDelete(r) === 'Cascade' && gone.has(byName.get(r.parent)?.table ?? ''),
        );
        if (cascades) {
          gone.add(m.table);
          grew = true;
        }
      }
    }
    const missing: string[] = [];
    for (const m of models) {
      if (gone.has(m.table)) continue;
      for (const r of m.relations) {
        const parent = byName.get(r.parent);
        if (parent && gone.has(parent.table) && blocksParentDelete(r)) {
          missing.push(
            `${m.table} → ${parent.table} (${effectiveOnDelete(r)}): add "DELETE FROM ${m.table} WHERE …" before "${parent.table}" in purge-retailer-now.ts, and GRANT DELETE to kanchuki_purge`,
          );
        }
      }
    }
    expect(missing, missing.join('\n')).toEqual([]);
  });
});
