// Retailer-facing GST Report routes.
//
// Retailers view their own GST summary, monthly breakdown, and
// transaction history. All queries are scoped to the retailer's ID.
// Uses SubscriptionPayment.gst_amount / gst_invoice_number.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

export const growthGstRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /growth/gst/summary ────────────────────────────────────
  server.get('/gst/summary', async (request) => {
    const retailerId = request.retailerId;

    const q = z
      .object({
        month: z.coerce.number().int().min(1).max(12).optional(),
        year: z.coerce.number().int().min(2020).max(2030).optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {
      retailer_id: retailerId,
      status: 'success',
    };

    if (q.success) {
      if (q.data.month && q.data.year) {
        const start = new Date(q.data.year, q.data.month - 1, 1);
        const end = new Date(q.data.year, q.data.month, 1);
        where.created_at = { gte: start, lt: end };
      } else if (q.data.year) {
        const start = new Date(q.data.year, 0, 1);
        const end = new Date(q.data.year + 1, 0, 1);
        where.created_at = { gte: start, lt: end };
      }
    }

    const [result, invoicedCount] = await Promise.all([
      prisma.subscriptionPayment.aggregate({
        where,
        _sum: {
          amount_excluding_gst: true,
          gst_amount: true,
          amount_inr: true,
          cgst_amount: true,
          sgst_amount: true,
          igst_amount: true,
        },
        _count: true,
      }),
      prisma.subscriptionPayment.count({
        where: { ...where, gst_invoice_number: { not: null } },
      }),
    ]);

    const subtotal = result._sum.amount_excluding_gst ?? 0;
    const totalGst = result._sum.gst_amount ?? 0;
    const totalSales = result._sum.amount_inr ?? 0;
    const totalOrders = result._count;

    return {
      data: {
        total_orders: totalOrders,
        invoiced_orders: invoicedCount,
        pending_invoices: totalOrders - invoicedCount,
        total_taxable: subtotal,
        total_gst: totalGst,
        total_sales: totalSales,
        cgst: result._sum.cgst_amount ?? 0,
        sgst: result._sum.sgst_amount ?? 0,
        igst: result._sum.igst_amount ?? 0,
      },
    };
  });

  // ─── GET /growth/gst/monthly ────────────────────────────────────
  server.get('/gst/monthly', async (request) => {
    const retailerId = request.retailerId;

    const q = z
      .object({
        year: z.coerce.number().int().min(2020).max(2030).optional(),
      })
      .safeParse(request.query);

    const year = q.success && q.data.year ? q.data.year : new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    const where: Record<string, unknown> = {
      retailer_id: retailerId,
      created_at: { gte: startOfYear, lt: endOfYear },
      status: 'success',
    };

    const monthlyData = await prisma.subscriptionPayment.groupBy({
      by: ['created_at'],
      where,
      _sum: {
        amount_excluding_gst: true,
        gst_amount: true,
        amount_inr: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
      },
      _count: true,
    });

    const months: Record<
      number,
      {
        taxable: number;
        gst: number;
        cgst: number;
        sgst: number;
        igst: number;
        sales: number;
        orders: number;
      }
    > = {};
    for (let m = 0; m < 12; m++) {
      months[m] = { taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, sales: 0, orders: 0 };
    }

    for (const row of monthlyData) {
      const m = new Date(row.created_at).getMonth();
      const entry = months[m];
      if (entry) {
        entry.taxable += (row._sum?.amount_excluding_gst ?? 0) as number;
        entry.gst += (row._sum?.gst_amount ?? 0) as number;
        entry.cgst += (row._sum?.cgst_amount ?? 0) as number;
        entry.sgst += (row._sum?.sgst_amount ?? 0) as number;
        entry.igst += (row._sum?.igst_amount ?? 0) as number;
        entry.sales += (row._sum?.amount_inr ?? 0) as number;
        entry.orders += (row._count ?? 0) as number;
      }
    }

    const result = Object.entries(months).map(([m, data]) => ({
      month: Number.parseInt(m) + 1,
      month_name: new Date(year, Number.parseInt(m)).toLocaleString('en-IN', { month: 'short' }),
      taxable: data.taxable,
      gst: data.gst,
      cgst: data.cgst,
      sgst: data.sgst,
      igst: data.igst,
      sales: data.sales,
      orders: data.orders,
    }));

    return { data: { year, months: result } };
  });

  // ─── GET /growth/gst/transactions ───────────────────────────────
  server.get('/gst/transactions', async (request) => {
    const retailerId = request.retailerId;

    const q = z
      .object({
        month: z.coerce.number().int().min(1).max(12).optional(),
        year: z.coerce.number().int().min(2020).max(2030).optional(),
        invoiced: z.coerce.boolean().optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {
      retailer_id: retailerId,
      status: 'success',
    };

    if (q.success) {
      if (q.data.invoiced !== undefined) {
        where.gst_invoice_number = q.data.invoiced ? { not: null } : null;
      }
      if (q.data.month && q.data.year) {
        const start = new Date(q.data.year, q.data.month - 1, 1);
        const end = new Date(q.data.year, q.data.month, 1);
        where.created_at = { gte: start, lt: end };
      } else if (q.data.year) {
        const start = new Date(q.data.year, 0, 1);
        const end = new Date(q.data.year + 1, 0, 1);
        where.created_at = { gte: start, lt: end };
      }
    }

    const page = q.success && q.data.page ? q.data.page : 1;
    const limit = q.success && q.data.limit ? q.data.limit : 50;
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      prisma.subscriptionPayment.findMany({
        where,
        select: {
          id: true,
          amount_excluding_gst: true,
          gst_amount: true,
          amount_inr: true,
          gst_invoice_number: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.subscriptionPayment.count({ where }),
    ]);

    return {
      data: {
        transactions: payments.map((p) => ({
          id: p.id,
          taxable: p.amount_excluding_gst ?? 0,
          gst: p.gst_amount ?? 0,
          total: p.amount_inr,
          invoice_number: p.gst_invoice_number,
          has_invoice: !!p.gst_invoice_number,
          date: p.created_at,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    };
  });
};
