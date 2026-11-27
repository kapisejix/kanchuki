'use client';

// Spec step 2: self-entered measurements. Shopper-only (never shown to a store), saved to the
// account, removable in one tap. There is deliberately no weight field. "Saved" is only
// reported when the API confirms it (RC-060).
import {
  MY_STYLE_BODY_CONSENT,
  MY_STYLE_MEASUREMENT_RANGES,
  feetInchesToCm,
  inMeasurementRange,
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
const FIELDS: Field[] = ['height_cm', 'bust_cm', 'waist_cm', 'hip_cm'];
const INPUT = 'w-full rounded-xl border border-lavender-200 px-3 py-2 text-sm text-spaceCadet-900';

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

export function MeasurementsCard({
  initial,
  onSaved,
  sizeMatches,
  onPickUsualSize,
}: {
  initial: Measurements | null;
  onSaved: () => void;
  /** Phase 4: feed meta.size_matches; null/undefined hides the counter. */
  sizeMatches?: number | null;
  /** Phase 4 "No tape?": hands over to the page's Size filter. */
  onPickUsualSize?: () => void;
}) {
  const [vals, setVals] = useState<Record<Field, string>>({
    height_cm: initial?.height_cm?.toString() ?? '',
    bust_cm: initial?.bust_cm?.toString() ?? '',
    waist_cm: initial?.waist_cm?.toString() ?? '',
    hip_cm: initial?.hip_cm?.toString() ?? '',
  });
  const [ftIn, setFtIn] = useState(false);
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Saved measurements imply a live consent (they cannot be stored without one), so only a
  // shopper with none meets the consent step.
  const [step, setStep] = useState<'consent' | 'declined' | 'form'>(initial ? 'form' : 'consent');
  // Only bust / waist / hip drive a size; height alone never does.
  const hasBody = !!(initial?.bust_cm || initial?.waist_cm || initial?.hip_cm);
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

  function save() {
    const body: Partial<Record<Field, number>> = {};
    for (const f of FIELDS) {
      let raw = vals[f].trim();
      if (f === 'height_cm' && ftIn) {
        raw =
          !feet.trim() && !inches.trim()
            ? ''
            : String(feetInchesToCm(Number(feet || 0), Number(inches || 0)));
      }
      if (!raw) continue;
      const n = Number(raw);
      if (!inMeasurementRange(f, n)) {
        const r = MY_STYLE_MEASUREMENT_RANGES[f];
        setMsg({
          kind: 'error',
          text: `${LABEL[f]} should be a whole number between ${r.min} and ${r.max} cm.`,
        });
        return;
      }
      body[f] = n;
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
      setMsg({ kind: 'ok', text: 'Your measurements were removed.' });
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
            {step === 'consent' ? MY_STYLE_BODY_CONSENT.title : 'Your measurements'}
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
              Add my measurements
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
        <h2 className="text-base font-bold text-spaceCadet-900">Your measurements</h2>
      </div>
      <p className="text-xs text-heliotrope-500 mt-3">
        Only you can see these. They are saved to your account to suggest sizes, and are never shown
        to a store. You can delete them any time.
      </p>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="col-span-2">
          <div className="flex items-center justify-between">
            <label htmlFor="m-height" className="text-xs font-semibold text-heliotrope-500">
              {ftIn ? 'Height (feet and inches)' : 'Height (cm)'}
            </label>
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
                aria-label="Feet"
                inputMode="numeric"
                value={feet}
                onChange={(e) => setFeet(e.target.value)}
                className={INPUT}
                placeholder="ft"
              />
              <input
                aria-label="Inches"
                inputMode="numeric"
                value={inches}
                onChange={(e) => setInches(e.target.value)}
                className={INPUT}
                placeholder="in"
              />
            </div>
          ) : (
            <input
              id="m-height"
              inputMode="numeric"
              value={vals.height_cm}
              onChange={(e) => setVals((v) => ({ ...v, height_cm: e.target.value }))}
              className={`${INPUT} mt-1`}
            />
          )}
        </div>
        {(['bust_cm', 'waist_cm', 'hip_cm'] as Field[]).map((f) => (
          <div key={f}>
            <label htmlFor={`m-${f}`} className="text-xs font-semibold text-heliotrope-500">
              {LABEL[f]} (cm)
            </label>
            <input
              id={`m-${f}`}
              inputMode="numeric"
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
          Waist: the narrowest part, above the navel. Hip: around the fullest part. Height: standing
          straight, no shoes. Sizes are approximate.
        </p>
      </details>

      {onPickUsualSize && (
        <button
          type="button"
          onClick={onPickUsualSize}
          className="mt-2 text-xs font-semibold text-fuchsia-600 underline"
        >
          No tape? Pick your usual size
        </button>
      )}

      {hasBody && sizeMatches !== null && sizeMatches !== undefined && (
        <p data-testid="size-matches" className="mt-3 text-sm font-semibold text-spaceCadet-900">
          {sizeMatches > 0
            ? `Your size is shown on ${sizeMatches} products in your feed`
            : 'No product in your feed has a size for your measurements yet'}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={save} disabled={busy} className={BTN_SECONDARY}>
          Save measurements
        </button>
        {initial && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className={BTN_SECONDARY.replace('text-spaceCadet-900', 'text-red-700')}
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            Remove my measurements
          </button>
        )}
      </div>

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
