// F-045 My Style — photo analysis consent copy + the profile enums (spec §4.3, PR-6).
//
// ONE source of truth for the words on the consent screen, same rule as
// tryon-consent.ts: the API records `MY_STYLE_CONSENT.version` on every consent it
// accepts, and the UI renders `points` from here, so a recorded version always names
// text a real person saw. Bump the version on ANY wording change.
//
// Unlike try-on there is only ONE photo and nothing generated: the photo is read once
// and discarded; what we keep is three words about colouring and frame.

export const MY_STYLE_CONSENT = {
  version: 'mystyle-1.0',

  title: 'Before we read your photo',

  intro:
    'My Style looks at one photo to suggest colours and fits that suit you. Adults only — please do not upload a photo of a child.',

  points: [
    {
      label: 'Your photo',
      text: 'is read once by AI and then thrown away. It is never saved — not on our servers, not in storage, nowhere.',
    },
    {
      label: 'What we keep',
      text: 'is only a short note — your undertone, depth and frame — so your suggestions are ready next time. It is only used to rank clothes for you.',
    },
  ],

  training: 'We never use your photo to train AI models.',

  withdrawal:
    'You can clear this note any time from My Style. Clearing it deletes it and stops us using your photo consent.',

  acceptLabel: 'I agree — read my photo',
  declineLabel: 'Not now',

  full_notice_url: 'https://kanchuki.app/privacy#my-style',
} as const;

/** What the analysis may say. Mirrors the CHECK constraints in migration 133. */
export const MY_STYLE_UNDERTONES = ['warm', 'cool', 'neutral'] as const;
export const MY_STYLE_DEPTHS = ['fair', 'medium', 'deep'] as const;
export const MY_STYLE_FRAMES = ['petite', 'average', 'tall', 'curvy'] as const;
/** Why a photo could not be read — an enum, so the model cannot smuggle free text out. */
export const MY_STYLE_UNUSABLE_REASONS = [
  'no_person',
  'face_not_clear',
  'multiple_people',
  'too_dark',
] as const;

export interface MyStyleProfile {
  undertone: (typeof MY_STYLE_UNDERTONES)[number];
  depth: (typeof MY_STYLE_DEPTHS)[number];
  frame: (typeof MY_STYLE_FRAMES)[number];
}
