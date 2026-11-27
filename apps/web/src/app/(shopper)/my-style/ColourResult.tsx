// Phase 1 (customer-profile-research §7.3): real swatches + a plain "why" for a saved palette.
// Shared by the result step in AnalyzeSheet and by PaletteCard, so both always say the same.
// Spec 4.3: no skin or body label. The "why" talks about shades, never about the shopper.
import { colorFamilySwatch } from '@kanchuki/shared';
import { useId } from 'react';

// ponytail: "Best" = the first 4 of the admin-ordered good list (the seeded palettes lead with
// their signature shades). A stylist-ranked list would replace this if order stops meaning it.
const BEST = 4;

// Keyed by undertone, but the words never name it ("warm" on screen IS the label; spec 4.3).
const WHY: Record<string, string> = {
  warm: 'Earthy, golden and spice shades make your face look brighter and fresher.',
  cool: 'Jewel, berry and icy shades make your face look brighter and fresher.',
  neutral: 'Clear, rich mid-tones make your face look brighter. Many shades sit well on you.',
};
const WHY_FALLBACK = 'These shades make your face look brighter and fresher.';

function Group({ label, items }: { label: string; items: string[] }) {
  const id = useId();
  if (items.length === 0) return null;
  return (
    <div>
      <p id={id} className="text-xs font-semibold text-heliotrope-500">
        {label}
      </p>
      <ul aria-labelledby={id} className="flex flex-wrap gap-x-3 gap-y-2 mt-1.5">
        {items.map((f) => (
          <li
            key={f}
            className="flex items-center gap-1.5 text-xs font-semibold capitalize text-spaceCadet-900"
          >
            <span
              aria-hidden="true"
              data-swatch={f}
              className="h-6 w-6 shrink-0 rounded-full ring-1 ring-inset ring-spaceCadet-900/15"
              style={{ background: colorFamilySwatch(f) }}
            />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PaletteSwatches({
  undertone,
  palette,
}: {
  undertone: string;
  palette: { good: string[]; avoid: string[] };
}) {
  return (
    <div className="space-y-3">
      <p data-testid="palette-why" className="text-sm text-spaceCadet-900 leading-relaxed">
        {WHY[undertone] ?? WHY_FALLBACK}
        {palette.avoid.length > 0 && ' The "go easy" shades can look flat next to your face.'}
      </p>
      <Group label="Best on you" items={palette.good.slice(0, BEST)} />
      <Group label="Good" items={palette.good.slice(BEST)} />
      <Group label="Go easy on" items={palette.avoid} />
    </div>
  );
}
