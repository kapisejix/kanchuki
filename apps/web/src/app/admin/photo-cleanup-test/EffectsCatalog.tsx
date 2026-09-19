'use client';

// Effects catalog for the admin bench. Pick a sample product (simulates the AI
// tag) → effects load by audience + garment → "Use in bench" fills the AI Studio
// Shoot card below (sample photo, prompt, demographic, garment type). Port of
// docs/tasks/AI Studio Effects.html; data + rules live in lib/studio-effects.ts.

import {
  AUD_LABEL,
  type Aud,
  CLS,
  type Cls,
  FRAME,
  HALF,
  LIGHT,
  type LightId,
  MODEL_TILES,
  type Mode,
  POSE,
  PRES,
  PRESETS,
  type Preset,
  SAMPLES,
  type Sample,
  composePrompt,
  fits,
  poseOrPres,
  recommend,
} from '@/lib/studio-effects';
import { Sparkles, X } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

export type UseEffectArgs = { prompt: string; aud: Aud; cls: Cls; sample: Sample | null };

const IMG = '/effect-photos';
// ponytail: uploaded outputs live in this browser's localStorage (~720px jpeg);
// the permanent home is public/effect-photos/previews/<CODE>.jpg.
const saved = (code: string): string | null => {
  try {
    return localStorage.getItem(`fx:${code}`);
  } catch {
    return null;
  }
};

function Photo({ src, alt, label }: { src: string; alt: string; label: string }) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-2 text-center text-[10px] text-gray-400">
        no photo yet
        <br />
        {label}
      </div>
    );
  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      sizes="200px"
      className="object-cover"
      onError={() => setBroken(true)}
    />
  );
}

const Chip = ({ children, tone = '' }: { children: React.ReactNode; tone?: string }) => (
  <span
    className={`rounded-full border px-2 py-0.5 text-[10px] ${tone || 'border-violet-200 bg-violet-50 text-violet-700'}`}
  >
    {children}
  </span>
);

export default function EffectsCatalog({ onUse }: { onUse: (a: UseEffectArgs) => void }) {
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState<Sample>(SAMPLES[0] as Sample);
  const [aud, setAud] = useState<Aud>(SAMPLES[0]?.aud ?? 'womens');
  const [cls, setCls] = useState<Cls>(SAMPLES[0]?.cls ?? 'kurti');
  const [mode, setMode] = useState<Mode>('model');
  const [env, setEnv] = useState<'all' | 'indoor' | 'outdoor'>('all');
  const [senior, setSenior] = useState(false);
  const [cur, setCur] = useState<Preset | null>(null);
  const [po, setPo] = useState<string>('');
  const [li, setLi] = useState<LightId>('softbox');
  const [, bump] = useState(0); // re-render after an upload

  const pool = PRESETS.filter(
    (p) => p.mode === mode && fits(p, cls, aud) && (env === 'all' || p.env === env),
  );
  const rec = recommend(pool, cls);
  const hasSenior = MODEL_TILES.some((m) => m.aud === aud && m.senior);
  const models = MODEL_TILES.filter((m) => m.aud === aud && m.senior === (senior && hasSenior));
  const isWorn = sample.aud === aud && sample.cls === cls && sample.worn;

  const pickSample = (s: Sample) => {
    setSample(s);
    setAud(s.aud);
    setCls(s.cls);
    if (s.cls === 'unstitched') setMode('product');
  };
  const manual = (a: Aud, c: Cls) => {
    setAud(a);
    setCls(c);
    setSample(SAMPLES.find((s) => s.aud === a && s.cls === c) ?? sample);
  };
  const openEffect = (p: Preset) => {
    setCur(p);
    setPo(p.po);
    setLi(p.li);
  };
  const promptFor = (p: Preset) =>
    composePrompt(p, { cls, aud, senior: senior && hasSenior, po: po || p.po, li });

  const upload = (file: File | undefined, code: string) => {
    if (!file) return;
    const im = new window.Image();
    im.onload = () => {
      const r = Math.min(1, 720 / im.width);
      const c = document.createElement('canvas');
      c.width = im.width * r;
      c.height = im.height * r;
      c.getContext('2d')?.drawImage(im, 0, 0, c.width, c.height);
      try {
        localStorage.setItem(`fx:${code}`, c.toDataURL('image/jpeg', 0.8));
      } catch {
        /* storage full — keep the file-based preview */
      }
      bump((n) => n + 1);
    };
    im.src = URL.createObjectURL(file);
  };
  const clear = (code: string) => {
    try {
      localStorage.removeItem(`fx:${code}`);
    } catch {
      /* ignore */
    }
    bump((n) => n + 1);
  };

  const card = (p: Preset, star: boolean) => (
    <button
      key={`${star ? 'r' : 'g'}-${p.code}`}
      type="button"
      onClick={() => openEffect(p)}
      className={`overflow-hidden rounded-xl border bg-white text-left transition hover:shadow-md ${star ? 'border-fuchsia-400' : 'border-gray-200'}`}
    >
      <div className="relative aspect-[3/4] w-full">
        <Photo
          src={saved(p.code) ?? `${IMG}/previews/${p.code}.jpg`}
          alt={p.title}
          label={p.code}
        />
        {star && (
          <span className="absolute left-1.5 top-1.5">
            <Chip tone="border-amber-200 bg-amber-50 text-amber-700">★ recommended</Chip>
          </span>
        )}
        <span className="absolute right-1.5 top-1.5">
          <Chip tone={p.combo ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''}>
            {p.combo ? 'combo' : 'fixed'}
          </Chip>
        </span>
      </div>
      <div className="space-y-1 p-2">
        <p className="text-xs font-semibold text-gray-800">{p.title}</p>
        <div className="flex flex-wrap gap-1">
          <Chip>{p.group}</Chip>
          <Chip>{poseOrPres(p.mode, p.po)[0]}</Chip>
          <Chip>{LIGHT[p.li][0]}</Chip>
          <Chip>{FRAME[p.fr][0]}</Chip>
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200/80 bg-white/80 p-4 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 text-left"
      >
        <Sparkles size={18} className="text-violet-500" />
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">Effects catalog ({PRESETS.length})</p>
          <p className="text-xs text-gray-400">
            Pick a sample product → effects load by audience + garment → “Use in bench” fills the AI
            Studio Shoot card.
          </p>
        </div>
        <span className="text-xs text-gray-400">{open ? 'hide' : 'show'}</span>
      </button>

      {open && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* left: AI-tag simulator + model tiles */}
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-1.5">
              {SAMPLES.map((s) => (
                <button
                  key={s.f}
                  type="button"
                  title={s.label}
                  onClick={() => pickSample(s)}
                  className={`relative aspect-[3/4] overflow-hidden rounded-lg border-2 ${s.f === sample.f ? 'border-fuchsia-500' : 'border-transparent'}`}
                >
                  <Photo src={`${IMG}/products/${s.f}.jpg`} alt={s.label} label={s.f} />
                  {s.worn && (
                    <span className="absolute inset-x-0 bottom-0 bg-amber-500 text-center text-[8px] text-white">
                      worn
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label>
                Audience
                <select
                  value={aud}
                  onChange={(e) => manual(e.target.value as Aud, cls)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                >
                  {(Object.keys(AUD_LABEL) as Aud[]).map((a) => (
                    <option key={a} value={a}>
                      {AUD_LABEL[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Garment
                <select
                  value={cls}
                  onChange={(e) => manual(aud, e.target.value as Cls)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                >
                  {(Object.keys(CLS) as Cls[]).map((c) => (
                    <option key={c} value={c}>
                      {CLS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-1">
              <Chip tone="border-emerald-200 bg-emerald-50 text-emerald-700">{AUD_LABEL[aud]}</Chip>
              <Chip>{CLS[cls]}</Chip>
              <Chip tone="border-amber-200 bg-amber-50 text-amber-700">
                {HALF.has(cls)
                  ? 'half-body garment'
                  : cls === 'unstitched'
                    ? 'not wearable'
                    : 'full-body garment'}
              </Chip>
              {isWorn && (
                <Chip tone="border-amber-200 bg-amber-50 text-amber-700">
                  worn source — AI must ignore the person
                </Chip>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {models.map((m) => (
                <div key={m.f}>
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg">
                    <Photo src={`${IMG}/models/${m.f}.jpg`} alt={m.label} label={m.f} />
                  </div>
                  <p className="mt-0.5 text-center text-[10px] font-semibold text-gray-600">
                    {m.label}
                  </p>
                </div>
              ))}
            </div>
            {hasSenior && (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={senior}
                  onChange={(e) => setSenior(e.target.checked)}
                />{' '}
                Senior look (60+)
              </label>
            )}
          </div>

          {/* right: effects */}
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {(['model', 'product'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-xl px-4 py-1.5 text-xs font-bold ${mode === m ? 'bg-[#231F48] text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  {m === 'model' ? 'Model Only' : 'Product Only'}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-gray-300" />
              {(['all', 'indoor', 'outdoor'] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEnv(e)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize ${env === e ? 'bg-fuchsia-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  {e}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-gray-400">
                {pool.length} match this product
              </span>
            </div>
            {mode === 'model' && cls === 'unstitched' && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                Unstitched material can’t be worn — use Product Only.
              </p>
            )}
            {rec.length > 0 && (
              <>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  ★ Best for this product
                </p>
                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {rec.map((p) => card(p, true))}
                </div>
              </>
            )}
            {(['indoor', 'outdoor'] as const).map((e) =>
              Array.from(new Set(pool.filter((p) => p.env === e).map((p) => p.group))).map((g) => (
                <div key={`${e}-${g}`} className="mb-4">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    {e} · {g}
                  </p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                    {pool.filter((p) => p.env === e && p.group === g).map((p) => card(p, false))}
                  </div>
                </div>
              )),
            )}
            {pool.length === 0 && (
              <p className="py-8 text-center text-xs text-gray-400">
                No effects match this audience + garment.
              </p>
            )}
          </div>
        </div>
      )}

      {cur && (
        <dialog
          open
          className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center bg-black/60 p-4"
          aria-label={cur.title}
        >
          <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5">
            <button
              type="button"
              aria-label="Close"
              onClick={() => setCur(null)}
              className="absolute right-3 top-3 rounded-full bg-gray-100 p-1.5"
            >
              <X size={14} />
            </button>
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div>
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl">
                  <Photo
                    src={saved(cur.code) ?? `${IMG}/previews/${cur.code}.jpg`}
                    alt={cur.title}
                    label={cur.code}
                  />
                </div>
                <p className="mt-1 text-[10px] text-gray-400">
                  public/effect-photos/previews/{cur.code}.jpg
                </p>
                <label className="mt-2 block cursor-pointer rounded-xl bg-fuchsia-600 px-3 py-2 text-center text-xs font-bold text-white">
                  Upload output image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => upload(e.target.files?.[0], cur.code)}
                  />
                </label>
                {saved(cur.code) && (
                  <div className="mt-1 text-center text-[11px]">
                    <a
                      href={saved(cur.code) ?? ''}
                      download={`${cur.code}.jpg`}
                      className="font-semibold underline"
                    >
                      Download as {cur.code}.jpg
                    </a>
                    <button
                      type="button"
                      onClick={() => clear(cur.code)}
                      className="ml-2 text-gray-500 underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400">{cur.code}</p>
                  <h3 className="text-lg font-bold text-gray-800">{cur.title}</h3>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Chip>
                      {cur.env} · {cur.group}
                    </Chip>
                    <Chip
                      tone={cur.combo ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''}
                    >
                      {cur.combo ? 'combo — override below' : 'fixed effect'}
                    </Chip>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
                  <label>
                    {cur.mode === 'model' ? 'Pose / action' : 'Presentation'}
                    <select
                      disabled={!cur.combo}
                      value={po}
                      onChange={(e) => setPo(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                    >
                      {Object.entries(cur.mode === 'model' ? POSE : PRES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v[0]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Lighting
                    <select
                      disabled={!cur.combo}
                      value={li}
                      onChange={(e) => setLi(e.target.value as LightId)}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                    >
                      {(Object.keys(LIGHT) as LightId[]).map((k) => (
                        <option key={k} value={k}>
                          {LIGHT[k][0]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Composed prompt · {AUD_LABEL[aud]} · {CLS[cls]}
                  </p>
                  <p className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed">
                    {promptFor(cur)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onUse({
                        prompt: promptFor(cur),
                        aud,
                        cls,
                        sample: sample.cls === cls && sample.aud === aud ? sample : null,
                      });
                      setCur(null);
                    }}
                    className="rounded-xl bg-[#231F48] px-4 py-2 text-xs font-bold text-white hover:bg-fuchsia-700"
                  >
                    Use in bench
                  </button>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(promptFor(cur))}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700"
                  >
                    Copy prompt
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Fits: {cur.fit === 'all' ? 'all garments' : cur.fit.map((c) => CLS[c]).join(', ')}{' '}
                  · Audience: {cur.aud ? cur.aud.map((a) => AUD_LABEL[a]).join(', ') : 'all'}
                </p>
              </div>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
