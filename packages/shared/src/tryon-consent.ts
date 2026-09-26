// F-040 — virtual try-on consent copy (task T6).
//
// ONE source of truth for the words on the consent screen. The API records
// `TRY_ON_CONSENT.version` on every consent it accepts and on the job it
// generated, and the two UIs (retailer app in-store, customer PWA) render
// `points` / `acceptLabel` / `declineLabel` from here — so a wording change
// changes the version, and a recorded version always names text a real person
// actually saw. Do not inline this copy in a screen: a second copy is free to
// drift from the version the database claims was shown, which is the whole
// point of recording a version.
//
// Why two photos get two different promises: they really are treated
// differently, and conflating them is how a privacy notice becomes false. The
// photo the person GIVES is never persisted (it does not leave the API process
// — see `lib/tryon-photo-store.ts`); the picture we GENERATE is a photo of a
// real person that IS stored, so it needs the consent and the deletion route.

export const TRY_ON_CONSENT = {
  /** Bump on ANY wording change — this is what an accepted consent records. */
  version: 'tryon-1.0',

  title: 'Before we show you wearing this',

  intro:
    'This uses AI to make a picture of you wearing this outfit. Two photos are involved, and they are treated differently:',

  points: [
    {
      label: 'The photo you give us',
      text: 'is used only to make the picture, and is never saved — not on your phone, not on our servers, nowhere.',
    },
    {
      label: 'The picture we make',
      text: 'of you wearing the outfit is saved to this store, so you and the store can look at it again or share it. It is not shown publicly, and only a short-lived private link opens it.',
    },
  ],

  training: 'We never use either photo to train AI models.',

  withdrawal:
    'You can withdraw this any time from My Profile. Withdrawing deletes every try-on picture we made for you.',

  acceptLabel: 'I agree — show me wearing it',
  declineLabel: 'Not now',

  /** Where the full written notice lives, for a "read more" affordance. */
  full_notice_url: 'https://kanchuki.app/privacy#virtual-try-on',
} as const;

export type TryOnConsent = typeof TRY_ON_CONSENT;
