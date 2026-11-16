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
