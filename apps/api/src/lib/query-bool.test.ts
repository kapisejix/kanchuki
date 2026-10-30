import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@kanchuki/shared/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { queryBool } from './query-bool.js';

describe('RC-127: query-string booleans', () => {
  const schema = z.object({ flag: queryBool() });

  it('parses "false" as false (z.coerce.boolean() made it true)', () => {
    expect(schema.parse({ flag: 'false' }).flag).toBe(false);
    expect(z.coerce.boolean().parse('false')).toBe(true);
  });

  it('parses "true" as true and absent as undefined', () => {
    expect(schema.parse({ flag: 'true' }).flag).toBe(true);
    expect(schema.parse({}).flag).toBeUndefined();
  });

  it('rejects anything else', () => {
    expect(schema.safeParse({ flag: 'yes' }).success).toBe(false);
    expect(schema.safeParse({ flag: '1' }).success).toBe(false);
  });

  it('no API source file uses z.coerce.boolean()', () => {
    const root = join(__dirname, '..');
    const files = (readdirSync(root, { recursive: true }) as string[]).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    const offenders = files.filter((f) =>
      stripComments(readFileSync(join(root, f), 'utf8')).includes('z.coerce.boolean'),
    );
    expect(offenders).toEqual([]);
  });
});
