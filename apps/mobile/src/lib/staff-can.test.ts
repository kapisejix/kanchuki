import { describe, expect, it } from 'vitest'
import { staffCan } from './staff-can'

describe('staffCan mirrors the server allowlist', () => {
  it('owner can do everything', () => {
    for (const f of ['catalog.edit', 'collections', 'growth', 'analytics', 'social'] as const) {
      expect(staffCan(null, f)).toBe(true)
    }
  })
  it('manager gets growth, analytics and social', () => {
    expect(staffCan('manager', 'growth')).toBe(true)
    expect(staffCan('manager', 'analytics')).toBe(true)
    expect(staffCan('manager', 'social')).toBe(true)
  })
  it('enquiries inbox: every role; reassign: owner + manager (F-044 D2)', () => {
    for (const role of [null, 'manager', 'salesperson']) {
      expect(staffCan(role, 'enquiries')).toBe(true)
    }
    expect(staffCan(null, 'enquiries.assign')).toBe(true)
    expect(staffCan('manager', 'enquiries.assign')).toBe(true)
    expect(staffCan('salesperson', 'enquiries.assign')).toBe(false)
  })
  it('salesperson gets view + add customer only', () => {
    expect(staffCan('salesperson', 'catalog.view')).toBe(true)
    expect(staffCan('salesperson', 'customers.add')).toBe(true)
    for (const f of ['catalog.edit', 'collections', 'growth', 'analytics', 'social'] as const) {
      expect(staffCan('salesperson', f)).toBe(false)
    }
  })
})
