import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react-native'
import { ApiError } from '../lib/api/api-error'

const { online, queue, updateStatus, dequeue } = vi.hoisted(() => ({
  online: { value: false },
  queue: { items: [] as Array<{ id: string; productId: string; status: string; queuedAt: number }> },
  updateStatus: vi.fn(),
  dequeue: vi.fn(async () => {}),
}))

vi.mock('./useNetworkStatus', () => ({ useNetworkStatus: () => ({ isOnline: online.value }) }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../lib/api', () => ({ productApi: { updateStatus } }))
vi.mock('../lib/mutation-queue', async (orig) => ({
  ...(await orig<typeof import('../lib/mutation-queue')>()),
  getQueue: async () => queue.items,
  dequeueStatusMutation: dequeue,
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

  it('keeps a mutation on a network failure (status 0)', async () => {
    queue.items = [item('a')]
    updateStatus.mockRejectedValue(new ApiError('NETWORK_ERROR', 'offline', 0))
    await reconnect()
    expect(dequeue).not.toHaveBeenCalled()
  })

  it('does not replay when the device never went offline', async () => {
    queue.items = [item('a')]
    online.value = true
    render(<Probe />)
    await new Promise((r) => setTimeout(r, 0))
    expect(updateStatus).not.toHaveBeenCalled()
  })
})
