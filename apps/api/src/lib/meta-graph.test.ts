import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaApiError, publishFacebookCarousel, publishInstagramCarousel } from './meta-graph.js';

// Create Post Composer v2 (docs/tasks/social-create-post-composer.md §6.2) —
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
});
