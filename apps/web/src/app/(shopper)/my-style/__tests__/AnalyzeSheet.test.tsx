// F-045 PR-7 T17: the selfie capture sheet.
//
// What matters: the file input does not exist until consent is accepted; one tap = one
// upload (RC-015); polling is capped and stops on unmount (nothing leaks); every API
// outcome becomes plain copy; the sheet adds no history entry (RC-065/RC-006).
import { type GarmentDescriptor, MY_STYLE_CONSENT } from '@kanchuki/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyzeSheet } from '../AnalyzeSheet';
import {
  clearProfile,
  confirmProfile,
  fetchProfile,
  pollAnalysis,
  prepareUpload,
  startAnalysis,
} from '../analyze';

vi.mock('../analyze', () => ({
  prepareUpload: vi.fn(),
  startAnalysis: vi.fn(),
  pollAnalysis: vi.fn(),
  fetchProfile: vi.fn(),
  clearProfile: vi.fn(),
  confirmProfile: vi.fn(),
}));

const prepare = vi.mocked(prepareUpload);
const start = vi.mocked(startAnalysis);
const poll = vi.mocked(pollAnalysis);
const readProfile = vi.mocked(fetchProfile);
const clear = vi.mocked(clearProfile);
const confirm = vi.mocked(confirmProfile);
const profile = { undertone: 'warm', depth: 'medium', frame: 'tall' } as const;

const onClose = vi.fn();
const onDone = vi.fn();

function setup() {
  return render(<AnalyzeSheet onClose={onClose} onDone={onDone} />);
}

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement | null;

async function accept() {
  fireEvent.click(screen.getByRole('button', { name: MY_STYLE_CONSENT.acceptLabel }));
}

async function pick(file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })) {
  await act(async () => {
    fireEvent.change(fileInput()!, { target: { files: [file] } });
  });
}

const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  prepare.mockResolvedValue({ photo: new Blob(['jpeg'], { type: 'image/jpeg' }), problems: [] });
  start.mockResolvedValue({ kind: 'started', jobId: 'mystyle_a' });
  poll.mockResolvedValue({ kind: 'processing' });
  // Default: the profile read fails, so the older tests see the plain fallback.
  readProfile.mockResolvedValue({ kind: 'error' });
  URL.createObjectURL = vi.fn(() => 'blob:local-preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('consent first', () => {
  it('shows the shared consent copy and renders NO file input', () => {
    const { container } = setup();
    expect(screen.getByText(MY_STYLE_CONSENT.title)).toBeTruthy();
    expect(screen.getByText(MY_STYLE_CONSENT.intro)).toBeTruthy();
    for (const p of MY_STYLE_CONSENT.points) expect(screen.getByText(p.text)).toBeTruthy();
    expect(screen.getByText(MY_STYLE_CONSENT.training)).toBeTruthy();
    expect(screen.getByRole('link', { name: /full notice/i }).getAttribute('href')).toBe(
      MY_STYLE_CONSENT.full_notice_url,
    );
    expect(container.querySelector('input')).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('decline closes without ever creating a file input', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: MY_STYLE_CONSENT.declineLabel }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fileInput()).toBeNull();
  });

  it('accepting reveals the front-camera image input', async () => {
    setup();
    await accept();
    const input = fileInput()!;
    expect(input.accept).toBe('image/*');
    expect(input.getAttribute('capture')).toBe('user');
  });

  it('also offers a gallery picker (no capture) that runs the same upload', async () => {
    setup();
    await accept();
    const gallery = screen.getByTestId('my-style-gallery-input') as HTMLInputElement;
    expect(gallery.accept).toBe('image/*');
    expect(gallery.getAttribute('capture')).toBeNull();
    const file = new File(['x'], 'g.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(gallery, { target: { files: [file] } });
    });
    expect(prepare).toHaveBeenCalledWith(file, 'selfie');
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('happy path', () => {
  it('prepares the photo, uploads once, polls, then reports done', async () => {
    setup();
    await accept();
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    await pick(file);

    expect(prepare).toHaveBeenCalledWith(file, 'selfie');
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/reading your photo/i)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();

    poll.mockResolvedValue({ kind: 'ready', profile });
    await tick(2500);

    expect(poll).toHaveBeenCalledWith('mystyle_a', expect.anything(), 'selfie');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/your palette is ready/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /see my picks/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('two change events in the same tick send ONE upload (RC-015)', async () => {
    setup();
    await accept();
    const input = fileInput()!;
    const f = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [f] } });
      fireEvent.change(input, { target: { files: [f] } });
    });
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('start failures', () => {
  it('401 shows sign-in with a return_to back to /my-style', async () => {
    start.mockResolvedValue({ kind: 'unauthorized' });
    setup();
    await accept();
    await pick();
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link.getAttribute('href')).toBe('/login?return_to=%2Fmy-style');
    expect(poll).not.toHaveBeenCalled();
  });

  it('shows the plain message and "Try again" returns to capture', async () => {
    start.mockResolvedValue({ kind: 'error', message: "You've reached this month's limit." });
    setup();
    await accept();
    await pick();
    expect(screen.getByText("You've reached this month's limit.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(fileInput()).toBeTruthy();
  });

  it('a wrong format or oversize photo names the accepted formats and never uploads', async () => {
    prepare.mockRejectedValue(new Error('unsupported'));
    setup();
    await accept();
    await pick();
    expect(screen.getByText(/JPEG, PNG, WebP or HEIC photo under 25 MB/)).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });

  it('an undecodable photo (HEIC on Chrome) says so and never uploads', async () => {
    prepare.mockRejectedValue(new Error('unreadable'));
    setup();
    await accept();
    await pick();
    expect(screen.getByText(/can.t open that photo/i)).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });

  it('after an error a second attempt is allowed (guard resets)', async () => {
    start.mockResolvedValueOnce({ kind: 'error', message: 'nope' });
    setup();
    await accept();
    await pick();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await pick();
    expect(start).toHaveBeenCalledTimes(2);
  });
});

describe('polling', () => {
  it('a failed read shows its message and offers Try again', async () => {
    poll.mockResolvedValue({ kind: 'failed', message: 'That photo is too dark.' });
    setup();
    await accept();
    await pick();
    await tick(2500);
    expect(screen.getByText('That photo is too dark.')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('a vanished job (404) is a terminal error', async () => {
    poll.mockResolvedValue({ kind: 'gone' });
    setup();
    await accept();
    await pick();
    await tick(2500);
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('a transient poll error keeps polling', async () => {
    poll.mockResolvedValueOnce({ kind: 'error' });
    setup();
    await accept();
    await pick();
    await tick(2500);
    poll.mockResolvedValue({ kind: 'ready', profile });
    await tick(2500);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a 401 mid-poll shows sign-in', async () => {
    poll.mockResolvedValue({ kind: 'unauthorized' });
    setup();
    await accept();
    await pick();
    await tick(2500);
    expect(screen.getByRole('link', { name: /sign in/i })).toBeTruthy();
  });

  it('gives up after the cap and stops polling', async () => {
    setup();
    await accept();
    await pick();
    await tick(95_000);
    expect(screen.getByText(/taking longer than usual/i)).toBeTruthy();
    const calls = poll.mock.calls.length;
    expect(calls).toBeGreaterThan(5);
    expect(calls).toBeLessThanOrEqual(40);
    await tick(30_000);
    expect(poll.mock.calls.length).toBe(calls);
  });

  it('unmounting stops polling and aborts the in-flight read', async () => {
    const { unmount } = setup();
    await accept();
    await pick();
    await tick(2500);
    const signal = poll.mock.calls[0]![1] as AbortSignal;
    const calls = poll.mock.calls.length;
    unmount();
    expect(signal.aborted).toBe(true);
    await tick(30_000);
    expect(poll.mock.calls.length).toBe(calls);
  });
});

describe('history', () => {
  it('opens and closes without touching history (one close path, RC-065/RC-006)', async () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back');
    const { unmount } = setup();
    fireEvent.click(screen.getByRole('button', { name: MY_STYLE_CONSENT.declineLabel }));
    unmount();
    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
});

describe('garment mode (find similar)', () => {
  const garment: GarmentDescriptor = {
    category: 'Kurti',
    color_family: 'yellow',
    embellishments: [],
  };
  const setupGarment = () =>
    render(<AnalyzeSheet mode="garment" onClose={onClose} onDone={onDone} />);

  it('still asks for consent first and renders no file input until accepted', () => {
    const { container } = setupGarment();
    expect(screen.getByText(MY_STYLE_CONSENT.title)).toBeTruthy();
    expect(container.querySelector('input')).toBeNull();
  });

  it('offers a gallery picker, not the front camera, with garment copy', async () => {
    setupGarment();
    await accept();
    const input = fileInput()!;
    expect(input.getAttribute('capture')).toBeNull();
    expect(input.getAttribute('data-testid')).toBe('my-style-garment-input');
    expect(screen.getByText('Pick a photo of a garment you like')).toBeTruthy();
    expect(screen.getByText(/We keep nothing from it/)).toBeTruthy();
  });

  it('uploads and polls in garment mode, then hands the descriptor to onDone', async () => {
    poll.mockResolvedValue({ kind: 'ready', garment });
    setupGarment();
    await accept();
    await pick();
    expect(start).toHaveBeenCalledWith(expect.any(Blob), expect.anything(), 'garment');
    await tick(2500);
    expect(poll).toHaveBeenCalledWith('mystyle_a', expect.anything(), 'garment');
    expect(onDone).toHaveBeenCalledWith(garment);
    expect(screen.getByText('Showing pieces like this')).toBeTruthy();
  });

  it('a selfie finish hands back no garment', async () => {
    poll.mockResolvedValue({ kind: 'ready', profile });
    setup();
    await accept();
    await pick();
    await tick(2500);
    expect(onDone).toHaveBeenCalledWith(undefined);
  });

  it('keeps the error path: a failed read shows plain copy and does not report done', async () => {
    poll.mockResolvedValue({
      kind: 'failed',
      message: 'That photo is too blurry. Please try a sharper one.',
    });
    setupGarment();
    await accept();
    await pick();
    await tick(2500);
    expect(screen.getByRole('alert').textContent).toMatch(/blurry/);
    expect(onDone).not.toHaveBeenCalled();
  });
});

// Phase 1 (customer-profile-research §7.3): a successful selfie read ends on a result screen.
describe('result screen', () => {
  const saved = {
    style_profile: {
      undertone: 'warm',
      depth: 'medium',
      frame: 'average',
      saved_at: '2026-11-26T09:34:00.000Z',
      palette: { good: ['yellow', 'orange', 'green', 'olive', 'teal'], avoid: ['grey'] },
    },
    measurements: null,
    taste: null,
  };
  const onShop = vi.fn();
  const onCleared = vi.fn();

  async function readOk() {
    readProfile.mockResolvedValue({ kind: 'ok', data: saved });
    poll.mockResolvedValue({ kind: 'ready', profile });
    render(
      <AnalyzeSheet onClose={onClose} onDone={onDone} onShop={onShop} onCleared={onCleared} />,
    );
    await accept();
    await pick();
    await tick(2500);
  }

  it('shows swatches, the why line and the photo from page memory only', async () => {
    await readOk();
    expect(screen.getByRole('heading', { name: /your colours are ready/i })).toBeTruthy();
    expect(screen.getByRole('list', { name: /best on you/i })).toBeTruthy();
    expect(screen.getByTestId('palette-why')).toBeTruthy();
    const img = screen.getByRole('img', { name: /your selfie/i }) as HTMLImageElement;
    // A local object URL of the prepared photo: nothing is uploaded or stored again for it.
    expect(img.getAttribute('src')).toBe('blob:local-preview');
    expect(URL.createObjectURL).toHaveBeenCalledWith((await prepare.mock.results[0]!.value).photo);
    expect(screen.getByText(/not kept/i)).toBeTruthy();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('never shows a skin or body label', async () => {
    await readOk();
    expect(document.body.textContent).not.toMatch(
      /undertone|skin|depth|medium|average|frame|body/i,
    );
  });

  it('the profile read is a GET with no photo (fetchProfile takes only a signal)', async () => {
    await readOk();
    expect(readProfile).toHaveBeenCalledTimes(1);
    expect(
      readProfile.mock.calls[0]!.every((a) => a === undefined || a instanceof AbortSignal),
    ).toBe(true);
  });

  it('Shop my colours hands off and closes', async () => {
    await readOk();
    fireEvent.click(screen.getByRole('button', { name: /shop my colours/i }));
    expect(onShop).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Retake goes back to capture and drops the preview', async () => {
    await readOk();
    fireEvent.click(screen.getByRole('button', { name: /retake/i }));
    expect(screen.getByTestId('my-style-selfie-input')).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
  });

  it('Delete clears on the server, reports it and closes; a failure says so and stays', async () => {
    await readOk();
    clear.mockResolvedValueOnce('error');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    });
    expect(screen.getByRole('alert').textContent).toMatch(/could not delete/i);
    expect(onCleared).not.toHaveBeenCalled();
    clear.mockResolvedValueOnce('ok');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    });
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('unmounting revokes the preview URL', async () => {
    readProfile.mockResolvedValue({ kind: 'ok', data: saved });
    poll.mockResolvedValue({ kind: 'ready', profile });
    const { unmount } = setup();
    await accept();
    await pick();
    await tick(2500);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
  });
});

describe('failure help', () => {
  it('a failed selfie read shows the fix line and the good-photo tips', async () => {
    poll.mockResolvedValue({
      kind: 'failed',
      message: 'That photo is too dark.',
      fix: 'Move near a window in daylight, or turn on a bright light.',
    });
    setup();
    await accept();
    await pick();
    await tick(2500);
    expect(screen.getByText(/move near a window/i)).toBeTruthy();
    const tips = screen.getByRole('list', { name: /good photo/i });
    expect(tips.querySelectorAll('li').length).toBeGreaterThanOrEqual(3);
  });

  it('a start error (quota, network) has no tips: a better photo would not help', async () => {
    start.mockResolvedValue({ kind: 'error', message: 'Could not send your photo.' });
    setup();
    await accept();
    await pick();
    expect(screen.queryByRole('list', { name: /good photo/i })).toBeNull();
  });
});

describe('capture copy (R6)', () => {
  it('asks for a face photo for colours and never for a full-body photo or measurements', async () => {
    setup();
    await accept();
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/face/i);
    expect(text).not.toMatch(/full.body|measure/i);
  });
});

// ─── Phase 2: guided capture, on-device check, drape test (research §7.2, D4) ─────────────

const BANNED =
  /undertone|skin|depth|\bwarm\b|\bcool\b|\bneutral\b|\bfair\b|\bmedium\b|\bdeep\b|complexion|body/i;
const problem = (code: string, blocking = true) => ({
  code: code as never,
  message: `msg ${code}`,
  fix: `fix ${code}`,
  blocking,
});

describe('how-to card (guided capture)', () => {
  it('shows what works and what to avoid before the camera opens', async () => {
    setup();
    await accept();
    const doList = screen.getByRole('list', { name: /what works/i });
    const avoid = screen.getByRole('list', { name: /avoid/i });
    expect(doList.textContent).toMatch(/window/i);
    expect(doList.textContent).toMatch(/filter/i);
    for (const bad of [
      /dark room/i,
      /sunglasses/i,
      /group photo/i,
      /beauty filter/i,
      /screenshot/i,
    ]) {
      expect(avoid.textContent).toMatch(bad);
    }
  });

  it('opens a live camera with an oval guide where the browser allows it', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    try {
      const view = setup();
      await accept();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /open camera/i }));
      });
      expect(getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ video: expect.objectContaining({ facingMode: 'user' }) }),
      );
      expect(screen.getByTestId('camera-oval')).toBeTruthy();
      expect(screen.getByRole('button', { name: /take photo/i })).toBeTruthy();
      view.unmount();
      expect(stop).toHaveBeenCalled(); // the camera light goes off with the sheet
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    }
  });
});

describe('on-device check (never uploads a failing photo)', () => {
  it('a blocking problem shows its message, fix and Retake, and uploads nothing', async () => {
    prepare.mockResolvedValue({ photo: new Blob(['j']), problems: [problem('too_dark')] });
    setup();
    await accept();
    await pick();
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByText('msg too_dark')).toBeTruthy();
    expect(screen.getByText('fix too_dark')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /use this photo/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /retake/i }));
    expect(fileInput()).toBeTruthy();
  });

  it('a warning only lets the shopper continue, and then uploads once', async () => {
    prepare.mockResolvedValue({
      photo: new Blob(['j']),
      problems: [problem('colour_cast', false)],
    });
    setup();
    await accept();
    await pick();
    expect(start).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use this photo/i }));
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('garment mode passes its mode to the check', async () => {
    render(<AnalyzeSheet onClose={onClose} onDone={onDone} mode="garment" />);
    await accept();
    await pick();
    expect(prepare).toHaveBeenCalledWith(expect.anything(), 'garment');
  });
});

describe('drape test (D4)', () => {
  const saved = {
    undertone: 'warm',
    depth: 'medium',
    frame: 'average',
    palette: { good: ['yellow', 'orange'], avoid: ['grey'] },
  };

  async function readyWith(confidence: 'high' | 'low') {
    readProfile.mockResolvedValue({
      kind: 'ok',
      data: { style_profile: saved, measurements: null, taste: null },
    });
    poll.mockResolvedValue({ kind: 'ready', profile, confidence });
    setup();
    await accept();
    await pick();
    await tick(2500);
  }
  const answer = async (n: number) => {
    for (let i = 0; i < n; i++) {
      const sides = screen.getAllByRole('button', { name: /this side/i });
      await act(async () => {
        fireEvent.click(sides[0]!);
      });
    }
  };

  it('low confidence opens the drape test with the photo between two swatches', async () => {
    await readyWith('low');
    expect(screen.getByText(/which side makes your face look brighter/i)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /this side/i })).toHaveLength(2);
    expect(screen.getByRole('img', { name: /your selfie/i })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(BANNED);
  });

  it('three answers save through confirmProfile, then show the result', async () => {
    confirm.mockResolvedValue({ kind: 'ok', profile: { ...saved, undertone: 'cool' } });
    await readyWith('low');
    await answer(3);
    expect(confirm).toHaveBeenCalledTimes(1);
    const picks = confirm.mock.calls[0]![0];
    expect(picks).toHaveLength(3);
    for (const p of picks) expect(['warm', 'cool']).toContain(p);
    expect(screen.getByRole('heading', { name: /your colours are ready/i })).toBeTruthy();
    expect(onDone).toHaveBeenCalledTimes(2); // the page refreshes after the answer too
  });

  it('a failed save says so and keeps the shopper on the test', async () => {
    confirm.mockResolvedValue({ kind: 'error' });
    await readyWith('low');
    await answer(3);
    expect(screen.getByRole('alert').textContent).toMatch(/could not save/i);
  });

  it('a cleared profile (409) sends the shopper back to retake, not to a retry that cannot work', async () => {
    confirm.mockResolvedValue({ kind: 'no_profile' });
    await readyWith('low');
    await answer(3);
    expect(screen.getByRole('alert').textContent).toMatch(/cleared/i);
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(fileInput()).toBeTruthy();
  });

  it('Skip cannot be pressed while the answer is saving', async () => {
    confirm.mockReturnValue(new Promise(() => {}));
    await readyWith('low');
    await answer(3);
    expect((screen.getByRole('button', { name: /skip/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('Skip goes to the result without saving anything', async () => {
    await readyWith('low');
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(screen.getByRole('heading', { name: /your colours are ready/i })).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('high confidence goes straight to the result, whose Adjust button opens the test', async () => {
    await readyWith('high');
    expect(screen.queryByText(/which side/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /adjust/i }));
    expect(screen.getByText(/which side makes your face look brighter/i)).toBeTruthy();
  });
});
