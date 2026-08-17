import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError, notFound } from '../../plugins/error-handler.js';
import { computeSupplierPending } from './growth-helpers.js';

const SupplierSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(20).optional().nullable(),
  city: z.string().max(60).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const TransactionSchema = z.object({
  kind: z.enum(['ORDER', 'PAYMENT']),
  amount_paise: z.number().int().min(1),
  note: z.string().max(500).optional().nullable(),
  transaction_date: z.string().datetime().optional(),
});

export const growthSupplierRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /growth/suppliers ──────────────────────────────────────
  server.get('/suppliers', async (request) => {
    const suppliers = await prisma.supplier.findMany({
      where: { retailer_id: request.retailerId },
      orderBy: { created_at: 'desc' },
    });
    return { data: suppliers };
  });

  // ─── POST /growth/suppliers ─────────────────────────────────────
  server.post('/suppliers', async (request, reply) => {
    const retailerId = request.retailerId;
    const body = SupplierSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const supplier = await prisma.supplier.create({ data: { retailer_id: retailerId, ...body.data } });
    return reply.status(201).send({ data: supplier });
  });

  // ─── PUT /growth/suppliers/:id ──────────────────────────────────
  server.put('/suppliers/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const existing = await prisma.supplier.findFirst({ where: { id, retailer_id: retailerId } });
    if (!existing) throw notFound('Supplier');

    const body = SupplierSchema.partial().safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const updated = await prisma.supplier.update({ where: { id }, data: body.data });
    return reply.send({ data: updated });
  });

  // ─── DELETE /growth/suppliers/:id ───────────────────────────────
  server.delete('/suppliers/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const existing = await prisma.supplier.findFirst({ where: { id, retailer_id: retailerId } });
    if (!existing) throw notFound('Supplier');
    await prisma.$transaction([
      prisma.supplierTransaction.deleteMany({ where: { supplier_id: id } }),
      prisma.supplier.delete({ where: { id } }),
    ]);
    return reply.status(204).send();
  });

  // ─── GET /growth/suppliers/:id ──────────────────────────────────
  // Supplier detail + transaction ledger + pending balance.
  server.get('/suppliers/:id', async (request) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const supplier = await prisma.supplier.findFirst({ where: { id, retailer_id: retailerId } });
    if (!supplier) throw notFound('Supplier');

    const transactions = await prisma.supplierTransaction.findMany({
      where: { supplier_id: id },
      orderBy: { transaction_date: 'desc' },
    });
    const pending = computeSupplierPending(transactions);

    // Keep the stored pending snapshot in sync (denormalized for the list view).
    if (pending !== supplier.pending_amount_paise) {
      await prisma.supplier.update({ where: { id }, data: { pending_amount_paise: pending } });
      supplier.pending_amount_paise = pending;
    }

    return { data: { ...supplier, transactions, pending_amount_paise: pending } };
  });

  // ─── POST /growth/suppliers/:id/transactions ────────────────────
  server.post('/suppliers/:id/transactions', async (request, reply) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const supplier = await prisma.supplier.findFirst({ where: { id, retailer_id: retailerId } });
    if (!supplier) throw notFound('Supplier');

    const body = TransactionSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { transaction_date, ...rest } = body.data;

    const tx = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierTransaction.create({
        data: { supplier_id: id, retailer_id: retailerId, transaction_date: transaction_date ? new Date(transaction_date) : new Date(), ...rest },
      });
      const all = await tx.supplierTransaction.findMany({ where: { supplier_id: id } });
      await tx.supplier.update({ where: { id }, data: { pending_amount_paise: computeSupplierPending(all) } });
      return created;
    });
    return reply.status(201).send({ data: tx });
  });
};
