// Auto-split from retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';

export const retailersStatsRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /retailers/me/stats ────────────────────────────────────
  server.get('/me/stats', async (request) => {
    const retailerId = request.retailerId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalProducts,
      totalCustomers,
      activeCollections,
      monthViews,
      monthEnquiries,
      topViewed,
      topEnquired,
    ] = await Promise.all([
      prisma.product.count({
        where: { retailer_id: retailerId, deleted_at: null, status: 'AVAILABLE' },
      }),
      prisma.customer.count({ where: { retailer_id: retailerId, deleted_at: null } }),
      prisma.collection.count({
        where: { retailer_id: retailerId, status: 'ACTIVE', deleted_at: null },
      }),
      prisma.collectionView.count({
        where: { retailer_id: retailerId, created_at: { gte: monthStart } },
      }),
      prisma.collectionEnquiry.count({
        where: { retailer_id: retailerId, created_at: { gte: monthStart } },
      }),
      Promise.resolve([]) as any,
      Promise.resolve([]) as any,
    ]);

    const productIds = [...topViewed, ...topEnquired].map((g) => g.product_id as string);
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            category: true,
            primary_color: true,
            photos: { where: { is_primary: true }, select: { url: true }, take: 1 },
          },
        })
      : [];
    const productMap = new Map(
      products.map((p) => [
        p.id,
        {
          id: p.id,
          category: p.category,
          primary_color: p.primary_color,
          photo_url: p.photos[0]?.url ?? null,
        },
      ]),
    );

    const toRanked = (groups: Array<{ product_id: string; _count: { product_id: number } }>) =>
      groups
        .filter((g) => productMap.has(g.product_id as string))
        .map((g) => ({
          product: productMap.get(g.product_id as string),
          count: g._count.product_id,
        }));

    return {
      data: {
        total_products_available: totalProducts,
        total_customers: totalCustomers,
        active_collections: activeCollections,
        views_this_month: monthViews,
        enquiries_this_month: monthEnquiries,
        top_viewed_products: toRanked(topViewed),
        top_enquired_products: toRanked(topEnquired),
      },
    };
  });

  // ─── GET /retailers/me/analytics ────────────────────────────────
  server.get('/me/analytics', async (request) => {
    const retailerId = request.retailerId;
    const now = new Date();

    // Last 7 days of daily views + enquiries
    const days: { date: string; views: number; enquiries: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);

      const [views, enquiries] = await Promise.all([
        prisma.collectionView.count({
          where: { retailer_id: retailerId, created_at: { gte: dayStart, lt: dayEnd } },
        }),
        prisma.collectionEnquiry.count({
          where: { retailer_id: retailerId, created_at: { gte: dayStart, lt: dayEnd } },
        }),
      ]);

      days.push({
        date: dayStart.toISOString().slice(0, 10),
        views,
        enquiries,
      });
    }

    // Category distribution
    const categoryGroups = await prisma.product.groupBy({
      by: ['category'],
      where: { retailer_id: retailerId, deleted_at: null },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Status distribution
    const statusGroups = await prisma.product.groupBy({
      by: ['status'],
      where: { retailer_id: retailerId, deleted_at: null },
      _count: { id: true },
    });

    // Recent collection performance
    const collections = await prisma.collection.findMany({
      where: { retailer_id: retailerId, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        view_count: true,
        enquiry_count: true,
        favorite_count: true,
        created_at: true,
        _count: { select: { products: true } },
      },
    });

    // Plan usage
    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: {
        plan: true,
        plan_status: true,
        max_products: true,
        max_customers: true,
          },
    });

    return {
      data: {
        daily_trends: days,
        category_breakdown: categoryGroups.map((g) => ({
          category: g.category ?? 'Uncategorized',
          count: g._count.id,
        })),
        status_breakdown: statusGroups.map((g) => ({ status: g.status, count: g._count.id })),
        recent_collections: collections.map((c) => ({
          id: c.id,
          title: c.title,
          slug: c.slug,
          status: c.status,
          view_count: c.view_count,
          enquiry_count: c.enquiry_count,
          favorite_count: c.favorite_count,
          product_count: c._count.products,
          created_at: c.created_at,
        })),
        plan: retailer,
      },
    };
  });
};
