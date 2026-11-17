import { DESIGN_FORMATS, type DesignFormat, parseDesignSpec } from '@kanchuki/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesignLibrary from '../DesignLibrary';

vi.mock('@/lib/admin-fetch', () => ({
  adminGetOptions: () => ({}),
  adminMutateOptions: async () => ({ headers: { 'Content-Type': 'application/json' } }),
}));

const RECT = { type: 'rect', x: 0, y: 900, w: 1080, h: 450, color: '#112233', opacity: 0.5 };
const base = {
  description: null,
  status: 'DRAFT',
  plans: ['STARTER'],
  occasion: null,
  format: 'PORTRAIT_4_5',
  product_slots: 1,
  background_key: null,
  background_url: null,
  sort_order: 0,
  usage_count: 0,
};
const DESIGNS = [
  { ...base, id: 'd1', name: 'Plain', ai_prompt: null, spec: { layers: [RECT] } },
  { ...base, id: 'd2', name: 'Poster', ai_prompt: 'a marble table', spec: { layers: [RECT] } },
];

let saved: { url: string; body: Record<string, unknown> } | null;
beforeEach(() => {
  saved = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });
      if (url.endsWith('/preview')) return ok({ image: 'data:image/png;base64,AA' });
      if (init?.method === 'PUT' || init?.method === 'POST') {
        saved = { url, body: JSON.parse(String(init.body)) };
        return ok({});
      }
      return ok(DESIGNS);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function openEdit(name: string) {
  await screen.findByText(name);
  const idx = DESIGNS.findIndex((d) => d.name === name);
  fireEvent.click(screen.getAllByText('Edit')[idx] as HTMLElement);
}

describe('DesignLibrary AI poster + rect', () => {
  it('shows the AI badge only on designs with a prompt', async () => {
    render(<DesignLibrary />);
    await screen.findByText('Poster');
    expect(screen.getAllByText('AI')).toHaveLength(1);
  });

  it('sends ai_prompt trimmed, forcing one product', async () => {
    render(<DesignLibrary />);
    await openEdit('Plain');
    fireEvent.change(screen.getByLabelText('Products shown (1–6)'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('AI scene prompt'), {
      target: { value: '  marble table, empty top  ' },
    });
    expect((screen.getByLabelText('Products shown (1–6)') as HTMLInputElement).value).toBe('1');
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved?.body.ai_prompt).toBe('marble table, empty top');
    expect(saved?.body.product_slots).toBe(1);
  });

  it('hints that product image layers are not drawn on an AI poster', async () => {
    const IMG = { type: 'image', var: 'product_image', x: 0, y: 0, w: 10, h: 10, fit: 'contain' };
    DESIGNS.push({
      ...base,
      id: 'd3',
      name: 'PosterImg',
      ai_prompt: 'x',
      spec: { layers: [IMG as never] },
    });
    try {
      render(<DesignLibrary />);
      await openEdit('PosterImg');
      expect(await screen.findByText(/product image layer is not drawn/i)).toBeTruthy();
    } finally {
      DESIGNS.pop();
    }
  });

  it('sends null when the prompt is cleared', async () => {
    render(<DesignLibrary />);
    await openEdit('Poster');
    fireEvent.change(screen.getByLabelText('AI scene prompt'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved?.body.ai_prompt).toBeNull();
  });

  it('round-trips an edited rect layer', async () => {
    render(<DesignLibrary />);
    await openEdit('Plain');
    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '0.8' } });
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved?.body.spec as { layers: unknown[] }).layers[0]).toEqual({
      ...RECT,
      h: 300,
      opacity: 0.8,
    });
  });

  it('adds a rect layer', async () => {
    render(<DesignLibrary />);
    await openEdit('Plain');
    fireEvent.click(screen.getByText('+ Rect'));
    expect(screen.getByText('2. rect')).toBeTruthy();
  });

  it.each(Object.keys(DESIGN_FORMATS) as DesignFormat[])(
    '+ Rect default fits the %s canvas',
    async (format) => {
      render(<DesignLibrary />);
      await openEdit('Plain');
      fireEvent.change(screen.getByLabelText('Format'), { target: { value: format } });
      fireEvent.click(screen.getByText('+ Rect'));
      fireEvent.click(screen.getByText('Save changes'));
      await waitFor(() => expect(saved).not.toBeNull());
      const layers = (saved?.body.spec as { layers: unknown[] }).layers;
      expect(parseDesignSpec({ layers: [layers[1]] }, format, 1).ok).toBe(true);
    },
  );

  it('saves product_slots 1 for a loaded AI design with 3 slots and clamps layer index', async () => {
    DESIGNS.push({
      ...base,
      id: 'd3',
      name: 'Legacy',
      product_slots: 3,
      ai_prompt: 'x',
      spec: {
        layers: [
          {
            type: 'text',
            var: 'product_name',
            index: 2,
            x: 0,
            y: 0,
            size: 40,
            font: 'sans',
            color: '#000000',
          },
        ],
      },
    } as never);
    render(<DesignLibrary />);
    await openEdit('Legacy');
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(saved).not.toBeNull());
    DESIGNS.pop();
    expect(saved?.body.product_slots).toBe(1);
    expect((saved?.body.spec as { layers: { index: number }[] }).layers[0]?.index).toBe(0);
  });

  it('links badge and textarea accessibility attributes', async () => {
    render(<DesignLibrary />);
    await screen.findByLabelText('AI poster');
    fireEvent.click(screen.getAllByText('Edit')[0] as HTMLElement);
    const ta = screen.getByLabelText('AI scene prompt');
    expect(document.getElementById(ta.getAttribute('aria-describedby') ?? 'none')).toBeTruthy();
  });
});
