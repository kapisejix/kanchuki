// Native Facebook Login (react-native-fbsdk-next).
//
// Opens the installed Facebook app — the retailer taps "Continue as …" once
// and lands back in Kanchuki. No web OAuth page, no https redirect, no phone
// OTP. The SDK returns a short-lived USER access token on-device; the server
// (POST /v1/retailers/me/social/connect-native) swaps it for a long-lived
// token and stores the Page.
//
// The SDK is a native module, so it is ONLY present in an EAS / dev-client
// build — never in Expo Go. `loginWithFacebook` throws FacebookAuthUnavailable
// there, and callers fall back to the old web OAuth-URL flow.

export class FacebookAuthUnavailable extends Error {
  constructor(message = 'Facebook SDK is not available in this build') {
    super(message);
    this.name = 'FacebookAuthUnavailable';
  }
}

export class FacebookAuthCancelled extends Error {
  constructor() {
    super('Facebook login was cancelled');
    this.name = 'FacebookAuthCancelled';
  }
}

// Page publishing needs these; Instagram publishing needs the two extra scopes.
const PAGE_PERMISSIONS = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'business_management',
];
const IG_PERMISSIONS = [...PAGE_PERMISSIONS, 'instagram_basic', 'instagram_content_publish'];

/** Message of any thrown value — some native paths reject with a string. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * True when a module-load failure means the native module simply isn't in this
 * build (Expo Go / JS-only bundle) rather than being present-but-broken.
 *
 * Expo Go fails at *resolution* ("Cannot find module" / "Unable to resolve
 * module"); a real misconfiguration fails after resolution (TurboModule
 * registry, Metro bundling, a missing native lib in a release build). Only the
 * former may send callers down the web-OAuth fallback — see the catch block in
 * `loginWithFacebook`.
 */
export function isSdkUnavailableError(err: unknown): boolean {
  return /cannot find module|unable to resolve module/i.test(errorMessage(err))
}

/**
 * Runs native Facebook Login and returns a short-lived user access token.
 * @throws {FacebookAuthUnavailable} in Expo Go / any build without the SDK
 * @throws {FacebookAuthCancelled}   when the retailer backs out of the FB dialog
 */
export async function loginWithFacebook(
  target: 'facebook' | 'instagram' = 'facebook',
): Promise<string> {
  let fbsdk: {
    Settings: { initializeSDK: () => void };
    LoginManager: {
      logInWithPermissions: (p: string[]) => Promise<{
        isCancelled: boolean;
        grantedPermissions?: string[];
        declinedPermissions?: string[];
      }>;
      logOut: () => void;
    };
    AccessToken: {
      getCurrentAccessToken: () => Promise<{ accessToken: string } | null>;
    };
  };
  try {
    // Dynamic import so a missing native module doesn't blow up the JS bundle
    // at eval time (Expo Go) — only this call path fails.
    fbsdk = (await import('react-native-fbsdk-next')) as typeof fbsdk;
  } catch (err) {
    // Two very different failures used to land here and get the same answer.
    //  · The module isn't resolvable at all (Expo Go) → a genuine "not
    //    available in this build" case callers should fall back from.
    //  · The module IS installed but threw while loading (Metro/bundle error,
    //    missing native lib in a release build) → NOT an Expo Go case.
    // Treating the second as the first silently dropped a broken release
    // build into the web OAuth flow and hid the reason it broke.
    if (!isSdkUnavailableError(err)) {
      throw new Error(
        `Facebook SDK could not be loaded in this build: ${errorMessage(err)}`,
      );
    }
    throw new FacebookAuthUnavailable(errorMessage(err));
  }

  // isAutoInitEnabled is false in app.json (a bad appID in Application.onCreate
  // crashes app launch before the splash). Init here instead — idempotent, runs
  // only when the retailer actually taps Connect Facebook.
  // NOTE: the module IS present here (EAS build), so an init failure is a real
  // misconfig (bad appID/clientToken, plugin didn't run) — surface it, don't
  // masquerade as "unavailable" and silently drop to the mock web flow.
  try {
    fbsdk.Settings.initializeSDK();
  } catch (err) {
    throw new Error(
      `Facebook SDK failed to initialise: ${
        err instanceof Error ? err.message : String(err)
      }. Check the react-native-fbsdk-next appID/clientToken in app.json and rebuild.`,
    );
  }

  const permissions = target === 'instagram' ? IG_PERMISSIONS : PAGE_PERMISSIONS;

  // What Facebook reported as declined on the last attempt. A login can
  // *complete* with pages_manage_posts switched off (the consent screen hides
  // the per-permission toggles behind "Edit access"), which looks like a
  // successful connect on the device and only fails later as the server's
  // NO_PAGE_TOKEN 502 — read by the retailer as "Kanchuki is broken". Keep it
  // so the error below can name the actual missing permission instead.
  let lastDeclined: string[] = [];

  // Ask the SDK for a token FIRST, without clearing the on-device session.
  // When a session already exists the SDK returns it (Facebook's one-tap
  // "Continue as <you>" dialog, no credentials).
  const attemptLogin = async () => {
    const result = await fbsdk.LoginManager.logInWithPermissions(permissions);
    if (result.isCancelled) throw new FacebookAuthCancelled();
    lastDeclined = result.declinedPermissions ?? [];
    return fbsdk.AccessToken.getCurrentAccessToken();
  };

  let token = await attemptLogin();

  // Reconnect-after-Disconnect (RC-016): Disconnect only deletes the
  // server-side row, so the device can still hold a session whose grant the
  // server no longer knows about — the login then completes with no usable
  // token. Only in that case clear the stale session and retry once.
  //
  // This is deliberately NOT done up front. Unconditionally calling logOut()
  // before every login destroyed the cached session, so Facebook had to ask
  // for credentials on every single attempt — which is the full login form
  // retailers kept seeing instead of "Continue as <you>".
  if (!token?.accessToken) {
    fbsdk.LoginManager.logOut();
    token = await attemptLogin();
  }

  if (!token?.accessToken) {
    throw new Error(
      'Facebook returned no access token. This usually means the Android release key hash / bundle ID is not registered on the Meta app, or the app is not in Live mode.' +
        (lastDeclined.length > 0
          ? ` Facebook also reported these permissions as declined: ${lastDeclined.join(', ')}.`
          : ''),
    );
  }
  return token.accessToken;
}
