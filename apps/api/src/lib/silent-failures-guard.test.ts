// T1.7 F2–F5 — source guards (name-based, like db-delete-guards.test.ts) plus one
// behavioural check. A swallowed catch makes an operation "succeed" while doing nothing.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const SRC = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('F2: prisma write errors are not collapsed into null', () => {
  // prisma.<model>.<create|update|delete|upsert>(...) closed by .catch(() => null)
  const PATTERN =
    /prisma\.\w+\s*\.(create|update|delete|upsert)\((?:(?!\n\s*\}\);)[\s\S]){0,600}?\.catch\(\(\) => null\)/;

  it('no route or lib file swallows a prisma write with .catch(() => null)', () => {
    const bad = [...walk(join(SRC, 'routes')), ...walk(join(SRC, 'lib'))]
      .filter((f) => PATTERN.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length + 1));
    expect(bad).toEqual([]);
  });

  it('the guard itself matches the old shape', () => {
    const old = `const x = await prisma.territory
      .update({ where: { id }, data })
      .catch(() => null);`;
    expect(PATTERN.test(old)).toBe(true);
  });
});

describe('F3/F4: status-write fallbacks log instead of swallowing', () => {
  it.each([
    'routes/products/products-tryon.ts',
    'routes/products/products-ai.ts',
    'routes/products/products-crud.ts',
  ])('%s has no empty catch', (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/catch \{\}/);
    expect(src).not.toMatch(/\.catch\(\(\) => \{\}\)/);
  });

  it('try-on logs both FAILED-write failures', () => {
    const src = read('routes/products/products-tryon.ts');
    expect(src.split('Failed to mark try-on job FAILED').length - 1).toBe(2);
  });

  it('both tagging fallbacks log ai_tag_error write failures', () => {
    for (const rel of ['routes/products/products-ai.ts', 'routes/products/products-crud.ts']) {
      expect(read(rel)).toMatch(
        /catch \(e\) \{\s*request\.log\.error\([^)]*'ai_tag_error write failed'\);\s*\}/,
      );
    }
  });
});

describe('F5: secret-store errors are logged before falling back', () => {
  it.each(['lib/fal-client.ts', 'lib/fal-video.ts', 'lib/gemini-image.ts', 'lib/studio-shoot.ts'])(
    '%s does not use getSecret(...).catch(() => null)',
    (rel) => {
      expect(read(rel)).not.toMatch(/getSecret\([^)]*\)\.catch\(\(\) => null\)/);
    },
  );

  it('resolveFalKey logs a secret-store failure and still falls back to env', async () => {
    vi.resetModules();
    vi.doMock('@kanchuki/db', () => ({
      getSecret: vi.fn().mockRejectedValue(new Error('db down')),
    }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.FAL_API_KEY = 'env-key';
    const { resolveFalKey } = await import('./fal-client.js');
    await expect(resolveFalKey()).resolves.toBe('env-key');
    expect(errSpy).toHaveBeenCalledWith(
      '[fal-client] getSecret FAL_API_KEY failed:',
      expect.any(Error),
    );
    errSpy.mockRestore();
    vi.doUnmock('@kanchuki/db');
  });
});
