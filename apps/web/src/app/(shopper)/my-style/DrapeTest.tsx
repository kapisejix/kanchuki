'use client';

// My Style Phase 2, owner decision D4 (research §7.2 step 6): the drape test.
//
// Three swatch pairs beside the shopper's own photo; per pair they tap the side that makes their
// face look brighter. The answer goes to POST /profile/confirm, which works out the undertone (the
// shopper's answer wins over the photo read). The screen never names skin or undertone words:
// only colour names and "brighter".
import { colorFamilySwatch } from '@kanchuki/shared';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { BTN_PRIMARY } from '../ui';
import type { DrapePick } from './analyze';

// Which side the warm swatch shows on alternates per round, so "always tap left" is not an answer.
const PAIRS: { warm: string; cool: string }[] = [
  { warm: 'gold', cool: 'silver' },
  { warm: 'orange', cool: 'magenta' },
  { warm: 'cream', cool: 'white' },
];

export function DrapeTest({
  photo,
  busy,
  error,
  onAnswer,
  onSkip,
}: {
  /** Local object URL of the photo just read (page memory only), or null. */
  photo: string | null;
  busy: boolean;
  error: boolean;
  onAnswer: (picks: DrapePick[]) => void;
  onSkip: () => void;
}) {
  const [picks, setPicks] = useState<DrapePick[]>([]);
  const done = picks.length === PAIRS.length;
  const round = Math.min(picks.length, PAIRS.length - 1);
  const pair = PAIRS[round] as (typeof PAIRS)[number];
  const sides: DrapePick[] = round % 2 === 0 ? ['warm', 'cool'] : ['cool', 'warm'];

  const choose = (p: DrapePick) => {
    if (done || busy) return;
    const next = [...picks, p];
    setPicks(next);
    if (next.length === PAIRS.length) onAnswer(next);
  };

  const swatch = (p: DrapePick, side: 'left' | 'right') => (
    <button
      key={p}
      type="button"
      onClick={() => choose(p)}
      disabled={done || busy}
      aria-label={`This side (${side}, ${pair[p]})`}
      className="min-h-32 flex-1 rounded-2xl ring-1 ring-lavender-200 transition-transform active:scale-[0.98] disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50 motion-reduce:transition-none"
      style={{ background: colorFamilySwatch(pair[p]) }}
    />
  );

  return (
    <div>
      <h2 id="drape-question" className="text-base font-bold text-spaceCadet-900">
        Which side makes your face look brighter?
      </h2>
      <p className="text-xs text-heliotrope-500 mt-0.5" aria-live="polite">
        {done
          ? 'Saving your answer…'
          : `Pair ${round + 1} of ${PAIRS.length}: ${pair[sides[0] as DrapePick]} or ${pair[sides[1] as DrapePick]}. Tap that side.`}
      </p>
      <fieldset
        aria-labelledby="drape-question"
        className="mt-4 flex min-w-0 items-stretch gap-2 border-0 p-0 m-0"
      >
        {swatch(sides[0] as DrapePick, 'left')}
        {photo && (
          <img
            src={photo}
            alt="Your selfie, kept on this screen only"
            className="h-32 w-24 shrink-0 rounded-2xl object-cover"
          />
        )}
        {swatch(sides[1] as DrapePick, 'right')}
      </fieldset>
      {busy && (
        <Loader2
          aria-hidden
          size={20}
          className="mx-auto mt-4 animate-spin motion-reduce:animate-none text-fuchsia-600"
        />
      )}
      {error && !busy && (
        <div className="mt-4">
          <p role="alert" className="text-xs text-red-700">
            We could not save your answer. Please try again.
          </p>
          <button
            type="button"
            onClick={() => onAnswer(picks)}
            className={`${BTN_PRIMARY} mt-2 w-full`}
          >
            Try again
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onSkip}
        disabled={busy}
        className="w-full min-h-11 mt-2 rounded-xl text-sm font-semibold text-heliotrope-500 hover:text-spaceCadet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50"
      >
        Skip
      </button>
    </div>
  );
}
