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
      logInWithPermissions: (p: string[]) => Promise<{ isCancelled: boolean }>;
    };
    AccessToken: {
      getCurrentAccessToken: () => Promise<{ accessToken: string } | null>;
    };
  };
  try {
    // Dynamic require so a missing native module doesn't blow up the JS bundle
    // at eval time (Expo Go) — only this call path fails.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fbsdk = require('react-native-fbsdk-next');
  } catch {
    throw new FacebookAuthUnavailable();
  }

  // isAutoInitEnabled is false in app.json (a bad appID in Application.onCreate
  // crashes app launch before the splash). Init here instead — idempotent, runs
  // only when the retailer actually taps Connect Facebook.
  try {
    fbsdk.Settings.initializeSDK();
  } catch {
    throw new FacebookAuthUnavailable();
  }

  const result = await fbsdk.LoginManager.logInWithPermissions(
    target === 'instagram' ? IG_PERMISSIONS : PAGE_PERMISSIONS,
  );
  if (result.isCancelled) throw new FacebookAuthCancelled();

  const token = await fbsdk.AccessToken.getCurrentAccessToken();
  if (!token?.accessToken) {
    throw new Error('Facebook did not return an access token. Please try again.');
  }
  return token.accessToken;
}
