import React from 'react';
import { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_VIDEOS_PER_PRODUCT,
  formatElapsed,
  isKidsAudience,
  promoBlockReason,
  resolveAspect,
} from '../../src/lib/promo-video';
import { render } from '../../src/test/__mocks__/testing-library';

// ── Mocks ──────────────────────────────────────────────────────────
const api = vi.hoisted(() => ({
  startPromoVideo: vi.fn(),
  getPromoVideoStatus: vi.fn(),
  getPromoVideoStyles: vi.fn(),
}));
vi.mock('../../src/lib/api', () => ({
  productApi: api,
  ApiError: class ApiError extends Error {
    code = '';
    status = 0;
  },
}));
vi.mock('../../src/lib/polling', () => ({ pollWithBackoff: () => () => {} }));
vi.mock('../../src/lib/safe-video-player', () => ({ useSafeVideoPlayer: () => null }));
vi.mock('expo-video', () => ({ VideoView: () => null }));
vi.mock('../../src/components/ReportAiContent', () => ({ ReportAiContent: () => null }));
vi.mock('../../src/lib/meta-social', () => ({ META_SOCIAL_ENABLED: true }));

import { ProductVideoModal } from '../../src/components/product-detail/ProductVideoModal';
import { useProductPromoVideo } from '../../src/hooks/useProductPromoVideo';

// ── Tree helpers ───────────────────────────────────────────────────
type Node = { props?: Record<string, any>; children?: unknown; rendered?: unknown };
function texts(n: unknown, out: string[] = []): string[] {
  if (!n) return out;
  if (typeof n === 'string') {
    out.push(n);
    return out;
  }
  if (Array.isArray(n)) {
    for (const c of n) texts(c, out);
    return out;
  }
  if (typeof n !== 'object') return out;
  texts((n as Node).children, out);
  texts((n as Node).rendered, out);
  return out;
}
const allText = (t: ReturnType<typeof render>) => texts(t.toTree()).join(' ');
function findByLabelProp(n: unknown, prefix: string): Node | null {
  if (!n || typeof n !== 'object') return null;
  if (Array.isArray(n)) {
    for (const c of n) {
      const hit = findByLabelProp(c, prefix);
      if (hit) return hit;
    }
    return null;
  }
  const node = n as Node;
  if (typeof node.props?.label === 'string' && node.props.label.startsWith(prefix)) return node;
  return findByLabelProp(node.rendered, prefix) ?? findByLabelProp(node.children, prefix);
}

// ── Pure rules ─────────────────────────────────────────────────────
describe('promo-video rules', () => {
  it('aspect: retailer pick > style default > Reels', () => {
    expect(resolveAspect('1:1', { default_aspect: '4:5' })).toBe('1:1');
    expect(resolveAspect(null, { default_aspect: '4:5' })).toBe('4:5');
    expect(resolveAspect(null, { default_aspect: '16:9' })).toBe('9:16');
    expect(resolveAspect(null, undefined)).toBe('9:16');
  });

  const ok = {
    online: true,
    videoCount: 0,
    quota: { remaining: 2, unlimited: false },
    styleCount: 2,
  };
  it('ready when nothing blocks', () => expect(promoBlockReason(ok)).toBeNull());
  it('limit reached is flagged as a limit; unlimited never blocks', () => {
    expect(promoBlockReason({ ...ok, quota: { remaining: 0, unlimited: false } })).toEqual({
      reason: 'Video limit reached this month',
      limit: true,
    });
    expect(promoBlockReason({ ...ok, quota: { remaining: 0, unlimited: true } })).toBeNull();
  });
  it('3-video cap, no styles, offline each give a reason', () => {
    expect(promoBlockReason({ ...ok, videoCount: MAX_VIDEOS_PER_PRODUCT })?.reason).toMatch(
      /Delete one/,
    );
    expect(promoBlockReason({ ...ok, styleCount: 0 })?.reason).toMatch(/No video styles/);
    expect(promoBlockReason({ ...ok, online: false })?.reason).toBe('Internet needed');
  });
  it('elapsed clock', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(42_900)).toBe('0:42');
    expect(formatElapsed(185_000)).toBe('3:05');
  });
  it('kids audiences', () => {
    expect(isKidsAudience('GIRLS')).toBe(true);
    expect(isKidsAudience('KIDS_UNISEX')).toBe(true);
    expect(isKidsAudience('WOMEN')).toBe(false);
    expect(isKidsAudience(null)).toBe(false);
  });
});

// ── Hook ───────────────────────────────────────────────────────────
function mountHook() {
  const ref: { current: ReturnType<typeof useProductPromoVideo> | null } = { current: null };
  function Harness() {
    ref.current = useProductPromoVideo({ product: { id: 'p1' } as any, sourcePhotoId: 'ph1' });
    return null;
  }
  const t = render(<Harness />);
  return { ref, t };
}

describe('useProductPromoVideo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('two taps in one tick send one POST (RC-015/132/135 shape)', async () => {
    let resolve!: (v: unknown) => void;
    api.startPromoVideo.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { ref, t } = mountHook();
    await act(async () => {
      void ref.current!.start('slow-turn', '9:16');
      void ref.current!.start('slow-turn', '9:16');
      resolve({ data: { job_id: 'j1', status: 'processing' } });
    });
    expect(api.startPromoVideo).toHaveBeenCalledTimes(1);
    expect(api.startPromoVideo).toHaveBeenCalledWith('p1', {
      photo_id: 'ph1',
      style_slug: 'slow-turn',
      aspect: '9:16',
    });
    expect(ref.current!.status).toBe('processing');
    t.unmount();
  });

  it('a plan-limit refusal is marked as a limit (no retry offered)', async () => {
    const { ApiError } = (await import('../../src/lib/api')) as any;
    api.startPromoVideo.mockRejectedValue(
      Object.assign(new ApiError('Your plan limit for AI video has been reached.'), {
        code: 'PLAN_LIMIT_EXCEEDED',
        status: 402,
      }),
    );
    const { ref, t } = mountHook();
    await act(async () => {
      await ref.current!.start('slow-turn', '9:16');
    });
    expect(ref.current!.status).toBe('failed');
    expect(ref.current!.limitReached).toBe(true);
    t.unmount();
  });
});

// ── Modal states ───────────────────────────────────────────────────
const colors = {
  danger: '#E3262D',
  ink: { 700: '#000', 800: '#000' },
  sand: { 400: '#999', 600: '#666', 700: '#444' },
};
const base = {
  visible: true,
  onClose: vi.fn(),
  onStart: vi.fn(),
  onRetry: vi.fn(),
  onPostToSocial: vi.fn(),
  styles: [
    {
      slug: 'slow-turn',
      label: 'Slow turn',
      description: 'Gentle camera orbit',
      thumbnail_url: null,
      default_aspect: '4:5',
      duration_sec: 5,
      no_person: false,
    },
  ],
  stylesLoading: false,
  quota: { remaining: 3, unlimited: false },
  sourcePhotoUrl: 'https://cdn.example/p.jpg',
  videoCount: 0,
  online: true,
  kids: false,
  starting: false,
  status: null,
  error: null,
  limitReached: false,
  result: null,
  elapsedMs: 0,
  primaryColor: '#000',
  colors,
};

describe('ProductVideoModal', () => {
  it('picker: quota in videos, no slug, Make video uses the style default aspect', () => {
    const onStart = vi.fn();
    const t = render(<ProductVideoModal {...base} onStart={onStart} />);
    const text = allText(t);
    expect(text).toContain('3 videos left');
    expect(text).not.toContain('slow-turn');
    const btn = findByLabelProp(t.toTree(), 'Make video');
    expect(btn).toBeTruthy();
    act(() => btn!.props!.onPress());
    expect(onStart).toHaveBeenCalledWith('slow-turn', '4:5');
  });

  it('blocked: the button says why and is disabled', () => {
    const t = render(<ProductVideoModal {...base} videoCount={3} />);
    const btn = findByLabelProp(t.toTree(), 'This product has 3 videos');
    expect(btn?.props?.disabled).toBe(true);
  });

  it('kids note only for kids products', () => {
    expect(allText(render(<ProductVideoModal {...base} kids />))).toContain('product-only clips');
    expect(allText(render(<ProductVideoModal {...base} />))).not.toContain('product-only clips');
  });

  it('making: elapsed time, no percentage', () => {
    const text = allText(
      render(<ProductVideoModal {...base} status="processing" elapsedMs={42_000} />),
    );
    expect(text).toContain('0:42');
    expect(text).not.toMatch(/\d+%/);
  });

  it('failed at the limit: no Try again', () => {
    const t = render(
      <ProductVideoModal {...base} status="failed" limitReached error="Limit reached." />,
    );
    expect(allText(t)).toContain('Video limit reached');
    expect(findByLabelProp(t.toTree(), 'Try again')).toBeNull();
  });

  it('ready: honesty line + Post to social', () => {
    const t = render(
      <ProductVideoModal
        {...base}
        status="ready"
        result={{ videoId: 'v1', url: 'https://cdn.example/v.mp4' }}
      />,
    );
    expect(allText(t)).toContain('Your photo stays the main photo');
    expect(findByLabelProp(t.toTree(), 'Post to social')).toBeTruthy();
  });
});
