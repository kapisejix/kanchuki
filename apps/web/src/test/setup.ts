import '@testing-library/jest-dom/vitest';

// Node >= 25 ships a built-in localStorage/sessionStorage global that is unusable
// without --localstorage-file and shadows jsdom's (localStorage.clear is undefined).
// Put jsdom's back when the global is broken. No-op on Node 20/22 (CI).
declare const jsdom: { window: Record<string, unknown> } | undefined;
if (typeof globalThis.localStorage?.clear !== 'function' && jsdom) {
  // Storage too: tests spy on Storage.prototype, which must be jsdom's class.
  for (const name of ['localStorage', 'sessionStorage', 'Storage']) {
    Object.defineProperty(globalThis, name, { value: jsdom.window[name], configurable: true });
  }
}
