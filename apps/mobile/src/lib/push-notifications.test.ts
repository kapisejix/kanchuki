// F-046 slice 3: registration flow, once-only permission prompt, route mapping, badge pub/sub.
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enquiryRouteFor, registerForPush, unregisterPush } from './push-notifications'

const api = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn() }))
vi.mock('./api/push', () => ({ pushDeviceApi: api }))

// In-memory SecureStore stand-in that actually stores (so "asked once" is real state).
const store = vi.hoisted(() => new Map<string, string>())
vi.mock('./storage', () => ({
  getItem: async (k: string) => store.get(k) ?? null,
  setItem: async (k: string, v: string) => void store.set(k, v),
  deleteItem: async (k: string) => void store.delete(k),
}))

const N = vi.mocked(Notifications)
const setOS = (os: string) => {
  ;(Platform as { OS: string }).OS = os
}

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  setOS('android')
  N.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true } as never)
  N.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as never)
  N.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' } as never)
  api.register.mockResolvedValue({ data: { registered: true } })
  api.unregister.mockResolvedValue({ data: { unregistered: true } })
})

describe('registerForPush', () => {
  it('creates the channel, registers the token with its platform, remembers it', async () => {
    expect(await registerForPush()).toBe('ExponentPushToken[abc]')
    expect(N.setNotificationChannelAsync).toHaveBeenCalledWith(
      'enquiries',
      expect.objectContaining({ importance: 4 }),
    )
    expect(api.register).toHaveBeenCalledWith('ExponentPushToken[abc]', 'android')
    expect(store.get('push_token')).toBe('ExponentPushToken[abc]')
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled()
  })

  it('ios: no channel, platform ios', async () => {
    setOS('ios')
    await registerForPush()
    expect(N.setNotificationChannelAsync).not.toHaveBeenCalled()
    expect(api.register).toHaveBeenCalledWith('ExponentPushToken[abc]', 'ios')
  })

  it('web: does nothing', async () => {
    setOS('web')
    expect(await registerForPush()).toBeNull()
    expect(N.getPermissionsAsync).not.toHaveBeenCalled()
  })

  it('asks for permission exactly once per install', async () => {
    N.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true } as never)
    N.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as never)
    expect(await registerForPush()).toBeNull()
    expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1)
    // next launch: still undetermined at the OS level, but we already asked
    expect(await registerForPush()).toBeNull()
    expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(api.register).not.toHaveBeenCalled()
  })

  it('never prompts when the OS says it cannot ask again', async () => {
    N.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false } as never)
    expect(await registerForPush()).toBeNull()
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled()
  })

  it('a granted prompt registers', async () => {
    N.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true } as never)
    expect(await registerForPush()).toBe('ExponentPushToken[abc]')
    expect(api.register).toHaveBeenCalledTimes(1)
  })

  it('a failing token fetch (no FCM config / simulator) is logged, not thrown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    N.getExpoPushTokenAsync.mockRejectedValue(new Error('no FCM'))
    expect(await registerForPush()).toBeNull()
    expect(warn).toHaveBeenCalledWith('[push] registration failed:', 'no FCM')
    expect(api.register).not.toHaveBeenCalled()
    expect(store.has('push_token')).toBe(false)
    warn.mockRestore()
  })

  it('a rejected registration (403 delegate) does not store the token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    api.register.mockRejectedValue(new Error('403'))
    expect(await registerForPush()).toBeNull()
    expect(store.has('push_token')).toBe(false)
    warn.mockRestore()
  })
})

describe('unregisterPush', () => {
  it('unregisters the stored token and forgets it', async () => {
    store.set('push_token', 'ExponentPushToken[abc]')
    await unregisterPush()
    expect(api.unregister).toHaveBeenCalledWith('ExponentPushToken[abc]')
    expect(store.has('push_token')).toBe(false)
  })

  it('no stored token: no call', async () => {
    await unregisterPush()
    expect(api.unregister).not.toHaveBeenCalled()
  })

  it('a failed unregister still forgets the token and never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    store.set('push_token', 'ExponentPushToken[abc]')
    api.unregister.mockRejectedValue(new Error('offline'))
    await expect(unregisterPush()).resolves.toBeUndefined()
    expect(store.has('push_token')).toBe(false)
    warn.mockRestore()
  })
})

describe('enquiryRouteFor', () => {
  it('maps only our enquiry payload to the inbox', () => {
    expect(enquiryRouteFor({ type: 'enquiry', enquiryId: 'e1' })).toBe('/enquiries')
    expect(enquiryRouteFor({ type: 'promo' })).toBeNull()
    expect(enquiryRouteFor({})).toBeNull()
    expect(enquiryRouteFor(null)).toBeNull()
    expect(enquiryRouteFor('enquiry')).toBeNull()
  })
})
