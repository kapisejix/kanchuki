// Regression test for the admin hard-delete FK-violation bug.
//
// hardDeleteRetailer runs a single transaction ending in `DELETE FROM
// retailers`. product_attributes (migration 046), social_accounts and
// social_posts (migration 052) all have retailer_id FKs WITHOUT
// onDelete: Cascade. They were missing from the delete list, so the final
// DELETE threw an FK violation and the whole transaction rolled back — the
// admin "delete retailer" action silently did nothing (and R2 objects were
// never cleaned, since that happens after the DB commit).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const { mockDeleteObject, mockExecuteRaw, mockQueryRaw, mockRetailerFindUnique } = vi.hoisted(() => ({
  mockDeleteObject: vi.fn(),
  mockExecuteRaw: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockRetailerFindUnique: vi.fn(),
}))

vi.mock('@kanchuki/ai', () => ({
  deleteObject: mockDeleteObject,
}))

vi.mock('@kanchuki/db', () => ({
  getPurgePrisma: () => ({
    $executeRawUnsafe: mockExecuteRaw,
    $queryRawUnsafe: mockQueryRaw,
    $transaction: async (ops: unknown[]) => {
      if (Array.isArray(ops)) {
        for (const op of ops) await op
      }
      return [null, null]
    },
    retailer: { findUnique: mockRetailerFindUnique },
  }),
}))

import { hardDeleteRetailer } from './purge-retailer-now.js'

// Captures the SQL statements passed to $executeRawUnsafe inside the
// transaction (the SET bypass + every DELETE).
function executedStatements(): string[] {
  return mockExecuteRaw.mock.calls.map((c) => String(c[0]))
}

describe('hardDeleteRetailer', () => {
  beforeEach(() => {
    mockDeleteObject.mockReset().mockResolvedValue(undefined)
    mockExecuteRaw.mockReset().mockResolvedValue(null)
    mockQueryRaw.mockReset().mockResolvedValue([])
    mockRetailerFindUnique.mockReset().mockResolvedValue({
      logo_r2_key: null,
      banner_r2_key: null,
      kyc_gst_r2_key: null,
      kyc_aadhar_front_r2_key: null,
      kyc_aadhar_back_r2_key: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes the RESTRICT-FK tables (product_attributes, social_accounts, social_posts, retailer_payment_accounts) before the retailer row', async () => {
    await hardDeleteRetailer('retailer_1')

    const statements = executedStatements()
    const retailerDelete = statements.findIndex((s) => s.includes('DELETE FROM retailers'))

    // Every table with a retailer_id FK must be deleted before the retailer.
    for (const table of [
      'DELETE FROM product_attributes',
      'DELETE FROM social_accounts',
      'DELETE FROM social_posts',
      'DELETE FROM retailer_payment_accounts',
      'DELETE FROM subscriptions',
      'DELETE FROM support_tickets',
      'DELETE FROM quota_addon_purchases',
      'DELETE FROM staff',
      'DELETE FROM store_sections',
      'DELETE FROM try_on_usage_logs',
      'DELETE FROM collections',
      'DELETE FROM customers',
      'DELETE FROM products',
    ]) {
      const idx = statements.findIndex((s) => s.startsWith(table))

      expect(idx, `expected ${table} in delete list`).toBeGreaterThanOrEqual(0)
      expect(idx, `${table} must be deleted before retailers`).toBeLessThan(retailerDelete)
    }
  })

  it('deletes training_photo_consents before try_on_jobs (keyed subquery must still find the jobs)', async () => {
    await hardDeleteRetailer('retailer_1')

    const statements = executedStatements()
    const consents = statements.findIndex((s) => s.startsWith('DELETE FROM training_photo_consents'))
    const jobs = statements.findIndex((s) => s.startsWith('DELETE FROM try_on_jobs'))
    expect(consents).toBeGreaterThanOrEqual(0)
    expect(consents).toBeLessThan(jobs)
  })

  it('collects and deletes R2 objects for category covers, measurement photos and training consents', async () => {
    // category cover + two measurement photos + one training consent photo
    mockQueryRaw.mockImplementation(async (sql: string) => {
      if (String(sql).includes('product_categories')) return [{ r2_key: 'cat-cover.jpg' }]
      if (String(sql).includes('customer_measurements')) {
        return [{ r2_key: 'front.jpg' }, { r2_key: 'back.jpg' }]
      }
      if (String(sql).includes('training_photo_consents')) return [{ r2_key: 'training.jpg' }]
      return []
    })

    await hardDeleteRetailer('retailer_1')

    const deleted = mockDeleteObject.mock.calls.map((c) => c[0])
    expect(deleted).toContain('cat-cover.jpg')
    expect(deleted).toContain('front.jpg')
    expect(deleted).toContain('back.jpg')
    expect(deleted).toContain('training.jpg')
  })
})
