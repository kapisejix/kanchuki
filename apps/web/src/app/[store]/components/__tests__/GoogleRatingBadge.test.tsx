import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoogleRatingBadge } from '../GoogleRatingBadge';

const OK = {
  rating: 4.6,
  count: 123,
  url: 'https://www.google.com/maps/search/?api=1&query=Google&query_place_id=ChIJabc',
};

describe('GoogleRatingBadge', () => {
  it('shows the rating and review count labelled as Google', () => {
    render(<GoogleRatingBadge google={OK} />);
    const link = screen.getByRole('link');
    expect(link.textContent).toContain('4.6');
    expect(link.textContent).toContain('123');
    expect(link.textContent).toContain('Google');
    expect(link.getAttribute('aria-label')).toBe('Rated 4.6 out of 5 on Google, 123 reviews');
  });

  it('opens Google in a new tab without leaking the opener', () => {
    render(<GoogleRatingBadge google={OK} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(OK.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('renders nothing when there is no rating (never a fake 0 or a placeholder)', () => {
    const a = render(<GoogleRatingBadge google={null} />);
    expect(a.container.innerHTML).toBe('');
    const b = render(<GoogleRatingBadge />);
    expect(b.container.innerHTML).toBe('');
  });

  it('refuses a link that is not a Google Maps https URL', () => {
    for (const url of [
      'javascript:alert(1)',
      'http://www.google.com/maps/x',
      'https://evil.example/maps/',
    ]) {
      const { container } = render(<GoogleRatingBadge google={{ ...OK, url }} />);
      expect(container.innerHTML, url).toBe('');
    }
  });

  it('one review reads as singular', () => {
    render(<GoogleRatingBadge google={{ ...OK, count: 1 }} />);
    expect(screen.getByRole('link').getAttribute('aria-label')).toContain('1 review');
    expect(screen.getByRole('link').getAttribute('aria-label')).not.toContain('1 reviews');
  });
});
