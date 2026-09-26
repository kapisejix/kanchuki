// DPDP notice version registry (Task 27).

import { TRY_ON_CONSENT } from '@kanchuki/shared';
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
    summary:
      'We collect your phone number, style preferences, and browsing behavior to personalize your shopping experience across partner stores.',
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
 * Purpose-specific consents (F-040 T6 — virtual try-on).
 *
 * Deliberately a SEPARATE registry, not another key in `NOTICE_VERSIONS`.
 * `getCurrentNoticeVersion()` returns the **last key** of `NOTICE_VERSIONS`,
 * so appending a purpose notice there would silently become the
 * `notice_version` recorded on every passport `ConsentEvent` write — the
 * passport would start claiming shoppers agreed to try-on text. Add purpose
 * consents here.
 *
 * The wording itself is NOT duplicated here: it lives in
 * `@kanchuki/shared` (`TRY_ON_CONSENT`) so the API and both UIs cannot drift
 * from the version the database says was shown.
 */
export const PURPOSE_CONSENTS = {
  TRY_ON: {
    /** `ConsentEvent.kind` for the grant (consent given). */
    granted_kind: 'TRY_ON_CONSENTED',
    /** `ConsentEvent.kind` for the withdrawal. */
    withdrawn_kind: 'TRY_ON_CONSENT_WITHDRAWN',
    /** Recorded on ConsentEvent + the job; equals TRY_ON_CONSENT.version. */
    version: TRY_ON_CONSENT.version,
  },
} as const;

/** The text for a purpose consent, for a server-rendered notice or an email. */
export function getPurposeConsentCopy() {
  return TRY_ON_CONSENT;
}

/**
 * Is this the CURRENT try-on consent text? A stale version means the client
 * showed older wording (or made the string up), so the gate rejects it rather
 * than recording a version the person never saw. Re-accepting is one tap.
 */
export function isCurrentTryOnConsent(version: string | undefined): boolean {
  return version !== undefined && version === PURPOSE_CONSENTS.TRY_ON.version;
}

/**
 * Get the current (latest) notice version.
 */
export function getCurrentNoticeVersion(): NoticeVersion {
  const versions = Object.keys(NOTICE_VERSIONS) as NoticeVersion[];
  const latest = versions[versions.length - 1];
  if (!latest) throw new Error('NOTICE_VERSIONS is empty');
  return latest;
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
