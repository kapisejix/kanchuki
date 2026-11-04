// Admin social design templates (docs/tasks/pending/admin-social-design-templates.md §4, T3).
// A design = background art + a validated layer spec (packages/shared/src/design-template.ts).
// - No DELETE route: kanchuki_app has no DELETE grant on design_templates; retire = status HIDDEN.
// - Background/thumbnail keys are client-supplied but verified (RC-075) and the public URL is
//   always server-built from the final key.
// - Preview is stateless (spec in the body) so the editor can preview an unsaved draft.
import { createHash } from 'node:crypto';
import {
  downloadBuffer,
  getUploadPresignedUrl,
  publicUrl,
  renderDesign,
  samplePhoto,
} from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import {
  DESIGN_FORMAT_KEYS,
  DESIGN_MAX_PRODUCT_SLOTS,
  type DesignFormat,
  R2_PATHS,
  parseDesignSpec,
} from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  IMAGE_KINDS,
  UPLOAD_URL_RATE_LIMIT,
  isOwnedKey,
  stagingKey,
  unstagedKey,
  verifyUpload,
} from '../../lib/upload-guard.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const;
const STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'] as const;
const MAX_ASSET_BYTES = 10_000_000;

/** Real image under the admin design-template prefix → FINAL key (staged copy promoted). */
async function verifyAsset(r2Key: string): Promise<string> {
  const { r2Key: finalKey } = await verifyUpload({
    r2Key,
    allowed: IMAGE_KINDS,
    maxBytes: MAX_ASSET_BYTES,
    prefix: R2_PATHS.designTemplateAsset(''),
  });
  return finalKey;
}

const Format = z.enum(DESIGN_FORMAT_KEYS as [DesignFormat, ...DesignFormat[]]);

const Fields = {
  name: z.string().min(1).max(100),
  description: z.string().max(300).nullable(),
  occasion: z.string().max(60).nullable(),
  format: Format,
  product_slots: z.number().int().min(1).max(DESIGN_MAX_PRODUCT_SLOTS),
  spec: z.unknown(),
  background_key: z.string().min(1).nullable(),
  thumbnail_key: z.string().min(1).nullable(),
  plans: z.array(z.enum(PLANS)).max(3),
  sort_order: z.number().int().min(0),
};

const CreateSchema = z.object({
  name: Fields.name,
  description: Fields.description.optional(),
  occasion: Fields.occasion.optional(),
  format: Fields.format.default('PORTRAIT_4_5'),
  product_slots: Fields.product_slots.default(1),
  spec: Fields.spec,
  background_key: Fields.background_key.optional(),
  thumbnail_key: Fields.thumbnail_key.optional(),
  // D5: free designs are for every plan, so that is the default (an empty list = nobody).
  plans: Fields.plans.default([...PLANS]),
  sort_order: Fields.sort_order.default(0),
});

const UpdateSchema = z.object({
  name: Fields.name.optional(),
  description: Fields.description.optional(),
  occasion: Fields.occasion.optional(),
  format: Fields.format.optional(),
  product_slots: Fields.product_slots.optional(),
  spec: Fields.spec.optional(),
  background_key: Fields.background_key.optional(),
  thumbnail_key: Fields.thumbnail_key.optional(),
  plans: Fields.plans.optional(),
  sort_order: Fields.sort_order.optional(),
});

type Row = NonNullable<Awaited<ReturnType<typeof prisma.designTemplate.findUnique>>>;

const toDto = (r: Row) => ({
  ...r,
  background_url: r.background_key ? publicUrl(r.background_key) : null,
  thumbnail_url: r.thumbnail_key ? publicUrl(r.thumbnail_key) : null,
});

/** Spec must pass the shared validator for this format + slot count; returns the REBUILT copy. */
function checkSpec(raw: unknown, format: DesignFormat, slots: number) {
  const parsed = parseDesignSpec(raw, format, slots);
  if (!parsed.ok) throw validationError(parsed.error, 'spec');
  return parsed.spec;
}

const audit = (
  request: { ip: string },
  action: string,
  id: string,
  metadata: Prisma.InputJsonValue,
) =>
  prisma.auditLog.create({
    data: {
      actor_type: 'admin',
      action,
      resource_type: 'DesignTemplate',
      resource_id: id,
      metadata,
      ip_address: request.ip,
    },
  });

export const adminDesignTemplateRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // GET /admin/design-templates — full library incl. DRAFT / HIDDEN.
  server.get('/design-templates', async () => {
    const rows = await prisma.designTemplate.findMany({
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    return { data: rows.map(toDto) };
  });

  // POST /admin/design-templates/upload-url — presigned PUT for background art / thumbnail.
  server.post('/design-templates/upload-url', UPLOAD_URL_RATE_LIMIT, async (request) => {
    const body = z
      .object({
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        filename: z.string().min(1).max(200),
        // Exact byte length of the PUT, bound into the signature (RC-080).
        content_length: z.number().int().min(1).max(MAX_ASSET_BYTES),
      })
      .parse(request.body);
    const ext = body.content_type.split('/')[1];
    const r2Key = stagingKey(
      R2_PATHS.designTemplateAsset(
        `${createHash('sha256')
          .update(body.filename + Date.now())
          .digest('hex')
          .slice(0, 16)}.${ext}`,
      ),
    );
    const uploadUrl = await getUploadPresignedUrl(
      r2Key,
      body.content_type,
      300,
      body.content_length,
    );
    return {
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    };
  });

  // POST /admin/design-templates/preview — render a (possibly unsaved) draft with sample data.
  server.post('/design-templates/preview', async (request) => {
    const body = z
      .object({
        format: Fields.format,
        product_slots: Fields.product_slots,
        spec: Fields.spec,
        background_key: Fields.background_key.optional(),
      })
      .parse(request.body);
    const spec = checkSpec(body.spec, body.format, body.product_slots);

    let background: Buffer | null = null;
    if (body.background_key) {
      // Read-only, but still pin the key to our prefix so this can't fetch arbitrary bucket objects.
      if (!isOwnedKey('', unstagedKey(body.background_key), R2_PATHS.designTemplateAsset('')))
        throw validationError('Invalid upload reference', 'background_key');
      background = await downloadBuffer(body.background_key);
    }
    const photo = await samplePhoto();
    const jpeg = await renderDesign({
      format: body.format,
      spec,
      background,
      shop: {
        texts: {
          shop_name: 'Sample Boutique',
          shop_phone: '98765 43210',
          shop_city: 'Jaipur',
          store_url: 'kanchuki.app/s/sample',
        },
        logo: null,
      },
      custom: { custom_text: 'Festive Offer', offer_text: 'Flat 20% off' },
      products: Array.from({ length: body.product_slots }, (_, i) => ({
        texts: {
          product_name: `Cotton Suit ${i + 1}`,
          price: '₹1,499',
          mrp: '₹1,999',
          discount_pct: '25% off',
          sku: `SKU-00${i + 1}`,
          fabric: 'Cotton',
        },
        image: photo,
      })),
    });
    return { data: { image: `data:image/jpeg;base64,${jpeg.toString('base64')}` } };
  });

  // GET /admin/design-templates/:id
  server.get('/design-templates/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const row = await prisma.designTemplate.findUnique({ where: { id } });
    if (!row) throw notFound('Design template');
    return { data: toDto(row) };
  });

  // POST /admin/design-templates — always created as DRAFT; publish via /status.
  server.post('/design-templates', async (request, reply) => {
    const body = CreateSchema.parse(request.body);
    const spec = checkSpec(body.spec, body.format, body.product_slots);
    const row = await prisma.designTemplate.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        occasion: body.occasion ?? null,
        format: body.format,
        product_slots: body.product_slots,
        spec: spec as unknown as Prisma.InputJsonValue,
        background_key: body.background_key ? await verifyAsset(body.background_key) : null,
        thumbnail_key: body.thumbnail_key ? await verifyAsset(body.thumbnail_key) : null,
        plans: body.plans,
        sort_order: body.sort_order,
      },
    });
    await audit(request, 'CREATE', row.id, { name: row.name, format: row.format });
    return reply.status(201).send({ data: toDto(row) });
  });

  // PUT /admin/design-templates/:id — partial update. format / product_slots / spec are
  // re-validated together against the stored values, so they can never disagree.
  server.put('/design-templates/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = UpdateSchema.parse(request.body ?? {});
    const existing = await prisma.designTemplate.findUnique({ where: { id } });
    if (!existing) throw notFound('Design template');

    const data: Prisma.DesignTemplateUpdateInput = {};
    for (const k of ['name', 'description', 'occasion', 'plans', 'sort_order'] as const) {
      if (body[k] !== undefined) (data as Record<string, unknown>)[k] = body[k];
    }
    const format = body.format ?? existing.format;
    const slots = body.product_slots ?? existing.product_slots;
    if (body.format || body.product_slots || body.spec !== undefined) {
      data.format = format;
      data.product_slots = slots;
      data.spec = checkSpec(
        body.spec ?? existing.spec,
        format,
        slots,
      ) as unknown as Prisma.InputJsonValue;
    }
    for (const col of ['background_key', 'thumbnail_key'] as const) {
      const v = body[col];
      if (v === undefined) continue;
      // Unchanged key = no re-verify (it is already a final key we stored).
      data[col] = v === null ? null : v === existing[col] ? v : await verifyAsset(v);
    }

    const row = await prisma.designTemplate.update({ where: { id }, data });
    await audit(request, 'UPDATE', id, { fields: Object.keys(data) });
    return { data: toDto(row) };
  });

  // PUT /admin/design-templates/:id/status — DRAFT | PUBLISHED | HIDDEN (the only way to retire).
  server.put('/design-templates/:id/status', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { status } = z.object({ status: z.enum(STATUSES) }).parse(request.body);
    const existing = await prisma.designTemplate.findUnique({ where: { id } });
    if (!existing) throw notFound('Design template');
    const row = await prisma.designTemplate.update({ where: { id }, data: { status } });
    await audit(request, 'UPDATE', id, { before: existing.status, after: status });
    return { data: toDto(row) };
  });
};
