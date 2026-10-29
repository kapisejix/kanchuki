// Retailer-facing support tickets — POST/GET /retailers/me/tickets.
// docs/tasks/pending/support-and-feedback-loop.md §1. Reuses routeTicket() so routing
// stays in one place. Creating a ticket does NOT grant Kanchuki staff any access to the
// account — consent stays in the support-session flow.
import { prisma } from '@kanchuki/db';
import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError, forbidden, validationError } from '../../plugins/error-handler.js';
import { routeTicket } from '../team.js';

// Abuse guard: a retailer can have this many unresolved tickets at once.
export const MAX_OPEN_TICKETS = 5;

const TicketCreateSchema = z.object({
  ticket_type: z.enum(['GENERAL', 'DEMO', 'GROWTH_SETUP', 'MAINTENANCE']).default('GENERAL'),
  note: z.string().trim().min(10, 'Please describe what you need in a bit more detail').max(2000),
  requires_visit: z.boolean().default(false),
});

const TICKET_SELECT = {
  id: true,
  ticket_type: true,
  requires_visit: true,
  status: true,
  note: true,
  created_at: true,
  resolved_at: true,
  assigned_to: { select: { name: true } },
} as const;

type TicketInput = {
  ticket_type: 'GENERAL' | 'DEMO' | 'GROWTH_SETUP' | 'MAINTENANCE';
  note: string;
  requires_visit: boolean;
  setup_item?: string;
};

/**
 * Create a retailer-scoped ticket and auto-route it. Shared by POST /me/tickets and the
 * dashboard checklist's "Ask Kanchuki team" so routing stays in one place.
 */
export async function createRoutedTicket(
  retailerId: string,
  input: TicketInput,
  log: FastifyBaseLogger,
) {
  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: { territory_id: true },
  });

  // Backend-manageable tickets are poolable within the CITY-level parent territory
  // (same rule as POST /team/tickets).
  let regionScopeId: string | null = null;
  if (!input.requires_visit && retailer?.territory_id) {
    const zone = await prisma.territory.findUnique({
      where: { id: retailer.territory_id },
      select: { parent_id: true },
    });
    regionScopeId = zone?.parent_id ?? null;
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      retailer_id: retailerId,
      ticket_type: input.ticket_type,
      requires_visit: input.requires_visit,
      region_scope_id: regionScopeId,
      note: input.note,
      ...(input.setup_item ? { setup_item: input.setup_item } : {}),
    },
    select: TICKET_SELECT,
  });

  // Auto-route. A routing failure must not lose the ticket — it stays OPEN for staff.
  try {
    const assignedTo = await routeTicket(
      ticket.id,
      input.requires_visit,
      retailer?.territory_id ?? null,
      regionScopeId,
      log,
    );
    if (assignedTo) {
      return await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { assigned_to_id: assignedTo, status: 'ASSIGNED' },
        select: TICKET_SELECT,
      });
    }
  } catch (err) {
    log.error({ err, ticket_id: ticket.id }, 'Ticket auto-routing failed, left OPEN');
  }
  return ticket;
}

export const retailersTicketRoutes: FastifyPluginAsync = async (server) => {
  // ── POST /retailers/me/tickets ──────────────────────────────────
  server.post('/me/tickets', async (request, reply) => {
    if (!request.retailerId) throw forbidden('Sign in to raise a ticket');

    const body = TicketCreateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid ticket');

    // Dashboard "Ask Kanchuki team" tickets (setup_item set) don't count: six checklist
    // items must not lock the retailer out of ordinary support.
    const openCount = await prisma.supportTicket.count({
      where: {
        retailer_id: request.retailerId,
        ticket_type: { not: 'CATALOG_UPLOAD' },
        status: { in: ['OPEN', 'ASSIGNED'] },
        setup_item: null,
      },
    });
    if (openCount >= MAX_OPEN_TICKETS) {
      throw new AppError(
        'TOO_MANY_OPEN_TICKETS',
        `You already have ${MAX_OPEN_TICKETS} open tickets. Please wait for one to be resolved.`,
        429,
      );
    }

    const ticket = await createRoutedTicket(request.retailerId, body.data, request.log);
    reply.code(201);
    return { data: ticket };
  });

  // ── GET /retailers/me/tickets ───────────────────────────────────
  // Own tickets only. CATALOG_UPLOAD tickets have their own screen (settings/catalog-upload).
  server.get('/me/tickets', async (request) => {
    if (!request.retailerId) throw forbidden('Sign in to view your tickets');
    const tickets = await prisma.supportTicket.findMany({
      where: { retailer_id: request.retailerId, ticket_type: { not: 'CATALOG_UPLOAD' } },
      select: TICKET_SELECT,
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return { data: tickets };
  });
};
