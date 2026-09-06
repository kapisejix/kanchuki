import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunVisionAsk } = vi.hoisted(() => ({ mockRunVisionAsk: vi.fn() }));

vi.mock('./providers.js', () => ({
  runVisionAsk: mockRunVisionAsk,
}));

import { generateSocialPostCaption } from './campaign-assistant.js';

const BASE = {
  productNames: ['Pink Embroidered Lehenga Choli'],
  postType: 'SINGLE_PRODUCT' as const,
};

describe('generateSocialPostCaption — fenced JSON', () => {
  beforeEach(() => mockRunVisionAsk.mockReset());

  it('parses a ```json-fenced reply instead of dumping the raw fence', async () => {
    mockRunVisionAsk.mockResolvedValue(
      '```json\n{"caption":"Step into the festive season with us!","hashtags":["diwali","ethnicwear"]}\n```',
    );
    const r = await generateSocialPostCaption(BASE);
    expect(r.caption).toBe('Step into the festive season with us!');
    expect(r.hashtags).toEqual(['diwali', 'ethnicwear']);
  });

  it('accepts hashtags returned as one space-joined string', async () => {
    mockRunVisionAsk.mockResolvedValue(
      '```json\n{"caption":"New in.","hashtags":"#PriyankaFashion #DiwaliReady"}\n```',
    );
    const r = await generateSocialPostCaption(BASE);
    expect(r.caption).toBe('New in.');
    expect(r.hashtags).toEqual(['#PriyankaFashion', '#DiwaliReady']);
  });

  it('still parses an un-fenced JSON reply', async () => {
    mockRunVisionAsk.mockResolvedValue('{"caption":"Plain.","hashtags":[]}');
    const r = await generateSocialPostCaption(BASE);
    expect(r.caption).toBe('Plain.');
  });

  it('falls open to raw text when the reply is not JSON at all', async () => {
    mockRunVisionAsk.mockResolvedValue('Just some caption text.');
    const r = await generateSocialPostCaption(BASE);
    expect(r.caption).toBe('Just some caption text.');
    expect(r.hashtags).toEqual([]);
  });
});
