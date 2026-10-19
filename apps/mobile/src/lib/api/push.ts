import { request } from './client'

// F-046: register / unregister this device's Expo push token. Server: routes/push-devices.ts.
// POST for both (the API deliberately has no DELETE here: bodyless/empty-JSON DELETE 400s).
export const pushDeviceApi = {
  register: (expoToken: string, platform: 'android' | 'ios') =>
    request<{ data: { registered: boolean } }>('/v1/push-devices/register', {
      method: 'POST',
      body: JSON.stringify({ expo_token: expoToken, platform }),
    }),

  unregister: (expoToken: string) =>
    request<{ data: { unregistered: boolean } }>('/v1/push-devices/unregister', {
      method: 'POST',
      body: JSON.stringify({ expo_token: expoToken }),
    }),
}
