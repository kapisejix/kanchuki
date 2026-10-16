import { describe, expect, it } from 'vitest';
import { previewCover, previewTargets } from './post-preview';

// RC-061: the composer preview said "Your store" whatever Page was selected,
// and showed no image when the post's media was a video.
describe('previewTargets', () => {
  const accounts = [
    { id: 'fb1', platform: 'FACEBOOK' as const, account_name: 'Kanchuki.App' },
    { id: 'fb2', platform: 'FACEBOOK' as const, account_name: 'Second Page' },
    { id: 'ig1', platform: 'INSTAGRAM' as const, account_name: '@kanchuki' },
  ];

  it('heads each platform card with the selected account name', () => {
    expect(previewTargets(accounts, ['fb1', 'ig1'])).toEqual([
      { platform: 'FACEBOOK', name: 'Kanchuki.App' },
      { platform: 'INSTAGRAM', name: '@kanchuki' },
    ]);
  });

  it('uses the selected account, not the first one on that platform', () => {
    expect(previewTargets(accounts, ['fb2'])).toEqual([{ platform: 'FACEBOOK', name: 'Second Page' }]);
  });

  it('no targets → no cards', () => {
    expect(previewTargets(accounts, [])).toEqual([]);
  });
});

describe('previewCover', () => {
  it('a photo shows itself', () => {
    expect(previewCover([{ kind: 'photo', url: 'p.jpg' }])).toEqual({ url: 'p.jpg', isVideo: false });
  });

  it('a video shows its poster, flagged as video', () => {
    expect(previewCover([{ kind: 'video', url: 'v.mp4', poster_url: 'p.jpg' }])).toEqual({
      url: 'p.jpg',
      isVideo: true,
    });
  });

  it('never hands an mp4 to <Image>: a video without a poster shows the empty state', () => {
    expect(previewCover([{ kind: 'video', url: 'v.mp4' }])).toBeNull();
  });

  it('no media → empty state', () => {
    expect(previewCover([])).toBeNull();
  });
});
