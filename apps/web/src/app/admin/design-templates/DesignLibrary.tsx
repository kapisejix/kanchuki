'use client';

import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch';
// Admin Design Library — form + live preview editor for social design templates (D3: no canvas).
// Talks to /v1/admin/design-templates (apps/api admin-design-templates.ts). Variable / font /
// format lists come from @kanchuki/shared so the editor cannot offer what the server rejects.
import {
  DESIGN_FONTS,
  DESIGN_FORMATS,
  DESIGN_IMAGE_VARS,
  DESIGN_MAX_LAYERS,
  DESIGN_MAX_PRODUCT_SLOTS,
  DESIGN_TEXT_VARS,
  type DesignFormat,
  type DesignLayer,
} from '@kanchuki/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const BASE = `${API_URL}/v1/admin/design-templates`;
const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const;
type Status = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';

type Design = {
  id: string;
  name: string;
  description: string | null;
  status: Status;
  plans: string[];
  occasion: string | null;
  ai_prompt: string | null;
  format: DesignFormat;
  product_slots: number;
  spec: { layers: DesignLayer[] };
  background_key: string | null;
  background_url: string | null;
  sort_order: number;
  usage_count: number;
};

type Draft = {
  id: string | null;
  name: string;
  occasion: string;
  ai_prompt: string;
  format: DesignFormat;
  product_slots: number;
  plans: string[];
  layers: DesignLayer[];
  background_key: string | null;
};

const blank = (): Draft => ({
  id: null,
  name: '',
  occasion: '',
  ai_prompt: '',
  format: 'PORTRAIT_4_5',
  product_slots: 1,
  plans: [...PLANS],
  layers: [
    { type: 'text', var: 'shop_name', x: 60, y: 60, size: 56, font: 'serif', color: '#000000' },
  ],
  background_key: null,
});

const STATUS_STYLE: Record<Status, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PUBLISHED: 'bg-green-100 text-green-800',
  HIDDEN: 'bg-amber-100 text-amber-800',
};

async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const j = await res.json();
    return j?.error?.message ?? j?.message ?? fallback;
  } catch {
    return fallback;
  }
}

const num = (v: string, fallback: number) => (v.trim() === '' || Number.isNaN(+v) ? fallback : +v);

const INPUT = 'w-full rounded border border-gray-300 px-2 py-1 text-sm';
const LABEL = 'block text-xs font-medium text-gray-600';

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function DesignLibrary() {
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState('');
  const previewSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(BASE, adminGetOptions());
      if (!res.ok) throw new Error(await apiError(res, `Failed to load designs (${res.status})`));
      setDesigns((await res.json()).data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live preview: debounce edits, drop out-of-order responses.
  useEffect(() => {
    if (!draft) return;
    const seq = ++previewSeq.current;
    const t = setTimeout(async () => {
      try {
        const opts = await adminMutateOptions();
        const res = await fetch(`${BASE}/preview`, {
          ...opts,
          method: 'POST',
          body: JSON.stringify({
            format: draft.format,
            product_slots: draft.product_slots,
            spec: { layers: draft.layers },
            background_key: draft.background_key,
          }),
        });
        if (seq !== previewSeq.current) return;
        if (!res.ok) {
          setPreviewError(await apiError(res, 'Preview failed'));
          return;
        }
        setPreviewError('');
        setPreview((await res.json()).data.image);
      } catch (e) {
        if (seq === previewSeq.current)
          setPreviewError(e instanceof Error ? e.message : 'Preview failed');
      }
    }, 500);
    return () => clearTimeout(t);
  }, [draft]);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchLayer = (i: number, p: Record<string, unknown>) =>
    setDraft((d) =>
      d
        ? { ...d, layers: d.layers.map((l, n) => (n === i ? ({ ...l, ...p } as DesignLayer) : l)) }
        : d,
    );
  const swap = (i: number, j: number) =>
    setDraft((d) => {
      if (!d) return d;
      const a = [...d.layers];
      [a[i], a[j]] = [a[j] as DesignLayer, a[i] as DesignLayer];
      return { ...d, layers: a };
    });

  const edit = (d: Design) => {
    setError('');
    setPreview('');
    setDraft({
      id: d.id,
      name: d.name,
      occasion: d.occasion ?? '',
      ai_prompt: d.ai_prompt ?? '',
      format: d.format,
      product_slots: d.product_slots,
      plans: d.plans,
      layers: d.spec.layers,
      background_key: d.background_key,
    });
  };

  const uploadBackground = async (file: File) => {
    setError('');
    try {
      const type = file.type;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type))
        throw new Error('Use a JPEG, PNG or WebP image');
      const opts = await adminMutateOptions();
      const res = await fetch(`${BASE}/upload-url`, {
        ...opts,
        method: 'POST',
        body: JSON.stringify({
          content_type: type,
          filename: file.name,
          content_length: file.size,
        }),
      });
      if (!res.ok) throw new Error(await apiError(res, 'Could not start upload'));
      const { upload_url, r2_key } = (await res.json()).data;
      const put = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      patch({ background_key: r2_key });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        name: draft.name,
        occasion: draft.occasion.trim() || null,
        ai_prompt: draft.ai_prompt.trim() || null,
        format: draft.format,
        product_slots: draft.product_slots,
        plans: draft.plans,
        spec: { layers: draft.layers },
        background_key: draft.background_key,
      };
      const opts = await adminMutateOptions();
      const res = await fetch(draft.id ? `${BASE}/${draft.id}` : BASE, {
        ...opts,
        method: draft.id ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await apiError(res, `Save failed (${res.status})`));
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: Status) => {
    setError('');
    try {
      const opts = await adminMutateOptions();
      const res = await fetch(`${BASE}/${id}/status`, {
        ...opts,
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await apiError(res, `Status change failed (${res.status})`));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status change failed');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!draft && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Free designs, shown to every selected plan. Hidden designs stay in the library.
            </p>
            <button
              type="button"
              onClick={() => {
                setPreview('');
                setDraft(blank());
              }}
              className="shrink-0 rounded bg-black px-3 py-1.5 text-sm font-medium text-white"
            >
              New design
            </button>
          </div>
          {designs === null ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : designs.length === 0 ? (
            <p className="text-sm text-gray-500">No designs yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {designs.map((d) => (
                <li key={d.id} className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900">
                        {d.name}
                        {d.ai_prompt && (
                          <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800">
                            AI
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {d.format.replace(/_/g, ' ')} ·{d.product_slots} product
                        {d.product_slots > 1 ? 's' : ''}
                        {d.occasion ? ` · ${d.occasion}` : ''}
                      </p>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[d.status]}`}>
                      {d.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Plans: {d.plans.length ? d.plans.join(', ') : 'none'} · used {d.usage_count}×
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => edit(d)}
                      className="rounded border px-2 py-1"
                    >
                      Edit
                    </button>
                    {d.status !== 'PUBLISHED' && (
                      <button
                        type="button"
                        onClick={() => setStatus(d.id, 'PUBLISHED')}
                        className="rounded border px-2 py-1"
                      >
                        Publish
                      </button>
                    )}
                    {d.status === 'PUBLISHED' && (
                      <button
                        type="button"
                        onClick={() => setStatus(d.id, 'HIDDEN')}
                        className="rounded border px-2 py-1"
                      >
                        Hide
                      </button>
                    )}
                    {d.status === 'HIDDEN' && (
                      <button
                        type="button"
                        onClick={() => setStatus(d.id, 'DRAFT')}
                        className="rounded border px-2 py-1"
                      >
                        Back to draft
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {draft && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="dt-name" label="Name">
                <input
                  id="dt-name"
                  className={INPUT}
                  value={draft.name}
                  maxLength={100}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </Field>
              <Field id="dt-occasion" label="Occasion (Diwali, Wedding, General…)">
                <input
                  id="dt-occasion"
                  className={INPUT}
                  value={draft.occasion}
                  maxLength={60}
                  onChange={(e) => patch({ occasion: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field id="dt-ai" label="AI scene prompt">
                  <textarea
                    id="dt-ai"
                    className={INPUT}
                    rows={3}
                    value={draft.ai_prompt}
                    maxLength={600}
                    onChange={(e) =>
                      patch({
                        ai_prompt: e.target.value,
                        ...(e.target.value.trim() ? { product_slots: 1 } : {}),
                      })
                    }
                  />
                </Field>
                <p className="text-xs text-gray-500">
                  Describe the setting and mood, and ask for empty space where the text sits. The
                  system adds the no-text and keep-garment rules itself.
                  {draft.ai_prompt.trim() && ' An AI poster holds one product, so it is set to 1.'}
                </p>
              </div>
              <Field id="dt-format" label="Format">
                <select
                  id="dt-format"
                  className={INPUT}
                  value={draft.format}
                  onChange={(e) => patch({ format: e.target.value as DesignFormat })}
                >
                  {Object.entries(DESIGN_FORMATS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k.replace(/_/g, ' ')} ({v.w}×{v.h})
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="dt-slots" label={`Products shown (1–${DESIGN_MAX_PRODUCT_SLOTS})`}>
                <input
                  id="dt-slots"
                  type="number"
                  min={1}
                  max={DESIGN_MAX_PRODUCT_SLOTS}
                  disabled={!!draft.ai_prompt.trim()}
                  className={INPUT}
                  value={draft.product_slots}
                  onChange={(e) =>
                    patch({
                      product_slots: Math.min(
                        DESIGN_MAX_PRODUCT_SLOTS,
                        Math.max(1, num(e.target.value, 1)),
                      ),
                    })
                  }
                />
              </Field>
            </div>

            <fieldset>
              <legend className={LABEL}>Plans</legend>
              <div className="flex gap-4 text-sm">
                {PLANS.map((p) => (
                  <label key={p} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={draft.plans.includes(p)}
                      onChange={(e) =>
                        patch({
                          plans: e.target.checked
                            ? [...draft.plans, p]
                            : draft.plans.filter((x) => x !== p),
                        })
                      }
                    />
                    {p}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              id="dt-bg"
              label="Background art (JPEG / PNG / WebP, ≤ 10 MB). Empty = plain white."
            >
              <input
                id="dt-bg"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadBackground(f);
                }}
              />
              {draft.background_key && (
                <button
                  type="button"
                  className="ml-2 text-xs text-red-600 underline"
                  onClick={() => patch({ background_key: null })}
                >
                  Remove
                </button>
              )}
            </Field>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">
                  Layers ({draft.layers.length}/{DESIGN_MAX_LAYERS}) — drawn top to bottom
                </h3>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    disabled={draft.layers.length >= DESIGN_MAX_LAYERS}
                    className="rounded border px-2 py-1 disabled:opacity-40"
                    onClick={() =>
                      patch({
                        layers: [
                          ...draft.layers,
                          {
                            type: 'text',
                            var: 'product_name',
                            x: 60,
                            y: 200,
                            size: 40,
                            font: 'sans',
                            color: '#000000',
                          },
                        ],
                      })
                    }
                  >
                    + Text
                  </button>
                  <button
                    type="button"
                    disabled={draft.layers.length >= DESIGN_MAX_LAYERS}
                    className="rounded border px-2 py-1 disabled:opacity-40"
                    onClick={() =>
                      patch({
                        layers: [
                          ...draft.layers,
                          {
                            type: 'image',
                            var: 'product_image',
                            x: 100,
                            y: 300,
                            w: 600,
                            h: 700,
                            fit: 'contain',
                          },
                        ],
                      })
                    }
                  >
                    + Image
                  </button>
                  <button
                    type="button"
                    disabled={draft.layers.length >= DESIGN_MAX_LAYERS}
                    className="rounded border px-2 py-1 disabled:opacity-40"
                    onClick={() =>
                      patch({
                        layers: [
                          ...draft.layers,
                          {
                            type: 'rect',
                            x: 0,
                            y: 900,
                            w: 1080,
                            h: 450,
                            color: '#000000',
                            opacity: 0.5,
                          },
                        ],
                      })
                    }
                  >
                    + Rect
                  </button>
                </div>
              </div>

              {draft.layers.map((l, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: layers have no id; order is the identity
                  key={i}
                  className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-white p-3 sm:grid-cols-4"
                >
                  <div className="col-span-2 flex items-center justify-between text-xs font-medium text-gray-700 sm:col-span-4">
                    <span>
                      {i + 1}. {l.type}
                    </span>
                    <span className="flex gap-3">
                      <button
                        type="button"
                        disabled={i === 0}
                        aria-label={`Move layer ${i + 1} up`}
                        className="disabled:opacity-30"
                        onClick={() => swap(i, i - 1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={i === draft.layers.length - 1}
                        aria-label={`Move layer ${i + 1} down`}
                        className="disabled:opacity-30"
                        onClick={() => swap(i, i + 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove layer ${i + 1}`}
                        className="text-red-600"
                        onClick={() => patch({ layers: draft.layers.filter((_, n) => n !== i) })}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                  {l.type !== 'rect' && (
                    <Field id={`l${i}-var`} label="Shows">
                      <select
                        id={`l${i}-var`}
                        className={INPUT}
                        value={l.var}
                        onChange={(e) => patchLayer(i, { var: e.target.value })}
                      >
                        {(l.type === 'text' ? DESIGN_TEXT_VARS : DESIGN_IMAGE_VARS).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {(['x', 'y'] as const).map((k) => (
                    <Field key={k} id={`l${i}-${k}`} label={k.toUpperCase()}>
                      <input
                        id={`l${i}-${k}`}
                        type="number"
                        className={INPUT}
                        value={l[k]}
                        onChange={(e) => patchLayer(i, { [k]: num(e.target.value, 0) })}
                      />
                    </Field>
                  ))}
                  {l.type !== 'rect' && (
                    <Field id={`l${i}-idx`} label="Product slot">
                      <input
                        id={`l${i}-idx`}
                        type="number"
                        min={0}
                        max={draft.product_slots - 1}
                        className={INPUT}
                        value={l.index ?? 0}
                        onChange={(e) => patchLayer(i, { index: num(e.target.value, 0) })}
                      />
                    </Field>
                  )}
                  {l.type === 'text' ? (
                    <>
                      <Field id={`l${i}-size`} label="Size">
                        <input
                          id={`l${i}-size`}
                          type="number"
                          className={INPUT}
                          value={l.size}
                          onChange={(e) => patchLayer(i, { size: num(e.target.value, 40) })}
                        />
                      </Field>
                      <Field id={`l${i}-w`} label="Wrap width">
                        <input
                          id={`l${i}-w`}
                          type="number"
                          className={INPUT}
                          placeholder="to edge"
                          value={l.w ?? ''}
                          onChange={(e) =>
                            patchLayer(i, {
                              w: e.target.value === '' ? undefined : num(e.target.value, 400),
                            })
                          }
                        />
                      </Field>
                      <Field id={`l${i}-font`} label="Font">
                        <select
                          id={`l${i}-font`}
                          className={INPUT}
                          value={l.font}
                          onChange={(e) => patchLayer(i, { font: e.target.value })}
                        >
                          {DESIGN_FONTS.map((f) => (
                            <option key={f}>{f}</option>
                          ))}
                        </select>
                      </Field>
                      <Field id={`l${i}-color`} label="Colour">
                        <input
                          id={`l${i}-color`}
                          type="color"
                          className="h-8 w-full"
                          value={l.color}
                          onChange={(e) => patchLayer(i, { color: e.target.value })}
                        />
                      </Field>
                      <Field id={`l${i}-align`} label="Align">
                        <select
                          id={`l${i}-align`}
                          className={INPUT}
                          value={l.align ?? 'left'}
                          onChange={(e) => patchLayer(i, { align: e.target.value })}
                        >
                          <option>left</option>
                          <option>center</option>
                          <option>right</option>
                        </select>
                      </Field>
                      <Field id={`l${i}-lines`} label="Max lines">
                        <input
                          id={`l${i}-lines`}
                          type="number"
                          min={1}
                          max={6}
                          className={INPUT}
                          value={l.maxLines ?? 1}
                          onChange={(e) => patchLayer(i, { maxLines: num(e.target.value, 1) })}
                        />
                      </Field>
                      <label className="flex items-end gap-1 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={!!l.bold}
                          onChange={(e) => patchLayer(i, { bold: e.target.checked })}
                        />
                        Bold
                      </label>
                      {(l.var === 'price' || l.var === 'mrp') && (
                        <label className="flex items-end gap-1 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={l.format === 'inr'}
                            onChange={(e) =>
                              patchLayer(i, { format: e.target.checked ? 'inr' : undefined })
                            }
                          />
                          Format as ₹
                        </label>
                      )}
                    </>
                  ) : (
                    <>
                      {(['w', 'h'] as const).map((k) => (
                        <Field key={k} id={`l${i}-${k}`} label={k === 'w' ? 'Width' : 'Height'}>
                          <input
                            id={`l${i}-${k}`}
                            type="number"
                            className={INPUT}
                            value={l[k]}
                            onChange={(e) => patchLayer(i, { [k]: num(e.target.value, 100) })}
                          />
                        </Field>
                      ))}
                      {l.type === 'image' ? (
                        <Field id={`l${i}-fit`} label="Fit">
                          <select
                            id={`l${i}-fit`}
                            className={INPUT}
                            value={l.fit ?? 'contain'}
                            onChange={(e) => patchLayer(i, { fit: e.target.value })}
                          >
                            <option>contain</option>
                            <option>cover</option>
                          </select>
                        </Field>
                      ) : (
                        <>
                          <Field id={`l${i}-rcolor`} label="Colour">
                            <input
                              id={`l${i}-rcolor`}
                              type="color"
                              className="h-8 w-full"
                              value={l.color}
                              onChange={(e) => patchLayer(i, { color: e.target.value })}
                            />
                          </Field>
                          <Field id={`l${i}-opacity`} label="Opacity">
                            <input
                              id={`l${i}-opacity`}
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              className={INPUT}
                              value={l.opacity}
                              onChange={(e) =>
                                patchLayer(i, {
                                  opacity: Math.min(1, Math.max(0, num(e.target.value, 1))),
                                })
                              }
                            />
                          </Field>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving || !draft.name.trim() || draft.layers.length === 0}
                onClick={save}
                className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create draft'}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded border px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>

          <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
            <h3 className="text-sm font-semibold text-gray-800">Live preview (sample data)</h3>
            {previewError && (
              <p role="alert" className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                {previewError}
              </p>
            )}
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-internal data-URL preview
              <img src={preview} alt="Design preview" className="w-full rounded border" />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center rounded border border-dashed text-xs text-gray-400">
                Rendering…
              </div>
            )}
            <p className="text-xs text-gray-500">
              Hindi text may show as boxes until the Devanagari font is added to the API image.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
