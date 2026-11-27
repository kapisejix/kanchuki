'use client';

import { ReportAiContent } from '@/components/ReportAiContent';
import { Sheet } from '@/components/Sheet';
// F-045 PR-7 T17: selfie capture sheet. Same flow as TryOnSheet (c/[slug]/components):
// consent FIRST - the file input does not exist until the shopper accepts, so there is
// no way to reach the camera behind the notice. Copy is imported from @kanchuki/shared
// so the words on screen are the words `consent_version` names.
//
// One close path (`onClose`) and no history entry, so there is nothing to pop twice
// (RC-065/RC-006). The submit guard is a ref, not state, because two events can land
// before React commits (RC-015). Polling is capped and stops on unmount.
import { type GarmentDescriptor, MY_STYLE_CONSENT } from '@kanchuki/shared';
import {
  Camera,
  ImageIcon,
  Loader2,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BTN_PRIMARY, BTN_SECONDARY } from '../ui';
import { PaletteSwatches } from './ColourResult';
import {
  type AnalyzeMode,
  clearProfile,
  fetchProfile,
  pollAnalysis,
  prepareUpload,
  startAnalysis,
} from './analyze';
import { LOGIN_HREF, type StyleProfile } from './lib';

// Shown under a failed selfie read (not under quota/network errors: a better photo would not help).
const PHOTO_TIPS = [
  'Daylight, facing a window',
  'Only you, your face filling most of the frame',
  'No beauty filter, sunglasses or heavy makeup',
  'Hair off your face, camera at eye level',
];

type Step = 'consent' | 'capture' | 'processing' | 'done' | 'error' | 'signin';

const POLL_MS = 2500;
const MAX_POLLS = 36; // 90 s; the server drops the job after 15 min

const btn = `${BTN_PRIMARY} w-full`;
const quiet =
  'w-full min-h-11 mt-1 rounded-xl text-sm font-semibold text-heliotrope-500 hover:text-spaceCadet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50';

// `mode` 'garment' is find similar (PR-9): the photo is of a garment the shopper likes, not of
// them. Same consent, same flow; only the words, the picker and what onDone hands back differ.
export function AnalyzeSheet({
  onClose,
  onDone,
  onShop,
  onCleared,
  mode = 'selfie',
}: {
  onClose: () => void;
  onDone: (garment?: GarmentDescriptor) => void;
  /** Result screen "Shop my colours": the page filters the feed to the palette. */
  onShop?: () => void;
  /** Result screen "Delete": the server confirmed the profile is gone. */
  onCleared?: () => void;
  mode?: AnalyzeMode;
}) {
  const garment = mode === 'garment';
  const [step, setStep] = useState<Step>('consent');
  const [message, setMessage] = useState('');
  const [fix, setFix] = useState('');
  // The saved palette for the result screen; null = show the plain "ready" fallback.
  const [result, setResult] = useState<StyleProfile | null>(null);
  // Preview of the photo just read: a local object URL of the prepared JPEG, held in page memory
  // only. Never uploaded again or stored; revoked on retake and on close.
  const [preview, setPreview] = useState<string | null>(null);
  const [deleteState, setDeleteState] = useState<'idle' | 'busy' | 'error'>('idle');
  const busyRef = useRef(false);
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  // Set up in the effect (not at first render) so a StrictMode remount gets a live
  // controller instead of the one its simulated cleanup already aborted.
  useEffect(() => {
    stoppedRef.current = false;
    ctrlRef.current = new AbortController();
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      ctrlRef.current?.abort();
    };
  }, []);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL?.(preview);
    },
    [preview],
  );

  const fail = (msg: string, fixLine = '') => {
    busyRef.current = false;
    setMessage(msg);
    setFix(fixLine);
    setStep('error');
  };

  // A ready poll carries enums only; the palette comes from the saved profile.
  const finishSelfie = async () => {
    const r = await fetchProfile(ctrlRef.current?.signal);
    if (stoppedRef.current) return;
    const saved = r.kind === 'ok' ? r.data.style_profile : null;
    setResult(saved?.palette ? saved : null);
    busyRef.current = false;
    setStep('done');
  };

  const retake = () => {
    setPreview(null); // the effect cleanup revokes the old URL
    setResult(null);
    setDeleteState('idle');
    busyRef.current = false;
    setStep('capture');
  };

  const remove = async () => {
    if (deleteState === 'busy') return;
    setDeleteState('busy');
    const r = await clearProfile();
    if (stoppedRef.current) return;
    if (r === 'ok') {
      onCleared?.();
      onClose();
    } else setDeleteState('error');
  };

  const pollLater = (jobId: string, n: number) => {
    timerRef.current = setTimeout(async () => {
      const r = await pollAnalysis(jobId, ctrlRef.current?.signal, mode);
      if (stoppedRef.current) return;
      if (r.kind === 'ready') {
        onDone(r.garment);
        if (garment) {
          busyRef.current = false;
          setStep('done');
        } else void finishSelfie();
      } else if (r.kind === 'failed') fail(r.message, r.fix);
      else if (r.kind === 'unauthorized') setStep('signin');
      else if (r.kind === 'gone') fail('This photo is no longer available. Please try again.');
      else if (r.kind === 'aborted') return;
      else if (n + 1 >= MAX_POLLS) {
        fail('This is taking longer than usual. Close this and check My Style again in a minute.');
      } else pollLater(jobId, n + 1);
    }, POLL_MS);
  };

  const handleFile = async (file: File) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStep('processing');

    let photo: Blob;
    try {
      photo = await prepareUpload(file);
    } catch (e) {
      if (!stoppedRef.current) {
        fail(
          e instanceof Error && e.message === 'unsupported'
            ? 'Please choose a JPEG, PNG, WebP or HEIC photo under 25 MB.'
            : "We can't open that photo. Please take a new one, or choose a JPEG.",
        );
      }
      return;
    }
    if (!garment && typeof URL.createObjectURL === 'function') {
      setPreview(URL.createObjectURL(photo));
    }
    const r = await startAnalysis(photo, ctrlRef.current?.signal, mode);
    if (stoppedRef.current || r.kind === 'aborted') return;
    if (r.kind === 'unauthorized') setStep('signin');
    else if (r.kind === 'error') fail(r.message);
    else pollLater(r.jobId, 0);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      overlayClassName="z-[80] bg-spaceCadet-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      panelClassName="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 shadow-2xl shadow-spaceCadet-900/30 max-h-[95vh] overflow-y-auto"
      panelAnimation={{
        initial: { y: 24, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
      }}
      maxHeightVh={95}
      ariaLabel={garment ? 'Find similar' : 'Read my photo'}
    >
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-bold text-spaceCadet-900">My Style</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-11 h-11 rounded-2xl border border-lavender-200 flex items-center justify-center text-heliotrope-500 hover:bg-lavender-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50"
        >
          <X size={16} />
        </button>
      </div>

      {step === 'consent' && (
        <div>
          <div className="flex items-center gap-2 mb-2 text-fuchsia-600">
            <ShieldCheck size={16} />
            <h2 className="text-base font-semibold text-spaceCadet-900">
              {MY_STYLE_CONSENT.title}
            </h2>
          </div>
          <p className="text-xs text-heliotrope-500 leading-relaxed mb-3">
            {MY_STYLE_CONSENT.intro}
          </p>
          <div className="space-y-2 mb-3">
            {MY_STYLE_CONSENT.points.map((p) => (
              <div
                key={p.label}
                className="p-3 rounded-2xl bg-lavender-50 border border-lavender-100"
              >
                <p className="text-xs font-semibold text-spaceCadet-900">{p.label}</p>
                <p className="text-xs text-heliotrope-500 leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-heliotrope-500 mb-1">{MY_STYLE_CONSENT.training}</p>
          <p className="text-xs text-heliotrope-500 mb-4">
            {MY_STYLE_CONSENT.withdrawal}{' '}
            <a
              href={MY_STYLE_CONSENT.full_notice_url}
              target="_blank"
              rel="noreferrer"
              className="text-fuchsia-600 font-semibold underline"
            >
              Read the full notice
            </a>
          </p>
          <button type="button" onClick={() => setStep('capture')} className={btn}>
            {MY_STYLE_CONSENT.acceptLabel}
          </button>
          <button type="button" onClick={onClose} className={quiet}>
            {MY_STYLE_CONSENT.declineLabel}
          </button>
        </div>
      )}

      {step === 'capture' && (
        <div className="text-center py-2">
          <p className="text-sm font-semibold text-spaceCadet-900 mb-1">
            {garment ? 'Pick a photo of a garment you like' : 'Take or choose a photo of yourself'}
          </p>
          <p className="text-xs text-heliotrope-500 mb-5">
            {garment
              ? 'A screenshot or a photo of one piece works. It is read once and thrown away. We keep nothing from it.'
              : 'A clear face photo is all we need. Face a window or a light, with only you in the frame.'}
          </p>
          <label className={`${btn} inline-flex items-center justify-center gap-2 cursor-pointer`}>
            <Camera size={16} />
            {garment ? 'Choose a photo' : 'Open camera'}
            <input
              type="file"
              accept="image/*"
              {...(garment ? {} : { capture: 'user' as const })}
              className="hidden"
              data-testid={garment ? 'my-style-garment-input' : 'my-style-selfie-input'}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </label>
          {/* Selfie mode: same pipeline, no `capture`, so the phone opens its gallery. */}
          {!garment && (
            <label className={`${BTN_SECONDARY} w-full mt-2 cursor-pointer`}>
              <ImageIcon size={16} />
              Choose from gallery
              <input
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="my-style-gallery-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </label>
          )}
        </div>
      )}

      {step === 'processing' && (
        <div className="text-center py-8" aria-live="polite">
          <Loader2
            size={26}
            className="animate-spin motion-reduce:animate-none mx-auto text-fuchsia-600"
          />
          <p className="text-sm font-semibold text-spaceCadet-900 mt-3">
            {garment ? 'Looking at the garment…' : 'Reading your photo…'}
          </p>
          <p className="text-xs text-heliotrope-500 mt-1">This usually takes under a minute.</p>
        </div>
      )}

      {step === 'signin' && (
        <div className="text-center py-2">
          <p className="text-sm font-semibold text-spaceCadet-900 mb-1">
            {garment ? 'Sign in to find similar pieces' : 'Sign in to read your photo'}
          </p>
          <p className="text-xs text-heliotrope-500 leading-relaxed mb-5">
            {garment
              ? 'My Style searches stores for you, so you need to be signed in.'
              : 'My Style saves your palette to your account, so you need to be signed in.'}
          </p>
          <a href={LOGIN_HREF} className={btn}>
            Sign in
          </a>
          <button type="button" onClick={onClose} className={quiet}>
            Not now
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="text-center py-2">
          <p role="alert" className="text-sm font-semibold text-spaceCadet-900 pt-4">
            {message}
          </p>
          {fix && <p className="text-sm text-spaceCadet-900 mt-1">{fix}</p>}
          {fix && !garment && (
            <div className="text-left mt-4 p-3 rounded-2xl bg-lavender-50 border border-lavender-100">
              <p id="good-photo-tips" className="text-xs font-semibold text-spaceCadet-900">
                A good photo
              </p>
              <ul
                aria-labelledby="good-photo-tips"
                className="mt-1 list-disc pl-4 text-xs text-heliotrope-500 space-y-0.5"
              >
                {PHOTO_TIPS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={retake} className={`${btn} mt-5`}>
            Try again
          </button>
          <button type="button" onClick={onClose} className={quiet}>
            Close
          </button>
        </div>
      )}

      {step === 'done' && !garment && result?.palette && (
        <div>
          <div className="flex items-center gap-3">
            {preview && (
              <img
                src={preview}
                alt="Your selfie, kept on this screen only"
                className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-lavender-200"
              />
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-spaceCadet-900">Your colours are ready</h2>
              <p className="text-xs text-heliotrope-500 mt-0.5">
                Your photo was not kept. This preview goes when you close this.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <PaletteSwatches undertone={result.undertone} palette={result.palette} />
          </div>
          <p className="text-xs text-heliotrope-500 mt-4">
            Results depend on the light in your photo, so you can retake it any time.
          </p>
          <button
            type="button"
            onClick={() => {
              onShop?.();
              onClose();
            }}
            className={`${btn} mt-4`}
          >
            <ShoppingBag aria-hidden className="h-4 w-4" />
            Shop my colours
          </button>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button type="button" onClick={retake} className={BTN_SECONDARY}>
              <RotateCcw aria-hidden className="h-4 w-4 text-heliotrope-500" />
              Retake
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleteState === 'busy'}
              className={BTN_SECONDARY.replace('text-spaceCadet-900', 'text-red-700')}
            >
              <Trash2 aria-hidden className="h-4 w-4" />
              Delete
            </button>
          </div>
          {deleteState === 'error' && (
            <p role="alert" className="text-xs text-red-700 mt-3">
              We could not delete your colours. Please try again.
            </p>
          )}
          <ReportAiContent feature="My Style selfie analysis" className="mt-3" />
        </div>
      )}

      {step === 'done' && (garment || !result?.palette) && (
        <div className="text-center py-4">
          <p className="text-sm font-semibold text-spaceCadet-900">
            {garment ? 'Showing pieces like this' : 'Your palette is ready'}
          </p>
          <p className="text-xs text-heliotrope-500 mt-1 mb-5">
            {garment
              ? 'Stores with similar pieces now come first.'
              : 'Your picks now lean toward colours that suit you.'}
          </p>
          <button type="button" onClick={onClose} className={btn}>
            {garment ? 'See matches' : 'See my picks'}
          </button>
          <ReportAiContent
            feature={garment ? 'My Style find similar' : 'My Style selfie analysis'}
            className="mt-3"
          />
        </div>
      )}
    </Sheet>
  );
}
