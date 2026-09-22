// The referral_settings singleton reader.
//
// Two things matter here and both are anti-drift, not behaviour:
//
//  1. The create branch passes an EMPTY data object. Every term has to come from
//     the column DEFAULT in migration 109. If a fallback constant ever appears at
//     this layer it will be invisible in production (the row is seeded, so the
//     branch never runs) and a commission term by definition — the exact
//     hardcoding T1's design exists to prevent. The assertion below is written
//     against the CALL ARGUMENT so a `?? 30` anywhere in it fails.
//  2. The id matches the model's `@default("singleton")`. If they diverge, the
//     loader reads one row and every write lands on another.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REFERRAL_SETTINGS_ID, loadReferralSettings } from './referral-settings.js';

const { mockFindUnique, mockCreate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    referralSettings: { findUnique: mockFindUnique, create: mockCreate },
  },
}));

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadReferralSettings', () => {
  it('reads the singleton by its fixed id', async () => {
    const row = { id: REFERRAL_SETTINGS_ID, commission_pct: 30 };
    mockFindUnique.mockResolvedValue(row);

    await expect(loadReferralSettings()).resolves.toBe(row);
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: REFERRAL_SETTINGS_ID } });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates from the column defaults, never from a constant in code', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: REFERRAL_SETTINGS_ID });

    await loadReferralSettings();

    // The whole assertion: `{}` and nothing else. A `data: { commission_pct: 30 }`
    // would pass a "returns a row" test while being a second source of truth for
    // a payout term.
    expect(mockCreate).toHaveBeenCalledWith({ data: {} });
  });

  it('uses the same id the schema defaults to', () => {
    // A schema/code mismatch means reads and writes land on different rows —
    // silently, because both sides are valid rows.
    const schema = readFileSync(join(REPO_ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');
    const model = schema.slice(schema.indexOf('\nmodel ReferralSettings {'));
    const idLine = model
      .slice(0, model.indexOf('\n}'))
      .match(/id\s+String\s+@id\s+@default\("([^"]+)"\)/);

    expect(idLine).not.toBeNull();
    expect(idLine?.[1]).toBe(REFERRAL_SETTINGS_ID);
  });
});
