import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunVisionAsk } = vi.hoisted(() => ({ mockRunVisionAsk: vi.fn() }));

vi.mock('./providers.js', () => ({
  runVisionAsk: mockRunVisionAsk,
}));

import { generateSocialPostCaption, normalizeCampaignIntent } from './campaign-assistant.js';

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

describe('normalizeCampaignIntent — malformed AI replies', () => {
  it('passes a well-formed intent through unchanged', () => {
    const intent = normalizeCampaignIntent({
      campaign_type: 'FESTIVAL',
      name: 'Diwali silk blast',
      festival_id: 3,
      audience: { all: true, colors: ['red'] },
      product_criteria: { category: 'Saree', limit: 8 },
      message_tone: 'festive',
      schedule_hint: '2 days before Diwali',
    });
    expect(intent.campaign_type).toBe('FESTIVAL');
    expect(intent.festival_id).toBe(3);
    expect(intent.audience).toEqual({ all: true, colors: ['red'] });
    expect(intent.product_criteria.limit).toBe(8);
    expect(intent.message_tone).toBe('festive');
  });

  it('coerces lowercase enums to the valid union instead of crashing', () => {
    const intent = normalizeCampaignIntent({
      campaign_type: 'festival',
      name: 'Diwali blast',
      festival_id: null,
      audience: {},
      product_criteria: {},
      message_tone: 'FESTIVE',
      schedule_hint: null,
    });
    expect(intent.campaign_type).toBe('FESTIVAL');
    expect(intent.message_tone).toBe('festive');
  });

  it('defaults unknown enums to PROMOTION/casual instead of throwing', () => {
    const intent = normalizeCampaignIntent({
      campaign_type: 'HOLIDAY',
      name: 'Blast',
      audience: {},
      product_criteria: {},
      message_tone: 'shouty',
    });
    expect(intent.campaign_type).toBe('PROMOTION');
    expect(intent.message_tone).toBe('casual');
  });

  it('re-parses stringified nested objects (models love "product_criteria": "{...}")', () => {
    const intent = normalizeCampaignIntent({
      campaign_type: 'PROMOTION',
      name: 'Kurti sale',
      audience: '{"colors":"pink,black","min_total_spent_paise":200000}',
      product_criteria: '{"category":"Kurti","max_price_paise":"150000"}',
      message_tone: 'casual',
    });
    expect(intent.audience.colors).toEqual(['pink', 'black']);
    expect(intent.audience.min_total_spent_paise).toBe(200000);
    expect(intent.product_criteria.category).toBe('Kurti');
    expect(intent.product_criteria.max_price_paise).toBe(150000);
  });

  it('keeps only valid audience sources', () => {
    const intent = normalizeCampaignIntent({
      campaign_type: 'PROMOTION',
      name: 'Blast',
      audience: { sources: ['MANUAL', 'not-a-source'] },
      product_criteria: {},
      message_tone: 'casual',
    });
    expect(intent.audience.sources).toEqual(['MANUAL']);
  });

  it('does not dereference missing objects (the 500 root cause)', () => {
    const intent = normalizeCampaignIntent({
      campaign_type: 'REACTIVATION',
      name: 'Comeback offer',
      message_tone: 'urgent',
    });
    expect(intent.audience).toEqual({});
    expect(intent.product_criteria).toEqual({});
    expect(intent.campaign_type).toBe('REACTIVATION');
  });

  it('caps product limit at 20', () => {
    const intent = normalizeCampaignIntent({
      campaign_type: 'PROMOTION',
      name: 'Blast',
      audience: {},
      product_criteria: { limit: 99 },
      message_tone: 'casual',
    });
    expect(intent.product_criteria.limit).toBe(20);
  });
});
