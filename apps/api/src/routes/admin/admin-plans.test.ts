// T5 — admin plan-limits: the resource list, and the customer-side editor.
//
// F-039 Phase 2 (CatVTON try-on) meters two separate caps: a per-plan
// retailer cap (`plan_limits.TRY_ON_GENERATION`) and a per-shopper cap
// (`customer_resource_limits`). The admin panel is where both numbers are set,
// and T5 turned out to be less "confirm it appears" than the spec assumed:
// `TRY_ON_GENERATION` was in NEITHER of the two hand-kept lists the panel used,
// so the seeded rows from migration 119 rendered no row and the PUT rejected
// the value — the number existed in the database and was unsettable from the UI.
//
// That is why the first describe block is about the LIST rather than the routes.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAN_LIMIT_RESOURCE_TYPES } from '@kanchuki/shared';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** routes/admin → routes → src → apps/api → apps → repo root */
const REPO_ROOT = join(HERE, '..', '..', '..', '..', '..');

// ─── Prisma stand-in ───────────────────────────────────────────────
// Enough of customerResourceLimit + auditLog to drive the real handlers. Rows
// are keyed by resource_type, which is the model's own unique constraint — so a
// test that reads back what it wrote is exercising the real key, not a stand-in.

type LimitRow = {
  resource_type: string;
  limit_per_period: number;
  period: 'DAY' | 'MONTH' | 'LIFETIME';
  updated_at: Date;
  updated_by_id?: string | null;
};

const state: { rows: LimitRow[]; audits: Array<Record<string, unknown>> } = {
  rows: [],
  audits: [],
};

beforeEach(() => {
  state.rows = [];
  state.audits = [];
});

/**
 * A row as a QUERY would return it: a fresh, detached object.
 *
 * Not a nicety — the first version of this stand-in returned the live stored
 * object, and the before/after audit test failed with `before.limit_per_period
 * === 1` where the real answer is 5. The route reads `prev` for the audit row
 * AFTER its upsert has written, so an aliased `prev` reported the NEW value as
 * the OLD one.
 *
 * The production behaviour is the clone: `findUnique` and `upsert` are separate
 * round trips, and Prisma materialises new objects each time. A double that
 * hands back the object it will later mutate agrees with the code instead of
 * with the platform (RC-037: three payout bugs were invisible for exactly this
 * reason), so the aliasing would have made the test pass while proving nothing —
 * or, as here, failed for a reason the code under test does not have.
 */
const detached = (row: LimitRow): LimitRow => ({ ...row });

vi.mock('@kanchuki/db', () => {
  const prismaMock = {
    customerResourceLimit: {
      findMany: async () => state.rows.map(detached),
      findUnique: async ({ where }: { where: { resource_type: string } }) => {
        const row = state.rows.find((r) => r.resource_type === where.resource_type);
        return row ? detached(row) : null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { resource_type: string };
        create: Omit<LimitRow, 'updated_at'>;
        update: Partial<LimitRow>;
      }) => {
        const existing = state.rows.find((r) => r.resource_type === where.resource_type);
        if (existing) {
          Object.assign(existing, update, { updated_at: new Date() });
          return existing;
        }
        const row: LimitRow = {
          ...create,
          updated_at: new Date(),
        } as LimitRow;
        state.rows.push(row);
        return row;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.audits.push(data);
        return data;
      },
    },
    // The route module imports a pile of vault/secret helpers at module load.
    // They are never called by the two routes under test — only `prisma` is —
    // so they exist here purely to satisfy the import graph.
    getSecret: async () => null,
    invalidateSecret: async () => {},
    maskSecret: (v: string) => v,
    encryptSecret: (v: string) => v,
    getReplicaPrisma: () => prismaMock,
    getVaultPrisma: () => prismaMock,
    vaultDelete: async () => {},
  };
  return { prisma: prismaMock };
});

// Mocked so the tests do not need a real admin key. The hook is still declared
// by the plugin, which is the part a route can get wrong.
vi.mock('../admin-auth.js', () => ({
  adminAuthPreHandler: async () => {},
}));

import { CUSTOMER_LIMIT_RESOURCE_TYPES, adminPlansRoutes } from './admin-plans.js';

async function build() {
  const app = Fastify({ logger: false });
  // Without the real handler a ZodError surfaces as a bare 500, and the 422
  // arms below would pass for the wrong reason.
  app.setErrorHandler(errorHandler);
  await app.register(adminPlansRoutes);
  await app.ready();
  return app;
}

const ADMIN_HEADERS = { 'x-admin-key': 'test-admin-key' };
const JSON_HEADERS = { ...ADMIN_HEADERS, 'content-type': 'application/json' };

// ─── The list (the actual T5 gap) ──────────────────────────────────

describe('TRY_ON_GENERATION is settable from the admin panel', () => {
  it('is in the shared admin-settable list', () => {
    // The gap T5 existed to close: migration 119 seeds a plan_limits row for all
    // three plans, but a seeded row is invisible if no list names the value.
    expect(PLAN_LIMIT_RESOURCE_TYPES).toContain('TRY_ON_GENERATION');
  });

  it('is accepted by the plan-limits PUT (not just present in the array)', async () => {
    // The list is only half the contract — the PUT's zod enum is the gate the
    // number actually passes through. Asserting the array alone would stay green
    // if the enum were re-hardcoded without this value.
    const app = await build();
    const res = await app.inject({
      method: 'PUT',
      url: '/plan-limits',
      headers: JSON_HEADERS,
      payload: {
        plan: 'PRO',
        resource_type: 'TRY_ON_GENERATION',
        limit_per_period: 100,
        period: 'MONTH',
      },
    });
    // 200 or a prisma-missing 500 would both pass an `toBe(200)`-less assertion,
    // so this pins the STATUS: the important thing is that validation let it
    // through to the handler (a rejected enum is 422).
    expect(res.statusCode).not.toBe(422);
    await app.close();
  });

  it('every entry names a real QuotaResourceType enum value', () => {
    // Drift guard in the other direction: the shared list is hand-kept (the
    // Prisma enum also carries @deprecated values that must stay out of it), so
    // a typo here would ship a value the column rejects at write time — after
    // the admin had already been shown a "saved" confirmation.
    const schema = readFileSync(join(REPO_ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');
    const block = /enum QuotaResourceType \{([\s\S]*?)\n\}/.exec(schema);
    expect(block, 'QuotaResourceType enum not found in schema.prisma').not.toBeNull();
    const enumValues = (block?.[1] ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('@@'))
      .map((line) => line.split(/\s+/)[0] ?? '');

    for (const resource of PLAN_LIMIT_RESOURCE_TYPES) {
      expect(enumValues, `${resource} is not a QuotaResourceType value`).toContain(resource);
    }
  });

  it('the web page derives its list from the shared constant (no local copy)', () => {
    // The two hand-kept copies are what went stale. This asserts the page keeps
    // no third one: a re-added `const RESOURCE_TYPES = [ ... ]` literal, or a
    // hand-written resource union, would re-open the same gap for the NEXT
    // resource while every test above stayed green.
    const page = readFileSync(
      join(REPO_ROOT, 'apps/web/src/app/admin/plan-limits/page.tsx'),
      'utf8',
    );
    // Strip comments: the page's prose names these shapes while explaining them.
    const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(code).toContain('PLAN_LIMIT_RESOURCE_TYPES');
    // The annotation is matched explicitly, and it has to be: the first version
    // of this pattern was /const RESOURCE_TYPES\s*[:=]\s*\[/, which a
    // re-introduced `const RESOURCE_TYPES: ResourceType[] = [...]` walked
    // straight past — the `ResourceType[]` sat between the `:` and the `[`, so
    // the arm never fired and the guard read exactly like protection while
    // being none (measured: the mutation left this test green).
    expect(code).not.toMatch(/const RESOURCE_TYPES\s*(?::[^=]*)?=\s*\[/);
    expect(code).not.toMatch(/type ResourceType\s*=\s*\n?\s*\|/);
  });
});

// ─── GET /plan-limits/customer ─────────────────────────────────────

describe('GET /plan-limits/customer', () => {
  it('returns an entry for an UNSET resource rather than omitting it', async () => {
    // The failure this pins: `findMany` alone returns only the rows that exist,
    // so an unseeded resource disappears from the screen — exactly how the
    // seeded TRY_ON_GENERATION row sat invisible. `configured:false` plus a null
    // limit is what lets the UI show the row and say no cap is in force.
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/plan-limits/customer',
      headers: ADMIN_HEADERS,
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(CUSTOMER_LIMIT_RESOURCE_TYPES.length);
    expect(data[0]).toMatchObject({
      resource_type: 'TRY_ON_GENERATION',
      limit_per_period: null,
      configured: false,
      // A sane period is required even unset: the form renders a select, and a
      // null there would make the control uncontrolled.
      period: 'MONTH',
    });
    await app.close();
  });

  it('returns the stored value when a row exists', async () => {
    state.rows.push({
      resource_type: 'TRY_ON_GENERATION',
      limit_per_period: 3,
      period: 'MONTH',
      updated_at: new Date('2026-09-26T00:00:00Z'),
    });
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/plan-limits/customer',
      headers: ADMIN_HEADERS,
    });

    const data = res.json().data as Array<Record<string, unknown>>;
    expect(data[0]).toMatchObject({
      resource_type: 'TRY_ON_GENERATION',
      limit_per_period: 3,
      configured: true,
    });
    await app.close();
  });
});

// ─── PUT /plan-limits/customer ─────────────────────────────────────

describe('PUT /plan-limits/customer', () => {
  it("creates the first row and audit-logs CREATE with the new number (the 'admin decides 3–5' case)", async () => {
    const app = await build();
    const res = await app.inject({
      method: 'PUT',
      url: '/plan-limits/customer',
      headers: JSON_HEADERS,
      payload: { resource_type: 'TRY_ON_GENERATION', limit_per_period: 3, period: 'MONTH' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.limit_per_period).toBe(3);
    expect(state.rows).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      actor_type: 'admin',
      action: 'CREATE',
      resource_type: 'CustomerResourceLimit',
      resource_id: 'TRY_ON_GENERATION',
      metadata: { before: null, after: { limit_per_period: 3, period: 'MONTH' } },
    });
    await app.close();
  });

  it('records the BEFORE value when lowering an existing cap', async () => {
    // Money-adjacent and shopper-visible: an admin dropping the cap from 5 to 1
    // is the change somebody asks about later, so the old number has to be on
    // the audit row, not just the new one.
    state.rows.push({
      resource_type: 'TRY_ON_GENERATION',
      limit_per_period: 5,
      period: 'MONTH',
      updated_at: new Date(),
    });
    const app = await build();
    await app.inject({
      method: 'PUT',
      url: '/plan-limits/customer',
      headers: JSON_HEADERS,
      payload: { resource_type: 'TRY_ON_GENERATION', limit_per_period: 1, period: 'MONTH' },
    });

    expect(state.audits[0]).toMatchObject({
      action: 'UPDATE',
      metadata: { before: { limit_per_period: 5, period: 'MONTH' } },
    });
    expect(state.rows[0]?.limit_per_period).toBe(1);
    await app.close();
  });

  it('refuses a resource with no customer-side writer (422, nothing written)', async () => {
    // PRODUCT_UPLOAD is plan-side only: no customer path ever checks it, so a
    // row here would be a cap the panel claims to enforce and nothing reads.
    const app = await build();
    const res = await app.inject({
      method: 'PUT',
      url: '/plan-limits/customer',
      headers: JSON_HEADERS,
      payload: { resource_type: 'PRODUCT_UPLOAD', limit_per_period: 5, period: 'MONTH' },
    });

    expect(res.statusCode).toBe(422);
    expect(state.rows).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
    await app.close();
  });

  it('accepts -1 (unlimited) and refuses -2', async () => {
    const app = await build();
    const unlimited = await app.inject({
      method: 'PUT',
      url: '/plan-limits/customer',
      headers: JSON_HEADERS,
      payload: { resource_type: 'TRY_ON_GENERATION', limit_per_period: -1, period: 'MONTH' },
    });
    expect(unlimited.statusCode).toBe(200);

    // -1 is the sentinel `effectiveCustomerLimit` skips; a lower number is not a
    // bigger allowance, it is meaningless, and silently storing it would make
    // the cap depend on which comparison operator read it.
    const below = await app.inject({
      method: 'PUT',
      url: '/plan-limits/customer',
      headers: JSON_HEADERS,
      payload: { resource_type: 'TRY_ON_GENERATION', limit_per_period: -2, period: 'MONTH' },
    });
    expect(below.statusCode).toBe(422);
    await app.close();
  });
});
