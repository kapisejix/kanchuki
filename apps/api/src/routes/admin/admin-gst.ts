// Admin GST Report Dashboard (Phase 8).
//
// Queries existing Order.gst_amount / Order.gst_invoice_number data to provide
// a GST overview, monthly breakdown, and per-retailer summaries.
// No new schema needed — GST fields already exist on the Order model.
//
// SECURITY: guarded by adminAuthPreHandler (admin key + CSRF).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminGstRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/gst/summary ─────────────────────────────────────
  // Overall GST summary: total taxable, total GST, total orders, invoiced count.
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

    // Only include completed/paid orders
    where.status = { in: ['PAID', 'DELIVERED', 'COMPLETED'] };

    const result = await prisma.order.aggregate({
      where,
      _sum: { subtotal_amount: true, gst_amount: true, total_amount: true },
      _count: { id: true },
    });

    const invoicedCount = await prisma.order.count({
      where: { ...where, gst_invoice_number: { not: null } },
    });

    const subtotal = result._sum.subtotal_amount ?? 0;
    const totalGst = result._sum.gst_amount ?? 0;
    const totalSales = result._sum.total_amount ?? 0;

    return {
      data: {
        total_orders: result._count.id,
        invoiced_orders: invoicedCount,
        pending_invoices: result._count.id - invoicedCount,
        // Amounts in paise → convert to rupees for display
        total_taxable: Math.round(subtotal / 100),
        total_gst: Math.round(totalGst / 100),
        total_sales: Math.round(totalSales / 100),
        // Estimated CGST/SGST/IGST split (50/50 for intra-state, 100% IGST for inter-state)
        estimated_cgst: Math.round(totalGst / 200),
        estimated_sgst: Math.round(totalGst / 200),
        estimated_igst: 0, // Simplified — real split needs state comparison
      },
    };
  });

  // ─── GET /admin/gst/monthly ─────────────────────────────────────
  // Monthly breakdown for the current/selected year.
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
      status: { in: ['PAID', 'DELIVERED', 'COMPLETED'] },
    };
    if (q.success && q.data.retailer_id) where.retailer_id = q.data.retailer_id;

    const monthlyData = await prisma.order.groupBy({
      by: ['created_at'],
      where,
      _sum: { subtotal_amount: true, gst_amount: true, total_amount: true },
      _count: { id: true },
    });

    // Aggregate by month
    const months: Record<number, { taxable: number; gst: number; sales: number; orders: number }> = {};
    for (let m = 0; m < 12; m++) {
      months[m] = { taxable: 0, gst: 0, sales: 0, orders: 0 };
    }

    for (const row of monthlyData) {
      const m = new Date(row.created_at).getMonth();
      const entry = months[m];
      if (entry) {
        entry.taxable += (row._sum?.subtotal_amount ?? 0) as number;
        entry.gst += (row._sum?.gst_amount ?? 0) as number;
        entry.sales += (row._sum?.total_amount ?? 0) as number;
        entry.orders += (row._count?.id ?? 0) as number;
      }
    }

    const result = Object.entries(months).map(([m, data]) => ({
      month: parseInt(m) + 1,
      month_name: new Date(year, parseInt(m)).toLocaleString('en-IN', { month: 'short' }),
      taxable: Math.round(data.taxable / 100),
      gst: Math.round(data.gst / 100),
      sales: Math.round(data.sales / 100),
      orders: data.orders,
    }));

    return { data: { year, months: result } };
  });

  // ─── GET /admin/gst/by-retailer ─────────────────────────────────
  // Per-retailer GST breakdown for the selected period.
  server.get('/gst/by-retailer', async (request) => {
    const q = z
      .object({
        month: z.coerce.number().int().min(1).max(12).optional(),
        year: z.coerce.number().int().min(2020).max(2030).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .safeParse(request.query);

    const where: Record<string, unknown> = {
      status: { in: ['PAID', 'DELIVERED', 'COMPLETED'] },
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

    const byRetailer = await prisma.order.groupBy({
      by: ['retailer_id'],
      where,
      _sum: { subtotal_amount: true, gst_amount: true, total_amount: true },
      _count: { id: true },
      orderBy: { _sum: { gst_amount: 'desc' } },
      take: limit,
    });

    // Fetch retailer names
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
        orders: r._count.id,
        taxable: Math.round((r._sum.subtotal_amount ?? 0) / 100),
        gst: Math.round((r._sum.gst_amount ?? 0) / 100),
        sales: Math.round((r._sum.total_amount ?? 0) / 100),
      };
    });

    return { data: result };
  });

  // ─── GET /admin/gst/transactions ─────────────────────────────────
  // Individual GST transactions (orders with GST data) for the period.
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
      status: { in: ['PAID', 'DELIVERED', 'COMPLETED'] },
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

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          customer_name: true,
          customer_phone: true,
          subtotal_amount: true,
          gst_amount: true,
          total_amount: true,
          gst_invoice_number: true,
          created_at: true,
          retailer: { select: { id: true, shop_name: true, gstin: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      data: {
        transactions: orders.map((o) => ({
          id: o.id,
          customer: o.customer_name,
          taxable: Math.round(o.subtotal_amount / 100),
          gst: Math.round(o.gst_amount / 100),
          total: Math.round(o.total_amount / 100),
          invoice_number: o.gst_invoice_number,
          has_invoice: !!o.gst_invoice_number,
          date: o.created_at,
          retailer: o.retailer.shop_name,
          gstin: o.retailer.gstin,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    };
  });
};
