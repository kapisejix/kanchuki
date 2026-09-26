// F-039 Phase 2 — virtual try-on (CatVTON on the RunPod worker).
//
// Two clients, one route. The retailer app calls it with a Bearer token (the
// in-store flow: photograph the customer, try the product on); the customer PWA
// calls it with only the `kanchuki_passport` cookie (the shopper's own product
// page). The auth plugin deliberately does not hard-401 the cookie-only case —
// it defers that to this handler, which validates the session and resolves the
// retailer from the product (see plugins/auth.ts).
//
//   POST /v1/products/:id/try-on            multipart wearer photo → 202 {job_id}
//   GET  /v1/products/:id/try-on/status     ?job_id= → processing|ready|failed
//
// ─── The launch gate is here, server-side, and it is a 404 ───────────────────
// If the retailer's plan does not have VIRTUAL_TRY_ON_V2 enabled the route
// answers 404, not 403 — a 403 confirms the endpoint exists and is merely
// locked, which is a fact the owner asked us not to reveal before launch. The
// UI hiding the button is a convenience; THIS check is the gate (a client can
// always call the API directly). It is the first thing after identity, before
// config/quota/media, so a flag-off plan leaks nothing else.
//
// ─── The wearer's photo is never persisted ───────────────────────────────────
// Read into a Buffer, stashed in-process for the job (lib/tryon-photo-store.ts),
// and gone. It is not in the BullMQ payload, not on R2, not in the DB — Redis
// is storage too, which is why the obvious "put the bytes in job.data" is not
// what happens here. Only the GENERATED image is saved, under a key served
// presigned per read.
import multipart from '@fastify/multipart';
import { getDownloadPresignedUrl, isCatVtonConfigured, isUnsupportedTryOnCategory } from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { addTryOnJob } from '../../jobs/index.js';
import { hasFeature } from '../../lib/features.js';
import { checkCustomerQuota, checkQuota } from '../../lib/quota.js';
import { discardTryOnPhoto, putTryOnPhoto } from '../../lib/tryon-photo-store.js';
import {
  AppError,
  notFound,
  serviceUnavailable,
  validationError,
} from '../../plugins/error-handler.js';
import { getPassportSession } from '../public/passport/passport-helpers.js';

/** Phone JPEGs run 2–8 MB; 10 MB is generous without making the parser a
 *  memory amplifier. Over this, Fastify answers 413. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const PRODUCT_SELECT = {
  id: true,
  retailer_id: true,
  category: true,
  photos: {
    orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
    take: 1,
    select: { url: true, r2_key: true },
  },
} satisfies Prisma.ProductSelect;

function unauthorized(): AppError {
  return new AppError('UNAUTHORIZED', 'Sign in to try on this outfit.', 401);
}

interface TryOnContext {
  retailerId: string;
  customerAccountId: string | null;
  product: {
    id: string;
    retailer_id: string;
    category: string | null;
    photos: { url: string; r2_key: string | null }[];
  };
}

/**
 * Resolve who is asking + which product, without trusting either side blindly.
 *
 * A valid Bearer token (already verified by the auth plugin) wins: the product
 * must belong to that retailer, so a staff/owner token cannot try on another
 * store's catalogue. Without one, an authenticated shopper may try on any
 * publicly-visible product, and the product row names the retailer whose quota
 * it spends.
 *
 * A passport session is also read on the retailer path when present — the
 * in-store flow can carry the shopper's cookie, and a set customer id is what
 * makes the request count against the customer-side quota too.
 */
async function resolveTryOnContext(
  request: FastifyRequest,
  productId: string,
): Promise<TryOnContext> {
  const session = await getPassportSession(request.headers.cookie ?? '');
  const customerAccountId = session?.customer_account_id ?? null;

  if (request.retailerId) {
    const product = await prisma.product.findFirst({
      where: { id: productId, retailer_id: request.retailerId, deleted_at: null },
      select: PRODUCT_SELECT,
    });
    if (!product) throw notFound('Product');
    return { retailerId: request.retailerId, customerAccountId, product };
  }

  if (!customerAccountId) throw unauthorized();

  // Customer path: the product must be publicly visible, and its retailer is
  // the one whose monthly try-on allowance this spends.
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      deleted_at: null,
      retailer: { deleted_at: null, is_suspended: false },
    },
    select: PRODUCT_SELECT,
  });
  if (!product) throw notFound('Product');
  return { retailerId: product.retailer_id, customerAccountId, product };
}

/** Normalise a client-declared MIME type for the inline data URI the worker
 *  decodes. `image/jpg` is a real (if nonstandard) thing phones send. */
function normalizeContentType(mimetype: string | undefined): string | null {
  if (!mimetype) return null;
  const lower = mimetype.toLowerCase();
  if (!lower.startsWith('image/')) return null;
  return lower === 'image/jpg' ? 'image/jpeg' : lower;
}

export const productsTryOnRoutes: FastifyPluginAsync = async (server) => {
  // Scoped to this plugin — the multipart parser is only needed by the one
  // route below and is not registered against the whole API.
  await server.register(multipart, {
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  });

  // ─── POST /products/:id/try-on ──────────────────────────────────
  server.post('/:id/try-on', async (request, reply) => {
    const { id } = request.params as { id: string };

    const { retailerId, customerAccountId, product } = await resolveTryOnContext(request, id);

    // 1. Launch gate. 404 (not 403) so the route is invisible until the owner
    //    enables VIRTUAL_TRY_ON_V2 for a plan in the Plan Feature Matrix.
    if (!(await hasFeature(retailerId, 'VIRTUAL_TRY_ON_V2'))) {
      throw notFound('Product');
    }

    // 2. Engine configured (Admin → Integrations: CATVTON_API_URL + key).
    if (!(await isCatVtonConfigured())) {
      throw serviceUnavailable(
        'Virtual try-on is not configured yet. Set the try-on engine in Admin → Integrations.',
      );
    }

    // 3. Garment sanity — checked before quota so an impossible request never
    //    costs the retailer a credit.
    if (isUnsupportedTryOnCategory(product.category)) {
      throw validationError('This garment type cannot be tried on yet.', 'product');
    }
    if (product.photos.length === 0) {
      throw validationError('This product has no photo to try on.', 'product');
    }

    // 4. Both caps must pass — the retailer's monthly allowance AND, for a
    //    logged-in shopper, their own. Distinct error codes: the retailer cap
    //    is 402 PLAN_LIMIT_EXCEEDED ("upgrade"), the shopper's is 402
    //    CUSTOMER_LIMIT_EXCEEDED (advice aimed at someone with no plan).
    await checkQuota(retailerId, 'TRY_ON_GENERATION');
    if (customerAccountId) {
      await checkCustomerQuota(customerAccountId, 'TRY_ON_GENERATION');
    }

    // 5. The wearer's photo.
    if (!request.isMultipart()) {
      throw validationError('Expected a multipart form with one photo.', 'photo');
    }
    const file = await request.file();
    if (!file) throw validationError('A photo is required.', 'photo');

    const contentType = normalizeContentType(file.mimetype);
    if (!contentType) throw validationError('Only JPEG, PNG or WebP photos are supported.', 'photo');

    const buffer = await file.toBuffer();
    if (buffer.length === 0) throw validationError('The submitted photo was empty.', 'photo');

    // 6. Job row first, so the poll endpoint has something to read even if the
    //    worker is slow to pick the job up.
    const jobId = `tryon_${createId()}`;
    await prisma.tryOnJob.create({
      data: {
        id: jobId,
        retailer_id: retailerId,
        customer_account_id: customerAccountId,
        product_id: id,
        status: 'PENDING',
      },
    });

    // 7. Hand the photo to the job in-process — it must not cross Redis. A full
    //    store means the server is saturated; fail this one job cleanly.
    if (!putTryOnPhoto(jobId, buffer, contentType)) {
      await prisma.tryOnJob
        .update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            failure_reason: 'Try-on is busy right now. Please try again in a moment.',
            completed_at: new Date(),
          },
        })
        .catch(() => {});
      throw serviceUnavailable('Try-on is busy right now. Please try again in a moment.');
    }

    try {
      await addTryOnJob({
        job_id: jobId,
        retailer_id: retailerId,
        customer_account_id: customerAccountId,
        product_id: id,
      });
    } catch (err) {
      // Nothing will take the photo now — drop it rather than hold it for TTL.
      discardTryOnPhoto(jobId);
      await prisma.tryOnJob
        .update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            failure_reason: 'Could not start the try-on. Please try again.',
            completed_at: new Date(),
          },
        })
        .catch(() => {});
      throw err;
    }

    return reply.status(202).send({ data: { job_id: jobId, status: 'processing' } });
  });

  // ─── GET /products/:id/try-on/status ────────────────────────────
  server.get('/:id/try-on/status', async (request) => {
    const { id } = request.params as { id: string };
    const q = z.object({ job_id: z.string().min(1) }).safeParse(request.query);
    if (!q.success) throw validationError('job_id is required', 'job_id');

    const session = await getPassportSession(request.headers.cookie ?? '');
    const customerAccountId = session?.customer_account_id ?? null;
    if (!request.retailerId && !customerAccountId) throw unauthorized();

    // The job id is an opaque handle, but it is scoped to the caller anyway:
    // a retailer only sees their own store's jobs, a shopper only their own.
    const job = await prisma.tryOnJob.findFirst({
      where: {
        id: q.data.job_id,
        product_id: id,
        ...(request.retailerId
          ? { retailer_id: request.retailerId }
          : { customer_account_id: customerAccountId ?? '' }),
      },
      select: { status: true, result_url: true, failure_reason: true },
    });
    if (!job) throw notFound('Try-on job');

    if (job.status === 'COMPLETED' && job.result_url) {
      // The generated image is a photo of a real person — a short-lived
      // presigned URL per read, never a public one.
      const url = await getDownloadPresignedUrl(job.result_url, 3600).catch(() => null);
      return { data: { status: 'ready', url } };
    }
    if (job.status === 'FAILED') {
      return {
        data: {
          status: 'failed',
          error: job.failure_reason ?? 'The try-on could not be generated. Please try again.',
        },
      };
    }
    return { data: { status: 'processing' } };
  });
};
