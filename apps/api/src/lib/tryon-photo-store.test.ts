// F-039 T7 — the wearer-photo handoff store. The privacy rule this module
// enforces is "the photo never crosses a serialization boundary", so the test
// that matters most is the one-shot take (a retry must never see the photo).
import { describe, expect, it, vi } from 'vitest';
import {
  discardTryOnPhoto,
  putTryOnPhoto,
  takeTryOnPhoto,
  tryOnPhotoCount,
} from './tryon-photo-store.js';

describe('try-on photo store', () => {
  it('hands a photo back exactly once', () => {
    expect(putTryOnPhoto('job_1', Buffer.from('abc'), 'image/jpeg')).toBe(true);
    expect(takeTryOnPhoto('job_1')).toEqual({
      buffer: Buffer.from('abc'),
      contentType: 'image/jpeg',
    });
    // One-shot: a retry must not see the same photo.
    expect(takeTryOnPhoto('job_1')).toBeNull();
  });

  it('returns null for an unknown job', () => {
    expect(takeTryOnPhoto('never_stored')).toBeNull();
  });

  it('expires an entry that waited too long', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T00:00:00Z'));
    putTryOnPhoto('job_ttl', Buffer.from('abc'), 'image/png');
    vi.setSystemTime(new Date('2026-09-26T00:10:00Z')); // well past the TTL
    expect(takeTryOnPhoto('job_ttl')).toBeNull();
    vi.useRealTimers();
  });

  it('discard drops the photo without using it', () => {
    putTryOnPhoto('job_discard', Buffer.from('abc'), 'image/jpeg');
    discardTryOnPhoto('job_discard');
    expect(takeTryOnPhoto('job_discard')).toBeNull();    expect(tryOnPhotoCount()).toBe(0);
  });

  it('sweeps an expired entry when the next photo is put', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T00:00:00Z'));
    putTryOnPhoto('job_old', Buffer.from('abc'), 'image/jpeg');
    vi.setSystemTime(new Date('2026-09-26T00:10:00Z'));
    putTryOnPhoto('job_new', Buffer.from('xyz'), 'image/jpeg');
    // job_old was swept by the put, job_new is live.
    expect(tryOnPhotoCount()).toBe(1);
    discardTryOnPhoto('job_new');
    vi.useRealTimers();
  });
});
