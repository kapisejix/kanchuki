import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Native Facebook Login flow (src/lib/facebook-auth.ts).
 *
 * The bug these pin: unconditionally clearing the on-device session before
 * every login (RC-016) destroyed Facebook's cached session, so the SDK asked
 * for the full credentials form on every attempt instead of the one-tap
 * "Continue as <you>" dialog — retailers read that as "it comes back to the
 * login page and never connects".
 */

const sdk = vi.hoisted(() => ({
  /** Non-null makes the module factory throw, simulating an import failure. */
  loadError: null as string | null,
  /** Non-null makes initializeSDK() throw. */
  initError: null as string | null,
  loginResult: { isCancelled: false, declinedPermissions: [] as string[] },
  /** Shifted per login call; when exhausted, `token` is used. */
  tokenQueue: [] as ({ accessToken: string } | null)[],
  token: null as { accessToken: string } | null,
  lastPermissions: [] as string[],
  calls: { init: 0, logOut: 0, login: 0 },
}))

function sdkFactory() {
  if (sdk.loadError) throw new Error(sdk.loadError)
  return {
    Settings: {
      initializeSDK: () => {
        sdk.calls.init += 1
        if (sdk.initError) throw new Error(sdk.initError)
      },
    },
    LoginManager: {
      logInWithPermissions: async (permissions: string[]) => {
        sdk.calls.login += 1
        sdk.lastPermissions = permissions
        return sdk.loginResult
      },
      logOut: () => {
        sdk.calls.logOut += 1
      },
    },
    AccessToken: {
      getCurrentAccessToken: async () =>
        sdk.tokenQueue.length > 0 ? (sdk.tokenQueue.shift() ?? null) : sdk.token,
    },
  }
}

/** Fresh module instance + fresh SDK mock, so each case sees a clean device. */
async function loadSubject() {
  vi.resetModules()
  vi.doMock('react-native-fbsdk-next', sdkFactory)
  return import('../../src/lib/facebook-auth')
}

async function capture<T>(p: Promise<T>): Promise<unknown> {
  return p.then(
    () => null,
    (e) => e,
  )
}

beforeEach(() => {
  sdk.loadError = null
  sdk.initError = null
  sdk.loginResult = { isCancelled: false, declinedPermissions: [] }
  sdk.tokenQueue = []
  sdk.token = null
  sdk.lastPermissions = []
  sdk.calls = { init: 0, logOut: 0, login: 0 }
})

describe('loginWithFacebook — session reuse (RC-018)', () => {
  it('returns the cached session token without ever calling logOut', async () => {
    sdk.token = { accessToken: 'tok-cached' }
    const mod = await loadSubject()

    await expect(mod.loginWithFacebook('facebook')).resolves.toBe('tok-cached')

    // The regression: logOut() up front forced the credentials form every time.
    expect(sdk.calls.logOut).toBe(0)
    expect(sdk.calls.login).toBe(1)
    expect(sdk.calls.init).toBe(1)
  })

  it('clears a stale session and retries exactly once when no token comes back', async () => {
    sdk.tokenQueue = [null, { accessToken: 'tok-after-logout' }]
    const mod = await loadSubject()

    await expect(mod.loginWithFacebook('facebook')).resolves.toBe('tok-after-logout')

    expect(sdk.calls.login).toBe(2)
    expect(sdk.calls.logOut).toBe(1)
  })

  it('does not retry forever when the second attempt also yields no token', async () => {
    sdk.token = null
    const mod = await loadSubject()

    const err = await capture(mod.loginWithFacebook('facebook'))

    expect(err).toBeInstanceOf(Error)
    expect(sdk.calls.login).toBe(2)
    expect(sdk.calls.logOut).toBe(1)
  })
})

describe('loginWithFacebook — diagnostics', () => {
  it('names the Meta dashboard / key-hash cause when Facebook returns no token', async () => {
    sdk.token = null
    const mod = await loadSubject()

    const err = (await capture(mod.loginWithFacebook('facebook'))) as Error

    expect(err.message).toContain('no access token')
    expect(err.message).toContain('Android release key hash')
    expect(err.message).toContain('Live mode')
  })

  it('reports the permissions Facebook declined alongside the no-token error', async () => {
    sdk.token = null
    sdk.loginResult = {
      isCancelled: false,
      declinedPermissions: ['pages_manage_posts', 'instagram_content_publish'],
    }
    const mod = await loadSubject()

    const err = (await capture(mod.loginWithFacebook('instagram'))) as Error

    expect(err.message).toContain('pages_manage_posts')
    expect(err.message).toContain('instagram_content_publish')
  })

  it('throws FacebookAuthCancelled when the retailer backs out', async () => {
    sdk.loginResult = { isCancelled: true, declinedPermissions: [] }
    const mod = await loadSubject()

    const err = await capture(mod.loginWithFacebook('facebook'))

    expect(err).toBeInstanceOf(mod.FacebookAuthCancelled)
    expect(sdk.calls.logOut).toBe(0)
  })

  it('surfaces an SDK init failure instead of falling back to the web flow', async () => {
    sdk.token = { accessToken: 'unused' }
    sdk.initError = 'bad appID'
    const mod = await loadSubject()

    const err = (await capture(mod.loginWithFacebook('facebook'))) as Error

    expect(err).not.toBeInstanceOf(mod.FacebookAuthUnavailable)
    expect(err.message).toContain('failed to initialise')
    expect(err.message).toContain('bad appID')
  })
})

// The Expo-Go branch can't be reached through a mocked import: vitest replaces a
// throwing mock factory with its own "[vitest] There was an error when mocking a
// module…" message, so a Metro resolution error text never arrives at the
// subject. The classification rule therefore lives in an exported predicate
// (isSdkUnavailableError) and is pinned directly below; the integration test
// after it proves the catch block routes a non-resolution message correctly.
describe('isSdkUnavailableError — Expo Go vs broken release build', () => {
  it('classifies a module-resolution failure as "not in this build"', async () => {
    const { isSdkUnavailableError } = await loadSubject()

    expect(
      isSdkUnavailableError(new Error('Cannot find module react-native-fbsdk-next')),
    ).toBe(true)
    expect(
      isSdkUnavailableError(
        new Error(
          'Unable to resolve module react-native-fbsdk-next from src/lib/facebook-auth.ts',
        ),
      ),
    ).toBe(true)
  })

  it('does NOT classify a load-time throw as "not in this build"', async () => {
    const { isSdkUnavailableError } = await loadSubject()

    expect(
      isSdkUnavailableError(
        new Error('TurboModuleRegistry.getEnforcing: module not found'),
      ),
    ).toBe(false)
  })

  it('handles a non-Error rejection (some native paths throw strings)', async () => {
    const { isSdkUnavailableError } = await loadSubject()

    expect(isSdkUnavailableError('Cannot find module react-native-fbsdk-next')).toBe(true)
    expect(isSdkUnavailableError(undefined)).toBe(false)
  })
})

describe('loginWithFacebook — build/setup failures', () => {
  it('does NOT masquerade a broken release build as "unavailable"', async () => {
    // Present but throwing at load = Metro/bundle or missing native lib in a
    // release build. Swallowing this dropped the retailer into the web OAuth
    // flow and hid the real reason the build was broken.
    sdk.loadError = 'Invariant Violation: TurboModuleRegistry.getEnforcing: module not found';
    const mod = await loadSubject()

    const err = (await capture(mod.loginWithFacebook('facebook'))) as Error

    expect(err).not.toBeInstanceOf(mod.FacebookAuthUnavailable)
    expect(err.message).toContain('could not be loaded in this build')
  })
})

describe('loginWithFacebook — requested scopes', () => {
  it('asks for the page scopes on the facebook target', async () => {
    sdk.token = { accessToken: 'tok' }
    const mod = await loadSubject()

    await mod.loginWithFacebook('facebook')

    expect(sdk.lastPermissions).toEqual([
      'public_profile',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'business_management',
    ])
  })

  it('adds the Instagram publishing scopes on the instagram target', async () => {
    sdk.token = { accessToken: 'tok' }
    const mod = await loadSubject()

    await mod.loginWithFacebook('instagram')

    expect(sdk.lastPermissions).toContain('instagram_basic')
    expect(sdk.lastPermissions).toContain('instagram_content_publish')
    // …without dropping the page scopes the Page lookup still needs.
    expect(sdk.lastPermissions).toContain('pages_manage_posts')
  })
})
