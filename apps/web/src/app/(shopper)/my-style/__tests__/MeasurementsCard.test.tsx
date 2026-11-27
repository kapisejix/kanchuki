import { MY_STYLE_BODY_CONSENT } from '@kanchuki/shared';
// Spec step 2 + B2: the shopper picks a usual size first, then (optionally) enters their own
// measurements in inches (ft/in for height). Stored in cm. Shopper-only data: the card says so,
// saves only on a confirmed API answer, and the shopper can remove it in one tap.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeasurementsCard } from '../MeasurementsCard';
import { saveMeasurements, withdrawMeasurements } from '../analyze';

vi.mock('../analyze', () => ({ saveMeasurements: vi.fn(), withdrawMeasurements: vi.fn() }));
const save = vi.mocked(saveMeasurements);
const withdraw = vi.mocked(withdrawMeasurements);
const onSaved = vi.fn();
type Initial = Parameters<typeof MeasurementsCard>[0]['initial'];

// A shopper with no saved measurements meets the consent step first; accept it by default so the
// form tests below stay about the form. The consent tests pass accept=false.
const setup = (initial = null as Initial, accept = true) => {
  const r = render(<MeasurementsCard initial={initial} onSaved={onSaved} />);
  if (!initial && accept)
    fireEvent.click(screen.getByRole('button', { name: MY_STYLE_BODY_CONSENT.acceptLabel }));
  return r;
};
const type = (label: RegExp, v: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
const saveBtn = () => screen.getByRole('button', { name: /save measurements/i });
const V = MY_STYLE_BODY_CONSENT.version;

afterEach(() => vi.clearAllMocks());

describe('MeasurementsCard', () => {
  it('says who sees it and that it can be deleted, and has no weight field', () => {
    const { container } = setup();
    const text = container.textContent!.toLowerCase();
    expect(text).toMatch(/only you/);
    expect(text).toMatch(/delete/);
    expect(screen.queryByLabelText(/weight/i)).toBeNull();
  });

  it('takes height in ft/in and bust / waist / hip in inches, and saves cm', async () => {
    save.mockResolvedValue('ok');
    setup();
    type(/height feet/i, '5');
    type(/height inches/i, '4');
    type(/bust \/ chest \(inches\)/i, '34.5');
    type(/waist \(inches\)/i, '28');
    type(/hip \(inches\)/i, '38');
    await act(async () => {
      fireEvent.click(saveBtn());
    });
    expect(save).toHaveBeenCalledWith({
      height_cm: 163,
      bust_cm: 88,
      waist_cm: 71,
      hip_cm: 97,
      consent_version: V,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('height can still be typed in cm', async () => {
    save.mockResolvedValue('ok');
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Use cm' }));
    type(/height \(cm\)/i, '163');
    await act(async () => {
      fireEvent.click(saveBtn());
    });
    expect(save).toHaveBeenCalledWith({ height_cm: 163, consent_version: V });
  });

  it('shows saved cm back in inches and ft/in', () => {
    setup({ height_cm: 163, bust_cm: 86, waist_cm: null, hip_cm: null });
    expect((screen.getByLabelText(/bust \/ chest/i) as HTMLInputElement).value).toBe('34');
    expect((screen.getByLabelText(/height feet/i) as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText(/height inches/i) as HTMLInputElement).value).toBe('4');
  });

  it.each([
    ['out of range', '10'],
    ['not a number', 'abc'],
  ])('refuses a bust %s in inches without calling the API', async (_n, v) => {
    setup();
    type(/bust \/ chest/i, v);
    await act(async () => {
      fireEvent.click(saveBtn());
    });
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/bust.*inches/i);
  });

  it('a failed save is reported and NOT shown as saved', async () => {
    save.mockResolvedValue('error');
    setup();
    type(/bust \/ chest/i, '34');
    await act(async () => {
      fireEvent.click(saveBtn());
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/could not save/i);
  });

  it('two quick taps save once', async () => {
    save.mockResolvedValue('ok');
    setup();
    type(/bust \/ chest/i, '34');
    await act(async () => {
      fireEvent.click(saveBtn());
      fireEvent.click(saveBtn());
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('remove withdraws the consent and deletes the numbers, and tells the page', async () => {
    withdraw.mockResolvedValue('ok');
    setup({
      height_cm: 163,
      bust_cm: 88,
      waist_cm: 72,
      hip_cm: 96,
      saved_at: '2026-11-12T10:00:00Z',
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /remove my measurements/i }));
    });
    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('a failed remove is reported and NOT shown as removed', async () => {
    withdraw.mockResolvedValue('error');
    setup({ height_cm: 163, bust_cm: null, waist_cm: null, hip_cm: null });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /remove my measurements/i }));
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/could not remove/i);
  });

  describe('separate consent step', () => {
    it('shows the measurements notice first and no input fields until the shopper agrees', () => {
      setup(null, false);
      expect(screen.getByText(MY_STYLE_BODY_CONSENT.title)).toBeTruthy();
      expect(screen.getByText(MY_STYLE_BODY_CONSENT.intro)).toBeTruthy();
      expect(screen.queryByLabelText(/height feet/i)).toBeNull();
      expect(screen.queryByRole('radio')).toBeNull();
      expect(screen.queryByRole('button', { name: /save measurements/i })).toBeNull();
    });

    it('agreeing reveals the form; the save then carries the notice version', async () => {
      save.mockResolvedValue('ok');
      setup(null, false);
      fireEvent.click(screen.getByRole('button', { name: MY_STYLE_BODY_CONSENT.acceptLabel }));
      type(/bust \/ chest/i, '34.5');
      await act(async () => {
        fireEvent.click(saveBtn());
      });
      expect(save).toHaveBeenCalledWith({ bust_cm: 88, consent_version: V });
    });

    it('not now leaves the form hidden', () => {
      setup(null, false);
      fireEvent.click(screen.getByRole('button', { name: MY_STYLE_BODY_CONSENT.declineLabel }));
      expect(screen.queryByLabelText(/bust \/ chest/i)).toBeNull();
    });

    it('a shopper who already has saved measurements is not asked again', () => {
      setup({ height_cm: 163, bust_cm: null, waist_cm: null, hip_cm: null });
      expect(screen.queryByText(MY_STYLE_BODY_CONSENT.title)).toBeNull();
      expect(screen.getByLabelText(/height feet/i)).toBeTruthy();
    });
  });
});

describe('MeasurementsCard: usual size first (B2)', () => {
  const usualOnly = {
    height_cm: null,
    bust_cm: null,
    waist_cm: null,
    hip_cm: null,
    usual_size: 'M',
    saved_at: null,
  } as Initial;

  it('a saved usual size skips the consent step and is shown checked', () => {
    setup(usualOnly);
    expect(screen.queryByText(MY_STYLE_BODY_CONSENT.title)).toBeNull();
    expect((screen.getByRole('radio', { name: 'M' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'L' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', { name: /remove my measurements/i })).toBeTruthy();
  });

  it('offers XS to 4XL only', () => {
    setup();
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual([
      'XS',
      'S',
      'M',
      'L',
      'XL',
      'XXL',
      'XXXL',
      '4XL',
    ]);
  });

  it('picks and saves a usual size with the notice version', async () => {
    save.mockResolvedValue('ok');
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'L' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save my size' }));
    });
    expect(save).toHaveBeenCalledWith({ usual_size: 'L', consent_version: V });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('clears a saved usual size', async () => {
    save.mockResolvedValue('ok');
    setup(usualOnly);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear my size' }));
    });
    expect(save).toHaveBeenCalledWith({ usual_size: null, consent_version: V });
  });

  it('comes before the custom measurements', () => {
    const { container } = setup();
    const text = container.textContent!;
    expect(text.indexOf('Your usual size')).toBeGreaterThan(-1);
    expect(text.indexOf('Your usual size')).toBeLessThan(text.indexOf('Custom measurements'));
  });

  it('custom measurements start folded for a usual-size-only shopper, open otherwise', () => {
    const { container, unmount } = setup(usualOnly);
    expect(container.querySelector('details[data-testid="custom"]')?.hasAttribute('open')).toBe(
      false,
    );
    unmount();
    const r2 = setup();
    expect(r2.container.querySelector('details[data-testid="custom"]')?.hasAttribute('open')).toBe(
      true,
    );
  });

  it('has no "No tape?" hand-off any more', () => {
    setup();
    expect(screen.queryByRole('button', { name: /no tape/i })).toBeNull();
  });
});

describe('MeasurementsCard: Phase 4 payoff + guide', () => {
  const saved = {
    height_cm: null,
    bust_cm: 91,
    waist_cm: null,
    hip_cm: null,
    saved_at: '2026-11-27T00:00:00.000Z',
  } as Initial;
  const mount = (p: Partial<Parameters<typeof MeasurementsCard>[0]> = {}) =>
    render(<MeasurementsCard initial={saved} onSaved={onSaved} {...p} />);

  it('counts the products that show the shopper size', () => {
    mount({ sizeMatches: 12 });
    expect(screen.getByTestId('size-matches').textContent).toBe(
      'Your size is shown on 12 products in your feed',
    );
  });
  it('says so when no product gets a size', () => {
    mount({ sizeMatches: 0 });
    expect(screen.getByTestId('size-matches').textContent).toBe(
      'No product in your feed has a size for your measurements yet',
    );
  });
  it('counts for a usual-size-only shopper too', () => {
    mount({
      sizeMatches: 4,
      initial: { height_cm: null, bust_cm: null, waist_cm: null, hip_cm: null, usual_size: 'M' },
    });
    expect(screen.getByTestId('size-matches').textContent).toBe(
      'Your size is shown on 4 products in your feed',
    );
  });
  it('hides the counter without a number, or with only a height saved', () => {
    mount({ sizeMatches: null });
    expect(screen.queryByTestId('size-matches')).toBeNull();
    act(() => undefined);
    render(
      <MeasurementsCard
        initial={{ height_cm: 163, bust_cm: null, waist_cm: null, hip_cm: null }}
        onSaved={onSaved}
        sizeMatches={3}
      />,
    );
    expect(screen.queryByTestId('size-matches')).toBeNull();
  });
  it('shows a picture for bust, waist and hip', () => {
    mount();
    for (const name of ['Bust', 'Waist', 'Hip'])
      expect(screen.getByRole('img', { name })).toBeTruthy();
    expect(screen.getByText('Measure over light clothing, tape snug, not tight')).toBeTruthy();
  });
});
