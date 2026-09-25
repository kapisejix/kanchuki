// The iOS-Safari keyboard inset used by fixed overlays whose input sits outside
// the scroll region (AIStylist).
//
// Four things here are load-bearing and easy to get subtly wrong:
//   1. A missing `visualViewport` (SSR, older browsers) must report 0, not
//      NaN — the overlay has to render exactly as it did before this existed.
//   2. Android Chrome already reflows for the keyboard, so `innerHeight` and
//      the visual viewport shrink together and the inset must come out 0. A
//      non-zero value there would push the panel up twice.
//   3. A pinch-zoom shrinks the visual viewport for a reason that is not the
//      keyboard, and the measurement cannot tell them apart — a zoom must not
//      move the panel.
//   4. The subscription must detach every listener it added; this hook's host
//      stays mounted on the storefront for the whole page view.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeKeyboardInset,
  readKeyboardInset,
  subscribeKeyboardInset,
  useKeyboardInset,
  type KeyboardSource,
} from '../keyboard-inset';

type Listener = () => void;

const IPHONE_14_HEIGHT = 844;
const IPHONE_14_KEYBOARD = 336;

describe('computeKeyboardInset', () => {
  it('reports 0 while the keyboard is closed', () => {
    expect(
      computeKeyboardInset(IPHONE_14_HEIGHT, { height: IPHONE_14_HEIGHT, offsetTop: 0 }),
    ).toBe(0);
  });

  it('measures the keyboard as the part of the layout viewport it hides', () => {
    expect(
      computeKeyboardInset(IPHONE_14_HEIGHT, {
        height: IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD,
        offsetTop: 0,
      }),
    ).toBe(IPHONE_14_KEYBOARD);
  });

  it('stays stable after iOS scrolls the visual viewport to reveal the input', () => {
    // Safari slides the visual viewport up (offsetTop grows) while the keyboard
    // is up. The keyboard covers the same slice of the layout viewport, so the
    // inset must not shrink just because the viewport moved.
    expect(
      computeKeyboardInset(IPHONE_14_HEIGHT, {
        height: IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD - 40,
        offsetTop: 40,
      }),
    ).toBe(IPHONE_14_KEYBOARD);
  });

  it('reports 0 on Android Chrome, where the keyboard resizes the layout viewport too', () => {
    // innerHeight is already the reduced height here, so measuring again would
    // double-count and lift the panel a keyboard's height off the bottom.
    expect(
      computeKeyboardInset(IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD, {
        height: IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD,
        offsetTop: 0,
      }),
    ).toBe(0);
  });

  it('reports 0 rather than NaN without a visual viewport (SSR, older browsers)', () => {
    expect(computeKeyboardInset(IPHONE_14_HEIGHT, null)).toBe(0);
    expect(computeKeyboardInset(IPHONE_14_HEIGHT, undefined)).toBe(0);
  });

  it('reports 0 rather than NaN on a non-numeric measurement', () => {
    expect(computeKeyboardInset(Number.NaN, { height: 500, offsetTop: 0 })).toBe(0);
    expect(computeKeyboardInset(IPHONE_14_HEIGHT, { height: Number.NaN, offsetTop: 0 })).toBe(0);
    expect(computeKeyboardInset(undefined as unknown as number, { height: 500, offsetTop: 0 })).toBe(
      0,
    );
  });

  it('clamps the mid-animation value that comes out negative', () => {
    // While the keyboard animates the visual viewport is briefly reported as
    // larger than the layout viewport. A negative padding would be invalid CSS
    // and would pull the panel off the bottom of the screen.
    expect(computeKeyboardInset(IPHONE_14_HEIGHT, { height: 900, offsetTop: 0 })).toBe(0);
  });

  it('rounds sub-pixel measurements instead of emitting a fraction', () => {
    expect(computeKeyboardInset(844, { height: 507.4, offsetTop: 0 })).toBe(337);
  });

  it('reports 0 for a pinch-zoomed viewport, which is not a keyboard', () => {
    expect(computeKeyboardInset(IPHONE_14_HEIGHT, { height: 400, offsetTop: 0, scale: 2 })).toBe(0);
    // Zoomed-out (scale < 1) is still unzoomed enough for the arithmetic to
    // hold — only zooming in makes the numbers meaningless.
    expect(
      computeKeyboardInset(IPHONE_14_HEIGHT, {
        height: IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD,
        offsetTop: 0,
        scale: 1,
      }),
    ).toBe(IPHONE_14_KEYBOARD);
  });
});

describe('readKeyboardInset', () => {
  it('reads from a window-like source and reports 0 without one', () => {
    const source: KeyboardSource = {
      innerHeight: IPHONE_14_HEIGHT,
      visualViewport: {
        height: IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD,
        offsetTop: 0,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    expect(readKeyboardInset(source)).toBe(IPHONE_14_KEYBOARD);
    expect(readKeyboardInset(null)).toBe(0);
    expect(readKeyboardInset(undefined)).toBe(0);
  });
});

/** A stand-in event target that records its listeners so the test can fire and count them. */
function fakeTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: (type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    emit: (type: string) => {
      for (const listener of Array.from(listeners.get(type) ?? [])) listener();
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

function fakeWindow(innerHeight: number, visualHeight: number) {
  const win = fakeTarget();
  const vv = fakeTarget();
  const state = { innerHeight, visualHeight, offsetTop: 0, scale: 1 };

  const source: KeyboardSource = {
    get innerHeight() {
      return state.innerHeight;
    },
    visualViewport: {
      get height() {
        return state.visualHeight;
      },
      get offsetTop() {
        return state.offsetTop;
      },
      get scale() {
        return state.scale;
      },
      addEventListener: vv.addEventListener,
      removeEventListener: vv.removeEventListener,
    },
    addEventListener: win.addEventListener,
    removeEventListener: win.removeEventListener,
  };

  return { source, win, vv, state };
}

describe('subscribeKeyboardInset', () => {
  it('reports the current inset immediately, for an overlay that mounts with the keyboard up', () => {
    const { source } = fakeWindow(IPHONE_14_HEIGHT, IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD);
    const onChange = vi.fn();

    subscribeKeyboardInset(onChange, source);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(IPHONE_14_KEYBOARD);
  });

  it('re-measures when the keyboard opens and closes', () => {
    const { source, vv, state } = fakeWindow(IPHONE_14_HEIGHT, IPHONE_14_HEIGHT);
    const seen: number[] = [];
    subscribeKeyboardInset((inset) => seen.push(inset), source);

    state.visualHeight = IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD;
    vv.emit('resize');
    state.visualHeight = IPHONE_14_HEIGHT;
    vv.emit('resize');

    expect(seen).toEqual([0, IPHONE_14_KEYBOARD, 0]);
  });

  it('re-measures when Safari scrolls the visual viewport while the keyboard is up', () => {
    const { source, vv, state } = fakeWindow(
      IPHONE_14_HEIGHT,
      IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD,
    );
    const onChange = vi.fn();
    subscribeKeyboardInset(onChange, source);

    state.visualHeight = IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD - 40;
    state.offsetTop = 40;
    vv.emit('scroll');

    expect(onChange).toHaveBeenLastCalledWith(IPHONE_14_KEYBOARD);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('re-measures on a window resize/orientation change', () => {
    const { source, win, state } = fakeWindow(IPHONE_14_HEIGHT, IPHONE_14_HEIGHT);
    const onChange = vi.fn();
    subscribeKeyboardInset(onChange, source);

    state.visualHeight = IPHONE_14_HEIGHT - IPHONE_14_KEYBOARD;
    win.emit('resize');
    expect(onChange).toHaveBeenLastCalledWith(IPHONE_14_KEYBOARD);

    win.emit('orientationchange');
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('detaches every listener it attached', () => {
    // The host of this hook stays mounted for the whole storefront page view,
    // so a listener left behind accumulates on every open/close of the sheet.
    const { source, win, vv } = fakeWindow(IPHONE_14_HEIGHT, IPHONE_14_HEIGHT);
    const unsubscribe = subscribeKeyboardInset(vi.fn(), source);

    expect(vv.count('resize')).toBe(1);
    expect(vv.count('scroll')).toBe(1);
    expect(win.count('resize')).toBe(1);
    expect(win.count('orientationchange')).toBe(1);

    unsubscribe();

    expect(vv.count('resize')).toBe(0);
    expect(vv.count('scroll')).toBe(0);
    expect(win.count('resize')).toBe(0);
    expect(win.count('orientationchange')).toBe(0);
  });

  it('does nothing without a window instead of throwing during SSR', () => {
    vi.stubGlobal('window', undefined);

    const onChange = vi.fn();
    const unsubscribe = subscribeKeyboardInset(onChange);

    expect(onChange).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

describe('useKeyboardInset', () => {
  const originalInnerHeight = window.innerHeight;

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
  });

  function installVisualViewport(innerHeight: number, visualHeight: number) {
    const vv = fakeTarget();
    const state = { innerHeight, visualHeight };
    // jsdom reports its own innerHeight (768) and has no visualViewport at all.
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: innerHeight,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: {
        get height() {
          return state.visualHeight;
        },
        offsetTop: 0,
        scale: 1,
        addEventListener: (type: string, listener: Listener) => {
          window.addEventListener(`__vv_${type}`, listener);
          vv.addEventListener(type, listener);
        },
        removeEventListener: (type: string, listener: Listener) => {
          window.removeEventListener(`__vv_${type}`, listener);
          vv.removeEventListener(type, listener);
        },
      },
    });
    return {
      vv,
      state,
      setKeyboard(open: boolean) {
        state.visualHeight = open ? state.innerHeight - IPHONE_14_KEYBOARD : state.innerHeight;
        act(() => {
          vv.emit('resize');
        });
      },
    };
  }

  it('tracks the keyboard while enabled', () => {
    const fake = installVisualViewport(IPHONE_14_HEIGHT, IPHONE_14_HEIGHT);
    const { result } = renderHook(() => useKeyboardInset(true));

    expect(result.current).toBe(0);

    fake.setKeyboard(true);
    expect(result.current).toBe(IPHONE_14_KEYBOARD);

    fake.setKeyboard(false);
    expect(result.current).toBe(0);
  });

  it('attaches nothing while disabled, so a closed sheet costs the page nothing', () => {
    const fake = installVisualViewport(IPHONE_14_HEIGHT, IPHONE_14_HEIGHT);
    const { result } = renderHook(() => useKeyboardInset(false));

    expect(result.current).toBe(0);
    expect(fake.vv.count('resize')).toBe(0);
    expect(fake.vv.count('scroll')).toBe(0);
  });

  it('detaches again when it flips from enabled to disabled', () => {
    const fake = installVisualViewport(IPHONE_14_HEIGHT, IPHONE_14_HEIGHT);
    const { rerender } = renderHook(({ enabled }) => useKeyboardInset(enabled), {
      initialProps: { enabled: true },
    });

    expect(fake.vv.count('resize')).toBe(1);

    rerender({ enabled: false });

    expect(fake.vv.count('resize')).toBe(0);
    expect(fake.vv.count('scroll')).toBe(0);
  });
});
