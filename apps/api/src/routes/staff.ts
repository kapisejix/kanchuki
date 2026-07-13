import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@kanchuki/db'
import { normalizeIndianPhone } from '@kanchuki/shared'
import { notFound, planLimitExceeded, validationError } from '../plugins/error-handler.js'

const StaffSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(10).max(15),
  role: z.enum(['owner', 'manager', 'salesperson']).default('salesperson'),
})

export const staffRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /staff ──────────────────────────────────────────────────
  server.get('/', async (request) => {
    const staff = await prisma.staff.findMany({
      where: { retailer_id: request.retailerId },
      orderBy: { created_at: 'asc' },
    })
    return { data: staff }
  })

  // ─── POST /staff ─────────────────────────────────────────────────
  // Seats: 3 free (Retailer.max_staff_seats), no purchase flow yet —
  // request beyond the limit is blocked with an upgrade error.
  server.post('/', async (request, reply) => {
    const retailerId = request.retailerId

    const body = StaffSchema.safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { max_staff_seats: true },
    })
    const activeCount = await prisma.staff.count({
      where: { retailer_id: retailerId, is_active: true },
    })
    if (activeCount >= retailer.max_staff_seats) throw planLimitExceeded('staff seats')

    const normalizedPhone = normalizeIndianPhone(body.data.phone)

    const existing = await prisma.staff.findFirst({
      where: { retailer_id: retailerId, phone: normalizedPhone, is_active: true },
    })
    if (existing) throw validationError('A staff member with this phone number already exists', 'phone')

    const staff = await prisma.staff.create({
      data: { retailer_id: retailerId, ...body.data, phone: normalizedPhone },
    })
    return reply.status(201).send({ data: staff })
  })

  // ─── PUT /staff/:id ──────────────────────────────────────────────
  server.put('/:id', async (request) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.staff.findFirst({
      where: { id, retailer_id: request.retailerId },
    })
    if (!existing) throw notFound('Staff')

    const body = StaffSchema.partial().safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const data = body.data.phone ? { ...body.data, phone: normalizeIndianPhone(body.data.phone) } : body.data

    const updated = await prisma.staff.update({ where: { id }, data })
    return { data: updated }
  })

  // ─── DELETE /staff/:id ───────────────────────────────────────────
  // Soft-remove: frees the seat without deleting history/audit trail.
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.staff.findFirst({
      where: { id, retailer_id: request.retailerId },
    })
    if (!existing) throw notFound('Staff')

    await prisma.staff.update({ where: { id }, data: { is_active: false } })
    return reply.status(204).send()
  })
}
