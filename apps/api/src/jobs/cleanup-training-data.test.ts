import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFindMany = vi.fn()
const mockDelete = vi.fn()
const mockDeleteObject = vi.fn()

vi.mock('@kanchuki/db', () => ({
  prisma: {
    trainingPhotoConsent: {
      findMany: mockFindMany,
      delete: mockDelete,
    },
  },
}))

vi.mock('@kanchuki/ai', () => ({
  deleteObject: mockDeleteObject,
}))

const { handleCleanupTrainingData } = await import('./cleanup-training-data.js')

beforeEach(() => {
  vi.useFakeTimers()
  mockFindMany.mockReset()
  mockDelete.mockReset()
  mockDeleteObject.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

function makeRow(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    try_on_job_id: `job_${id}`,
    customer_photo_r2_key: `training-data/job_${id}/customer.jpg`,
    garment_photo_r2_key: `training-data/job_${id}/garment.jpg`,
    result_r2_key: `training-data/job_${id}/result.jpg`,
    consent_version: '2026-07-13-v1',
    source: 'IN_STORE',
    consented_at: new Date('2025-01-01'),
    ...overrides,
  }
}

describe('handleCleanupTrainingData', () => {
  it('deletes no rows when nothing is expired', async () => {
    mockFindMany.mockResolvedValue([])

    await handleCleanupTrainingData()

    expect(mockFindMany).toHaveBeenCalledTimes(1)
    expect(mockDeleteObject).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes R2 objects and DB rows for expired entries in a batch', async () => {
    const rows = [makeRow('row_1'), makeRow('row_2')]
    mockFindMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([])
    mockDelete.mockResolvedValue({})

    await handleCleanupTrainingData()

    // Should have deleted 3 R2 objects per row (customer, garment, result)
    expect(mockDeleteObject).toHaveBeenCalledTimes(6)
    expect(mockDeleteObject).toHaveBeenCalledWith('training-data/job_row_1/customer.jpg')
    expect(mockDeleteObject).toHaveBeenCalledWith('training-data/job_row_1/garment.jpg')
    expect(mockDeleteObject).toHaveBeenCalledWith('training-data/job_row_1/result.jpg')
    expect(mockDeleteObject).toHaveBeenCalledWith('training-data/job_row_2/customer.jpg')
    expect(mockDeleteObject).toHaveBeenCalledWith('training-data/job_row_2/garment.jpg')
    expect(mockDeleteObject).toHaveBeenCalledWith('training-data/job_row_2/result.jpg')

    // Should have deleted both DB rows
    expect(mockDelete).toHaveBeenCalledTimes(2)
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'row_1' } })
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'row_2' } })
  })

  it('handles null result_r2_key gracefully (only deletes 2 R2 objects for that row)', async () => {
    const rows = [makeRow('row_null_result', { result_r2_key: null })]
    mockFindMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([])
    mockDelete.mockResolvedValue({})

    await handleCleanupTrainingData()

    // Only customer + garment = 2 deletes, no result delete
    expect(mockDeleteObject).toHaveBeenCalledTimes(2)
    expect(mockDeleteObject).toHaveBeenCalledWith('training-data/job_row_null_result/customer.jpg')
    expect(mockDeleteObject).toHaveBeenCalledWith('training-data/job_row_null_result/garment.jpg')
    expect(mockDeleteObject).not.toHaveBeenCalledWith(expect.stringMatching(/result\.jpg$/))
  })

  it('continues processing remaining rows when a single R2 delete fails', async () => {
    const rows = [makeRow('row_fail'), makeRow('row_ok')]
    mockFindMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([])
    mockDelete.mockResolvedValue({})
    // First call (customer.jpg) throws, subsequent calls succeed
    mockDeleteObject.mockRejectedValueOnce(new Error('R2 network error'))

    // Should not throw — errors are caught per-object
    await expect(handleCleanupTrainingData()).resolves.toBeUndefined()

    // Should have attempted all 6 deletes (5 succeeded, 1 failed)
    expect(mockDeleteObject).toHaveBeenCalledTimes(6)

    // Both DB rows should still be deleted even with R2 failure
    expect(mockDelete).toHaveBeenCalledTimes(2)
  })

  it('processes rows in ascending consented_at order with cursor pagination', async () => {
    const batch1 = [makeRow('row_a'), makeRow('row_b')]
    const batch2 = [makeRow('row_c')]
    mockFindMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([])
    mockDelete.mockResolvedValue({})

    await handleCleanupTrainingData()

    // First call: no cursor, ordered by consented_at asc, id asc
    expect(mockFindMany).toHaveBeenNthCalledWith(1, {
      where: { consented_at: { lt: expect.any(Date) } },
      take: 50,
      orderBy: [{ consented_at: 'asc' }, { id: 'asc' }],
    })

    // Second call: cursor at last item from batch1
    expect(mockFindMany).toHaveBeenNthCalledWith(2, {
      where: { consented_at: { lt: expect.any(Date) } },
      cursor: { id: 'row_b' },
      skip: 1,
      take: 50,
      orderBy: [{ consented_at: 'asc' }, { id: 'asc' }],
    })

    // Third call: cursor at last item from batch2
    expect(mockFindMany).toHaveBeenNthCalledWith(3, {
      where: { consented_at: { lt: expect.any(Date) } },
      cursor: { id: 'row_c' },
      skip: 1,
      take: 50,
      orderBy: [{ consented_at: 'asc' }, { id: 'asc' }],
    })

    // All 3 rows deleted from DB
    expect(mockDelete).toHaveBeenCalledTimes(3)
  })

  it('uses the correct 180-day cutoff date', async () => {
    const now = new Date('2026-07-13T12:00:00Z')
    vi.setSystemTime(now)
    mockFindMany.mockResolvedValue([])

    await handleCleanupTrainingData()

    const cutoffArg = mockFindMany.mock.calls[0]?.[0]?.where?.consented_at?.lt
    expect(cutoffArg).toBeInstanceOf(Date)
    // 180 days before July 13, 2026 = January 14, 2026
    const expected = new Date('2026-01-14T12:00:00Z')
    expect(cutoffArg.getTime()).toBe(expected.getTime())
  })
})
