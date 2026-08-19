// src/routes/visits.ts
import { FastifyInstance } from 'fastify';
import { prisma } from '@kanchuki/db';

export default async function (fastify: FastifyInstance) {
  // Record a customer visit
  fastify.post('/', async (request, reply) => {
    const { retailerId, customerId } = request.body as {
      retailerId: string;
      customerId: string;
    };

    if (!retailerId || !customerId) {
      return reply.status(400).send({ error: 'retailerId and customerId are required' });
    }

    try {
      // Check if retailer and customer exist
      const [retailer, customer] = await Promise.all([
        prisma.retailer.findUnique({ where: { id: retailerId } }),
        prisma.customer.findUnique({ where: { id: customerId } })
      ]);

      if (!retailer) {
        return reply.status(404).send({ error: 'Retailer not found' });
      }
      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' });
      }

      // Create visit record
      const visit = await prisma.customerVisit.create({
        data: {
          retailer: { connect: { id: retailerId } },
          customer: { connect: { id: customerId } }
        }
      });

      return reply.status(201).send(visit);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get visits for a retailer (optional: filter by customer, date range)
  fastify.get('/', async (request, reply) => {
    const { retailerId, customerId, startDate, endDate } = request.query as {
      retailerId?: string;
      customerId?: string;
      startDate?: string; // ISO date string
      endDate?: string;   // ISO date string
    };

    if (!retailerId) {
      return reply.status(400).send({ error: 'retailerId is required' });
    }

    try {
      const where: any = { retailerId };
      if (customerId) {
        where.customerId = customerId;
      }
      
      // Handle date filters
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          where.visit_at = {
            ...(where.visit_at || {}),
            gte: start
          };
        }
        // If invalid date, ignore the filter (could also return 400, but being lenient)
      }
      
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          where.visit_at = {
            ...(where.visit_at || {}),
            lte: end
          };
        }
        // If invalid date, ignore the filter
      }

      const visits = await prisma.customerVisit.findMany({
        where,
        include: {
          customer: true,
          retailer: true
        },
        orderBy: { visit_at: 'desc' }
      });

      return reply.send(visits);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}