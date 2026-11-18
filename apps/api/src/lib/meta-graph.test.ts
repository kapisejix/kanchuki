import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IG_CAPTION_LIMIT,
  MetaApiError,
  clampIgCaption,
  fetchIgPermalink,
  instagramContainerStatus,
  publishFacebookCarousel,
  publishIgContainer,
  publishInstagramCarousel,
  publishInstagramReel,
} from './meta-graph.js';

// Create Post Composer v2 (docs/tasks/done/social-create-post-composer.md §6.2) —
// both carousel helpers are pure fetch callers, so every branch is reachable
// by queueing mocked Graph API responses. `status_code: FINISHED` responses
// keep the IN_PROGRESS poll from ever sleeping.

function mockResponse(body: Record<string, unknown>, ok = true, status = ok ? 200 : 400): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const ok = (body: Record<string, unknown>) => mockResponse(body, true, 200);
const bad = (body: Record<string, unknown>) => mockResponse(body, false, 400);

/** Encode a param the same way the helper's URLSearchParams does (space → '+'). */
const enc = (key: string, value: string) =>
  `${key}=${new URLSearchParams({ [key]: value }).toString().slice(key.length + 1)}`;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function nthUrl(n: number): string {
  const call = fetchMock.mock.calls[n];
  if (!call) throw new Error(`no fetch call at index ${n}`);
  return String(call[0]);
}

describe('publishFacebookCarousel', () => {
  const pageId = 'page_1';
  const token = 'tok_fb';
  const images = ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'];
  const caption = 'New kurtis!';

  it('uploads unpublished photos then posts with attached_media + link', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'media_1' }))
      .mockResolvedValueOnce(ok({ id: 'media_2' }))
      .mockResolvedValueOnce(ok({ id: 'post_9' }));

    const result = await publishFacebookCarousel(
      pageId,
      token,
      images,
      caption,
      'https://k.app/store/coll',
    );

    expect(result).toEqual({ postId: 'post_9' });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 1 + 2: unpublished photo uploads
    expect(nthUrl(0)).toContain(`/${pageId}/photos?access_token=${token}`);
    expect(nthUrl(0)).toContain('url=https%3A%2F%2Fcdn.test%2Fa.jpg');
    expect(nthUrl(0)).toContain('published=false');
    expect(nthUrl(1)).toContain('url=https%3A%2F%2Fcdn.test%2Fb.jpg');

    // 3: feed post with attached_media[i] JSON + link card
    const feedUrl = nthUrl(2);
    expect(feedUrl).toContain(`/${pageId}/feed?access_token=${token}`);
    expect(feedUrl).toContain(enc('message', caption));
    expect(feedUrl).toContain(
      `attached_media%5B0%5D=${encodeURIComponent(JSON.stringify({ media_fbid: 'media_1' }))}`,
    );
    expect(feedUrl).toContain(
      `attached_media%5B1%5D=${encodeURIComponent(JSON.stringify({ media_fbid: 'media_2' }))}`,
    );
    expect(feedUrl).toContain('link=https%3A%2F%2Fk.app%2Fstore%2Fcoll');
  });

  it('omits the link param when none is given', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'media_1' }))
      .mockResolvedValueOnce(ok({ id: 'post_9' }));

    await publishFacebookCarousel(pageId, token, images.slice(0, 1), caption);

    expect(nthUrl(1)).not.toContain('link=');
  });

  it('throws on empty images without calling the API', async () => {
    await expect(publishFacebookCarousel(pageId, token, [], caption)).rejects.toThrow(MetaApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws INSTAGRAM…-style failure when an unpublished photo upload is rejected', async () => {
    fetchMock.mockResolvedValueOnce(bad({ error: { message: 'nope' } }));

    await expect(publishFacebookCarousel(pageId, token, images, caption)).rejects.toThrow(
      MetaApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the feed publish is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'media_1' }))
      .mockResolvedValueOnce(ok({ id: 'media_2' }))
      .mockResolvedValueOnce(bad({ error: { message: 'denied' } }));

    await expect(publishFacebookCarousel(pageId, token, images, caption)).rejects.toThrow(
      MetaApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws when an upload succeeds but returns no id', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    await expect(publishFacebookCarousel(pageId, token, images, caption)).rejects.toThrow(
      MetaApiError,
    );
  });
});

describe('publishInstagramCarousel', () => {
  const igId = 'ig_1';
  const token = 'tok_ig';
  const images = ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'];
  const caption = 'New sarees \u2728';

  it('creates child containers, a CAROUSEL parent, publishes, and returns the permalink', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'child_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'child_2', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'parent_7', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'pub_123' }))
      .mockResolvedValueOnce(ok({ permalink: 'https://www.instagram.com/p/AbCdEf/' }));

    const result = await publishInstagramCarousel(igId, token, images, caption);

    expect(result).toEqual({ postId: 'pub_123', permalink: 'https://www.instagram.com/p/AbCdEf/' });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // 1 + 2: child containers with is_carousel_item=true
    expect(nthUrl(0)).toContain(`/${igId}/media?access_token=${token}`);
    expect(nthUrl(0)).toContain('is_carousel_item=true');
    expect(nthUrl(0)).toContain('url=https%3A%2F%2Fcdn.test%2Fa.jpg');
    expect(nthUrl(1)).toContain('url=https%3A%2F%2Fcdn.test%2Fb.jpg');
    // children carry no caption (it belongs on the parent)
    expect(nthUrl(0)).not.toContain('caption=');

    // 3: CAROUSEL parent with children + caption
    const parentUrl = nthUrl(2);
    expect(parentUrl).toContain(`/${igId}/media?access_token=${token}`);
    expect(parentUrl).toContain('media_type=CAROUSEL');
    expect(parentUrl).toContain('children=child_1%2Cchild_2');
    expect(parentUrl).toContain(enc('caption', caption));

    // 4: publish the parent
    expect(nthUrl(3)).toContain(`/${igId}/media_publish?access_token=${token}`);
    expect(nthUrl(3)).toContain('creation_id=parent_7');

    // 5: permalink fetch
    expect(nthUrl(4)).toContain(`/pub_123?access_token=${token}`);
    expect(nthUrl(4)).toContain('fields=permalink');
  });

  it('polls a container reported IN_PROGRESS until FINISHED', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'child_1', status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(ok({ id: 'child_1', status_code: 'FINISHED' })) // poll GET
      .mockResolvedValueOnce(ok({ id: 'child_2', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'parent_7', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'pub_123' }))
      .mockResolvedValueOnce(ok({ permalink: 'https://www.instagram.com/p/AbCdEf/' }));

    const result = await publishInstagramCarousel(igId, token, images, caption);

    expect(result.postId).toBe('pub_123');
    // create(1) → poll(2) → create(3) → parent(4) → publish(5) → permalink(6)
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(nthUrl(1)).toContain(`/child_1?access_token=${token}`);
    expect(nthUrl(1)).toContain('fields=status_code');
  });

  it('throws INSTAGRAM_CONTAINER_FAILED when a polled container reports ERROR', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'child_1', status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(ok({ id: 'child_1', status_code: 'ERROR' }));

    await expect(publishInstagramCarousel(igId, token, images, caption)).rejects.toThrow(
      MetaApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on empty images without calling the API', async () => {
    await expect(publishInstagramCarousel(igId, token, [], caption)).rejects.toThrow(MetaApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws INSTAGRAM_CONTAINER_FAILED when a child container is rejected', async () => {
    fetchMock.mockResolvedValueOnce(bad({ error: { message: 'bad image' } }));

    const err = await publishInstagramCarousel(igId, token, images, caption).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(MetaApiError);
    expect((err as MetaApiError).code).toBe('INSTAGRAM_CONTAINER_FAILED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws INSTAGRAM_CONTAINER_FAILED when the CAROUSEL parent is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'child_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'child_2', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(bad({ error: { message: 'too few children' } }));

    const err = await publishInstagramCarousel(igId, token, images, caption).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(MetaApiError);
    expect((err as MetaApiError).code).toBe('INSTAGRAM_CONTAINER_FAILED');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws INSTAGRAM_PUBLISH_FAILED when media_publish rejects', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'child_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'child_2', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'parent_7', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(bad({ error: { message: 'not ready' } }));

    const err = await publishInstagramCarousel(igId, token, images, caption).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(MetaApiError);
    expect((err as MetaApiError).code).toBe('INSTAGRAM_PUBLISH_FAILED');
  });

  it('returns the post id with an empty permalink when the permalink fetch fails (fail-open)', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'child_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'child_2', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'parent_7', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'pub_123' }))
      .mockResolvedValueOnce(mockResponse({ error: {} }, false, 400));

    const result = await publishInstagramCarousel(igId, token, images, caption);

    expect(result).toEqual({ postId: 'pub_123', permalink: '' });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  // Finding 5a (docs/tasks/done/social-create-post-composer.md §12): IG captions cap
  // at 2,200 chars. The helper clamps at the platform boundary so a
  // server-appended '\n\n' + link URL can never push a near-max caption past
  // the limit.
  it('clamps a caption past IG\u2019s 2,200-char limit on the CAROUSEL parent', async () => {
    const over = 'x'.repeat(IG_CAPTION_LIMIT + 500);
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'child_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'child_2', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'parent_7', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'pub_123' }))
      .mockResolvedValueOnce(ok({ permalink: 'https://www.instagram.com/p/AbCdEf/' }));

    await publishInstagramCarousel(igId, token, images, over);

    // Parent creation carries the CLAMPED caption (2,200 chars, no 'x' tail) —
    // never the full 2,700-char string.
    const parentUrl = nthUrl(2);
    expect(parentUrl).toContain(enc('caption', 'x'.repeat(IG_CAPTION_LIMIT)));
    expect(parentUrl).not.toContain(enc('caption', over));
  });

  it('leaves a caption under the IG limit untouched on the CAROUSEL parent', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'child_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'child_2', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'parent_7', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'pub_123' }))
      .mockResolvedValueOnce(ok({ permalink: 'https://www.instagram.com/p/AbCdEf/' }));

    await publishInstagramCarousel(igId, token, images, caption);

    expect(nthUrl(2)).toContain(enc('caption', caption));
  });
});

// F-034 Phase 2 T1 (docs/tasks/pending/ai-promo-video.md): Instagram Reels.
// Same fetch-queue style as the carousel tests; `pollDelayMs: 0` keeps the
// IN_PROGRESS poll from ever sleeping.
describe('publishInstagramReel', () => {
  const igId = 'ig_1';
  const token = 'tok_ig';
  const videoUrl = 'https://cdn.test/clip.mp4';
  const caption = 'New arrivals ✨';
  const fast = { pollDelayMs: 0 };

  it('creates a REELS container, publishes it, and returns the permalink', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'pub_9' }))
      .mockResolvedValueOnce(ok({ permalink: 'https://www.instagram.com/reel/AbC/' }));

    const result = await publishInstagramReel(igId, token, videoUrl, caption, fast);

    expect(result).toEqual({ postId: 'pub_9', permalink: 'https://www.instagram.com/reel/AbC/' });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const container = nthUrl(0);
    expect(container).toContain(`/${igId}/media?access_token=${token}`);
    expect(container).toContain('media_type=REELS');
    expect(container).toContain('video_url=https%3A%2F%2Fcdn.test%2Fclip.mp4');
    expect(container).toContain(enc('caption', caption));
    expect(container).toContain('share_to_feed=true');
    // The AI label is opt-in per call — never sent by default.
    expect(container).not.toContain('is_ai_generated');

    expect(nthUrl(1)).toContain(`/${igId}/media_publish?access_token=${token}`);
    expect(nthUrl(1)).toContain('creation_id=reel_1');
    expect(nthUrl(2)).toContain('/pub_9?');
    expect(nthUrl(2)).toContain('fields=permalink');
  });

  it('sends is_ai_generated=true when the clip is AI-generated', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'pub_9' }))
      .mockResolvedValueOnce(ok({ permalink: '' }));

    await publishInstagramReel(igId, token, videoUrl, caption, { ...fast, isAiGenerated: true });

    expect(nthUrl(0)).toContain('is_ai_generated=true');
  });

  it('sends share_to_feed=false when asked', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'pub_9' }))
      .mockResolvedValueOnce(ok({ permalink: '' }));

    await publishInstagramReel(igId, token, videoUrl, caption, { ...fast, shareToFeed: false });

    expect(nthUrl(0)).toContain('share_to_feed=false');
  });

  it('polls a container reported IN_PROGRESS until FINISHED', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'IN_PROGRESS' })) // poll 1
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'FINISHED' })) // poll 2
      .mockResolvedValueOnce(ok({ id: 'pub_9' }))
      .mockResolvedValueOnce(ok({ permalink: '' }));

    const result = await publishInstagramReel(igId, token, videoUrl, caption, fast);

    expect(result.postId).toBe('pub_9');
    // create(1) → poll(2) → poll(3) → publish(4) → permalink(5)
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(nthUrl(1)).toContain(`/reel_1?access_token=${token}`);
    expect(nthUrl(1)).toContain('fields=status_code');
  });

  it('throws INSTAGRAM_CONTAINER_FAILED and never publishes when processing ERRORs', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'ERROR' }));

    const err = await publishInstagramReel(igId, token, videoUrl, caption, fast).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(MetaApiError);
    expect((err as MetaApiError).code).toBe('INSTAGRAM_CONTAINER_FAILED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after pollAttempts and never publishes a container that did not finish', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'IN_PROGRESS' }))
      .mockResolvedValue(ok({ id: 'reel_1', status_code: 'IN_PROGRESS' }));

    const err = await publishInstagramReel(igId, token, videoUrl, caption, {
      pollAttempts: 3,
      pollDelayMs: 0,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(MetaApiError);
    // Its own code, so the route can tell a retailer "try again in a minute"
    // instead of showing a generic failure. The Reel was NOT posted.
    expect((err as MetaApiError).code).toBe('INSTAGRAM_CONTAINER_TIMEOUT');
    expect((err as MetaApiError).message).toMatch(/try again/i);
    // create(1) + 3 status polls; media_publish is never reached.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('media_publish'))).toBe(false);
  });

  it('a timeout carries the container id so the caller can finish the Reel later (T2b)', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'reel_1', status_code: 'IN_PROGRESS' }));

    const err = await publishInstagramReel(igId, token, videoUrl, caption, {
      pollAttempts: 1,
      pollDelayMs: 0,
    }).catch((e: unknown) => e);

    expect((err as MetaApiError).code).toBe('INSTAGRAM_CONTAINER_TIMEOUT');
    expect((err as MetaApiError).containerId).toBe('reel_1');
  });

  it('a rejected container carries no container id (nothing to finish)', async () => {
    fetchMock.mockResolvedValueOnce(bad({ error: { message: 'bad video' } }));
    const err = await publishInstagramReel(igId, token, videoUrl, caption, fast).catch(
      (e: unknown) => e,
    );
    expect((err as MetaApiError).containerId).toBeUndefined();
  });

  it('throws INSTAGRAM_CONTAINER_FAILED when the container is rejected', async () => {
    fetchMock.mockResolvedValueOnce(bad({ error: { message: 'bad video', code: 9004 } }));

    const err = await publishInstagramReel(igId, token, videoUrl, caption, fast).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(MetaApiError);
    expect((err as MetaApiError).code).toBe('INSTAGRAM_CONTAINER_FAILED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws INSTAGRAM_PUBLISH_FAILED when media_publish rejects', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(bad({ error: { message: 'not ready' } }));

    const err = await publishInstagramReel(igId, token, videoUrl, caption, fast).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(MetaApiError);
    expect((err as MetaApiError).code).toBe('INSTAGRAM_PUBLISH_FAILED');
  });

  it('returns the post id with an empty permalink when the permalink fetch fails (fail-open)', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'pub_9' }))
      .mockResolvedValueOnce(mockResponse({ error: {} }, false, 400));

    const result = await publishInstagramReel(igId, token, videoUrl, caption, fast);

    expect(result).toEqual({ postId: 'pub_9', permalink: '' });
  });

  it.each(['http://cdn.test/clip.mp4', '', 'cdn.test/clip.mp4', 'javascript:alert(1)'])(
    'rejects a non-https video URL (%j) without calling the API',
    async (url) => {
      const err = await publishInstagramReel(igId, token, url, caption, fast).catch(
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(MetaApiError);
      expect((err as MetaApiError).code).toBe('INSTAGRAM_VIDEO_URL_INVALID');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('clamps a caption past IG’s 2,200-char limit', async () => {
    const over = 'x'.repeat(IG_CAPTION_LIMIT + 500);
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'reel_1', status_code: 'FINISHED' }))
      .mockResolvedValueOnce(ok({ id: 'pub_9' }))
      .mockResolvedValueOnce(ok({ permalink: '' }));

    await publishInstagramReel(igId, token, videoUrl, over, fast);

    expect(nthUrl(0)).toContain(enc('caption', 'x'.repeat(IG_CAPTION_LIMIT)));
    expect(nthUrl(0)).not.toContain(enc('caption', over));
  });
});

describe('clampIgCaption', () => {
  it('passes a caption under the limit through untouched', () => {
    expect(clampIgCaption('Short caption')).toBe('Short caption');
    // Exactly at the limit is fine too.
    expect(clampIgCaption('x'.repeat(IG_CAPTION_LIMIT))).toBe('x'.repeat(IG_CAPTION_LIMIT));
  });

  it('clamps an over-limit caption to the first 2,200 chars', () => {
    const result = clampIgCaption('a'.repeat(IG_CAPTION_LIMIT + 300));
    expect(result).toHaveLength(IG_CAPTION_LIMIT);
    expect(result).toBe('a'.repeat(IG_CAPTION_LIMIT));
  });

  it('never splits an astral (emoji) code point mid-surrogate', () => {
    // 2,200 ASCII chars + one 2-code-unit emoji = 2,201 code points but 2,202
    // UTF-16 units. A naive .slice(0, 2200) on the UTF-16 string would cut the
    // surrogate pair and leave a lone \uD83D high surrogate at the end — the
    // code-point-aware clamp must drop the emoji whole instead.
    const caption = `${'a'.repeat(IG_CAPTION_LIMIT)}\u{1F60A}`;
    const result = clampIgCaption(caption);
    expect(Array.from(result)).toHaveLength(IG_CAPTION_LIMIT);
    expect(result).toBe('a'.repeat(IG_CAPTION_LIMIT));
    expect(result).not.toContain('\uD83D');
  });
});

describe('fetchIgPermalink', () => {
  const mediaId = 'pub_123';
  const token = 'tok_ig';

  it('returns the real permalink when the Graph API answers', async () => {
    fetchMock.mockResolvedValueOnce(ok({ permalink: 'https://www.instagram.com/p/AbCdEf/' }));
    expect(await fetchIgPermalink(mediaId, token)).toBe('https://www.instagram.com/p/AbCdEf/');
    expect(nthUrl(0)).toContain(`/${mediaId}?access_token=${token}`);
    expect(nthUrl(0)).toContain('fields=permalink');
  });

  it('fails open (\u2018\u2019) on a non-2xx response — never throws', async () => {
    fetchMock.mockResolvedValueOnce(bad({ error: { message: 'denied' } }));
    expect(await fetchIgPermalink(mediaId, token)).toBe('');
  });

  it('fails open (\u2018\u2019) on a network throw — never throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await fetchIgPermalink(mediaId, token)).toBe('');
  });

  it('fails open (\u2018\u2019) when the body has no permalink field', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: mediaId }));
    expect(await fetchIgPermalink(mediaId, token)).toBe('');
  });
});

describe('instagramContainerStatus (F-034 T2b)', () => {
  it('returns the container status_code from one Graph call', async () => {
    fetchMock.mockResolvedValueOnce(ok({ status_code: 'IN_PROGRESS' }));
    await expect(instagramContainerStatus('c_1', 'tok')).resolves.toBe('IN_PROGRESS');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(nthUrl(0)).toContain('/c_1?');
    expect(nthUrl(0)).toContain('fields=status_code');
  });

  it('throws a MetaApiError when Graph rejects the status read', async () => {
    fetchMock.mockResolvedValueOnce(bad({ error: { message: 'token expired' } }));
    await expect(instagramContainerStatus('c_1', 'tok')).rejects.toBeInstanceOf(MetaApiError);
  });
});

describe('publishIgContainer (F-034 T2b)', () => {
  it('publishes a finished container and returns the permalink', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'pub_9' }))
      .mockResolvedValueOnce(ok({ permalink: 'https://www.instagram.com/reel/AbC/' }));
    await expect(publishIgContainer('ig_1', 'tok', 'c_1')).resolves.toEqual({
      postId: 'pub_9',
      permalink: 'https://www.instagram.com/reel/AbC/',
    });
    expect(nthUrl(0)).toContain('/ig_1/media_publish?');
    expect(nthUrl(0)).toContain('creation_id=c_1');
  });

  it('throws INSTAGRAM_PUBLISH_FAILED when media_publish rejects', async () => {
    fetchMock.mockResolvedValueOnce(bad({ error: { message: 'nope' } }));
    const err = await publishIgContainer('ig_1', 'tok', 'c_1').catch((e: unknown) => e);
    expect((err as MetaApiError).code).toBe('INSTAGRAM_PUBLISH_FAILED');
  });
});
