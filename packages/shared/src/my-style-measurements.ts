// F-045 My Style - self-entered body measurements (docs/tasks/pending/my-style-body-profile.md §3).
// Centimetres everywhere server-side; the only unit conversion lives here. Mirrors the CHECK
// constraints in migration 161. There is no weight field on purpose.

export const MY_STYLE_MEASUREMENT_RANGES = {
  height_cm: { min: 100, max: 220 },
  bust_cm: { min: 50, max: 160 },
  waist_cm: { min: 50, max: 160 },
  hip_cm: { min: 50, max: 160 },
} as const;

export type MyStyleMeasurementField = keyof typeof MY_STYLE_MEASUREMENT_RANGES;

export const MY_STYLE_MEASUREMENT_FIELDS = Object.keys(
  MY_STYLE_MEASUREMENT_RANGES,
) as MyStyleMeasurementField[];

/** 5 ft 4 in -> 163 (rounded to whole cm). The one conversion; the form calls this. */
export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54);
}

export function inMeasurementRange(field: MyStyleMeasurementField, cm: number): boolean {
  const r = MY_STYLE_MEASUREMENT_RANGES[field];
  return Number.isInteger(cm) && cm >= r.min && cm <= r.max;
}

// Separate consent for body measurements (owner decision 2026-11-16): their own words, version
// and grant/withdraw events, independent of the photo consent. Bump `version` on ANY wording
// change; the API records it so a stored version always names text a real person saw.
export const MY_STYLE_BODY_CONSENT = {
  version: 'mystyle-body-1.0',
  title: 'Before you save your measurements',
  intro:
    'My Style can use your height, bust, waist and hip to suggest the size that is likely to fit. Adults only.',
  points: [
    {
      label: 'Who sees them',
      text: 'Only you. They are never shown to a store, unless you choose to share them in an enquiry.',
    },
    {
      label: 'What we keep',
      text: 'The numbers you type, saved to your account. We do not ask for your weight and we do not need a photo.',
    },
    {
      label: 'What they are used for',
      text: 'Only to suggest sizes in My Style. Never to train AI models.',
    },
  ],
  withdrawal: 'You can remove them any time. Removing them deletes the numbers and ends this consent.',
  acceptLabel: 'I agree, save my measurements',
  declineLabel: 'Not now',
} as const;

