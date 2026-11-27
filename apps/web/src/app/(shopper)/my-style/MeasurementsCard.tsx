'use client';

// Spec step 2 + B2: the usual size first (XS..4XL, a label only), then self-entered measurements
// in inches (height in ft/in by default), stored in cm. Shopper-only (never shown to a store),
// saved to the account, removable in one tap. There is deliberately no weight field. "Saved" is
// only reported when the API confirms it (RC-060).
import {
  MY_STYLE_BODY_CONSENT,
  MY_STYLE_MEASUREMENT_RANGES,
  USUAL_SIZE_OPTIONS,
  cmToFeetInches,
  cmToInches,
  feetInchesToCm,
  inMeasurementRange,
  inchesToCm,
} from '@kanchuki/shared';
import { Ruler, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { BTN_SECONDARY, CARD, IconTile } from '../ui';
import { saveMeasurements, withdrawMeasurements } from './analyze';
import type { Measurements } from './lib';

type Field = 'height_cm' | 'bust_cm' | 'waist_cm' | 'hip_cm';
const LABEL: Record<Field, string> = {
  height_cm: 'Height',
  bust_cm: 'Bust / chest',
  waist_cm: 'Waist',
  hip_cm: 'Hip',
};
const BODY: Field[] = ['bust_cm', 'waist_cm', 'hip_cm'];
const INPUT = 'w-full rounded-xl border border-lavender-200 px-3 py-2 text-sm text-spaceCadet-900';
const SIZE_BTN = 'min-w-11 rounded-xl border px-3 py-2 text-sm font-semibold';

// Phase 4 illustrated guide: one torso outline per measurement, the tape drawn where it goes.
// ponytail: inline SVG, no image files; swap for drawn art if the owner wants a richer guide.
const TAPE_Y = { Bust: 30, Waist: 46, Hip: 62 } as const;
function TapeFigure({ name }: { name: keyof typeof TAPE_Y }) {
  const y = TAPE_Y[name];
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg role="img" aria-label={name} viewBox="0 0 60 90" className="h-20 w-14">
        <circle cx="30" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M18 22 Q30 18 42 22 L44 36 Q38 46 40 52 Q46 62 44 84 L16 84 Q14 62 20 52 Q22 46 16 36 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <ellipse cx="30" cy={y} rx="16" ry="3" fill="none" stroke="#c026d3" strokeWidth="2" />
      </svg>
      <figcaption className="font-semibold">{name}</figcaption>
    </figure>
  );
}

const inch = (cm: number | null | undefined) => (cm ? String(cmToInches(cm)) : '');

export function MeasurementsCard({
  initial,
  onSaved,
  sizeMatches,
}: {
  initial: Measurements | null;
  onSaved: () => void;
  /** Phase 4: feed meta.size_matches; null/undefined hides the counter. */
  sizeMatches?: number | null;
}) {
  const ft = initial?.height_cm ? cmToFeetInches(initial.height_cm) : null;
  const [vals, setVals] = useState<Record<Field, string>>({
    height_cm: initial?.height_cm?.toString() ?? '',
    bust_cm: inch(initial?.bust_cm),
    waist_cm: inch(initial?.waist_cm),
    hip_cm: inch(initial?.hip_cm),
  });
  const [ftIn, setFtIn] = useState(true);
  const [feet, setFeet] = useState(ft ? String(ft.feet) : '');
  const [inches, setInches] = useState(ft ? String(ft.inches) : '');
  const savedUsual = initial?.usual_size ?? null;
  const [usual, setUsual] = useState<string | null>(savedUsual);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Saved measurements or a saved usual size imply a live consent (neither can be stored without
  // one), so only a shopper with none meets the consent step.
  const [step, setStep] = useState<'consent' | 'declined' | 'form'>(initial ? 'form' : 'consent');
  // Only bust / waist / hip drive a measured size; height alone never does.
  const hasBody = !!(initial?.bust_cm || initial?.waist_cm || initial?.hip_cm);
  // Custom measurements start folded only for a shopper with a usual size and no numbers.
  const [customOpen, setCustomOpen] = useState(!(savedUsual && !hasBody && !initial?.height_cm));
  const busyRef = useRef(false); // sync guard: two taps can land before state commits (RC-015)

  async function run(body: Parameters<typeof saveMeasurements>[0], okText: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const r = await saveMeasurements(body);
    busyRef.current = false;
    setBusy(false);
    if (r === 'ok') {
      setMsg({ kind: 'ok', text: okText });
      onSaved();
    } else {
      setMsg({
        kind: 'error',
        text:
          r === 'unauthorized'
            ? 'Your session ended. Please sign in again.'
            : 'We could not save your measurements. Please try again.',
      });
    }
  }

  function saveSize(size: string | null) {
    void run(
      { usual_size: size, consent_version: MY_STYLE_BODY_CONSENT.version },
      size ? 'Saved. Products that list your size will say so.' : 'Your usual size was cleared.',
    );
  }

  function save() {
    const body: Partial<Record<Field, number>> = {};
    const height = ftIn
      ? !feet.trim() && !inches.trim()
        ? ''
        : String(feetInchesToCm(Number(feet || 0), Number(inches || 0)))
      : vals.height_cm.trim();
    if (height) {
      const n = Number(height);
      if (!inMeasurementRange('height_cm', n)) {
        const r = MY_STYLE_MEASUREMENT_RANGES.height_cm;
        const lo = cmToFeetInches(r.min);
        const hi = cmToFeetInches(r.max);
        setMsg({
          kind: 'error',
          text: ftIn
            ? `Height should be between ${lo.feet} ft ${lo.inches} in and ${hi.feet} ft ${hi.inches} in.`
            : `Height should be a whole number between ${r.min} and ${r.max} cm.`,
        });
        return;
      }
      body.height_cm = n;
    }
    for (const f of BODY) {
      const raw = vals[f].trim();
      if (!raw) continue;
      const cm = inchesToCm(Number(raw));
      if (!inMeasurementRange(f, cm)) {
        const r = MY_STYLE_MEASUREMENT_RANGES[f];
        setMsg({
          kind: 'error',
          text: `${LABEL[f]} should be between ${cmToInches(r.min)} and ${cmToInches(r.max)} inches.`,
        });
        return;
      }
      body[f] = cm;
    }
    if (Object.keys(body).length === 0) {
      setMsg({ kind: 'error', text: 'Enter at least one measurement.' });
      return;
    }
    void run(
      { ...body, consent_version: MY_STYLE_BODY_CONSENT.version },
      'Saved. We will use it to suggest sizes.',
    );
  }

  async function remove() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const r = await withdrawMeasurements();
    busyRef.current = false;
    setBusy(false);
    if (r === 'ok') {
      setVals({ height_cm: '', bust_cm: '', waist_cm: '', hip_cm: '' });
      setFeet('');
      setInches('');
      setUsual(null);
      setMsg({ kind: 'ok', text: 'Your size and measurements were removed.' });
      onSaved();
    } else {
      setMsg({
        kind: 'error',
        text:
          r === 'unauthorized'
            ? 'Your session ended. Please sign in again.'
            : 'We could not remove your measurements. Please try again.',
      });
    }
  }

  if (step !== 'form') {
    return (
      <section className={`${CARD} p-5`}>
        <div className="flex items-center gap-3">
          <IconTile icon={Ruler} />
          <h2 className="text-base font-bold text-spaceCadet-900">
            {step === 'consent' ? MY_STYLE_BODY_CONSENT.title : 'Your size'}
          </h2>
        </div>
        {step === 'consent' ? (
          <>
            <p className="text-sm text-heliotrope-500 mt-3">{MY_STYLE_BODY_CONSENT.intro}</p>
            <ul className="mt-3 space-y-2 text-sm text-heliotrope-500">
              {MY_STYLE_BODY_CONSENT.points.map((pt) => (
                <li key={pt.label}>
                  <span className="font-semibold text-spaceCadet-900">{pt.label}: </span>
                  {pt.text}
                </li>
              ))}
            </ul>
            <p className="text-xs text-heliotrope-500 mt-3">{MY_STYLE_BODY_CONSENT.withdrawal}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" onClick={() => setStep('form')} className={BTN_SECONDARY}>
                {MY_STYLE_BODY_CONSENT.acceptLabel}
              </button>
              <button type="button" onClick={() => setStep('declined')} className={BTN_SECONDARY}>
                {MY_STYLE_BODY_CONSENT.declineLabel}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-3">
            <button type="button" onClick={() => setStep('consent')} className={BTN_SECONDARY}>
              Add my size
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={`${CARD} p-5`}>
      <div className="flex items-center gap-3">
        <IconTile icon={Ruler} />
        <h2 className="text-base font-bold text-spaceCadet-900">Your size</h2>
      </div>
      <p className="text-xs text-heliotrope-500 mt-3">
        Only you can see these. They are saved to your account to suggest sizes, and are never shown
        to a store. You can delete them any time.
      </p>

      <h3 id="usual-size" className="text-sm font-bold text-spaceCadet-900 mt-4">
        Your usual size
      </h3>
      <p className="text-xs text-heliotrope-500 mt-1">
        We show it on products that list it. It never hides anything from your feed.
      </p>
      <div role="radiogroup" aria-labelledby="usual-size" className="flex flex-wrap gap-2 mt-2">
        {USUAL_SIZE_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={usual === s}
            onClick={() => setUsual(s)}
            className={`${SIZE_BTN} ${
              usual === s
                ? 'border-fuchsia-600 bg-fuchsia-50 text-fuchsia-700'
                : 'border-lavender-200 text-spaceCadet-900'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={() => saveSize(usual)}
          disabled={busy || !usual || usual === savedUsual}
          className={BTN_SECONDARY}
        >
          Save my size
        </button>
        {savedUsual && (
          <button
            type="button"
            onClick={() => saveSize(null)}
            disabled={busy}
            className={BTN_SECONDARY}
          >
            Clear my size
          </button>
        )}
      </div>

      <details
        data-testid="custom"
        open={customOpen}
        onToggle={(e) => setCustomOpen(e.currentTarget.open)}
        className="mt-5"
      >
        <summary className="cursor-pointer text-sm font-bold text-spaceCadet-900">
          Custom measurements
        </summary>
        <p className="text-xs text-heliotrope-500 mt-1">
          In inches. With bust, waist or hip saved, we work out your size from each product's chart.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-heliotrope-500">
                {ftIn ? 'Height (feet and inches)' : 'Height (cm)'}
              </span>
              <button
                type="button"
                onClick={() => setFtIn((v) => !v)}
                className="text-xs font-semibold text-fuchsia-600 underline"
              >
                {ftIn ? 'Use cm' : 'Use ft/in'}
              </button>
            </div>
            {ftIn ? (
              <div className="flex gap-2 mt-1">
                <input
                  aria-label="Height feet"
                  inputMode="numeric"
                  value={feet}
                  onChange={(e) => setFeet(e.target.value)}
                  className={INPUT}
                  placeholder="ft"
                />
                <input
                  aria-label="Height inches"
                  inputMode="numeric"
                  value={inches}
                  onChange={(e) => setInches(e.target.value)}
                  className={INPUT}
                  placeholder="in"
                />
              </div>
            ) : (
              <input
                aria-label="Height (cm)"
                inputMode="numeric"
                value={vals.height_cm}
                onChange={(e) => setVals((v) => ({ ...v, height_cm: e.target.value }))}
                className={`${INPUT} mt-1`}
              />
            )}
          </div>
          {BODY.map((f) => (
            <div key={f}>
              <label htmlFor={`m-${f}`} className="text-xs font-semibold text-heliotrope-500">
                {LABEL[f]} (inches)
              </label>
              <input
                id={`m-${f}`}
                inputMode="decimal"
                value={vals[f]}
                onChange={(e) => setVals((v) => ({ ...v, [f]: e.target.value }))}
                className={`${INPUT} mt-1`}
              />
            </div>
          ))}
        </div>

        <details className="mt-3 text-xs text-heliotrope-500">
          <summary className="cursor-pointer font-semibold">How to measure</summary>
          <div className="mt-2 flex justify-around text-heliotrope-500">
            <TapeFigure name="Bust" />
            <TapeFigure name="Waist" />
            <TapeFigure name="Hip" />
          </div>
          <p className="mt-2 font-semibold">Measure over light clothing, tape snug, not tight</p>
          <p className="mt-1">
            Use a soft tape over thin clothes, snug but not tight. Bust: around the fullest part.
            Waist: the narrowest part, above the navel. Hip: around the fullest part. Height:
            standing straight, no shoes. Sizes are approximate.
          </p>
        </details>

        <button type="button" onClick={save} disabled={busy} className={`${BTN_SECONDARY} mt-4`}>
          Save measurements
        </button>
      </details>

      {(hasBody || savedUsual) && sizeMatches !== null && sizeMatches !== undefined && (
        <p data-testid="size-matches" className="mt-3 text-sm font-semibold text-spaceCadet-900">
          {sizeMatches > 0
            ? `Your size is shown on ${sizeMatches} products in your feed`
            : 'No product in your feed has a size for your measurements yet'}
        </p>
      )}

      {initial && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className={BTN_SECONDARY.replace('text-spaceCadet-900', 'text-red-700')}
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            Remove my measurements
          </button>
        </div>
      )}

      {msg && (
        <p
          role={msg.kind === 'error' ? 'alert' : 'status'}
          className={`text-xs mt-3 ${msg.kind === 'error' ? 'text-red-700' : 'text-heliotrope-500'}`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
