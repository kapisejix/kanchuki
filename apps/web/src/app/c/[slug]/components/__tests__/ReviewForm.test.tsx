import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewForm } from '../StarPicker';

// RC-098: the form no longer asks for a phone; identity is the passport session cookie.

const props = {
  productName: 'Anarkali Suit',
  retailerId: 'ret1',
  productId: 'p1',
  retailerName: 'Meera Sarees',
};

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function submit() {
  fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
  fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
}

describe('ReviewForm', () => {
  it('has no phone field and sends no phone', async () => {
    const fetchMock = mockFetch(201, { routing: { action: 'none' } });
    render(<ReviewForm {...props} />);
    expect(screen.queryByLabelText(/phone/i)).toBeNull();

    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    expect(sent.phone).toBeUndefined();
    expect(sent).toMatchObject({ product_id: 'p1', rating: 5 });
  });

  it('shows a sign-in prompt on 401', async () => {
    mockFetch(401, { error: { code: 'NO_SESSION', message: 'Sign in to leave a review' } });
    render(<ReviewForm {...props} />);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in to leave a review/i);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/my-profile');
  });

  it('offers "Also post on Google" for a low rating too, plus the feedback note', async () => {
    mockFetch(201, {
      routing: {
        action: 'google_review',
        message: 'Also post on Google',
        url: 'https://search.google.com/local/writereview?placeid=PLACE',
        feedback_message: 'Tell us what went wrong.',
      },
    });
    render(<ReviewForm {...props} />);
    fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));

    const link = await screen.findByRole('link', { name: /also post on google/i });
    expect(link).toHaveAttribute(
      'href',
      'https://search.google.com/local/writereview?placeid=PLACE',
    );
    expect(screen.getByText(/tell us what went wrong/i)).toBeTruthy();
  });
});
