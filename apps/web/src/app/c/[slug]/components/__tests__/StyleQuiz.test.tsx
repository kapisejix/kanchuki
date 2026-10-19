// F-045 PR-3c: StyleQuiz sends the raw answers to the passport proxy (the API
// owns the label -> pref_* mapping) and keeps localStorage as the signed-out
// fallback and as the "quiz done" marker CollectionView reads.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleQuiz } from '../StyleQuiz';

const KEY = 'kanchuki_quiz_shop';
const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const firstOption = () =>
  screen.getAllByRole('button').find((b) => b.className.includes('rounded-full'))!;

/** Answer all 5 questions (first option each) and return the final Save button. */
function completeQuiz() {
  for (let i = 0; i < 4; i++) {
    fireEvent.click(firstOption());
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
  }
  fireEvent.click(firstOption());
  return screen.getByRole('button', { name: /Save My Style/ });
}

describe('StyleQuiz save', () => {
  it('PATCHes the raw answers to the proxy when signed in', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const onComplete = vi.fn();
    render(<StyleQuiz storeSlug="shop" onComplete={onComplete} />);

    fireEvent.click(completeQuiz());

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/passport/style-quiz');
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    // Raw labels, no client-side mapping.
    expect(JSON.parse(init.body as string)).toEqual({
      occasion: ['Daily Wear'],
      region: ['North Indian'],
      budget: ['Under ₹500'],
      fabric: ['Cotton'],
      color: ['Red / Maroon'],
    });
    // Marker CollectionView reads to hide the quiz.
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it('keeps the localStorage fallback on 401', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    render(<StyleQuiz storeSlug="shop" />);

    fireEvent.click(completeQuiz());

    await screen.findByText('Style Profile Saved!');
    expect(JSON.parse(localStorage.getItem(KEY)!).color).toEqual(['Red / Maroon']);
  });

  it('keeps the localStorage fallback on a network error (incl. AbortError)', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    render(<StyleQuiz storeSlug="shop" />);

    fireEvent.click(completeQuiz());

    // Rejection is swallowed: the success card still renders, nothing unhandled.
    await screen.findByText('Style Profile Saved!');
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it('Skip sends nothing and writes the empty marker', () => {
    const onComplete = vi.fn();
    render(<StyleQuiz storeSlug="shop" onComplete={onComplete} />);

    fireEvent.click(screen.getByText('Skip for now'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe('{}');
    expect(onComplete).toHaveBeenCalled();
  });

  it('a double click sends one request (sync ref guard, RC-015)', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<StyleQuiz storeSlug="shop" />);

    const save = completeQuiz();
    // Both clicks land before React commits a re-render.
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => resolve(new Response('{}', { status: 200 })));
  });
});
