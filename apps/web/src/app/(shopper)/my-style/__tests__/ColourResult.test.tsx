// Phase 1 (customer-profile-research §7.3): the swatches + plain "why" shared by the result
// screen in the sheet and the palette card. No skin or body label ever reaches the screen
// (spec 4.3): not the undertone/depth/frame words, not the raw enum values.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PaletteSwatches } from '../ColourResult';

const palette = {
  good: ['yellow', 'orange', 'green', 'olive', 'teal', 'maroon'],
  avoid: ['silver', 'grey'],
};

const group = (name: RegExp) => screen.getByRole('list', { name });

describe('PaletteSwatches', () => {
  it('splits the admin-ordered good list into Best (first 4) and Good (the rest)', () => {
    render(<PaletteSwatches undertone="warm" palette={palette} />);
    const best = within(group(/best/i)).getAllByRole('listitem');
    expect(best.map((li) => li.textContent)).toEqual(['yellow', 'orange', 'green', 'olive']);
    const good = within(group(/^good/i)).getAllByRole('listitem');
    expect(good.map((li) => li.textContent)).toEqual(['teal', 'maroon']);
    const easy = within(group(/go easy/i)).getAllByRole('listitem');
    expect(easy.map((li) => li.textContent)).toEqual(['silver', 'grey']);
  });

  it('paints each swatch and hides the dot from screen readers (the name is the text)', () => {
    const { container } = render(<PaletteSwatches undertone="warm" palette={palette} />);
    const dots = container.querySelectorAll('[data-swatch]');
    expect(dots).toHaveLength(8);
    const first = dots[0] as HTMLElement;
    expect(first.getAttribute('aria-hidden')).toBe('true');
    expect(first.getAttribute('data-swatch')).toBe('yellow');
    expect(first.style.background).not.toBe('');
  });

  it('a short good list shows no empty Good group, and no Go easy group without avoid colours', () => {
    render(<PaletteSwatches undertone="cool" palette={{ good: ['pink', 'blue'], avoid: [] }} />);
    expect(screen.queryByRole('list', { name: /^good/i })).toBeNull();
    expect(screen.queryByRole('list', { name: /go easy/i })).toBeNull();
  });

  it.each(['warm', 'cool', 'neutral'])(
    'the %s "why" is plain language with no skin or body label',
    (undertone) => {
      const { container } = render(<PaletteSwatches undertone={undertone} palette={palette} />);
      const why = screen.getByTestId('palette-why').textContent ?? '';
      expect(why.length).toBeGreaterThan(20);
      expect(container.textContent).not.toMatch(
        // The enum values themselves count as labels: "warm" names the undertone.
        /undertone|skin|depth|\bwarm\b|\bcool\b|\bneutral\b|\bfair\b|\bmedium\b|\bdeep\b|complexion|frame|petite|curvy|\btall\b|body/i,
      );
    },
  );

  it('an unknown undertone still gets a why line, never a blank', () => {
    render(<PaletteSwatches undertone="olive-ish" palette={palette} />);
    expect(screen.getByTestId('palette-why').textContent).toBeTruthy();
  });
});
