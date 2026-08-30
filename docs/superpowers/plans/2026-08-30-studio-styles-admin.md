# Studio Styles Admin — DB-Backed Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AI Studio Shoot styles out of the hardcoded `STUDIO_TEMPLATES` / `STUDIO_MODELS` constants into a `studio_styles` DB table managed from a new Admin → Studio Styles page (publish/hide/draft, per-plan assignment, thumbnail upload), and rework the mobile picker into Product Only / Models tabs fed by a plan-filtered API endpoint.

**Architecture:** New `StudioStyle` Prisma model is the single source of truth. Admin CRUD routes mirror `admin-media.ts` (background-images library). A retailer-auth `GET /v1/products/studio-styles` returns the published styles the retailer's plan allows (no `prompt` in the payload). The generate-path (`products-studio.ts` → BullMQ job → `generateStudioImage`) resolves the style row by slug and passes `prompt` / `tab` / `engine` through. The IDM-VTON photo-model path is deleted; the "Models" tab renders a person via the existing demographic person-swap keyed off the product category.

**Tech Stack:** Fastify + Zod + Prisma (PostgreSQL, enum arrays) on the API; Next.js App Router (client components, `framer-motion`, `lucide-react`) for the admin panel; React Native + `@tanstack/react-query` + NativeWind for mobile; Vitest (mock-based, no test DB) for API tests.

**Spec:** `docs/superpowers/specs/2026-08-30-studio-styles-admin-design.md`

## Global Constraints

- **INR only**, no USD anywhere.
- **Migrations are written by the implementer, applied by the owner** — never run `prisma migrate deploy` / `railway up` / any DB write against production. The migration folder + `migration.sql` is the deliverable.
- **Docs track commits** — when the feature lands, update `CLAUDE.md` index (owner-approval-gated — leave the exact row in the PR description, do not self-merge a CLAUDE.md edit), `docs/BUILD-LOG.md`, `docs/PRO-REQUIREMENTS.md`, `docs/PLAN.md` in the same PR.
- **Run after auth/checkout-adjacent changes:** `npx vitest run src/routes/security.test.ts` and `npx vitest run src/routes/admin.login.test.ts` (from `apps/api`).
- **`npx tsc --noEmit` must be clean** in `packages/shared`, `apps/api`, and `apps/mobile` before any task is marked done.
- **Prisma enum array filter:** `where: { plans: { has: retailerPlan } }`.
- **Style slug regex:** `/^[a-z0-9_]{2,40}$/`, unique, immutable after create.
- **Engine values** (the only valid `engine` strings): `flux_pro`, `imagen_3`, `imagen_3_fast`, `flux_schnell`, `bfl_kontext`. `null` = default cascade. (`idm_vton` is removed.)
- **Demographic values** (`audience` array members): `womens`, `mens`, `teen_girl`, `teen_boy`, `kids_girl`, `kids_boy`.
- **Commit style:** Conventional Commits; end message with the repo's `Co-Authored-By` + `Claude-Session` trailer lines.

---

## File Structure

**Created:**
- `packages/db/prisma/migrations/075_studio_styles/migration.sql` — table + 2 enums + 29 seed rows.
- `apps/api/src/routes/admin/admin-studio-styles.ts` — admin CRUD + thumbnail presign.
- `apps/api/src/routes/admin/admin-studio-styles.test.ts` — admin route tests.
- `apps/web/src/app/admin/studio-styles/page.tsx` — admin management grid.
- `scripts/gen-studio-styles-seed.mjs` — one-shot: reads the current constant, emits the seed `INSERT`s (used in Task 1, then deleted).

**Modified:**
- `packages/db/prisma/schema.prisma` — add `StudioStyle` model + `StudioStyleStatus` / `StudioStyleTab` enums.
- `packages/shared/src/constants/index.ts` — delete `STUDIO_TEMPLATES` / `STUDIO_MODELS` + their helpers/types; add `R2_PATHS.studioStyleThumb`; keep the demographic helpers.
- `apps/api/src/routes/products/products-studio.ts` — add `GET /studio-styles`; rework `POST .../studio-shoot` (slug lookup + plan gate); drop `engine`/`model_id` from the body.
- `apps/api/src/lib/studio-shoot.ts` — new `generateStudioImage` signature (`prompt`/`tab`/`engine`); delete the IDM-VTON branch, `STUDIO_MODELS` usage, `StudioModelId`; drop `idm_vton` from `StudioEngine`.
- `apps/api/src/jobs/studio-shoot.ts` + `apps/api/src/jobs/index.ts` — `StudioShootJobData` carries `slug`/`prompt`/`tab`/`engine`/`audience`/`style_id`; bump `usage_count`.
- `apps/api/src/routes/products/products-festival-background.ts` — replace `getStudioTemplate` with a `studioStyle` slug lookup.
- `apps/api/src/routes/admin/admin-photo-cleanup.ts` — bench route: optional `slug` → `studioStyle` lookup instead of `getStudioTemplate`; drop `model_id`.
- `apps/api/src/routes/admin/index.ts` + `apps/api/src/routes/admin.ts` — export + register `adminStudioStylesRoutes`.
- `apps/api/src/routes/products-studio.test.ts`, `apps/api/src/lib/studio-shoot.test.ts` — updated for the new contract.
- `apps/mobile/src/lib/api/products.ts` — add `getStudioStyles()`; drop `options` from `startStudioShoot`.
- `apps/mobile/src/hooks/useProductAiStudio.ts` — `handleStartStudioShoot(slug)`; `studioTab: 'product' | 'models'`.
- `apps/mobile/src/components/product-detail/ProductStudioModal.tsx` — DB fetch, `Product Only` / `Models` tabs, demographic filter, `Label (/slug)` rows.
- `apps/mobile/app/product/[id].tsx` — prop wiring.
- `apps/web/src/app/admin/components/Sidebar.tsx` — nav entry.
- `scripts/studio-shoot-demo.mjs` — stop importing the deleted constant (or delete the script).
- Docs: `CLAUDE.md`, `docs/BUILD-LOG.md`, `docs/PRO-REQUIREMENTS.md`, `docs/PLAN.md`.

---

## Task 1: Prisma schema + migration `075_studio_styles`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/075_studio_styles/migration.sql`
- Create (throwaway): `scripts/gen-studio-styles-seed.mjs`

**Interfaces:**
- Produces: Prisma model `StudioStyle` with fields `id, slug, label, description, prompt, tab (StudioStyleTab), status (StudioStyleStatus), plans (SubscriptionPlan[]), engine (String?), audience (String[]), thumbnail_url (String?), thumbnail_r2_key (String?), sort_order (Int), usage_count (Int), created_at, updated_at`. Enums `StudioStyleStatus { DRAFT PUBLISHED HIDDEN }`, `StudioStyleTab { PRODUCT MODEL }`.

- [ ] **Step 1: Add the model + enums to the schema**

In `packages/db/prisma/schema.prisma`, near the other admin-library models (after `model BackgroundImage { ... }` / `enum BackgroundTone`):

```prisma
enum StudioStyleStatus {
  DRAFT
  PUBLISHED
  HIDDEN
}

enum StudioStyleTab {
  PRODUCT
  MODEL
}

model StudioStyle {
  id               String             @id @default(cuid())
  slug             String             @unique
  label            String
  description      String
  prompt           String
  tab              StudioStyleTab
  status           StudioStyleStatus  @default(DRAFT)
  plans            SubscriptionPlan[] @default([])
  engine           String?
  audience         String[]           @default([])
  thumbnail_url    String?
  thumbnail_r2_key String?
  sort_order       Int                @default(0)
  usage_count      Int                @default(0)
  created_at       DateTime           @default(now())
  updated_at       DateTime           @updatedAt

  @@index([status])
  @@map("studio_styles")
}
```

- [ ] **Step 2: Generate the Prisma client and verify the schema**

Run: `cd packages/db && npx prisma validate && npx prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and client generated with no error.

- [ ] **Step 3: Write the seed generator script**

Create `scripts/gen-studio-styles-seed.mjs`:

```js
// One-shot: reads the current STUDIO_TEMPLATES constant and emits the
// INSERT rows for migration 075. Run once, paste output into migration.sql,
// then delete this file.
import { STUDIO_TEMPLATES } from '../packages/shared/src/constants/index.ts'

const KEEP_MODEL = [
  'blossom_atrium','boutique_showroom','runway','copper_diamond','dupatta_motion',
  'rooftop_golden','gradient_hero','heritage_library','heritage_street','lakeside_deck',
  'mall_concourse','pastel_gradient','botanical_garden','seated_haveli_steps','studiomodel',
  'teen_street','tree_tunnel','editorial_vogue','male_with_car','male_with_bike','kids_playing',
]
const KEEP_PRODUCT = [
  'display_hanger','studio_home','studio_minimal','display_mannequin','studio_pro',
  'studio_beige','wedding_elegant','warm_luxury',
]
const order = [...KEEP_MODEL, ...KEEP_PRODUCT]
const sq = (s) => `'${String(s).replace(/'/g, "''")}'`

const rows = order.map((slug, i) => {
  const t = STUDIO_TEMPLATES.find((x) => x.id === slug)
  if (!t) throw new Error(`missing template: ${slug}`)
  const tab = KEEP_PRODUCT.includes(slug) ? 'PRODUCT' : 'MODEL'
  const audience = Array.isArray(t.audience) ? t.audience : []
  const audienceLit = `ARRAY[${audience.map(sq).join(',')}]::text[]`
  return `  (gen_random_uuid()::text, ${sq(slug)}, ${sq(t.label)}, ${sq(t.description)}, ${sq(t.prompt)}, ` +
         `'${tab}'::"StudioStyleTab", 'DRAFT'::"StudioStyleStatus", ` +
         `'{}'::"SubscriptionPlan"[], NULL, ${audienceLit}, ${i})`
})

console.log(
  `INSERT INTO studio_styles (id, slug, label, description, prompt, tab, status, plans, engine, audience, sort_order) VALUES\n` +
  rows.join(',\n') + ';\n'
)
```

Run: `node --experimental-strip-types scripts/gen-studio-styles-seed.mjs > /tmp/studio-seed.sql`
(If `--experimental-strip-types` is unavailable, first `pnpm --filter @kanchuki/shared build` and change the import to `../packages/shared/dist/constants/index.js`.)
Expected: one `INSERT` with 29 `VALUES` rows, no "missing template" error.

- [ ] **Step 4: Write `migration.sql`**

Create `packages/db/prisma/migrations/075_studio_styles/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "StudioStyleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');
CREATE TYPE "StudioStyleTab" AS ENUM ('PRODUCT', 'MODEL');

-- CreateTable
CREATE TABLE "studio_styles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "tab" "StudioStyleTab" NOT NULL,
    "status" "StudioStyleStatus" NOT NULL DEFAULT 'DRAFT',
    "plans" "SubscriptionPlan"[] DEFAULT ARRAY[]::"SubscriptionPlan"[],
    "engine" TEXT,
    "audience" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbnail_url" TEXT,
    "thumbnail_r2_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "studio_styles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_styles_slug_key" ON "studio_styles"("slug");
CREATE INDEX "studio_styles_status_idx" ON "studio_styles"("status");

-- Seed (29 rows: 21 MODEL + 8 PRODUCT).
-- Paste the output of scripts/gen-studio-styles-seed.mjs (Step 3) below,
-- replacing this comment. Verify the column list matches:
-- (id, slug, label, description, prompt, tab, status, plans, engine, audience, sort_order)
INSERT INTO studio_styles (id, slug, label, description, prompt, tab, status, plans, engine, audience, sort_order) VALUES
  -- <paste 29 generated rows here>
;
```

If `updated_at` needs a value in the seed (it has no default), add `, "updated_at"` to the column list and `, CURRENT_TIMESTAMP` to each generated row, or add `ALTER TABLE studio_styles ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;` just before the INSERT and drop it after (Prisma manages it at runtime regardless).

- [ ] **Step 5: Verify the migration parses (no prod)**

Run: `cd packages/db && npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > /dev/null && echo OK`
(Or, with a local scratch Postgres: `npx prisma migrate dev --name studio_styles --create-only` then inspect. Never point at production.)
Expected: no SQL syntax error; the diff shows no drift between the migration and the schema for `studio_styles`.

- [ ] **Step 6: Delete the throwaway generator and commit**

```bash
rm scripts/gen-studio-styles-seed.mjs
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/075_studio_styles/migration.sql
git commit -m "feat(db): studio_styles table + enums + 29-row seed migration (075)

Owner applies the migration. Model is the source of truth for AI Studio
Shoot styles, replacing the STUDIO_TEMPLATES constant."
```

---

## Task 2: Admin CRUD routes (`admin-studio-styles.ts`)

**Files:**
- Create: `apps/api/src/routes/admin/admin-studio-styles.ts`
- Create: `apps/api/src/routes/admin/admin-studio-styles.test.ts`
- Modify: `apps/api/src/routes/admin/index.ts` (add `export { adminStudioStylesRoutes } from "./admin-studio-styles.js";`)
- Modify: `apps/api/src/routes/admin.ts` (import in the `from "./admin/index.js"` block + `await server.register(adminStudioStylesRoutes);` beside `adminMediaRoutes`)
- Modify: `packages/shared/src/constants/index.ts` — add to `R2_PATHS`: `studioStyleThumb: (filename: string) => \`admin/studio-styles/${filename}\`,`

**Interfaces:**
- Consumes: `adminAuthPreHandler` from `../admin-auth.js`; `getUploadPresignedUrl, publicUrl, deleteObject` from `@kanchuki/ai`; `prisma` from `@kanchuki/db`; `R2_PATHS` from `@kanchuki/shared`.
- Produces: routes under `/v1/admin` —
  `GET /admin/studio-styles` → `{ data: StudioStyleRow[] }` (all rows, full payload incl. `prompt`, ordered `sort_order asc, created_at asc`).
  `POST /admin/studio-styles/thumbnail-url` → `{ data: { upload_url, r2_key, public_url, expires_in } }`.
  `POST /admin/studio-styles` → `{ data: StudioStyleRow }` (201).
  `PATCH /admin/studio-styles/:id` → `{ data: StudioStyleRow }`.
  `DELETE /admin/studio-styles/:id` → `{ data: { id, deleted: true } }`.
  `StudioStyleRow` = the full Prisma `StudioStyle` shape.

- [ ] **Step 1: Add the R2 path helper**

In `packages/shared/src/constants/index.ts`, inside the `R2_PATHS` object (next to `backgroundImage`):

```ts
  studioStyleThumb: (filename: string) => `admin/studio-styles/${filename}`,
```

Run: `cd packages/shared && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Write the failing admin-route test**

Create `apps/api/src/routes/admin/admin-studio-styles.test.ts` (mock-based harness, mirrors `products-studio.test.ts`):

```ts
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const { mockFindMany, mockFindUnique, mockFindFirst, mockCreate, mockUpdate, mockDelete, mockAudit } =
  vi.hoisted(() => ({
    mockFindMany: vi.fn(),
    mockFindUnique: vi.fn(),
    mockFindFirst: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockDelete: vi.fn(),
    mockAudit: vi.fn(),
  }));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    studioStyle: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
    auditLog: { create: mockAudit },
  },
}));

vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: vi.fn(async () => 'https://r2.example/put'),
  publicUrl: (k: string) => `https://cdn.example/${k}`,
  deleteObject: vi.fn(async () => undefined),
}));

vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));

const { adminStudioStylesRoutes } = await import('./admin-studio-styles.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminStudioStylesRoutes);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('admin studio-styles', () => {
  it('POST rejects a bad slug', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/studio-styles',
      payload: { slug: 'Bad Slug!', label: 'X', description: 'd', prompt: 'p', tab: 'MODEL' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST 409 on duplicate slug', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 's1', slug: 'pastel_gradient' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/studio-styles',
      payload: { slug: 'pastel_gradient', label: 'X', description: 'd', prompt: 'p', tab: 'MODEL' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST creates with defaults', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: 's2', slug: 'new_scene', status: 'DRAFT', plans: [] });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/studio-styles',
      payload: { slug: 'new_scene', label: 'New', description: 'd', prompt: 'p', tab: 'PRODUCT' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'new_scene', status: 'DRAFT' }) }),
    );
  });

  it('PATCH rejects changing slug', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 's1', slug: 'pastel_gradient' });
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url: '/studio-styles/s1', payload: { slug: 'renamed' } });
    expect(res.statusCode).toBe(422);
  });

  it('PATCH updates status + plans', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 's1', slug: 'pastel_gradient', status: 'DRAFT', plans: [] });
    mockUpdate.mockResolvedValueOnce({ id: 's1', status: 'PUBLISHED', plans: ['STARTER', 'PRO'] });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: '/studio-styles/s1',
      payload: { status: 'PUBLISHED', plans: ['STARTER', 'PRO'] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PUBLISHED', plans: ['STARTER', 'PRO'] }) }),
    );
  });

  it('thumbnail-url returns a presigned PUT', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/studio-styles/thumbnail-url',
      payload: { content_type: 'image/jpeg', filename: 'shot.jpg' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.upload_url).toBe('https://r2.example/put');
    expect(body.data.r2_key).toMatch(/^admin\/studio-styles\//);
  });

  it('DELETE removes the row + best-effort thumb cleanup', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 's1', slug: 'x', thumbnail_r2_key: 'admin/studio-styles/a.jpg' });
    mockDelete.mockResolvedValueOnce({ id: 's1' });
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/studio-styles/s1' });
    expect(res.statusCode).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test — expect failure**

Run: `cd apps/api && npx vitest run src/routes/admin/admin-studio-styles.test.ts`
Expected: FAIL — `Cannot find module './admin-studio-styles.js'`.

- [ ] **Step 4: Implement `admin-studio-styles.ts`**

Create `apps/api/src/routes/admin/admin-studio-styles.ts`:

```ts
// Admin-managed AI Studio Shoot style catalog (studio_styles table).
// Mirrors admin-media.ts (background-images library): presigned R2 upload,
// status toggle, audit-logged CRUD. The retailer-facing read is a separate
// plan-filtered endpoint (products-studio.ts GET /studio-styles).
import { createHash } from 'node:crypto';
import { deleteObject, getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError, notFound } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const SLUG = /^[a-z0-9_]{2,40}$/;
const ENGINES = ['flux_pro', 'imagen_3', 'imagen_3_fast', 'flux_schnell', 'bfl_kontext'] as const;
const DEMOS = ['womens', 'mens', 'teen_girl', 'teen_boy', 'kids_girl', 'kids_boy'] as const;
const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const;

const CreateSchema = z.object({
  slug: z.string().regex(SLUG, 'slug must be lowercase letters, digits, underscore (2-40 chars)'),
  label: z.string().min(1).max(100),
  description: z.string().min(1).max(300),
  prompt: z.string().min(1).max(4000),
  tab: z.enum(['PRODUCT', 'MODEL']),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']).default('DRAFT'),
  plans: z.array(z.enum(PLANS)).default([]),
  engine: z.enum(ENGINES).nullable().optional(),
  audience: z.array(z.enum(DEMOS)).default([]),
  thumbnail_url: z.string().url().optional(),
  thumbnail_r2_key: z.string().optional(),
  sort_order: z.number().int().min(0).default(0),
});

const PatchSchema = z.object({
  slug: z.string().optional(), // accepted only if unchanged; else 422
  label: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(300).optional(),
  prompt: z.string().min(1).max(4000).optional(),
  tab: z.enum(['PRODUCT', 'MODEL']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']).optional(),
  plans: z.array(z.enum(PLANS)).optional(),
  engine: z.enum(ENGINES).nullable().optional(),
  audience: z.array(z.enum(DEMOS)).optional(),
  thumbnail_url: z.string().url().nullable().optional(),
  thumbnail_r2_key: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const adminStudioStylesRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/studio-styles', async () => {
    const rows = await prisma.studioStyle.findMany({
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    return { data: rows };
  });

  server.post('/studio-styles/thumbnail-url', async (request) => {
    const body = z
      .object({
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        filename: z.string().min(1).max(200),
      })
      .parse(request.body);
    const ext = body.content_type.split('/')[1];
    const r2Key = R2_PATHS.studioStyleThumb(
      `${createHash('sha256').update(body.filename + Date.now()).digest('hex').slice(0, 16)}.${ext}`,
    );
    const uploadUrl = await getUploadPresignedUrl(r2Key, body.content_type, 300);
    return { data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 } };
  });

  server.post('/studio-styles', async (request, reply) => {
    const body = CreateSchema.parse(request.body);
    const dupe = await prisma.studioStyle.findFirst({ where: { slug: body.slug } });
    if (dupe) throw new AppError('CONFLICT', 'A style with this slug already exists.', 409);

    const row = await prisma.studioStyle.create({
      data: {
        slug: body.slug,
        label: body.label,
        description: body.description,
        prompt: body.prompt,
        tab: body.tab,
        status: body.status,
        plans: body.plans,
        engine: body.engine ?? null,
        audience: body.audience,
        ...(body.thumbnail_url ? { thumbnail_url: body.thumbnail_url } : {}),
        ...(body.thumbnail_r2_key ? { thumbnail_r2_key: body.thumbnail_r2_key } : {}),
        sort_order: body.sort_order,
      },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'StudioStyle',
        resource_id: row.id,
        metadata: { slug: row.slug, label: row.label, tab: row.tab },
        ip_address: request.ip,
      },
    });
    return reply.status(201).send({ data: row });
  });

  server.patch('/studio-styles/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = PatchSchema.parse(request.body ?? {});
    const existing = await prisma.studioStyle.findUnique({ where: { id } });
    if (!existing) throw notFound('Studio style');
    if (body.slug !== undefined && body.slug !== existing.slug) {
      throw new AppError('VALIDATION_ERROR', 'slug is immutable after creation', 422);
    }

    const data: Record<string, unknown> = {};
    for (const k of ['label', 'description', 'prompt', 'tab', 'status', 'plans', 'audience', 'sort_order'] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.engine !== undefined) data.engine = body.engine; // null clears
    if (body.thumbnail_url !== undefined) data.thumbnail_url = body.thumbnail_url;
    if (body.thumbnail_r2_key !== undefined) data.thumbnail_r2_key = body.thumbnail_r2_key;

    const row = await prisma.studioStyle.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'StudioStyle',
        resource_id: id,
        metadata: { before: { status: existing.status, plans: existing.plans }, after: data },
        ip_address: request.ip,
      },
    });
    return { data: row };
  });

  server.delete('/studio-styles/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.studioStyle.findUnique({ where: { id } });
    if (!existing) throw notFound('Studio style');
    await prisma.studioStyle.delete({ where: { id } });
    if (existing.thumbnail_r2_key) {
      try {
        await deleteObject(existing.thumbnail_r2_key);
      } catch (err) {
        request.log.warn({ err, id }, 'R2 thumb delete failed for studio style');
      }
    }
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'StudioStyle',
        resource_id: id,
        metadata: { slug: existing.slug, label: existing.label },
        ip_address: request.ip,
      },
    });
    return { data: { id, deleted: true } };
  });
};
```

**Before implementing:** open `apps/api/src/plugins/error-handler.ts` and confirm `AppError`'s constructor signature and that a `'CONFLICT'` code maps to HTTP 409 (and `'VALIDATION_ERROR'` to 422). If the project uses a different helper (e.g. `conflict(msg)` / `validationError(msg, field)`), use that instead — match the existing convention in `admin-media.ts`.

- [ ] **Step 5: Run the test — expect pass**

Run: `cd apps/api && npx vitest run src/routes/admin/admin-studio-styles.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Register the routes**

`apps/api/src/routes/admin/index.ts` — add:
```ts
export { adminStudioStylesRoutes } from "./admin-studio-styles.js";
```
`apps/api/src/routes/admin.ts` — add `adminStudioStylesRoutes` to the `from "./admin/index.js"` import list, and after `await server.register(adminMediaRoutes);`:
```ts
  await server.register(adminStudioStylesRoutes);
```

- [ ] **Step 7: Typecheck + admin regression + commit**

Run: `cd apps/api && npx tsc --noEmit && npx vitest run src/routes/admin.login.test.ts`
Expected: clean; admin.login tests pass.

```bash
git add apps/api/src/routes/admin/admin-studio-styles.ts apps/api/src/routes/admin/admin-studio-styles.test.ts apps/api/src/routes/admin/index.ts apps/api/src/routes/admin.ts packages/shared/src/constants/index.ts
git commit -m "feat(api): admin studio-styles CRUD + thumbnail presign routes"
```

---

## Task 3: Retailer `GET /v1/products/studio-styles` + mobile API fn

**Files:**
- Modify: `apps/api/src/routes/products/products-studio.ts` (add the GET route)
- Modify: `apps/api/src/routes/products-studio.test.ts` (add coverage)
- Modify: `apps/mobile/src/lib/api/products.ts` (add `getStudioStyles`)

**Interfaces:**
- Consumes: `request.retailerId` (decorated by the `/v1/products` auth preHandler); `prisma.studioStyle`, `prisma.retailer`.
- Produces:
  `GET /v1/products/studio-styles` → `{ data: Array<{ slug, label, description, tab, audience, thumbnail_url }> }` — rows where `status = 'PUBLISHED'` and `plans has retailer.plan`, ordered `sort_order asc, created_at asc`. **No `prompt`, no `engine`.**
  Mobile `productApi.getStudioStyles()` → same `{ data: StudioStylePublic[] }`.

- [ ] **Step 1: Write the failing route test**

In `apps/api/src/routes/products-studio.test.ts`: add `mockStyleFindFirst` and `mockStyleFindMany` to the `vi.hoisted` block, and `studioStyle: { findFirst: mockStyleFindFirst, findMany: mockStyleFindMany }` to the mocked `@kanchuki/db` `prisma` object. Then add:

```ts
describe('GET /studio-styles', () => {
  it('returns only PUBLISHED styles the plan allows, without prompt', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValueOnce({ plan: 'STARTER' });
    mockStyleFindMany.mockResolvedValueOnce([
      { slug: 'pastel_gradient', label: 'Pastel Gradient Lounge', description: 'd', tab: 'MODEL', audience: [], thumbnail_url: null },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/studio-styles' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].slug).toBe('pastel_gradient');
    expect(body.data[0]).not.toHaveProperty('prompt');
    expect(mockStyleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PUBLISHED', plans: { has: 'STARTER' } } }),
    );
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd apps/api && npx vitest run src/routes/products-studio.test.ts -t "returns only PUBLISHED"`
Expected: FAIL (404 route not found / mock undefined).

- [ ] **Step 3: Implement the GET route**

In `apps/api/src/routes/products/products-studio.ts`, inside `productsStudioRoutes`, before the `POST /:id/photos/...` route:

```ts
  // ─── GET /products/studio-styles ────────────────────────────────
  // The retailer-facing catalog: PUBLISHED styles this plan may use.
  // Prompt + engine are deliberately omitted (server-side only).
  server.get('/studio-styles', async (request) => {
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: request.retailerId },
      select: { plan: true },
    });
    const rows = await prisma.studioStyle.findMany({
      where: { status: 'PUBLISHED', plans: { has: retailer.plan } },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: { slug: true, label: true, description: true, tab: true, audience: true, thumbnail_url: true },
    });
    return { data: rows };
  });
```

(`prisma` is already imported in this file.)

- [ ] **Step 4: Run — expect pass**

Run: `cd apps/api && npx vitest run src/routes/products-studio.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Add the mobile API function**

In `apps/mobile/src/lib/api/products.ts`, near `getBackgroundImages`:

```ts
  /** Admin-curated AI Studio Shoot styles this retailer's plan can use.
   * Cached 60s — the picker falls back to the last response offline. */
  getStudioStyles: () =>
    request<{
      data: {
        slug: string
        label: string
        description: string
        tab: 'PRODUCT' | 'MODEL'
        audience: string[]
        thumbnail_url: string | null
      }[]
    }>('/v1/products/studio-styles', { getCacheTtlMs: 60_000 }),
```

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/api && npx tsc --noEmit` and `cd apps/mobile && npx tsc --noEmit`
Expected: both clean.

```bash
git add apps/api/src/routes/products/products-studio.ts apps/api/src/routes/products-studio.test.ts apps/mobile/src/lib/api/products.ts
git commit -m "feat(api): GET /v1/products/studio-styles - plan-filtered retailer catalog"
```

---

## Task 4: Rework the generate-path (slug + plan gate + prompt passthrough, drop IDM-VTON)

**Files:**
- Modify: `apps/api/src/lib/studio-shoot.ts`
- Modify: `apps/api/src/jobs/studio-shoot.ts`
- Modify: `apps/api/src/jobs/index.ts` (`addStudioShootJob` data type)
- Modify: `apps/api/src/routes/products/products-studio.ts` (`POST .../studio-shoot`)
- Modify: `apps/api/src/routes/products/products-festival-background.ts`
- Modify: `apps/api/src/routes/admin/admin-photo-cleanup.ts`
- Modify: `apps/api/src/lib/studio-shoot.test.ts`
- Modify: `apps/api/src/routes/products-studio.test.ts`

**Interfaces:**
- Consumes: `prisma.studioStyle` (Task 1), `prisma.retailer.plan`.
- Produces:
  `generateStudioImage(inputImageUrl: string, opts: { prompt: string; tab: 'PRODUCT' | 'MODEL'; engine?: StudioEngine; demographic?: Demographic | string; product?: {...}; onProgress?: (p: { progress: number; etaMs: number }) => void }): Promise<StudioGenerationResult>` — **signature change**: `templateId` gone, `prompt` required, `modelId` gone.
  `StudioEngine = 'flux_pro' | 'imagen_3' | 'imagen_3_fast' | 'flux_schnell' | 'bfl_kontext'` (no `idm_vton`).
  `StudioShootJobData = { job_id; retailer_id; product_id; photo_id; slug: string; prompt: string; tab: 'PRODUCT' | 'MODEL'; engine?: StudioEngine; audience: string[]; style_id: string }`.

- [ ] **Step 1: Update `studio-shoot.test.ts` (lib) for the new signature**

In `apps/api/src/lib/studio-shoot.test.ts`, change every `generateStudioImage(templateId, url, ...)` call to `generateStudioImage(url, { prompt, tab, ... })`. Replace the model/IDM-VTON tests with:

```ts
it('PRODUCT tab uses the prompt verbatim (no person clause)', async () => {
  await generateStudioImage('https://img/1.jpg', {
    prompt: 'Product-only studio shot on a wooden hanger, seamless white backdrop.',
    tab: 'PRODUCT',
  });
  expect(capturedPrompt).toContain('Product-only studio shot on a wooden hanger');
  expect(capturedPrompt).not.toMatch(/The person wearing this garment is/);
});

it('MODEL tab injects the demographic person clause', async () => {
  await generateStudioImage('https://img/1.jpg', {
    prompt: 'On a chic city rooftop at golden hour with string lights.',
    tab: 'MODEL',
    demographic: 'mens',
  });
  expect(capturedPrompt).toMatch(/dignified adult Indian man fashion model/);
});

it('flux_pro engine takes the flux_pro branch, no VTON call', async () => {
  await generateStudioImage('https://img/1.jpg', { prompt: 'x', tab: 'MODEL', engine: 'flux_pro' });
  expect(mockGenerateFluxProImage).toHaveBeenCalled();
});
```

(`capturedPrompt` — capture from whichever mock the default path calls, e.g. `generateFluxKontext`; follow the existing test's mocking style.)

- [ ] **Step 2: Run — expect failure**

Run: `cd apps/api && npx vitest run src/lib/studio-shoot.test.ts`
Expected: FAIL (signature mismatch / removed exports).

- [ ] **Step 3: Rewrite `generateStudioImage` in `lib/studio-shoot.ts`**

- New signature: `generateStudioImage(inputImageUrl: string, opts: {...})` per Interfaces.
- Remove from the `@kanchuki/shared` import: `getStudioModel`, `getStudioTemplate`, `isNoModelTemplate`, `type StudioModelId`, `type StudioTemplateId`. Keep `demographicForCategory`, `type Demographic`.
- Grep `generateIdmVtonTryon` across `apps/api/src`. If only this file imports it, drop that import too.
- Delete: the whole `if ((options?.engine === 'idm_vton' || options?.modelId) && vtonEligible) { ... }` block; `vtonEligible`; `modelMeta` / `modelPrompt`; the `getStudioTemplate(templateId)` lookup + the `if (!template && ...)` guard; the `templateId === 'runway'` special-case block (the `runway` seed prompt already describes the scene, and the MODEL person-swap handles the demographic).
- `basePrompt` is now `opts.prompt`.
- `demographic = resolveDemographic(typeof opts.demographic === 'string' ? opts.demographic : undefined, opts.product)` — keep the existing `resolveDemographic` + `PERSON_CLAUSE` map.
- Person swap (replaces the old `template && !isNoModelTemplate(template)` condition):
  ```ts
  if (opts.tab === 'MODEL') {
    basePrompt = basePrompt.replace(
      /a (?:graceful|professional|dignified|charming|elegant|young)[^.,]*?Indian (?:fashion model|lady \/ female fashion model|gentleman \/ male fashion model|lady|gentleman|boy model|woman fashion model|man fashion model)/gi,
      PERSON_CLAUSE[demographic],
    );
    basePrompt = `The person wearing this garment is ${PERSON_CLAUSE[demographic]}. ${basePrompt}`;
  }
  ```
- `StudioEngine` type: remove `'idm_vton'`.
- Everything from `colorEnforcement` / `sceneGuard` / `promptText` downward (engine cascade, BFL direct fallback, poll loop, `downloadCompressAndUpload`, Redis status helpers) is unchanged.

- [ ] **Step 4: Run the lib test — expect pass**

Run: `cd apps/api && npx vitest run src/lib/studio-shoot.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the job (`jobs/studio-shoot.ts` + `jobs/index.ts`)**

`jobs/studio-shoot.ts`:
- `StudioShootJobData` → the new shape (Interfaces). Keep `engine?: StudioEngine`.
- Remove `type StudioTemplateId` from the `@kanchuki/shared` import (keep `R2_PATHS`).
- In `handleStudioShoot`: destructure `slug, prompt, tab, engine, audience, style_id`. Call:
  ```ts
  const result = await generateStudioImage(displayUrl, {
    prompt,
    tab,
    engine,
    onProgress: (p) => {
      setStudioJobStatus(job_id, { status: 'processing', progress: p.progress, etaMs: p.etaMs }).catch(() => {});
    },
    product: product
      ? {
          name: product.name, category: product.category,
          primary_color: product.primary_color, secondary_colors: product.secondary_colors,
          fabric: product.fabric_estimate, pattern: product.pattern, embellishments: product.embellishments,
        }
      : undefined,
  });
  ```
- `metadata.studio`: `{ job_id, slug, engine: engine ?? 'auto', tab, source_photo_id: photo.id, generated_at: startedAt.toISOString() }` (drop `template`, `model_id`).
- `recordBflStudioUsage(retailer_id, slug)` (arg was `template`).
- After the `ready` status write:
  ```ts
  prisma.studioStyle.update({ where: { id: style_id }, data: { usage_count: { increment: 1 } } })
    .catch((err) => console.error(`[studio-shoot] usage_count bump failed for ${style_id}:`, err));
  ```

`jobs/index.ts`: update `addStudioShootJob`'s parameter type to the new `StudioShootJobData` (keep the two in sync — check whether it re-declares the interface or imports it).

- [ ] **Step 6: Rework `POST .../studio-shoot` in `products-studio.ts`**

- `StudioShootBodySchema` → `z.object({ template: z.string().min(1) })` (drop `engine`, `model_id`).
- Replace the `getStudioTemplate` block with:
  ```ts
  const style = await prisma.studioStyle.findFirst({
    where: { slug: body.data.template, status: 'PUBLISHED' },
  });
  if (!style) throw validationError('Unknown or unavailable studio style.', 'template');

  const retailer = await prisma.retailer.findUniqueOrThrow({
    where: { id: request.retailerId }, select: { plan: true },
  });
  if (!style.plans.includes(retailer.plan)) {
    throw new AppError('FEATURE_UNAVAILABLE', 'This studio style is not included in your plan.', 403);
  }
  ```
- `addStudioShootJob({ job_id: jobId, retailer_id: request.retailerId, product_id: id, photo_id: photo.id, slug: style.slug, prompt: style.prompt, tab: style.tab, engine: (style.engine as StudioEngine | null) ?? undefined, audience: style.audience, style_id: style.id })`.
- Remove the `getStudioTemplate` / `type StudioTemplateId` import; import `type StudioEngine` from `../../lib/studio-shoot.js`; import `AppError` from `../../plugins/error-handler.js` if absent.

- [ ] **Step 7: Fix `products-festival-background.ts`**

- Remove `import { getStudioTemplate, type StudioTemplateId } from '@kanchuki/shared'`.
- Read how this file calls `addStudioShootJob`. The `templateId` field is an optional override. Two acceptable resolutions — pick the one that keeps the file's behaviour:
  - **If the override is used:** `const override = body.templateId ? await prisma.studioStyle.findFirst({ where: { slug: body.templateId, status: 'PUBLISHED' } }) : null;` then pass `slug: override?.slug ?? '<festival-fallback-slug>'`, `prompt: override?.prompt ?? '<the festival prompt this file already builds>'`, `tab: override?.tab ?? 'MODEL'`, `audience: override?.audience ?? []`, plus a `style_id` (use the override's id, or `''` if the festival path has no style row — then guard the `usage_count` bump in the job with `if (style_id) ...`).
  - **If the override is effectively dead** (festival flow always uses a `FestivalBackground` image, never a studio style): delete the `templateId` schema field and its handling; construct the job data from the festival prompt the file already has.
- **This file must compile against the new `StudioShootJobData`.** If `style_id` can be absent here, make it `style_id?: string` in the interface and guard the `prisma.studioStyle.update` bump in the job.

- [ ] **Step 8: Fix the admin bench route (`admin-photo-cleanup.ts`)**

- Remove `getStudioTemplate` from the `@kanchuki/shared` import (keep `PRODUCT_DEMOGRAPHICS`, `R2_PATHS`).
- Body schema: replace `template: z.string().min(1)` with `slug: z.string().optional()`; keep `prompt`, `engine`, `demographic`; drop `model_id`.
- Resolve:
  ```ts
  const style = body.slug
    ? await prisma.studioStyle.findFirst({ where: { slug: body.slug } }) // any status - bench tests drafts
    : null;
  if (!style && !body.prompt) throw validationError('Provide a slug or a prompt.', 'slug');
  const result = await generateStudioImage(body.product_url, {
    prompt: body.prompt ?? style!.prompt,
    tab: style?.tab ?? 'MODEL',
    engine: body.engine,
    demographic: body.demographic,
  });
  ```
- `downloadCompressAndUpload` + response shape stay. Update the response's `template` field to `slug: style?.slug ?? null`.

- [ ] **Step 9: Update `products-studio.test.ts` for the new POST contract**

- Ensure `mockStyleFindFirst` is in the hoisted mocks + `@kanchuki/db` mock (added in Task 3).
- Existing "enqueues for STARTER plan" test:
  ```ts
  mockStyleFindFirst.mockResolvedValueOnce({ id: 'st1', slug: 'pastel_gradient', prompt: 'p', tab: 'MODEL', engine: null, audience: [], plans: ['STARTER'] });
  mockRetailerFindUniqueOrThrow.mockResolvedValueOnce({ plan: 'STARTER' });
  // ... assert 202 + mockAddStudioShootJob called with
  // expect.objectContaining({ slug: 'pastel_gradient', prompt: 'p', tab: 'MODEL', style_id: 'st1' })
  ```
- New test — plan not allowed:
  ```ts
  mockStyleFindFirst.mockResolvedValueOnce({ id: 'st1', slug: 'x', prompt: 'p', tab: 'MODEL', engine: null, audience: [], plans: ['PRO'] });
  mockRetailerFindUniqueOrThrow.mockResolvedValueOnce({ plan: 'STARTER' });
  // -> res.statusCode 403, body.error.code 'FEATURE_UNAVAILABLE'
  ```
- New test — unknown slug: `mockStyleFindFirst.mockResolvedValueOnce(null)` -> 422.

- [ ] **Step 10: Run the full API studio + security suite**

Run: `cd apps/api && npx vitest run src/routes/products-studio.test.ts src/lib/studio-shoot.test.ts src/routes/security.test.ts && npx tsc --noEmit`
Expected: all green, tsc clean.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/lib/studio-shoot.ts apps/api/src/lib/studio-shoot.test.ts apps/api/src/jobs/studio-shoot.ts apps/api/src/jobs/index.ts apps/api/src/routes/products/products-studio.ts apps/api/src/routes/products/products-festival-background.ts apps/api/src/routes/admin/admin-photo-cleanup.ts apps/api/src/routes/products-studio.test.ts
git commit -m "feat(api): studio generate-path reads studio_styles by slug + per-plan gate; drop IDM-VTON"
```

---

## Task 5: Mobile picker — Product Only / Models tabs, DB-fed

**Files:**
- Modify: `apps/mobile/src/components/product-detail/ProductStudioModal.tsx`
- Modify: `apps/mobile/src/hooks/useProductAiStudio.ts`
- Modify: `apps/mobile/app/product/[id].tsx`

**Interfaces:**
- Consumes: `productApi.getStudioStyles()` (Task 3); `demographicForCategory` from `@kanchuki/shared`.
- Produces: `ProductStudioModal` prop `onStartShoot: (slug: string) => void` (was `(template, options?) => void`); `useProductAiStudio` returns `handleStartStudioShoot: (slug: string) => Promise<void>` and `studioTab: 'product' | 'models'`.

- [ ] **Step 1: Update the hook**

`apps/mobile/src/hooks/useProductAiStudio.ts`:
- `const [studioTab, setStudioTab] = useState<'product' | 'models'>('product')` (was `'scenes' | 'models'`).
- `handleStartStudioShoot = async (slug: string) => { ... await productApi.startStudioShoot(product.id, photo.id, slug); ... }` — drop the `options` param and its spread. Keep the surrounding try/catch/state logic.

- [ ] **Step 2: Update `startStudioShoot` in the mobile API**

`apps/mobile/src/lib/api/products.ts` — `startStudioShoot: (productId: string, photoId: string, template: string) =>` ... `body: JSON.stringify({ template })` (drop the `options` param + spread).

- [ ] **Step 3: Rewrite the picker body of `ProductStudioModal.tsx`**

- Imports: drop `STUDIO_TEMPLATES`, `STUDIO_MODELS` from the `@kanchuki/shared` import; keep `STUDIO_CREDITS_PER_IMAGE`; add `demographicForCategory`. Add `useQuery` from `@tanstack/react-query` and `productApi` from `../../lib/api` if not present.
- Add new props: `productCategory?: string`, `productName?: string`. Remove any prop that only fed `STUDIO_MODELS`.
- Near the top of the component body:
  ```tsx
  const { data: stylesData, isLoading: stylesLoading } = useQuery({
    queryKey: ['studio-styles'],
    queryFn: () => productApi.getStudioStyles(),
    staleTime: 60_000,
  })
  const styles = stylesData?.data ?? []
  const demo = demographicForCategory(productCategory, productName)
  const productStyles = styles.filter((s) => s.tab === 'PRODUCT')
  const modelStyles = styles.filter(
    (s) => s.tab === 'MODEL' && (s.audience.length === 0 || s.audience.includes(demo)),
  )
  const activeList = tab === 'product' ? productStyles : modelStyles
  ```
- Tabs: `useState<'product' | 'models'>('product')`; button labels `Product Only` / `Models`.
- Delete the `STUDIO_MODELS.map(...)` branch and the `LOCAL_STUDIO_THUMBNAILS` map. Both tabs render `activeList.map((s) => <row>)` with one row component.
- Row:
  ```tsx
  <View className="w-14 h-14 rounded-xl overflow-hidden bg-sand-100 border border-sand-200 items-center justify-center">
    {s.thumbnail_url ? (
      <Image source={{ uri: s.thumbnail_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
    ) : (
      <Wand2 size={22} color={colors.sand[400]} />
    )}
  </View>
  <View className="flex-1">
    <Text className="text-sm font-bold text-sand-900">
      {s.label} <Text className="text-[11px] font-normal text-sand-400">(/{s.slug})</Text>
    </Text>
    <Text className="text-xs text-sand-500 mt-0.5 leading-4" numberOfLines={2}>{s.description}</Text>
  </View>
  ```
- `selectedSlug` state, default `activeList[0]?.slug`; `useEffect(() => { setSelectedSlug(activeList[0]?.slug ?? '') }, [tab, styles.length])`.
- In `renderBody()` picker branch: `if (stylesLoading) return <View className="py-10 items-center"><ActivityIndicator color={primaryColor} /></View>`; `if (!activeList.length) return <Text className="text-xs text-sand-500 py-8 text-center">No {tab === 'product' ? 'product' : 'model'} styles available on your plan yet.</Text>`.
- Generate button: `onPress={() => selectedSlug && onStartShoot(selectedSlug)}`, `disabled={starting || limitReached || !selectedSlug}`.

- [ ] **Step 4: Wire `product/[id].tsx`**

- `<ProductStudioModal>`: `onStartShoot={studio.handleStartStudioShoot}`; add `productCategory={product?.category}` and `productName={product?.name}`. Remove any `STUDIO_MODELS`-derived prop.

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean. (`@kanchuki/shared` still exports `STUDIO_TEMPLATES` here — deleted in Task 6.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/product-detail/ProductStudioModal.tsx apps/mobile/src/hooks/useProductAiStudio.ts apps/mobile/app/product/[id].tsx apps/mobile/src/lib/api/products.ts
git commit -m "feat(mobile): Studio Shoot picker - Product Only / Models tabs, DB-fed, demographic filter"
```

---

## Task 6: Delete `STUDIO_TEMPLATES` / `STUDIO_MODELS` from `@kanchuki/shared`

**Files:**
- Modify: `packages/shared/src/constants/index.ts`
- Modify/delete: `scripts/studio-shoot-demo.mjs`
- Grep-and-fix any remaining importer.

**Interfaces:**
- Removes: `STUDIO_TEMPLATES`, `STUDIO_MODELS`, `getStudioTemplate`, `getStudioModel`, `isNoModelTemplate`, `studioTemplatesFor`, `StudioTemplateId`, `StudioModelId`.
- Keeps: `PRODUCT_DEMOGRAPHICS`, `Demographic`, `demographicForCategory`, `STUDIO_CREDITS_PER_IMAGE`, `R2_PATHS.studioStyleThumb`, `R2_PATHS.studioShot`.

- [ ] **Step 1: Grep for every importer**

Run: `git grep -nE "STUDIO_TEMPLATES|STUDIO_MODELS|getStudioTemplate|getStudioModel|isNoModelTemplate|studioTemplatesFor|StudioTemplateId|StudioModelId"`
Expected: only `packages/shared/src/constants/index.ts` and `scripts/studio-shoot-demo.mjs`. Any `apps/api` / `apps/mobile` hit is a miss from Tasks 4–5 — fix it now.

- [ ] **Step 2: Delete the symbols**

In `packages/shared/src/constants/index.ts`, remove: the full `export const STUDIO_TEMPLATES = [...] as const satisfies ...[]` array and its `satisfies` type literal, `export type StudioTemplateId`, `getStudioTemplate`, `isNoModelTemplate`, `studioTemplatesFor`, `export const STUDIO_MODELS = [...]`, `export type StudioModelId`, `getStudioModel`. Keep the `// ─── Product demographic ───` block (`PRODUCT_DEMOGRAPHICS`, `Demographic`, `demographicForCategory`, `resolveDemographic` if present there) and `STUDIO_CREDITS_PER_IMAGE`.

- [ ] **Step 3: Fix `scripts/studio-shoot-demo.mjs`**

If it only demoed the old constant: `git rm scripts/studio-shoot-demo.mjs`. Otherwise rewrite it to not import the deleted symbols. A throwaway demo script is not worth carrying — prefer deletion.

- [ ] **Step 4: Build shared + typecheck everything**

Run:
```bash
cd packages/shared && npx tsc --noEmit && pnpm build
cd ../../apps/api && npx tsc --noEmit
cd ../mobile && npx tsc --noEmit
```
Expected: all clean. Any error = a missed importer; fix and re-run.

- [ ] **Step 5: Full API test sweep**

Run: `cd apps/api && npx vitest run`
Expected: green. Update any test file still importing a deleted symbol.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants/index.ts
git rm scripts/studio-shoot-demo.mjs   # if deleted
git commit -m "refactor(shared): remove STUDIO_TEMPLATES/STUDIO_MODELS - now DB-driven via studio_styles"
```

---

## Task 7: Admin web page + Sidebar entry

**Files:**
- Create: `apps/web/src/app/admin/studio-styles/page.tsx`
- Modify: `apps/web/src/app/admin/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `adminGetOptions`, `adminMutateOptions` from `@/lib/admin-fetch`; the Task 2 routes at `${NEXT_PUBLIC_API_URL}/v1/admin/studio-styles`.

- [ ] **Step 1: Add the Sidebar entry**

`apps/web/src/app/admin/components/Sidebar.tsx` — in the "Catalog & Creative" group's `children`, after the `Backgrounds` line:
```tsx
      { label: 'Studio Styles', href: '/admin/studio-styles', icon: Clapperboard },
```
Add `Clapperboard` to the `lucide-react` import at the top of the file.

- [ ] **Step 2: Build the page**

Create `apps/web/src/app/admin/studio-styles/page.tsx` — `'use client'`. Model it on `apps/web/src/app/admin/plan-features/page.tsx` (per-row optimistic save + status banner + `motion.div` entrance) and `apps/web/src/app/admin/background-images/page.tsx` (thumbnail upload via presign). Requirements:

- On mount: `fetch(\`${API_URL}/v1/admin/studio-styles\`, adminGetOptions())` → `rows: StudioStyleRow[]`. `API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'`.
- Two `<section>`s — **Product Only** (`tab === 'PRODUCT'`) and **Models** (`tab === 'MODEL'`), each a table of that tab's rows sorted by `sort_order`.
- Per row, editable controls with a per-row **Save** button that `PATCH`es only changed fields (`await fetch(url, { ...(await adminMutateOptions()), method: 'PATCH', body: JSON.stringify(diff) })`):
  - `status`: three-way segmented control `DRAFT` / `PUBLISHED` / `HIDDEN`.
  - `plans`: checkboxes `STARTER` / `GROWTH` / `PRO` → writes the `plans` string array.
  - `engine`: `<select>` — options `— default —` (value `""` → send `null`), `flux_pro`, `imagen_3`, `imagen_3_fast`, `flux_schnell`, `bfl_kontext`.
  - `sort_order`: `<input type="number">`.
  - `label`, `description`: text inputs. `prompt`: `<textarea>` in an expandable row.
  - `audience` (MODEL rows only): checkboxes for the 6 demographics (`womens`, `mens`, `teen_girl`, `teen_boy`, `kids_girl`, `kids_boy`).
  - thumbnail: 48px `<img>` preview; click opens a fixed-overlay lightbox (`<img>` full-size, click to close); "Upload" / "Replace" button → `<input type="file" accept="image/*">` → `POST /studio-styles/thumbnail-url { content_type, filename }` → `fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })` → `PATCH` the row with `{ thumbnail_url: public_url, thumbnail_r2_key: r2_key }`.
  - **Delete** button → `window.confirm` → `DELETE /studio-styles/:id` → drop from `rows`.
- A collapsible **"New Style"** form above the tables: `slug`, `label`, `description`, `prompt` (textarea), `tab` (toggle PRODUCT/MODEL), `plans` (checkboxes), `engine` (select), `audience` (checkboxes), `sort_order`. Submit → `POST /v1/admin/studio-styles` → on 201 prepend to `rows`; on 409 show "slug already exists" inline on the `slug` field.
- Status banner (`✅` / `❌` / neutral) copied from `plan-features/page.tsx`.
- Loading spinner (`Loader2` spin) while the initial GET is in flight.

- [ ] **Step 3: Typecheck + build the web app**

Run: `cd apps/web && npx tsc --noEmit && npx next build`
Expected: clean; `/admin/studio-styles` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/studio-styles/page.tsx apps/web/src/app/admin/components/Sidebar.tsx
git commit -m "feat(admin): Studio Styles management page + sidebar entry"
```

---

## Task 8: Docs + PR

**Files:**
- Modify: `docs/BUILD-LOG.md`, `docs/PRO-REQUIREMENTS.md`, `docs/PLAN.md`, `docs/tasks/ai-studio-shoot-models-scenes.md`, this plan file.
- **`CLAUDE.md` — do NOT edit; put the proposed index row in the PR description for owner approval.**

- [ ] **Step 1: Update the docs**

- `docs/BUILD-LOG.md`: change the "📋 PLANNED" heading under F-032 to `### ✅ BUILT <date>: Studio style catalog → DB-managed + per-plan`; keep the summary; add a file table (model+migration / admin routes+page / retailer endpoint / generate-path / mobile picker / shared cleanup) and a verification line (`products-studio.test.ts`, `studio-shoot.test.ts`, `admin-studio-styles.test.ts`, `security.test.ts`, `admin.login.test.ts` all green; `tsc` clean in shared+api+mobile+web).
- `docs/PRO-REQUIREMENTS.md` §24.12: `📋 PLANNED — awaiting owner go` → `✅ BUILT <date>` — plus a line that migration `075` still needs the owner to apply.
- `docs/PLAN.md`: `Style catalog → DB + per-plan — ✅ Built <date>`.
- `docs/tasks/ai-studio-shoot-models-scenes.md`: step 6 line → `✅ done via this work`.
- This plan file: check every `- [ ]`.

- [ ] **Step 2: Commit the docs**

```bash
git add docs/
git commit -m "docs(studio): mark DB-backed studio style catalog built"
```

- [ ] **Step 3: Push + open the PR**

```bash
git push -u origin studio-styles-admin
gh pr create --base main --title "AI Studio Shoot — DB-backed style catalog + admin manager" --body "<body>"
```

PR body must include:
- Links to the spec + this plan.
- **"Owner action required before this is live: apply `packages/db/prisma/migrations/075_studio_styles/migration.sql` (Supabase SQL editor or `prisma migrate deploy`). Until styles are published + plan-assigned in Admin → Studio Styles, the mobile picker is empty by design."**
- The proposed `CLAUDE.md` What's-Built index row for the owner to add on merge:
  `| 55 | AI Studio Shoot — DB-backed style catalog (studio_styles) + Admin → Studio Styles manager (publish/hide/draft, per-plan assignment, thumbnail upload) + mobile Product/Models tabs; IDM-VTON retired | ✅ Built <date> | docs/superpowers/specs/2026-08-30-studio-styles-admin-design.md |`
  plus: update the #54 row to note step 6 is superseded.

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review` on the branch, then run `/code-review`. Address findings before the owner merges + applies the migration.

---

## Self-Review

**Spec coverage:**
- §1 data model → Task 1. ✅
- §2 retailer endpoint → Task 3; generate-path + plan gate + IDM-VTON retirement → Task 4. ✅
- §3 admin routes → Task 2; admin page + sidebar → Task 7. ✅
- §4 mobile picker → Task 5. ✅
- §5 shared cleanup → Task 6; tests distributed across Tasks 2–6; docs → Task 8. ✅
- `admin-photo-cleanup.ts` bench route → Task 4 Step 8. ✅
- `products-festival-background.ts` `getStudioTemplate` dependency → Task 4 Step 7. ✅
- `R2_PATHS.studioStyleThumb` → Task 2 Step 1. ✅
- Spec's "Skills for implementation" table → header sub-skill note + Task 8 Step 4 (code review). ✅

**Placeholder scan:** The migration seed `VALUES` block is generated by the Task 1 Step 3 script (concrete keep-lists, real source), not hand-waved. The admin page (Task 7 Step 2) is a requirements list rather than full JSX — acceptable because it is a faithful clone of two named existing pages the executor reads (`plan-features/page.tsx` + `background-images/page.tsx`). No `TODO` / "handle edge cases" / undefined-symbol references remain. Task 4 Steps 7–8 give explicit either/or resolutions, not "figure it out".

**Type consistency:**
- `generateStudioImage(url, opts)` — new signature in Task 4 Interfaces, consumed identically in Task 4 Steps 3/5/8.
- `StudioShootJobData` fields (`slug`, `prompt`, `tab`, `engine?`, `audience`, `style_id`) — defined Task 4 Interfaces, produced by `products-studio.ts` (Step 6) + `products-festival-background.ts` (Step 7), consumed by `jobs/studio-shoot.ts` (Step 5). `style_id` optionality note added in Step 7.
- Retailer payload (`slug, label, description, tab, audience, thumbnail_url` — no `prompt`/`engine`) — Task 3 route `select`, Task 3 mobile type, Task 5 consumer. Consistent.
- `StudioEngine` = 5 values, no `idm_vton` — Global Constraints + Task 4 Interfaces + Task 2 `ENGINES` const + Task 7 engine `<select>`. Consistent.
- `tab` values `PRODUCT` / `MODEL` (uppercase Prisma enum) everywhere, incl. the mobile filter `s.tab === 'PRODUCT'`. Consistent.
- `status` values `DRAFT` / `PUBLISHED` / `HIDDEN` — Task 1 enum, Task 2 schema, Task 3 filter (`'PUBLISHED'`), Task 7 control. Consistent.
