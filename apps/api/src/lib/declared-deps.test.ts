import { readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { stripComments } from '@kanchuki/shared/testing';
import { describe, expect, it } from 'vitest';

// T1.5 F1: apps/api resolved pdfjs-dist and @aws-sdk/client-s3 only through
// .npmrc shamefully-hoist. Every package the API source imports must be in its own manifest.
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, '..', 'package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

function importedPackages(src: string): string[] {
  const names = new Set<string>();
  const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(re)) {
    const spec = m[1] ?? '';
    if (spec.startsWith('.') || spec.startsWith('node:')) continue;
    const parts = spec.split('/');
    const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
    if (!builtinModules.includes(name)) names.add(name);
  }
  return [...names];
}

describe('apps/api declares every package it imports', () => {
  it('extracts scoped, subpath, dynamic and side-effect imports; skips relative and node:', () => {
    const src = `
      import a from 'pdfjs-dist/legacy/build/pdf.mjs';
      import { b } from '@aws-sdk/client-s3';
      import c from './local.js';
      import fs from 'node:fs';
      import path from 'path';
      import 'dotenv/config';
      const d = await import('@kanchuki/shared/testing');
    `;
    expect(importedPackages(src).sort()).toEqual([
      '@aws-sdk/client-s3',
      '@kanchuki/shared',
      'dotenv',
      'pdfjs-dist',
    ]);
  });

  it('every non-test source import is in apps/api/package.json', () => {
    const files = (readdirSync(root, { recursive: true }) as string[]).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    const missing = files.flatMap((f) =>
      importedPackages(stripComments(readFileSync(join(root, f), 'utf8')))
        .filter((p) => !declared.has(p))
        .map((p) => `${f}: ${p}`),
    );
    expect(missing).toEqual([]);
  });
});
