// Admin GST Report Dashboard (Phase 8).
//
// Queries SubscriptionPayment.gst_amount / gst_invoice_number data to provide
// a GST overview, monthly breakdown, and per-retailer summaries.
//
// SECURITY: guarded by adminAuthPreHandler (admin key + CSRF).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminGstRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/gst/summary ─────────────────────────────────────
  server.get('/gst/summary', async (request) => {
    const q = z
      .object({
        month: z.coerce.number().int().min(1).max(12).optional(),
        year: z.coerce.number().int().min(2020).max(2030).optional(),
        retailer_id: z.string().optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {};
    if (q.success) {
      if (q.data.retailer_id) where.retailer_id = q.data.retailer_id;
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

    where.status = 'success';

    const result = await prisma.subscriptionPayment.aggregate({
      where,
      _sum: { amount_excluding_gst: true, gst_amount: true, amount_inr: true },
      _count: true,
    });

    const invoicedCount = await prisma.subscriptionPayment.count({
      where: { ...where, gst_invoice_number: { not: null } },
    });

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
        estimated_cgst: Math.round(totalGst / 2),
        estimated_sgst: Math.round(totalGst / 2),
        estimated_igst: 0,
      },
    };
  });

  // ─── GET /admin/gst/monthly ─────────────────────────────────────
  server.get('/gst/monthly', async (request) => {
    const q = z
      .object({
        year: z.coerce.number().int().min(2020).max(2030).optional(),
        retailer_id: z.string().optional(),
      })
      .safeParse(request.query);

    const year = q.success && q.data.year ? q.data.year : new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    const where: Record<string, unknown> = {
      created_at: { gte: startOfYear, lt: endOfYear },
      status: 'success',
    };
    if (q.success && q.data.retailer_id) where.retailer_id = q.data.retailer_id;

    const monthlyData = await prisma.subscriptionPayment.groupBy({
      by: ['created_at'],
      where,
      _sum: { amount_excluding_gst: true, gst_amount: true, amount_inr: true },
      _count: true,
    });

    const months: Record<number, { taxable: number; gst: number; sales: number; orders: number }> = {};
    for (let m = 0; m < 12; m++) {
      months[m] = { taxable: 0, gst: 0, sales: 0, orders: 0 };
    }

    for (const row of monthlyData) {
      const m = new Date(row.created_at).getMonth();
      const entry = months[m];
      if (entry) {
        entry.taxable += (row._sum?.amount_excluding_gst ?? 0) as number;
        entry.gst += (row._sum?.gst_amount ?? 0) as number;
        entry.sales += (row._sum?.amount_inr ?? 0) as number;
        entry.orders += (row._count ?? 0) as number;
      }
    }

    const result = Object.entries(months).map(([m, data]) => ({
      month: parseInt(m) + 1,
      month_name: new Date(year, parseInt(m)).toLocaleString('en-IN', { month: 'short' }),
      taxable: data.taxable,
      gst: data.gst,
      sales: data.sales,
      orders: data.orders,
    }));

    return { data: { year, months: result } };
  });

  // ─── GET /admin/gst/by-retailer ─────────────────────────────────
  server.get('/gst/by-retailer', async (request) => {
    const q = z
      .object({
        month: z.coerce.number().int().min(1).max(12).optional(),
        year: z.coerce.number().int().min(2020).max(2030).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {
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

    const limit = q.success && q.data.limit ? q.data.limit : 20;

    const byRetailer = await prisma.subscriptionPayment.groupBy({
      by: ['retailer_id'],
      where,
      _sum: { amount_excluding_gst: true, gst_amount: true, amount_inr: true },
      _count: true,
      orderBy: { _sum: { gst_amount: 'desc' } },
      take: limit,
    });

    const retailerIds = byRetailer.map((r) => r.retailer_id);
    const retailers = await prisma.retailer.findMany({
      where: { id: { in: retailerIds } },
      select: { id: true, shop_name: true, city: true, gstin: true },
    });
    const retailerMap = new Map(retailers.map((r) => [r.id, r]));

    const result = byRetailer.map((r) => {
      const info = retailerMap.get(r.retailer_id);
      return {
        retailer_id: r.retailer_id,
        shop_name: info?.shop_name ?? 'Unknown',
        city: info?.city ?? '',
        gstin: info?.gstin ?? null,
        payments: r._count,
        taxable: r._sum.amount_excluding_gst ?? 0,
        gst: r._sum.gst_amount ?? 0,
        sales: r._sum.amount_inr ?? 0,
      };
    });

    return { data: result };
  });

  // ─── GET /admin/gst/transactions ─────────────────────────────────
  server.get('/gst/transactions', async (request) => {
    const q = z
      .object({
        month: z.coerce.number().int().min(1).max(12).optional(),
        year: z.coerce.number().int().min(2020).max(2030).optional(),
        retailer_id: z.string().optional(),
        invoiced: z.coerce.boolean().optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {
      status: 'success',
    };

    if (q.success) {
      if (q.data.retailer_id) where.retailer_id = q.data.retailer_id;
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
        include: { subscription: { include: { retailer: { select: { id: true, shop_name: true, gstin: true } } } } },
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
          retailer: p.subscription.retailer.shop_name,
          gstin: p.subscription.retailer.gstin,
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
