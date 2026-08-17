import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError, notFound } from '../../plugins/error-handler.js';
import { computeUdharBalance, buildWhatsAppDeepLink, fillTemplate } from './growth-helpers.js';

const TransactionSchema = z.object({
  kind: z.enum(['CHARGE', 'PAYMENT']),
  amount_paise: z.number().int().min(1),
  note: z.string().max(500).optional().nullable(),
});

export const growthUdharRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /growth/udhar ──────────────────────────────────────────
  // All accounts with customer info, balances, and recent transactions.
  server.get('/udhar', async (request) => {
    const retailerId = request.retailerId;
    const accounts = await prisma.udharAccount.findMany({
      where: { retailer_id: retailerId },
      orderBy: { updated_at: 'desc' },
    });
    const customers = await prisma.customer.findMany({
      where: { id: { in: accounts.map((a) => a.customer_id) }, deleted_at: null },
      select: { id: true, name: true, phone: true },
    });
    const customerById = new Map(customers.map((c) => [c.id, c]));

    const withBalances = await Promise.all(
      accounts.map(async (account) => {
        const txs = await prisma.udharTransaction.findMany({
          where: { account_id: account.id },
          orderBy: { created_at: 'desc' },
          take: 20,
        });
        return {
          ...account,
          customer: customerById.get(account.customer_id) ?? null,
          balance_paise: computeUdharBalance(txs),
          transactions: txs,
        };
      }),
    );

    // Only surface accounts with an outstanding balance or recent activity.
    return { data: withBalances.filter((a) => a.balance_paise !== 0 || a.transactions.length > 0) };
  });

  // ─── POST /growth/udhar/accounts ────────────────────────────────
  // Open (or reopen) an udhar account for a customer.
  server.post('/udhar/accounts', async (request, reply) => {
    const retailerId = request.retailerId;
    const body = z.object({ customer_id: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw validationError('customer_id is required');

    const customer = await prisma.customer.findFirst({
      where: { id: body.data.customer_id, retailer_id: retailerId, deleted_at: null },
    });
    if (!customer) throw notFound('Customer');

    const account = await prisma.udharAccount.upsert({
      where: { retailer_id_customer_id: { retailer_id: retailerId, customer_id: customer.id } },
      create: { retailer_id: retailerId, customer_id: customer.id },
      update: {},
    });
    return reply.status(201).send({ data: account });
  });

  // ─── POST /growth/udhar/accounts/:id/transactions ───────────────
  // CHARGE (customer owes more) or PAYMENT (settles). Balance computed
  // from the ledger — never stored directly (single source of truth).
  server.post('/udhar/accounts/:id/transactions', async (request, reply) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const account = await prisma.udharAccount.findFirst({ where: { id, retailer_id: retailerId } });
    if (!account) throw notFound('Udhar account');

    const body = TransactionSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const tx = await prisma.$transaction(async (tx) => {
      const created = await tx.udharTransaction.create({
        data: { account_id: id, retailer_id: retailerId, ...body.data },
      });
      const all = await tx.udharTransaction.findMany({ where: { account_id: id } });
      const balance = computeUdharBalance(all);
      await tx.udharAccount.update({ where: { id }, data: { balance_paise: balance } });
      return { created, balance_paise: balance };
    });
    return reply.status(201).send({ data: tx });
  });

  // ─── POST /growth/udhar/accounts/:id/reminder ───────────────────
  // Build a payment-reminder WhatsApp deep link for the account's customer
  // (roadmap O: "Payment reminder automation via WhatsApp" — manual first,
  // real sends via WHATSAPP_BUSINESS_API later).
  server.post('/udhar/accounts/:id/reminder', async (request, reply) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const account = await prisma.udharAccount.findFirst({ where: { id, retailer_id: retailerId } });
    if (!account) throw notFound('Udhar account');

    const customer = await prisma.customer.findFirst({
      where: { id: account.customer_id, retailer_id: retailerId, deleted_at: null },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) throw notFound('Customer');

    const txs = await prisma.udharTransaction.findMany({ where: { account_id: id } });
    const balance = computeUdharBalance(txs);
    if (balance <= 0) throw validationError('Customer has no outstanding balance');

    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { shop_name: true },
    });
    const message = fillTemplate(
      'Hi {{name}}, this is {{shop}}. Just a friendly reminder that your pending balance is ₹{{amount}}. Please settle it at your convenience. Thank you!',
      { name: customer.name ?? 'there', shop: retailer?.shop_name ?? 'our store', amount: (balance / 100).toFixed(0) },
    );
    return reply.send({
      data: {
        balance_paise: balance,
        customer_id: customer.id,
        message,
        whatsapp_link: buildWhatsAppDeepLink(customer.phone, message),
      },
    });
  });
};
