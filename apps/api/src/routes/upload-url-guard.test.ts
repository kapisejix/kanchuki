// RC-080 — derived from the source, not a hand-kept list (RC-043): every route that
// presigns a PUT must pass a content length (4th arg) and carry a rate limit, so a
// new `upload-url` route cannot ship unbounded.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

const CALL = /getUploadPresignedUrl\(([^)]*)\)/g;

describe('presigned upload routes', () => {
  const files = sourceFiles(join(__dirname)).map((p) => ({ p, src: readFileSync(p, 'utf8') }));
  const withCalls = files.filter(({ src }) => src.includes('getUploadPresignedUrl('));

  it('finds the presign routes', () => {
    expect(withCalls.length).toBeGreaterThanOrEqual(11);
  });

  it.each(withCalls.map(({ p, src }) => [p.replace(__dirname, ''), src] as const))(
    '%s binds a content length and is rate limited',
    (_name, src) => {
      const calls = [...src.matchAll(CALL)];
      for (const [, args] of calls) {
        expect(args?.split(',').filter((a) => a.trim()).length).toBeGreaterThanOrEqual(4);
      }
      expect((src.match(/UPLOAD_URL_RATE_LIMIT,/g) ?? []).length).toBeGreaterThanOrEqual(
        calls.length,
      );
    },
  );
});
