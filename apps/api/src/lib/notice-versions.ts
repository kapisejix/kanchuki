// DPDP notice version registry (Task 27).
//
// Every ConsentEvent write MUST reference a notice_version from this
// registry. The version tracks which privacy notice text was shown to
// the customer at the time of consent. Legal team updates the notice
// text and bumps the version; code references the version string.

export const NOTICE_VERSIONS = {
  '1.0': {
    version: '1.0',
    effective_date: '2026-08-31',
    title: 'Kanchuki Shopper Passport — Privacy Notice',
    summary: 'We collect your phone number, style preferences, and browsing behavior to personalize your shopping experience across partner stores.',
    key_points: [
      'Your phone number is used only for OTP login and WhatsApp messages from stores you consent to.',
      'Style preferences and browsing data help us recommend products you might like.',
      'You can turn off personalization at any time in My Profile.',
      'You can download all your data or delete your account from My Profile.',
      'We never sell your data to third parties.',
    ],
    full_notice_url: 'https://kanchuki.app/privacy',
  },
} as const;

export type NoticeVersion = keyof typeof NOTICE_VERSIONS;

/**
 * Get the current (latest) notice version.
 */
export function getCurrentNoticeVersion(): NoticeVersion {
  const versions = Object.keys(NOTICE_VERSIONS) as NoticeVersion[];
  return versions[versions.length - 1]!;
}

/**
 * Validate that a notice version string exists in the registry.
 */
export function isValidNoticeVersion(version: string): version is NoticeVersion {
  return version in NOTICE_VERSIONS;
}

/**
 * Get notice details for a specific version.
 */
export function getNoticeDetails(version: NoticeVersion) {
  return NOTICE_VERSIONS[version];
}
