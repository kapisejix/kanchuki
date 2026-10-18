// F-045 PR-6 — the My Style photo is never persisted and never logged (SECURITY.md §3e).
//
// A grep guard because nothing else survives a future edit: the promise "not on R2, not in
// the DB, not in a log" is a property of what the photo-path files DO NOT import or call,
// and a reviewer reading a diff that adds `uploadBuffer(photo)` has nothing telling them it
// was banned. Same reasoning, and the same shared comment stripper (RC-043), as
// retired-tryon-guard.test.ts. Comments are stripped so the files can explain the rule.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '@kanchuki/shared/testing';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');

/** Every file the photo bytes can pass through between the request and the model. */
const PHOTO_PATH = [
  'apps/api/src/routes/public/public-my-style-analyze.ts',
  'apps/api/src/jobs/my-style-analyze.ts',
  'apps/api/src/lib/my-style-analysis.ts',
  'apps/api/src/lib/my-style-consent.ts',
  'packages/ai/src/my-style-vision.ts',
] as const;

const code = (rel: string) => stripComments(readFileSync(resolve(ROOT, rel), 'utf8'));

describe('My Style photo path (privacy)', () => {
  it.each(PHOTO_PATH)('%s calls no storage helper', (rel) => {
    expect(code(rel)).not.toMatch(
      /\b(uploadBuffer|copyUrlToR2|getUploadPresignedUrl|saveTryOnResultToR2|PutObjectCommand|writeFile|createWriteStream)\b/,
    );
    expect(code(rel)).not.toMatch(/from\s+['"][^'"]*\/r2\.js['"]/);
  });

  it.each(PHOTO_PATH)('%s never logs the photo or its bytes', (rel) => {
    const logs = [...code(rel).matchAll(/console\.\w+\(([^;]*)\)/g)].map((m) => m[1] ?? '');
    for (const args of logs) expect(args).not.toMatch(/\b(buffer|photo|bytes|base64)\b/i);
  });

  it('the route/job use only the vision entry points of @kanchuki/ai', () => {
    const allowed = new Set(['analyzeStyleImage', 'hasConfiguredVisionProvider']);
    for (const rel of PHOTO_PATH.slice(0, 2)) {
      for (const m of code(rel).matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@kanchuki\/ai['"]/g)) {
        for (const name of (m[1] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)) {
          expect(allowed, `${rel} imports ${name} from @kanchuki/ai`).toContain(name);
        }
      }
    }
  });

  it('the photo never enters a queue payload', () => {
    const data = code('apps/api/src/jobs/my-style-analyze.ts').match(
      /interface MyStyleAnalyzeJobData\s*\{([^}]*)\}/,
    );
    expect(data?.[1]).toBeTruthy();
    expect(data?.[1]).not.toMatch(/buffer|photo|image|base64/i);
  });
});
