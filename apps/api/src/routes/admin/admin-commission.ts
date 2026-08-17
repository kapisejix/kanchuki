// Admin commission ledger — tracks the 3% of each month's total successful
// subscription payments set aside as a commission pool, and the admin's
// expense entries charged against it (amount, where, date, notes).
//
// The monthly commission is COMPUTED on the fly from subscription_payments
// (status='success', grouped by paid_at month) — nothing is snapshotted, so a
// refunded/voided payment immediately reduces the month's pool. Only expense
// entries are stored (admin_commission_expenses). All amounts are paise.
//
// Admin panel only — no retailer-facing surface. SECURITY: guarded by the
// standard adminAuthPreHandler (admin key + CSRF) like every /v1/admin route.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

/** 3% commission rate on each month's total payments. */
export const ADMIN_COMMISSION_RATE = 0.03;

/** IST offset (ms) — the business calendar the admin thinks in. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** YYYY-MM for a date, in IST (the admin's business calendar). */
export function periodKey(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Current YYYY-MM in IST. */
export function currentPeriod(): string {
  return periodKey(new Date());
}

/** UTC instant range covering a full IST month for a YYYY-MM period. */
export function monthRange(period: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = period.split('-');
  const y = Number(yearStr);
  const m = Number(monthStr);
  const start = new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS);
  return { start, end };
}

/** 3% of a monthly payment total (paise), rounded to the nearest paise. */
export function commissionOf(totalPaise: number): number {
  return Math.round(totalPaise * ADMIN_COMMISSION_RATE);
}

export const adminCommissionRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/commission/overview?months=N ────────────────────
  // Per-month rollup for the last N months (default 12, max 36): total
  // successful subscription payments, the 3% commission, total spent from the
  // pool, and what remains. Powers the "Monthly Summary" tab.
  server.get('/commission/overview', async (request) => {
    const query = z
      .object({ months: z.coerce.number().int().min(1).max(36).default(12) })
      .safeParse(request.query);
    const months = query.success ? query.data.months : 12;

    const now = new Date();
    // Newest month first (rows[0] = current month).
    const periods: string[] = [];
    for (let i = 0; i < months; i++) {
      periods.push(periodKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    }
    const { start } = monthRange(periods[0]!);

    const [payments, expenseGroups] = await Promise.all([
      prisma.subscriptionPayment.findMany({
        where: { status: 'success', paid_at: { gte: start } },
        select: { amount_inr: true, paid_at: true },
      }),
      prisma.adminCommissionExpense.groupBy({
        by: ['period'],
        where: { period: { in: periods } },
        _sum: { amount_inr: true },
        _count: true,
      }),
    ]);

    const paymentByPeriod = new Map<string, number>();
    for (const p of payments) {
      if (!p.paid_at) continue;
      const k = periodKey(p.paid_at);
      paymentByPeriod.set(k, (paymentByPeriod.get(k) ?? 0) + p.amount_inr);
    }
    const spentByPeriod = new Map(
      expenseGroups.map((g) => [g.period, g._sum.amount_inr ?? 0]),
    );
    const countByPeriod = new Map(expenseGroups.map((g) => [g.period, g._count]));

    const rows = periods.map((period) => {
      const total_payment_inr = paymentByPeriod.get(period) ?? 0;
      const commission_inr = commissionOf(total_payment_inr);
      const spent_inr = spentByPeriod.get(period) ?? 0;
      return {
        period,
        total_payment_inr,
        commission_inr,
        spent_inr,
        // Can go negative — the UI flags overspending in red.
        remaining_inr: commission_inr - spent_inr,
        expense_count: countByPeriod.get(period) ?? 0,
      };
    });

    return { data: rows };
  });

  // ─── GET /admin/commission/expenses?month=YYYY-MM ───────────────
  // The expenditure grid for one month: every expense entry plus the month's
  // summary (total payment → 3% → spent → remaining).
  server.get('/commission/expenses', async (request) => {
    const query = z
      .object({ month: z.string().regex(PERIOD_RE).default(currentPeriod()) })
      .parse(request.query);

    const { start, end } = monthRange(query.month);
    const [expenses, paymentAgg, expenseAgg] = await Promise.all([
      prisma.adminCommissionExpense.findMany({
        where: { period: query.month },
        orderBy: { expense_date: 'desc' },
      }),
      prisma.subscriptionPayment.aggregate({
        where: { status: 'success', paid_at: { gte: start, lt: end } },
        _sum: { amount_inr: true },
      }),
      prisma.adminCommissionExpense.aggregate({
        where: { period: query.month },
        _sum: { amount_inr: true },
        _count: true,
      }),
    ]);

    const total_payment_inr = paymentAgg._sum.amount_inr ?? 0;
    const spent_inr = expenseAgg._sum.amount_inr ?? 0;
    const commission_inr = commissionOf(total_payment_inr);

    return {
      data: {
        month: query.month,
        summary: {
          total_payment_inr,
          commission_inr,
          spent_inr,
          remaining_inr: commission_inr - spent_inr,
          expense_count: expenseAgg._count,
        },
        expenses,
      },
    };
  });

  // ─── POST /admin/commission/expenses ────────────────────────────
  // Record an expense charged against a month's 3% pool: amount, where
  // (category), date, and an explanation note.
  server.post('/commission/expenses', async (request) => {
    const body = z
      .object({
        period: z.string().regex(PERIOD_RE, 'Period must be YYYY-MM'),
        amount_inr: z.number().int().positive('Amount must be greater than 0 (in paise)'),
        category: z.string().trim().min(1, 'Where is required').max(120),
        expense_date: z.coerce.date(),
        notes: z.string().trim().max(1000).optional(),
      })
      .parse(request.body);

    const expense = await prisma.adminCommissionExpense.create({
      data: {
        period: body.period,
        amount_inr: body.amount_inr,
        category: body.category,
        expense_date: body.expense_date,
        notes: body.notes || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'AdminCommissionExpense',
        resource_id: expense.id,
        metadata: {
          period: expense.period,
          amount_inr: expense.amount_inr,
          category: expense.category,
          expense_date: expense.expense_date.toISOString(),
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ id: expense.id, period: expense.period }, 'Commission expense recorded');

    return { data: expense };
  });

  // ─── PATCH /admin/commission/expenses/:id ────────────────────────
  // Edit an existing expense — any subset of period / amount / where /
  // date / notes. `notes: null` clears the note. Audited with before/after.
  server.patch<{ Params: { id: string } }>('/commission/expenses/:id', async (request) => {
    const body = z
      .object({
        period: z.string().regex(PERIOD_RE, 'Period must be YYYY-MM').optional(),
        amount_inr: z.number().int().positive('Amount must be greater than 0 (in paise)').optional(),
        category: z.string().trim().min(1, 'Where is required').max(120).optional(),
        expense_date: z.coerce.date().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(request.body);

    if (Object.keys(body).length === 0) {
      throw validationError('Nothing to update — send at least one field');
    }

    const prev = await prisma.adminCommissionExpense.findUnique({
      where: { id: request.params.id },
    });
    if (!prev) throw notFound('Commission expense');

    const expense = await prisma.adminCommissionExpense.update({
      where: { id: request.params.id },
      data: {
        ...(body.period !== undefined ? { period: body.period } : {}),
        ...(body.amount_inr !== undefined ? { amount_inr: body.amount_inr } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.expense_date !== undefined ? { expense_date: body.expense_date } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'AdminCommissionExpense',
        resource_id: expense.id,
        metadata: {
          before: {
            period: prev.period,
            amount_inr: prev.amount_inr,
            category: prev.category,
            expense_date: prev.expense_date.toISOString(),
          },
          after: {
            period: expense.period,
            amount_inr: expense.amount_inr,
            category: expense.category,
            expense_date: expense.expense_date.toISOString(),
          },
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ id: expense.id }, 'Commission expense updated');
    return { data: expense };
  });

  // ─── DELETE /admin/commission/expenses/:id ──────────────────────
  server.delete<{ Params: { id: string } }>(
    '/commission/expenses/:id',
    async (request, reply) => {
      const expense = await prisma.adminCommissionExpense
        .delete({ where: { id: request.params.id } })
        .catch(() => null);
      if (!expense) throw notFound('Commission expense');

      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          action: 'DELETE',
          resource_type: 'AdminCommissionExpense',
          resource_id: expense.id,
          metadata: {
            period: expense.period,
            amount_inr: expense.amount_inr,
            category: expense.category,
            expense_date: expense.expense_date.toISOString(),
          },
          ip_address: request.ip,
        },
      });

      request.log.info({ id: expense.id }, 'Commission expense deleted');
      return reply.status(204).send();
    },
  );
};
