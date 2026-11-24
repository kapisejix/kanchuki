import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@kanchuki/shared/testing';
import { describe, expect, it } from 'vitest';

// RC-129: teardown removed server routes but left the growthApi client methods, and nothing tied a
// client path to a server route. Source pin: loose (segment appears in some API route file), not a
// method/param check, and not a runtime call.
const growth = stripComments(readFileSync(join(__dirname, '..', 'src/lib/api/growth.ts'), 'utf8'));

const apiRoutes = join(__dirname, '..', '..', 'api', 'src', 'routes');
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(dir, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
        ? [join(dir, e.name)]
        : [],
  );
const serverSrc = walk(apiRoutes)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

describe('RC-129: growthApi only calls endpoints the server still has', () => {
  const segs = [
    ...new Set(
      [...growth.matchAll(/\/v1\/(?:growth|retailers\/me)\/([a-z][a-z-]*)/g)].map((m) => m[1]),
    ),
  ];

  it('finds the paths to check', () => {
    expect(segs.length).toBeGreaterThan(5);
  });

  it.each(segs)('server has a route for "%s"', (seg) => {
    expect(serverSrc).toContain(seg);
  });

  it('teardown-removed segments are gone', () => {
    for (const seg of ['referrals', 'suppliers', 'bookings', 'partners', 'incentives']) {
      expect(growth).not.toContain(`/${seg}`);
    }
  });
});

// T3.3 b-d: methods with a live route but no caller, unused files and deps. Pins against
// re-adding them; a caller added later should re-add the method with its screen.
const readApi = (f: string) =>
  stripComments(readFileSync(join(__dirname, '..', 'src/lib/api', f), 'utf8'));

describe('T3.3 b: uncalled client methods stay deleted', () => {
  const cases: [string, string[]][] = [
    ['attributes.ts', ['create:', 'delete:']],
    ['billing.ts', ['getAddonPricing']],
    ['catalog-import.ts', ['importPdf']],
    ['collections.ts', ['autoSuggest']],
    ['growth.ts', ['updateChannel', 'socialTemplate:', 'createFbAdCampaign', 'FbAdCampaign']],
    ['products.ts', ['setPhotoPieceType', 'deleteVariant']],
    ['showcase-designs.ts', ['publicForProduct']],
    ['staff.ts', ['  delete:']],
    ['whatsapp-catalog.ts', ['syncProduct']],
  ];
  it.each(cases)('%s', (file, names) => {
    const src = readApi(file);
    for (const n of names) expect(src).not.toContain(n);
  });
});

describe('T3.3 c-d: unused files and deps stay gone', () => {
  const root = join(__dirname, '..');
  it('files are deleted', () => {
    for (const f of ['src/components/GradientBorderCard.tsx', 'src/test/mocks/react-native.cjs'])
      expect(existsSync(join(root, f))).toBe(false);
  });
  it('deps are not declared', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const d of [
      '@gorhom/bottom-sheet',
      'react-native-image-viewing',
      'zustand',
      '@expo/ngrok',
    ])
      expect(all).not.toHaveProperty(d);
  });
});

describe('RC-130: GST row does not claim a customer the server never sends', () => {
  it('row label and type', () => {
    const screen = stripComments(readFileSync(join(__dirname, '..', 'app/growth/gst.tsx'), 'utf8'));
    expect(screen).not.toContain('Walk-in');
    expect(screen).not.toContain('tx.customer');
    expect(screen).toContain('Kanchuki subscription');
    const tx = growth.slice(growth.indexOf('export type GstTransaction ='));
    expect(tx.slice(0, tx.indexOf('}'))).not.toContain('customer');
  });
});
