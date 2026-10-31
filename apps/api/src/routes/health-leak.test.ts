// H8-4 / RC-151 — anonymous /health must not echo driver error text (hosts, ports) during an
// outage. health.test.ts exercises a copy of the handler, so this pins the real sources.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const LEAK = /err instanceof Error \? err\.message/;

describe('/health error bodies', () => {
  it('index.ts /health handler does not return err.message', () => {
    const idx = read('../index.ts');
    const start = idx.indexOf("server.get('/health'");
    expect(start).toBeGreaterThan(0);
    expect(idx.slice(start, start + 1800)).not.toMatch(LEAK);
  });
  it('dbHealthCheck does not return err.message', () => {
    const c = read('../../../../packages/db/src/client.ts');
    const start = c.indexOf('export async function dbHealthCheck');
    expect(start).toBeGreaterThan(0);
    expect(c.slice(start, start + 600)).not.toMatch(LEAK);
  });
});
