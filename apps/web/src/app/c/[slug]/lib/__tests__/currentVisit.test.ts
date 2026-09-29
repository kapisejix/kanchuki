import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadCurrentVisitProductIds,
  recordCurrentVisitProduct,
  subscribeCurrentVisit,
} from '../currentVisit';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('current visit product IDs', () => {
  it('keeps IDs scoped by store, tab session, unique and most-recent-first', () => {
    recordCurrentVisitProduct('meera-sarees', 'p1');
    recordCurrentVisitProduct('other-store', 'p2');
    recordCurrentVisitProduct('meera-sarees', 'p1');
    recordCurrentVisitProduct('meera-sarees', 'p3');

    expect(loadCurrentVisitProductIds('meera-sarees')).toEqual(['p1', 'p3']);
    expect(loadCurrentVisitProductIds('other-store')).toEqual(['p2']);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(2);
  });

  it('bounds the current-tab history to the newest 30 product IDs', () => {
    for (let i = 0; i < 35; i += 1) recordCurrentVisitProduct('meera-sarees', `p${i}`);

    expect(loadCurrentVisitProductIds('meera-sarees')).toHaveLength(30);
    expect(loadCurrentVisitProductIds('meera-sarees')[0]).toBe('p5');
    expect(loadCurrentVisitProductIds('meera-sarees').at(-1)).toBe('p34');
  });

  it('notifies only the subscriber for the store whose visit changed', () => {
    const meeraListener = vi.fn();
    const otherListener = vi.fn();
    const unsubscribe = subscribeCurrentVisit('meera-sarees', meeraListener);
    const unsubscribeOther = subscribeCurrentVisit('other-store', otherListener);

    recordCurrentVisitProduct('meera-sarees', 'p1');

    expect(meeraListener).toHaveBeenCalledOnce();
    expect(otherListener).not.toHaveBeenCalled();
    unsubscribe();
    unsubscribeOther();
  });

  it('ignores invalid stored data and degrades when session storage is unavailable', () => {
    sessionStorage.setItem('kanchuki_current_visit_meera-sarees', '{bad json');
    expect(loadCurrentVisitProductIds('meera-sarees')).toEqual([]);

    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage disabled');
      },
    });
    expect(loadCurrentVisitProductIds('meera-sarees')).toEqual([]);
    expect(() => recordCurrentVisitProduct('meera-sarees', 'p1')).not.toThrow();
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: original });
  });
});
