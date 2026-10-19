import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useEffect, useRef } from 'react'
import { getCatalogDelegateInfo } from './catalog-delegate'
import { emitEnquiryPush } from './enquiry-push-events'
import { enquiryRouteFor, registerForPush } from './push-notifications'

// F-046 slice 3. `enabled` = a signed-in retailer or shop staff session (not a Kanchuki
// TeamMember). Catalog / support delegate sessions are skipped here and refused by the
// server as well (routes/push-devices.ts): their device is not the shop's.
export function usePushRegistration(enabled: boolean): void {
  const last = Notifications.useLastNotificationResponse()
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let live = true
    void (async () => {
      const delegate = await getCatalogDelegateInfo().catch(() => null)
      if (live && !delegate) await registerForPush()
    })()
    return () => {
      live = false
    }
  }, [enabled])

  // Push received while the app is open: refresh the unread badge now.
  useEffect(() => {
    if (!enabled) return
    const sub = Notifications.addNotificationReceivedListener((n) => {
      if (enquiryRouteFor(n.request.content.data)) emitEnquiryPush()
    })
    return () => sub.remove()
  }, [enabled])

  // Tap, from background or a cold start. Held until `enabled`: before sign-in the
  // inbox route is not in the navigator (Stack.Protected), so a push would be lost.
  useEffect(() => {
    if (!enabled || !last) return
    const id = last.notification.request.identifier
    if (handled.current === id) return
    handled.current = id
    const route = enquiryRouteFor(last.notification.request.content.data)
    if (route) router.push(route)
  }, [enabled, last])
}
