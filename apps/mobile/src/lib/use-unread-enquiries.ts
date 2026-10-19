import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { collectionApi } from './api/collections'
import { onEnquiryPush } from './enquiry-push-events'

export const UNREAD_POLL_MS = 30_000

// F-044 E4-lite: NEW-enquiry count for the home tile. Polls only while the
// screen is focused; re-focus (back from the inbox) refetches at once.
export function useUnreadEnquiries(): number {
  const [count, setCount] = useState(0)
  useFocusEffect(
    useCallback(() => {
      let live = true
      const load = () =>
        collectionApi.unreadEnquiries().then(
          (r) => {
            if (live) setCount(r.data.count)
          },
          // ponytail: badge is a hint — keep the last count on a failed poll, next tick retries.
          () => {},
        )
      void load()
      const id = setInterval(load, UNREAD_POLL_MS)
      // F-046: a push landed while this screen is focused — refetch now, not in <30 s.
      const off = onEnquiryPush(() => void load())
      return () => {
        live = false
        clearInterval(id)
        off()
      }
    }, []),
  )
  return count
}
