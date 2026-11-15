import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { ApiError } from '../lib/api/api-error'

const { online, queue, sellQueue, updateStatus, dequeue, sell, dequeueSell, showError } = vi.hoisted(() => ({
  online: { value: false },
  queue: { items: [] as Array<{ id: string; productId: string; status: string; queuedAt: number }> },
  sellQueue: {
    items: [] as Array<{
      id: string
      lines: { product_id: string; size: string; quantity: number }[]
      names: Record<string, string>
      queuedAt: number
    }>,
  },
  updateStatus: vi.fn(),
  dequeue: vi.fn(async () => {}),
  sell: vi.fn(),
  dequeueSell: vi.fn(async () => {}),
  showError: vi.fn(),
}))

vi.mock('./useNetworkStatus', () => ({ useNetworkStatus: () => ({ isOnline: online.value }) }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../lib/api', () => ({ productApi: { updateStatus, sell } }))
vi.mock('../lib/errors', () => ({ showError }))
vi.mock('../lib/mutation-queue', async (orig) => ({
  ...(await orig<typeof import('../lib/mutation-queue')>()),
  getQueue: async () => queue.items,
  dequeueStatusMutation: dequeue,
  getSellQueue: async () => sellQueue.items,
  dequeueSellMutation: dequeueSell,
}))
vi.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///documents/' } },
  File: class {},
  Directory: class {},
}))

import { useSyncQueue } from './useSyncQueue'

const item = (id: string) => ({ id, productId: `p-${id}`, status: 'SOLD', queuedAt: 0 })

function Probe() {
  useSyncQueue()
  return null
}

// Boot offline, then reconnect: the replay only runs on that edge.
async function reconnect() {
  online.value = false
  const tree = render(<Probe />)
  online.value = true
  tree.rerender(<Probe />)
  await vi.waitFor(() => expect(updateStatus).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 0))
}

// RC-115: a queued 4xx was kept and retried on every reconnect, forever.
describe('useSyncQueue replay', () => {
  beforeEach(() => {
    updateStatus.mockReset()
    dequeue.mockClear()
  })

  it('removes a mutation that replays successfully', async () => {
    queue.items = [item('a')]
    updateStatus.mockResolvedValue({})
    await reconnect()
    expect(dequeue).toHaveBeenCalledWith('a')
  })

  it('drops a mutation the server rejects with a 4xx', async () => {
    queue.items = [item('a')]
    updateStatus.mockRejectedValue(new ApiError('VALIDATION_ERROR', 'bad', 422))
    await reconnect()
    expect(dequeue).toHaveBeenCalledWith('a')
  })

  it('keeps a mutation on a 5xx so the next reconnect retries it', async () => {
    queue.items = [item('a')]
    updateStatus.mockRejectedValue(new ApiError('INTERNAL', 'down', 503))
    await reconnect()
    expect(dequeue).not.toHaveBeenCalled()
  })

  it('T8: keeps a mutation on a 401 (session not ready at app start)', async () => {
    queue.items = [item('a')]
    updateStatus.mockRejectedValue(new ApiError('UNAUTHORIZED', 'expired', 401))
    await reconnect()
    expect(dequeue).not.toHaveBeenCalled()
  })

  it('keeps a mutation on a network failure (status 0)', async () => {
    queue.items = [item('a')]
    updateStatus.mockRejectedValue(new ApiError('NETWORK_ERROR', 'offline', 0))
    await reconnect()
    expect(dequeue).not.toHaveBeenCalled()
  })

  // F-047 T7: an entry queued just before the app was killed must not wait for the next outage.
  it('replays what is already queued when the app starts online', async () => {
    queue.items = [item('a')]
    online.value = true
    render(<Probe />)
    await vi.waitFor(() => expect(updateStatus).toHaveBeenCalled())
  })

  it('does not replay on a re-render while staying online', async () => {
    queue.items = [item('a')]
    online.value = true
    const tree = render(<Probe />)
    await vi.waitFor(() => expect(updateStatus).toHaveBeenCalledTimes(1))
    tree.rerender(<Probe />)
    await new Promise((r) => setTimeout(r, 0))
    expect(updateStatus).toHaveBeenCalledTimes(1)
  })
})

// F-047 T7: bills confirmed offline replay with the same bill id.
describe('useSyncQueue sell replay', () => {
  const lines = [{ product_id: 'p1', size: 'M', quantity: 1 }]
  const bill = (id: string) => ({ id, lines, names: { p1: 'Red kurti' }, queuedAt: 0 })
  let alert: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    queue.items = []
    sellQueue.items = []
    sell.mockReset()
    dequeueSell.mockClear()
    showError.mockClear()
    alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
  })

  async function sellReconnect() {
    online.value = false
    const tree = render(<Probe />)
    online.value = true
    tree.rerender(<Probe />)
    await vi.waitFor(() => expect(sell).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
  }

  it('sends the queued bill under its own bill id and removes it on success', async () => {
    sellQueue.items = [bill('bill-1')]
    sell.mockResolvedValue({ data: { bill_id: 'bill-1', replayed: false, lines: [{ product_id: 'p1', size: 'M', ok: true }] } })
    await sellReconnect()
    expect(sell).toHaveBeenCalledWith('bill-1', lines)
    expect(dequeueSell).toHaveBeenCalledWith('bill-1')
    expect(alert).not.toHaveBeenCalled()
  })

  it('tells the retailer about a line that failed on replay (never silent)', async () => {
    sellQueue.items = [bill('bill-1')]
    sell.mockResolvedValue({
      data: { bill_id: 'bill-1', replayed: false, lines: [{ product_id: 'p1', size: 'M', ok: false, error: 'INSUFFICIENT_STOCK' }] },
    })
    await sellReconnect()
    expect(dequeueSell).toHaveBeenCalledWith('bill-1')
    expect(alert).toHaveBeenCalledTimes(1)
    expect(String(alert.mock.calls[0]?.[1])).toContain('Red kurti: Not enough stock')
  })

  it('shows a line the server returned no row for as NOT_APPLIED', async () => {
    sellQueue.items = [bill('bill-1')]
    sell.mockResolvedValue({ data: { bill_id: 'bill-1', replayed: true, lines: [] } })
    await sellReconnect()
    expect(String(alert.mock.calls[0]?.[1])).toContain('Red kurti: Not sold: scan it again')
  })

  it('drops a bill the server rejects with a 4xx and says so', async () => {
    sellQueue.items = [bill('bill-1')]
    sell.mockRejectedValue(new ApiError('FORBIDDEN', 'no', 403))
    await sellReconnect()
    expect(dequeueSell).toHaveBeenCalledWith('bill-1')
    expect(showError).toHaveBeenCalledTimes(1)
  })

  it('keeps a bill on a 5xx or a network failure for the next try', async () => {
    sellQueue.items = [bill('bill-1')]
    sell.mockRejectedValue(new ApiError('NETWORK_ERROR', 'offline', 0))
    await sellReconnect()
    expect(dequeueSell).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })

  // Review: an expired/unready session at app start must not delete a real sale.
  it('keeps a bill on a 401 (session not ready) instead of dropping it', async () => {
    sellQueue.items = [bill('bill-1')]
    sell.mockRejectedValue(new ApiError('UNAUTHORIZED', 'expired', 401))
    await sellReconnect()
    expect(dequeueSell).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })

  // T8: the first request may still be committing (timeout, then queued); dropping the bill would
  // tell the retailer "not sold" about a sale the server then records.
  it('keeps a bill on 409 BILL_IN_PROGRESS (the first request is still running)', async () => {
    sellQueue.items = [bill('bill-1')]
    sell.mockRejectedValue(new ApiError('BILL_IN_PROGRESS', 'still being processed', 409))
    await sellReconnect()
    expect(dequeueSell).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })

  it('still drops a bill on any other 409', async () => {
    sellQueue.items = [bill('bill-1')]
    sell.mockRejectedValue(new ApiError('CONFLICT', 'nope', 409))
    await sellReconnect()
    expect(dequeueSell).toHaveBeenCalledWith('bill-1')
  })

  it('names the articles of a bill it had to drop, so the sale can be re-entered', async () => {
    sellQueue.items = [bill('bill-1')]
    sell.mockRejectedValue(new ApiError('FORBIDDEN', 'no', 403))
    await sellReconnect()
    expect(String(showError.mock.calls[0]?.[1])).toContain('Red kurti')
  })

  // Review: a bill queued while the phone still looks online (5xx/timeout) gets no reconnect edge.
  it('retries a leftover bill on a timer while staying online', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      online.value = true
      sell.mockResolvedValue({ data: { bill_id: 'bill-1', replayed: false, lines: [{ product_id: 'p1', size: 'M', ok: true }] } })
      render(<Probe />)
      await new Promise((r) => setTimeout(r, 0))
      expect(sell).not.toHaveBeenCalled()
      sellQueue.items = [bill('bill-1')]
      await vi.advanceTimersByTimeAsync(60_000)
      await vi.waitFor(() => expect(sell).toHaveBeenCalledWith('bill-1', lines))
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not poll while offline', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      online.value = false
      render(<Probe />)
      sellQueue.items = [bill('bill-1')]
      await vi.advanceTimersByTimeAsync(180_000)
      expect(sell).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('one failing bill does not block the next', async () => {
    sellQueue.items = [bill('bill-1'), bill('bill-2')]
    sell.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'offline', 0)).mockResolvedValueOnce({
      data: { bill_id: 'bill-2', replayed: false, lines: [{ product_id: 'p1', size: 'M', ok: true }] },
    })
    online.value = false
    const tree = render(<Probe />)
    online.value = true
    tree.rerender(<Probe />)
    await vi.waitFor(() => expect(dequeueSell).toHaveBeenCalledWith('bill-2'))
    expect(dequeueSell).not.toHaveBeenCalledWith('bill-1')
  })

  it('never runs two drains at once (a flapping connection would double-send)', async () => {
    sellQueue.items = [bill('bill-1')]
    let release: () => void = () => {}
    sell.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: { bill_id: 'bill-1', replayed: false, lines: [{ product_id: 'p1', size: 'M', ok: true }] } })
        }),
    )
    online.value = false
    const tree = render(<Probe />)
    online.value = true
    tree.rerender(<Probe />)
    await vi.waitFor(() => expect(sell).toHaveBeenCalledTimes(1))
    online.value = false
    tree.rerender(<Probe />)
    online.value = true
    tree.rerender(<Probe />)
    await new Promise((r) => setTimeout(r, 0))
    expect(sell).toHaveBeenCalledTimes(1)
    release()
  })
})
