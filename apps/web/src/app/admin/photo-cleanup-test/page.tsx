'use client';

import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch';
import {
  PRODUCT_DEMOGRAPHICS,
  type Demographic,
} from '@kanchuki/shared';
import { motion } from 'framer-motion';
import { ArrowRight, ImageOff, Loader2, Shirt, Upload, Wand2 } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

type BackgroundImage = { id: string; name: string; image_url: string; is_active: boolean };

type RunResult = {
  id: string;
  productUrl: string;
  backgroundUrl: string;
  sampleUrl: string | null;
  resultUrl: string;
  shine: boolean;
  blur: number | null;
  ghostMannequin: boolean;
  ranAt: string;
};

type TryOnResult = {
  id: string;
  job_id: string;
  status: 'completed' | 'failed';
  result_url: string | null;
  error: string | null;
  model_url: string | null;
  product_url: string | null;
  category: string;
  duration_ms: number | null;
  ran_at: string;
};

const VTONE_CATEGORIES = [
  { value: 'tops', label: 'Tops / Kurti / Top' },
  { value: 'bottoms', label: 'Bottoms / Pants / Skirt' },
  { value: 'one-pieces', label: 'One-piece / Kurta / Dress / Suit set' },
] as const;

const DEMOGRAPHIC_LABELS: Record<string, string> = {
  womens: 'Womens',
  mens: 'Mens',
  teen_girl: 'Teen girl',
  teen_boy: 'Teen boy',
  kids_girl: 'Kids girl',
  kids_boy: 'Kids boy',
};

// ponytail: presign-then-PUT straight to R2, same pattern as the existing
// background-images admin page — no multipart parsing on the API.
async function uploadToR2(file: File): Promise<string> {
  const presign = await fetch(`${API_URL}/v1/admin/background-images/upload-url`, {
    ...(await adminMutateOptions()),
    method: 'POST',
    body: JSON.stringify({ content_type: file.type, filename: file.name }),
  });
  if (!presign.ok) throw new Error('Failed to get upload URL');
  const { data } = await presign.json();
  const put = await fetch(data.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!put.ok) throw new Error('Upload to storage failed');
  return data.public_url as string;
}

export default function PhotoCleanupTestPage() {
  const [productFile, setProductFile] = useState<File | null>(null);
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgLibrary, setBgLibrary] = useState<BackgroundImage[]>([]);
  const [bgLibraryId, setBgLibraryId] = useState<string>('');
  const [shine, setShine] = useState(true);
  const [blurMode, setBlurMode] = useState(false);
  const [blurRadius, setBlurRadius] = useState(25);
  const [ghostMannequin, setGhostMannequin] = useState(false);
  const [crop, setCrop] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<RunResult[]>([]);
  // Click-to-enlarge lightbox over a generated result image (full-size popup)
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null);

  // On-model (V-Tone) generation state
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [tryOnCategory, setTryOnCategory] = useState<(typeof VTONE_CATEGORIES)[number]['value']>('one-pieces');
  const [tryOnBusy, setTryOnBusy] = useState(false);
  const [tryOnResults, setTryOnResults] = useState<TryOnResult[]>([]);
  // Uploaded model photo URL — reused across runs so the model photo is only
  // uploaded once per session.
  const modelUrlRef = useRef<string | null>(null);
  const tryOnPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI Studio Shoot (F-032) — DB-backed styles from admin studio-styles API.
  type StudioStyleRow = {
    id: string; slug: string; label: string; description: string;
    prompt: string; tab: 'PRODUCT' | 'MODEL'; status: string;
    plans: string[]; engine: string | null; audience: string[];
    thumbnail_url: string | null; sort_order: number;
  };
  const [studioStyles, setStudioStyles] = useState<StudioStyleRow[]>([]);
  const [studioSlug, setStudioSlug] = useState<string>('');
  const [studioPrompt, setStudioPrompt] = useState<string>('');
  const [studioDemographic, setStudioDemographic] = useState<'' | Demographic>('');
  // Fetch all admin studio styles (any status — bench tests drafts).
  useEffect(() => {
    fetch(`${API_URL}/v1/admin/studio-styles`, adminGetOptions())
      .then((r) => r.json())
      .then((json) => setStudioStyles(json.data ?? []))
      .catch(() => {});
  }, []);
  const scenesForPicker = studioDemographic
    ? studioStyles.filter((s) => s.tab === 'MODEL' && (s.audience.length === 0 || s.audience.includes(studioDemographic)))
    : studioStyles;
  // If the current slug falls outside the filter, snap to the first allowed one.
  useEffect(() => {
    if (scenesForPicker.length > 0 && !scenesForPicker.some((s) => s.slug === studioSlug)) {
      setStudioSlug(scenesForPicker[0]?.slug ?? '');
    }
  }, [scenesForPicker, studioSlug]);
  const [studioBusy, setStudioBusy] = useState(false);
  const [studioResults, setStudioResults] = useState<
    { id: string; productUrl: string; resultUrl: string; label: string; ranAt: string }[]
  >([]);

  const runStudioShoot = async () => {
    if (!productFile || studioBusy) return;
    setStudioBusy(true);
    setError('');
    try {
      const productUrl = await uploadToR2(productFile);
      const res = await fetch(`${API_URL}/v1/admin/photo-cleanup/studio-shoot`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({
          product_url: productUrl,
          slug: studioSlug || undefined,
          demographic: studioDemographic || undefined,
          prompt: studioPrompt.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Studio shoot failed');
      const label = studioPrompt.trim()
        ? 'Custom prompt'
        : (studioStyles.find((s) => s.slug === (json.data.slug ?? studioSlug))?.label ??
          studioSlug);
      setStudioResults((prev) => [
        {
          id: crypto.randomUUID(),
          productUrl,
          resultUrl: json.data.result_url,
          label,
          ranAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Studio shoot failed');
    } finally {
      setStudioBusy(false);
    }
  };

  const productRef = useRef<HTMLInputElement>(null);
  const sampleRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/v1/admin/background-images`, adminGetOptions())
      .then((r) => r.json())
      .then((json) => setBgLibrary((json.data ?? []).filter((b: BackgroundImage) => b.is_active)))
      .catch(() => {});
  }, []);

  // Close the full-size popup on Escape
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const canRun = productFile && !running && (blurMode || bgFile || bgLibraryId);

  // On-model: upload the model photo lazily (once), then enqueue the V-Tone
  // job for the given garment URL and poll the ADMIN_TRYON feed for the row
  // carrying this job_id.
  const generateOnModel = async (garmentUrl: string) => {
    if (tryOnBusy) return;
    setTryOnBusy(true);
    setError('');
    // Double-click guard: a second click before the re-render lands would pass
    // the tryOnBusy check and leak the previous poll timer. Clear any
    // existing timer up front so only one poll chain can exist at a time.
    if (tryOnPollRef.current) clearTimeout(tryOnPollRef.current);
    tryOnPollRef.current = null;
    const jobId = crypto.randomUUID();
    try {
      if (!modelFile) throw new Error('Pick a model photo first');
      if (!modelUrlRef.current) {
        modelUrlRef.current = await uploadToR2(modelFile);
      }
      const res = await fetch(`${API_URL}/v1/admin/photo-cleanup/tryon`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({
          job_id: jobId,
          model_url: modelUrlRef.current,
          product_url: garmentUrl,
          category: tryOnCategory,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'On-model generation failed to enqueue');

      // Poll the results feed until a row with this job_id lands (success or
      // failure). V-Tone takes ~30-60s on CPU — use exponential backoff
      // (2s → 4s → 8s → 16s max) to reduce unnecessary load.
      let attempts = 0;
      await new Promise<void>((resolve) => {
        const poll = async () => {
          try {
            attempts += 1; // count only successful feed fetches — a flaky
            // network must not burn the whole window without polling.
            const feed = await fetch(`${API_URL}/v1/admin/photo-cleanup/tryon-results`, adminGetOptions());
            const feedJson = await feed.json();
            const rows: TryOnResult[] = feedJson?.data ?? [];
            const mine = rows.find((r) => r.job_id === jobId);
            if (mine) {
              setTryOnResults((prev) => [mine, ...prev.filter((r) => r.job_id !== jobId)]);
              tryOnPollRef.current = null;
              resolve();
              return;
            }
            if (attempts >= 36) {
              // 3 min cap — V-Tone cold-start (service autosleep) can exceed
              // this; leave the row visible as "running" via a synthetic entry.
              setTryOnResults((prev) => [
                { id: jobId, job_id: jobId, status: 'failed', result_url: null, error: 'Timed out waiting for the result — it may still be running or the V-Tone service may be cold-starting. Check the API logs.', model_url: null, product_url: garmentUrl, category: tryOnCategory, duration_ms: null, ran_at: new Date().toISOString() },
                ...prev,
              ]);
              tryOnPollRef.current = null;
              resolve();
              return;
            }
            // Exponential backoff: 2s, 4s, 8s, 16s (capped)
            const delay = Math.min(2000 * Math.pow(2, attempts - 1), 16_000);
            tryOnPollRef.current = setTimeout(poll, delay);
          } catch {
            // Transient network hiccup — keep polling with backoff
            const delay = Math.min(2000 * Math.pow(2, attempts - 1), 16_000);
            tryOnPollRef.current = setTimeout(poll, delay);
          }
        };
        // First poll fires immediately, then backs off
        void poll();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'On-model generation failed');
    } finally {
      setTryOnBusy(false);
    }
  };

  // Clear the poll timer on unmount
  useEffect(
    () =>    () => {
      if (tryOnPollRef.current) clearTimeout(tryOnPollRef.current);
    },
    [],
  );

  const run = async () => {
    if (!productFile) return;
    setRunning(true);
    setError('');
    try {
      const productUrl = await uploadToR2(productFile);
      const backgroundUrl = blurMode
        ? '' // ignored server-side in blur mode
        : bgFile
          ? await uploadToR2(bgFile)
          : (bgLibrary.find((b) => b.id === bgLibraryId)?.image_url ?? '');

      const res = await fetch(`${API_URL}/v1/admin/photo-cleanup/run`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({
          product_url: productUrl,
          background_url: backgroundUrl || productUrl, // dummy, ignored by API when blur is set
          shine,
          blur: blurMode ? blurRadius : undefined,
          ghost_mannequin: ghostMannequin,
          crop: crop ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Cleanup run failed');

      setResults((prev) => [
        {
          id: crypto.randomUUID(),
          productUrl,
          backgroundUrl: backgroundUrl || productUrl,
          sampleUrl: sampleFile ? URL.createObjectURL(sampleFile) : null,
          resultUrl: json.data.result_url,
          shine,
          blur: blurMode ? blurRadius : null,
          ghostMannequin,
          ranAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cleanup run failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-6xl"
    >
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Photo Cleanup Test</h1>
          <Wand2 size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Runs <code className="text-xs">scripts/batch-clean-photos.py</code> against an uploaded
          product photo (bg-removal + shadow + composite onto a backdrop, or portrait blur). Python
          + rembg are wired into the API container (Dockerfile) — runs are serialized so only one
          cleanup process is in memory at a time. If the API host has no Python, the run fails with
          a clear error.
        </p>
      </div>

      {error && (
        <div className="text-sm rounded-xl px-4 py-3 border bg-red-50/80 border-red-200 text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Dropzone
          label="Product photo"
          hint="the raw shot to clean"
          file={productFile}
          inputRef={productRef}
          onPick={(f) => {
            setProductFile(f);
            setCrop(null); // new photo → old crop rect is stale pixel coords
          }}
        />
        <Dropzone
          label="Sample image for output"
          hint="reference only — not sent to the script, shown next to the result for comparison"
          file={sampleFile}
          inputRef={sampleRef}
          onPick={setSampleFile}
        />
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Background image</p>
            <p className="text-xs text-gray-400">upload new or pick from the existing library</p>
          </div>
          <Dropzone
            compact
            file={bgFile}
            inputRef={bgRef}
            onPick={(f) => {
              setBgFile(f);
              setBgLibraryId('');
            }}
            disabled={blurMode}
          />
          {bgLibrary.length > 0 && (
            <select
              value={bgLibraryId}
              onChange={(e) => {
                setBgLibraryId(e.target.value);
                setBgFile(null);
              }}
              disabled={blurMode}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 disabled:opacity-40"
            >
              <option value="">— or select from library —</option>
              {bgLibrary.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {productFile && (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
          <CropPicker file={productFile} crop={crop} onChange={setCrop} />
        </div>
      )}

      {/* On-model generation — Fashion V-Tone (self-hosted, CPU, Apache 2.0) */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Shirt size={18} className="text-cyan-500" />
          <div>
            <p className="text-sm font-medium text-gray-800">Generate on model</p>
            <p className="text-xs text-gray-400">
              pick a model photo + garment type, then click the “On model” button on any cleaned
              result below — Fashion V-Tone drapes the garment onto the model (~30-60s).
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Dropzone
            compact
            label="Model photo"
            hint="full-body, front-facing, plain-ish background"
            file={modelFile}
            inputRef={modelRef}
            onPick={(f) => {
              setModelFile(f);
              modelUrlRef.current = null; // new model photo → re-upload next run
            }}
          />
          <div className="flex flex-col justify-end gap-2">
            <label htmlFor="tryon-category" className="text-xs text-gray-500">
              Garment type
            </label>
            <select
              id="tryon-category"
              value={tryOnCategory}
              onChange={(e) => setTryOnCategory(e.target.value as (typeof VTONE_CATEGORIES)[number]['value'])}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2"
            >
              {VTONE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400">
              Model photos stay in R2 for the session — uploaded once, reused for every run.
            </p>
          </div>
        </div>
      </div>

      {/* AI Studio Shoot — FLUX Kontext / Fal / Imagen cascade (F-032) */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Wand2 size={18} className="text-fuchsia-500" />
          <div>
            <p className="text-sm font-medium text-gray-800">AI Studio Shoot</p>
            <p className="text-xs text-gray-400">
              Uses the “Product photo” above. Pick a scene template (or a fashion model), then
              Generate — same <code className="text-[10px]">generateStudioImage()</code> the retailer
              app runs, synchronous here. ~10–60s.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="studio-demographic" className="text-xs text-gray-500">
              Product demographic
            </label>
            <select
              id="studio-demographic"
              value={studioDemographic}
              onChange={(e) => setStudioDemographic(e.target.value as '' | Demographic)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2"
            >
              <option value="">— any / all scenes —</option>
              {PRODUCT_DEMOGRAPHICS.map((d) => (
                <option key={d} value={d}>
                  {DEMOGRAPHIC_LABELS[d]}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400">
              Filters the scene list + tells the API which person to render.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="studio-template" className="text-xs text-gray-500">
              Scene template ({scenesForPicker.length})
            </label>
            <select
              id="studio-template"
              value={studioSlug}
              onChange={(e) => setStudioSlug(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2"
            >
              {scenesForPicker.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label} (/{s.slug}){' '}
                    {s.tab === 'PRODUCT'
                      ? '· product-only'
                      : s.audience.length > 0
                        ? `· ${s.audience.join('/')}`
                        : '· all models'}
                  </option>
                ))}
            </select>
          </div>

        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="studio-prompt" className="text-xs text-gray-500">
            Custom prompt (optional — overrides template & model; paste a formula from{' '}
            <code className="text-[10px]">AI Models and Scenes.html</code>)
          </label>
          <textarea
            id="studio-prompt"
            value={studioPrompt}
            onChange={(e) => setStudioPrompt(e.target.value)}
            rows={3}
            placeholder="Place this outfit in a high-fashion catwalk runway show with overhead spotlights…"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 font-mono"
          />
          <p className="text-[10px] text-gray-400">
            A colour-accuracy sentence is appended automatically so the garment colour stays true.
          </p>
        </div>
        <button
          onClick={runStudioShoot}
          disabled={!productFile || studioBusy}
          className="flex items-center gap-2 px-4 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
        >
          {studioBusy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          Generate studio shoot
        </button>
        {studioResults.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {studioResults.map((r) => (
              <div
                key={r.id}
                className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden"
              >
                <div className="flex items-center gap-1 p-2 bg-gray-50">
                  <button
                    type="button"
                    className="flex-1 aspect-square relative rounded-lg overflow-hidden bg-gray-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                    title="Click to enlarge"
                    onClick={() => setLightbox({ url: r.productUrl, label: 'Input' })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- R2 result URLs render reliably as a plain img; next/image was showing broken tiles here */}
                    <img src={r.productUrl} alt="input" className="absolute inset-0 w-full h-full object-cover" />
                  </button>
                  <ArrowRight size={14} className="text-gray-400 shrink-0" />
                  <button
                    type="button"
                    className="flex-1 aspect-square relative rounded-lg overflow-hidden bg-gray-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                    title="Click to enlarge"
                    onClick={() => setLightbox({ url: r.resultUrl, label: r.label })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                    <img src={r.resultUrl} alt="studio result" className="absolute inset-0 w-full h-full object-cover" />
                  </button>
                </div>
                <div className="px-3 py-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="truncate">{r.label}</span>
                  <span>{r.ranAt}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={shine} onChange={(e) => setShine(e.target.checked)} />
          Shine (contrast/highlight boost)
        </label>
        <label
          className="flex items-center gap-2 text-sm text-gray-700"
          title="Ghost mannequin fills neckline/sleeve gaps that show the plain backdrop through them, using local LaMa inpainting (no API key needed). Does NOT remove a visible mannequin neck/stand or hanger of a different color — use Crop for that. First run downloads the LaMa model, can take a few minutes"
        >
          <input
            type="checkbox"
            checked={ghostMannequin}
            onChange={(e) => {
              setGhostMannequin(e.target.checked);
              if (e.target.checked) setBlurMode(false);
            }}
          />
          Ghost mannequin
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={blurMode}
            disabled={ghostMannequin}
            onChange={(e) => setBlurMode(e.target.checked)}
          />
          Blur mode (keep own background, ignore backdrop above)
        </label>
        {blurMode && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            Blur radius
            <input
              type="number"
              min={1}
              max={100}
              value={blurRadius}
              onChange={(e) => setBlurRadius(Number(e.target.value))}
              className="w-16 border border-gray-200 rounded-lg px-2 py-1"
            />
          </label>
        )}
        <button
          onClick={run}
          disabled={!canRun}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          Run cleanup
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Results this session</h2>
        {results.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center border border-dashed border-gray-200 rounded-2xl">
            No test runs yet — pick a product photo and background above, then Run cleanup.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((r) => (
              <div
                key={r.id}
                className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden"
              >
                <div className="flex items-center gap-1 p-2 bg-gray-50">
                  <button
                    type="button"
                    className="flex-1 aspect-square relative rounded-lg overflow-hidden bg-gray-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                    title="Click to enlarge"
                    onClick={() => setLightbox({ url: r.productUrl, label: 'Before' })}
                  >
                    <Image
                      src={r.productUrl}
                      alt="before"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </button>
                  <ArrowRight size={14} className="text-gray-400 shrink-0" />
                  <button
                    type="button"
                    className="flex-1 aspect-square relative rounded-lg overflow-hidden bg-gray-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                    title="Click to enlarge"
                    onClick={() => setLightbox({ url: r.resultUrl, label: 'After' })}
                  >
                    <Image
                      src={r.resultUrl}
                      alt="after"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </button>
                  {r.sampleUrl && (
                    <>
                      <span className="text-[10px] text-gray-400 shrink-0 px-0.5">vs</span>
                      <button
                        type="button"
                        className="w-12 aspect-square relative rounded-lg overflow-hidden bg-gray-100 shrink-0 ring-1 ring-cyan-200 cursor-zoom-in hover:opacity-90 transition-opacity"
                        title="Click to enlarge"
                        onClick={() => setLightbox({ url: r.sampleUrl!, label: 'Sample target' })}
                      >
                        <Image
                          src={r.sampleUrl}
                          alt="sample target"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </button>
                    </>
                  )}
                </div>
                <div className="px-3 py-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span>
                    {r.ghostMannequin ? 'ghost mannequin + ' : ''}
                    {r.blur !== null ? `blur ${r.blur}` : 'bg composite'}
                    {r.shine ? ' + shine' : ''}
                  </span>
                  <span className="flex items-center gap-2">
                    <span>{r.ranAt}</span>
                    <button
                      type="button"
                      onClick={() => generateOnModel(r.resultUrl)}
                      disabled={tryOnBusy || !modelFile}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium disabled:opacity-40 transition-colors"
                      title={modelFile ? 'Drape this result onto the model photo' : 'Pick a model photo first'}
                    >
                      {tryOnBusy ? <Loader2 size={11} className="animate-spin" /> : <Shirt size={11} />}
                      On model
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* On-model results feed (ADMIN_TRYON audit trail) */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">On-model results this session</h2>
        {tryOnResults.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center border border-dashed border-gray-200 rounded-2xl">
            No on-model runs yet — clean a product above, pick a model photo + garment type, then
            click “On model” on the result.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tryOnResults.map((r) => (
              <div
                key={r.id}
                className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden"
              >
                {r.status === 'completed' && r.result_url ? (
                  <button
                    type="button"
                    className="aspect-square relative w-full bg-gray-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                    title="Click to enlarge"
                    onClick={() => setLightbox({ url: r.result_url as string, label: 'On-model result' })}
                  >
                    <Image src={r.result_url} alt="on-model result" fill className="object-cover" unoptimized />
                  </button>
                ) : (
                  <div className="aspect-square flex items-center justify-center bg-red-50/60 p-4">
                    <p className="text-xs text-red-600 text-center">{r.error ?? 'On-model generation failed'}</p>
                  </div>
                )}
                <div className="px-3 py-2 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {VTONE_CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}
                    {r.status === 'completed' && r.duration_ms !== null
                      ? ` · ${(r.duration_ms / 1000).toFixed(1)}s`
                      : ''}
                  </span>
                  <span>{new Date(r.ran_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full-size image popup — click any result image to open */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6">
          {/* backdrop — full-screen button so click-to-close is keyboard-accessible */}
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setLightbox(null)}
            aria-label="Close image preview"
          />
          <div className="relative max-w-full max-h-full">
            <div className="absolute -top-10 right-0 flex items-center gap-3">
              <span className="text-xs text-gray-300">{lightbox.label}</span>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-white/10 hover:bg-white/25 text-white text-sm transition-colors"
                aria-label="Close image preview"
              >
                ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- admin test tool; lightbox src may be a local object-URL that next/image can't optimize */}
            <img
              src={lightbox.url}
              alt={lightbox.label}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Drag-to-select a pixel rect on the product photo, fed to the script's
// --crop flag — isolates the subject before rembg runs, which is the fix
// the script's own docstring names for a second garment/prop or busy
// backdrop getting kept as "foreground" alongside the actual product.
function CropPicker({
  file,
  crop,
  onChange,
}: {
  file: File;
  crop: { x1: number; y1: number; x2: number; y2: number } | null;
  onChange: (c: { x1: number; y1: number; x2: number; y2: number } | null) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [previewUrl] = useState(() => URL.createObjectURL(file));
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const toNatural = (clientX: number, clientY: number) => {
    const el = imgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const scaleX = el.naturalWidth / rect.width;
    const scaleY = el.naturalHeight / rect.height;
    return {
      x: Math.round(Math.min(Math.max(clientX - rect.left, 0), rect.width) * scaleX),
      y: Math.round(Math.min(Math.max(clientY - rect.top, 0), rect.height) * scaleY),
    };
  };

  const onDown = (e: React.MouseEvent) => {
    const p = toNatural(e.clientX, e.clientY);
    if (!p) return;
    setDragStart(p);
    setDragRect(null);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!dragStart) return;
    const p = toNatural(e.clientX, e.clientY);
    if (!p) return;
    setDragRect({
      x: Math.min(dragStart.x, p.x),
      y: Math.min(dragStart.y, p.y),
      w: Math.abs(p.x - dragStart.x),
      h: Math.abs(p.y - dragStart.y),
    });
  };
  const onUp = () => {
    if (dragRect && dragRect.w > 4 && dragRect.h > 4) {
      onChange({ x1: dragRect.x, y1: dragRect.y, x2: dragRect.x + dragRect.w, y2: dragRect.y + dragRect.h });
    }
    setDragStart(null);
    setDragRect(null);
  };

  const el = imgRef.current;
  const overlayRect = dragRect ?? (crop ? { x: crop.x1, y: crop.y1, w: crop.x2 - crop.x1, h: crop.y2 - crop.y1 } : null);
  const overlayStyle =
    overlayRect && el && el.naturalWidth > 0
      ? {
          left: `${(overlayRect.x / el.naturalWidth) * 100}%`,
          top: `${(overlayRect.y / el.naturalHeight) * 100}%`,
          width: `${(overlayRect.w / el.naturalWidth) * 100}%`,
          height: `${(overlayRect.h / el.naturalHeight) * 100}%`,
        }
      : undefined;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-800">Crop before background removal (optional)</p>
      <p className="text-xs text-gray-400">
        Drag on the photo to isolate the subject — fixes a second garment/prop or busy backdrop getting
        kept as “foreground” by mistake.
      </p>
      <div
        className="relative inline-block max-w-full cursor-crosshair select-none"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={() => setDragStart(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- natural pixel size drives crop math, next/image doesn't expose that directly */}
        <img
          ref={imgRef}
          src={previewUrl}
          alt="crop target"
          draggable={false}
          className="max-w-full max-h-64 block rounded-lg border border-gray-200"
        />
        {overlayStyle && (
          <div className="absolute border-2 border-cyan-400 bg-cyan-400/20 pointer-events-none" style={overlayStyle} />
        )}
      </div>
      {crop && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-cyan-600 hover:underline"
        >
          Clear crop ({crop.x1},{crop.y1} → {crop.x2},{crop.y2})
        </button>
      )}
    </div>
  );
}

function Dropzone({
  label,
  hint,
  file,
  inputRef,
  onPick,
  compact,
  disabled,
}: {
  label?: string;
  hint?: string;
  file: File | null;
  // Plain structural ref shape, NOT `React.RefObject<HTMLInputElement>` (the
  // literal instantiation fails to assign from `useRef<HTMLInputElement>(null)`
  // under React 19 types, which the Railway Linux build hoists from the
  // Expo/mobile workspace) and NOT `React.Ref<HTMLInputElement>` (admits
  // callback refs with no `.current`). Both @types/react versions resolve
  // RefObject<HTMLInputElement> and RefObject<HTMLInputElement | null> to
  // this exact `{ readonly current: HTMLInputElement | null }` shape, so a
  // structural type accepts either — this mismatch failed `next build`'s
  // type-check on every web deploy since the page landed (deploy 7b58b78e).
  inputRef: { readonly current: HTMLInputElement | null };
  onPick: (f: File) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const previewUrl = file ? URL.createObjectURL(file) : null;
  return (
    <div
      className={
        compact
          ? ''
          : 'bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 space-y-3'
      }
    >
      {label && (
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          {hint && <p className="text-xs text-gray-400">{hint}</p>}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onPick(f);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={`w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-cyan-400 hover:text-cyan-600 transition-colors disabled:opacity-40 ${
          compact ? 'h-20' : 'h-32'
        } relative overflow-hidden`}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={label ?? 'preview'}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <>
            <Upload size={16} />
            Choose file
          </>
        )}
      </button>
      {!file && !compact && (
        <p className="text-[10px] text-gray-300 flex items-center gap-1">
          <ImageOff size={10} /> nothing selected
        </p>
      )}
    </div>
  );
}
