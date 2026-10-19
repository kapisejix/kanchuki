// F-046 slice 3: retailer-app push (new-enquiry pings). Pure-ish helpers; the hook that
// wires them to auth + navigation is use-push-registration.ts.
//
// Payload contract (server: jobs/enquiry-push.ts): data = { type: 'enquiry', enquiryId }.
// Nothing about the customer ever arrives in a push (F-037), so there is nothing to render
// here except the OS banner.
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { pushDeviceApi } from './api/push'
import { deleteItem, getItem, setItem } from './storage'

export const ENQUIRY_CHANNEL = 'enquiries'
const TOKEN_KEY = 'push_token'
// The OS prompt is shown ONCE per install. After a dismiss, asking again on every launch is
// the fastest way to get the permission blocked for good; Settings is the way back in.
const ASKED_KEY = 'push_permission_asked'

// Foreground: show the banner too (the unread badge refetches via emitEnquiryPush).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

/** Where a tapped notification should land; null = not ours, do nothing. */
export function enquiryRouteFor(data: unknown): '/enquiries' | null {
  if (!data || typeof data !== 'object') return null
  return (data as { type?: unknown }).type === 'enquiry' ? '/enquiries' : null
}

/** Ask permission (once), get the Expo token, register it. Null = no push on this device. */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null
  try {
    // Android 13+ shows the permission dialog only once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ENQUIRY_CHANNEL, {
        name: 'New enquiries',
        importance: Notifications.AndroidImportance.HIGH,
      })
    }

    const current = await Notifications.getPermissionsAsync()
    let granted = current.status === 'granted'
    if (!granted) {
      if (!current.canAskAgain || (await getItem(ASKED_KEY))) return null
      await setItem(ASKED_KEY, '1')
      granted = (await Notifications.requestPermissionsAsync()).status === 'granted'
    }
    if (!granted) return null

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId ?? Constants.easConfig?.projectId
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
    await pushDeviceApi.register(token, Platform.OS === 'ios' ? 'ios' : 'android')
    await setItem(TOKEN_KEY, token)
    return token
  } catch (err) {
    // Not silent (RC-059 shape): simulators have no token, a missing FCM config throws here,
    // and a 403 means this session is a delegate. All non-fatal, all worth a log line.
    console.warn('[push] registration failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Best-effort, called BEFORE the auth keys are cleared (the request needs the token). */
export async function unregisterPush(): Promise<void> {
  const token = await getItem(TOKEN_KEY).catch(() => null)
  if (!token) return
  try {
    await pushDeviceApi.unregister(token)
  } catch (err) {
    console.warn('[push] unregister failed:', err instanceof Error ? err.message : err)
  }
  await deleteItem(TOKEN_KEY).catch(() => {})
}
