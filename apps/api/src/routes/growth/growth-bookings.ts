import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError, notFound } from '../../plugins/error-handler.js';
import { hasBookingConflict } from './growth-helpers.js';

const BookingSchema = z.object({
  customer_id: z.string().optional().nullable(),
  name: z.string().min(1).max(120),
  phone: z.string().min(10).max(20),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  note: z.string().max(500).optional().nullable(),
});

export const growthBookingRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /growth/bookings ───────────────────────────────────────
  // ?status=REQUESTED|CONFIRMED|CANCELLED|COMPLETED&from&to
  server.get('/bookings', async (request) => {
    const retailerId = request.retailerId;
    const query = z
      .object({
        status: z.enum(['REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .safeParse(request.query);
    const q = query.success ? query.data : {};

    const bookings = await prisma.booking.findMany({
      where: {
        retailer_id: retailerId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.from ? { starts_at: { gte: new Date(q.from) } } : {}),
        ...(q.to ? { ends_at: { lte: new Date(q.to) } } : {}),
      },
      orderBy: { starts_at: 'asc' },
      take: 200,
    });
    return { data: bookings };
  });

  // ─── POST /growth/bookings ──────────────────────────────────────
  // Retailer-side manual booking (e.g. phone-in). Public self-service
  // booking lives on the customer web app (POST /public/retailers/:slug/bookings).
  server.post('/bookings', async (request, reply) => {
    const retailerId = request.retailerId;
    const body = BookingSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { starts_at, ends_at, ...rest } = body.data;
    const start = new Date(starts_at);
    const end = new Date(ends_at);
    if (end <= start) throw validationError('End time must be after start time');

    const existing = await prisma.booking.findMany({
      where: { retailer_id: retailerId, starts_at: { lt: end }, ends_at: { gt: start } },
      select: { starts_at: true, ends_at: true, status: true },
    });
    if (hasBookingConflict(existing, start, end)) {
      throw validationError('That slot overlaps an existing booking — pick another time');
    }

    const booking = await prisma.booking.create({
      data: { retailer_id: retailerId, starts_at: start, ends_at: end, ...rest },
    });
    return reply.status(201).send({ data: booking });
  });

  // ─── PUT /growth/bookings/:id ───────────────────────────────────
  // Update slot / details, or move status (REQUESTED → CONFIRMED, etc.).
  server.put('/bookings/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const existing = await prisma.booking.findFirst({ where: { id, retailer_id: retailerId } });
    if (!existing) throw notFound('Booking');

    const body = BookingSchema.partial()
      .extend({ status: z.enum(['REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional() })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { starts_at, ends_at, status, ...rest } = body.data;

    const start = starts_at ? new Date(starts_at) : existing.starts_at;
    const end = ends_at ? new Date(ends_at) : existing.ends_at;
    if (end <= start) throw validationError('End time must be after start time');

    // Conflict check only when the slot actually changes (and not when cancelling).
    if (status !== 'CANCELLED' && (starts_at || ends_at)) {
      const overlapping = await prisma.booking.findMany({
        where: {
          retailer_id: retailerId,
          id: { not: id },
          starts_at: { lt: end },
          ends_at: { gt: start },
        },
        select: { starts_at: true, ends_at: true, status: true },
      });
      if (hasBookingConflict(overlapping, start, end)) {
        throw validationError('That slot overlaps an existing booking — pick another time');
      }
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        ...rest,
        ...(starts_at ? { starts_at: start } : {}),
        ...(ends_at ? { ends_at: end } : {}),
        ...(status ? { status } : {}),
      },
    });
    return reply.send({ data: updated });
  });

  // ─── DELETE /growth/bookings/:id ────────────────────────────────
  server.delete('/bookings/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const existing = await prisma.booking.findFirst({ where: { id, retailer_id: retailerId } });
    if (!existing) throw notFound('Booking');
    await prisma.booking.delete({ where: { id } });
    return reply.status(204).send();
  });
};
