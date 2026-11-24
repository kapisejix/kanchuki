import { MY_STYLE_BODY_CONSENT } from '@kanchuki/shared';
// Spec step 2: the shopper enters their own measurements (cm, or ft/in for height).
// Shopper-only data: the card says so, saves only on a confirmed API answer, and the
// shopper can remove it in one tap.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeasurementsCard } from '../MeasurementsCard';
import { saveMeasurements, withdrawMeasurements } from '../analyze';

vi.mock('../analyze', () => ({ saveMeasurements: vi.fn(), withdrawMeasurements: vi.fn() }));
const save = vi.mocked(saveMeasurements);
const withdraw = vi.mocked(withdrawMeasurements);
const onSaved = vi.fn();

// A shopper with no saved measurements meets the consent step first; accept it by default so the
// form tests below stay about the form. The consent tests pass accept=false.
const setup = (
  initial = null as Parameters<typeof MeasurementsCard>[0]['initial'],
  accept = true,
) => {
  const r = render(<MeasurementsCard initial={initial} onSaved={onSaved} />);
  if (!initial && accept)
    fireEvent.click(screen.getByRole('button', { name: MY_STYLE_BODY_CONSENT.acceptLabel }));
  return r;
};
const type = (label: RegExp, v: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

afterEach(() => vi.clearAllMocks());

describe('MeasurementsCard', () => {
  it('says who sees it and that it can be deleted, and has no weight field', () => {
    const { container } = setup();
    const text = container.textContent!.toLowerCase();
    expect(text).toMatch(/only you/);
    expect(text).toMatch(/delete/);
    expect(screen.queryByLabelText(/weight/i)).toBeNull();
  });

  it('saves the four numbers in cm and tells the page', async () => {
    save.mockResolvedValue('ok');
    setup();
    type(/height/i, '163');
    type(/bust/i, '88');
    type(/waist/i, '72');
    type(/hip/i, '96');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }));
    });
    expect(save).toHaveBeenCalledWith({
      height_cm: 163,
      bust_cm: 88,
      waist_cm: 72,
      hip_cm: 96,
      consent_version: MY_STYLE_BODY_CONSENT.version,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('converts feet and inches to cm in one place', async () => {
    save.mockResolvedValue('ok');
    setup();
    fireEvent.click(screen.getByRole('button', { name: /ft.*in/i }));
    type(/feet/i, '5');
    type(/inches/i, '4');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }));
    });
    expect(save).toHaveBeenCalledWith({
      height_cm: 163,
      consent_version: MY_STYLE_BODY_CONSENT.version,
    });
  });

  it('refuses an out-of-range value without calling the API', async () => {
    setup();
    type(/height/i, '50');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }));
    });
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/height/i);
  });

  it('a failed save is reported and NOT shown as saved', async () => {
    save.mockResolvedValue('error');
    setup();
    type(/bust/i, '88');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }));
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/could not save/i);
  });

  it('two quick taps save once', async () => {
    save.mockResolvedValue('ok');
    setup();
    type(/bust/i, '88');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }));
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }));
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
      expect(screen.queryByLabelText(/height/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /save measurements/i })).toBeNull();
    });

    it('agreeing reveals the form; the save then carries the notice version', async () => {
      save.mockResolvedValue('ok');
      setup(null, false);
      fireEvent.click(screen.getByRole('button', { name: MY_STYLE_BODY_CONSENT.acceptLabel }));
      type(/bust/i, '88');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /save measurements/i }));
      });
      expect(save).toHaveBeenCalledWith({
        bust_cm: 88,
        consent_version: MY_STYLE_BODY_CONSENT.version,
      });
    });

    it('not now leaves the form hidden', () => {
      setup(null, false);
      fireEvent.click(screen.getByRole('button', { name: MY_STYLE_BODY_CONSENT.declineLabel }));
      expect(screen.queryByLabelText(/bust/i)).toBeNull();
    });

    it('a shopper who already has saved measurements is not asked again', () => {
      setup({ height_cm: 163, bust_cm: null, waist_cm: null, hip_cm: null });
      expect(screen.queryByText(MY_STYLE_BODY_CONSENT.title)).toBeNull();
      expect(screen.getByLabelText(/height/i)).toBeTruthy();
    });
  });
});
