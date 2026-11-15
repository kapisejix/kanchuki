/**
 * Replays queued offline mutations (product status changes and F-047 sell bills)
 * when the device comes back online, once on start for anything left from a
 * previous session, and every minute while online for anything a reconnect edge
 * missed (a bill queued after a 5xx/timeout on a phone that still looks online, or a
 * reconnect that landed mid-drain). Mount once in the root layout — always active.
 */

import { useCallback, useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useNetworkStatus } from './useNetworkStatus'
import {
  getQueue,
  dequeueStatusMutation,
  getSellQueue,
  dequeueSellMutation,
  isRetryable,
  type PendingSellMutation,
} from '../lib/mutation-queue'
import { describeFailures, settleSell } from '../lib/sell-bill'
import { ApiError } from '../lib/api/api-error'
import { showError } from '../lib/errors'
import { productApi } from '../lib/api'

const RETRY_MS = 60_000

/** "Red kurti x1, Blue kurti x2": what a dropped bill held, so the retailer can re-enter it. */
function summarize(b: PendingSellMutation): string {
  return b.lines.map((l) => `${b.names[l.product_id] ?? l.product_id} ×${l.quantity}`).join(', ')
}

/**
 * Keep an entry for the next try? Network/5xx/429 (isRetryable), 401 (the session is not ready or
 * is refreshing: a real sale or status change must wait, not vanish; sign-out clears the queue
 * itself) and 409 BILL_IN_PROGRESS (the first request is still committing: dropping the bill would
 * tell the retailer "not sold" about a sale the server then records). Anything else will never
 * succeed.
 */
function shouldWait(err: unknown): boolean {
  return (
    isRetryable(err) ||
    (err instanceof ApiError && (err.status === 401 || (err.status === 409 && err.code === 'BILL_IN_PROGRESS')))
  )
}

export function useSyncQueue(): void {
  const { isOnline } = useNetworkStatus()
  // First run counts as a transition: a bill queued just before the app was killed must not
  // wait for the next outage to sync.
  const wasOfflineRef = useRef(true)
  // Never two drains at once (a flapping connection would double-send); the timer picks up the rest.
  const drainingRef = useRef(false)
  const queryClient = useQueryClient()

  const drain = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    try {
      const queue = await getQueue()
      for (const m of queue) {
        try {
          await productApi.updateStatus(m.productId, m.status)
          await dequeueStatusMutation(m.id)
        } catch (err) {
          // Waiting errors stay queued for the next reconnect. Any other 4xx will never
          // succeed: drop it so it stops looping (the invalidate below reverts the UI).
          if (!shouldWait(err)) await dequeueStatusMutation(m.id)
        }
      }

      const bills = await getSellQueue()
      for (const b of bills) {
        try {
          // Same bill id as the original attempt: the server dedupes, so a replay is safe.
          const res = await productApi.sell(b.id, b.lines)
          await dequeueSellMutation(b.id)
          const failures = describeFailures(settleSell(b.lines, res.data.lines), b.names)
          if (failures.length > 0) {
            Alert.alert('Some items were not marked sold', failures.join('\n'))
          }
        } catch (err) {
          // A real sale must wait, not vanish (shouldWait). Any other 4xx will never succeed: drop and tell.
          if (!shouldWait(err)) {
            await dequeueSellMutation(b.id)
            showError(err, `A bill saved while offline could not be sent and was dropped: ${summarize(b)}.`)
          }
        }
      }
      if (queue.length || bills.length) void queryClient.invalidateQueries({ queryKey: ['products'] })
    } finally {
      drainingRef.current = false
    }
  }, [queryClient])

  useEffect(() => {
    if (isOnline && wasOfflineRef.current) void drain()
    wasOfflineRef.current = !isOnline
  }, [isOnline, drain])

  useEffect(() => {
    if (!isOnline) return
    const id = setInterval(() => void drain(), RETRY_MS)
    return () => clearInterval(id)
  }, [isOnline, drain])
}
