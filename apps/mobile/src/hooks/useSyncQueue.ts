/**
 * Replays queued offline product-status mutations when the device comes
 * back online. Mount once in the root layout — always active.
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNetworkStatus } from './useNetworkStatus'
import { getQueue, dequeueStatusMutation, isRetryable } from '../lib/mutation-queue'
import { productApi } from '../lib/api'

export function useSyncQueue(): void {
  const { isOnline } = useNetworkStatus()
  const wasOfflineRef = useRef(!isOnline)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (isOnline && wasOfflineRef.current) {
      void (async () => {
        const queue = await getQueue()
        for (const m of queue) {
          try {
            await productApi.updateStatus(m.productId, m.status)
            await dequeueStatusMutation(m.id)
          } catch (err) {
            // Retryable (network/5xx) stays queued for the next reconnect. A 4xx will never
            // succeed: drop it so it stops looping (the invalidate below reverts the UI).
            if (!isRetryable(err)) await dequeueStatusMutation(m.id)
          }
        }
        if (queue.length) void queryClient.invalidateQueries({ queryKey: ['products'] })
      })()
    }
    wasOfflineRef.current = !isOnline
  }, [isOnline, queryClient])
}
