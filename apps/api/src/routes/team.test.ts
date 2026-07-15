import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { teamRoutes } from './team.js'
import { errorHandler } from '../plugins/error-handler.js'
import { hashPassword, signTeamToken } from '../plugins/team-auth.js'

const {
  mockTeamMemberFindUnique,
  mockTeamMemberFindMany,
  mockTeamMemberCreate,
  mockTeamMemberUpdate,
  mockTeamMemberTerritoryFindMany,
  mockTerritoryFindFirst,
  mockTerritoryFindMany,
  mockRetailerUpsert,
  mockRetailerCount,
  mockRetailerFindMany,
} = vi.hoisted(() => ({
  mockTeamMemberFindUnique: vi.fn(),
  mockTeamMemberFindMany: vi.fn(),
  mockTeamMemberCreate: vi.fn(),
  mockTeamMemberUpdate: vi.fn(),
  mockTeamMemberTerritoryFindMany: vi.fn(),
  mockTerritoryFindFirst: vi.fn(),
  mockTerritoryFindMany: vi.fn(),
  mockRetailerUpsert: vi.fn(),
  mockRetailerCount: vi.fn(),
  mockRetailerFindMany: vi.fn(),
}))

vi.mock('@kanchuki/db', () => ({
  prisma: {
    teamMember: {
      findUnique: mockTeamMemberFindUnique,
      findMany: mockTeamMemberFindMany,
      create: mockTeamMemberCreate,
      update: mockTeamMemberUpdate,
    },
    teamMemberTerritory: { findMany: mockTeamMemberTerritoryFindMany },
    territory: {
      findFirst: mockTerritoryFindFirst,
      findMany: mockTerritoryFindMany,
      create: vi.fn(),
      update: vi.fn(),
    },
    retailer: {
      upsert: mockRetailerUpsert,
      count: mockRetailerCount,
      findMany: mockRetailerFindMany,
    },
  },
  Prisma: {},
}))

async function buildApp() {
  const app = Fastify()
  app.setErrorHandler(errorHandler)
  await app.register(teamRoutes, { prefix: '/v1/team' })
  await app.ready()
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env['TEAM_JWT_SECRET'] = 'test-team-secret'
  process.env['ADMIN_API_KEY'] = 'test-admin-key'
})

const AGENT = { id: 'agent_1', role: 'MARKETING_AGENT', is_active: true }

async function agentHeaders() {
  const token = await signTeamToken({ sub: AGENT.id, role: AGENT.role })
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

describe('POST /team/login', () => {
  it('rejects wrong password', async () => {
    mockTeamMemberFindUnique.mockResolvedValue({
      id: 'x',
      email: 'a@kanchuki.app',
      password_hash: hashPassword('correct-horse'),
      role: 'SUPER_ADMIN',
      is_active: true,
    })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/login',
      payload: { email: 'a@kanchuki.app', password: 'wrong' },
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('issues a token on correct credentials', async () => {
    mockTeamMemberFindUnique.mockResolvedValue({
      id: 'x',
      name: 'Admin One',
      email: 'a@kanchuki.app',
      password_hash: hashPassword('correct-horse'),
      role: 'SUPER_ADMIN',
      is_active: true,
    })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/login',
      payload: { email: 'a@kanchuki.app', password: 'correct-horse' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.token).toBeTruthy()
    await app.close()
  })
})

describe('GET /team/me', () => {
  it('rejects requests with no auth', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/v1/team/me' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('accepts the shared admin key as an unscoped Super Admin', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/v1/team/me',
      headers: { 'x-admin-key': 'test-admin-key' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.role).toBe('SUPER_ADMIN')
    await app.close()
  })
})

describe('POST /team/retailers — agent onboarding + territory derivation', () => {
  it('derives territory_id from pincode and attributes to the onboarding agent', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce(AGENT) // preHandler lookup
    mockTeamMemberTerritoryFindMany.mockResolvedValue([])
    mockTerritoryFindFirst.mockResolvedValue({ id: 'zone_42' })
    mockRetailerUpsert.mockResolvedValue({
      id: 'retailer_9',
      shop_name: 'New Shop',
      phone: '+919876543210',
      territory_id: 'zone_42',
      onboarded_by_id: AGENT.id,
    })
    mockTeamMemberFindUnique.mockResolvedValueOnce({ max_retailers: null }) // capacity check

    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/retailers',
      headers: await agentHeaders(),
      payload: { phone: '9876543210', shop_name: 'New Shop', city: 'Jaipur', pincode: '302001' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockTerritoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { level: 'ZONE', pincodes: { has: '302001' } } }),
    )
    const createArgs = mockRetailerUpsert.mock.calls[0]![0]
    expect(createArgs.create.territory_id).toBe('zone_42')
    expect(createArgs.create.onboarded_by_id).toBe(AGENT.id)
    expect(createArgs.create.auth_user_id).toMatch(/^pending:/)
    await app.close()
  })

  it('flags over_capacity once the agent exceeds max_retailers', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce(AGENT)
    mockTeamMemberTerritoryFindMany.mockResolvedValue([])
    mockTerritoryFindFirst.mockResolvedValue(null)
    mockRetailerUpsert.mockResolvedValue({ id: 'r', shop_name: 'S', phone: 'p', territory_id: null, onboarded_by_id: AGENT.id })
    mockTeamMemberFindUnique.mockResolvedValueOnce({ max_retailers: 5 })
    mockRetailerCount.mockResolvedValue(6)

    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/retailers',
      headers: await agentHeaders(),
      payload: { phone: '9876543211', shop_name: 'S', city: 'Jaipur' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.over_capacity).toBe(true)
    await app.close()
  })

  it('rejects a Support Agent trying to onboard a retailer (wrong role)', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce({ id: 's1', role: 'SUPPORT_AGENT', is_active: true })
    mockTeamMemberTerritoryFindMany.mockResolvedValue([])

    const token = await signTeamToken({ sub: 's1', role: 'SUPPORT_AGENT' })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/retailers',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { phone: '9876543212', shop_name: 'S', city: 'Jaipur' },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})

describe('POST /team/members — role scoping', () => {
  it('blocks a Marketing Manager from creating a Support Agent', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce({ id: 'mgr_1', role: 'MARKETING_MANAGER', is_active: true })
    mockTeamMemberTerritoryFindMany.mockResolvedValue([{ territory_id: 't1' }])

    const token = await signTeamToken({ sub: 'mgr_1', role: 'MARKETING_MANAGER' })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/members',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { name: 'X', email: 'x@kanchuki.app', password: 'password123', role: 'SUPPORT_AGENT' },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})

describe('GET /team/members — capacity flag', () => {
  it('marks a member over_capacity when onboarded count exceeds max_retailers', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce({ id: 'admin-key', role: 'SUPER_ADMIN', is_active: true })
    mockTeamMemberFindMany.mockResolvedValue([
      {
        id: AGENT.id,
        name: 'Agent One',
        email: 'agent@kanchuki.app',
        role: 'MARKETING_AGENT',
        is_active: true,
        max_retailers: 3,
        territories: [],
        _count: { onboarded_retailers: 5, supported_retailers: 0 },
      },
    ])

    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/v1/team/members',
      headers: { 'x-admin-key': 'test-admin-key' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data[0].over_capacity).toBe(true)
    expect(res.json().data[0].retailer_count).toBe(5)
    await app.close()
  })
})
