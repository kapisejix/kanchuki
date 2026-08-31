import { describe, expect, it } from 'vitest';
import { parseJsonAllowEmpty } from './empty-json-body.js';

const run = (body: string | Buffer): Promise<{ err: unknown; value: unknown }> =>
  new Promise((resolve) =>
    parseJsonAllowEmpty({} as never, body, (err, value) => resolve({ err, value })),
  );

describe('parseJsonAllowEmpty', () => {
  it('parses an empty body as {}', async () => {
    expect(await run('')).toEqual({ err: null, value: {} });
  });

  it('parses a whitespace-only body as {}', async () => {
    expect(await run('   \n')).toEqual({ err: null, value: {} });
  });

  it('parses a Buffer body', async () => {
    expect(await run(Buffer.from('{"a":1}'))).toEqual({ err: null, value: { a: 1 } });
  });

  it('parses valid JSON', async () => {
    expect(await run('{"reason":"x"}')).toEqual({ err: null, value: { reason: 'x' } });
  });

  it('rejects malformed JSON with statusCode 400', async () => {
    const { err } = await run('{bad');
    expect((err as { statusCode?: number }).statusCode).toBe(400);
  });
});
