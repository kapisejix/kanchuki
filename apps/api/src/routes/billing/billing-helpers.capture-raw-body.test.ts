/**
 * T1.8 F3: captureRawBody runs as a preParsing hook, before Fastify's bodyLimit
 * and before any signature check, on unauthenticated webhook routes. It must
 * refuse a body over WEBHOOK_BODY_LIMIT (1 MiB) instead of buffering it.
 */
import { Readable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@kanchuki/db', () => ({ getSecret: vi.fn(), prisma: {} }));

import { errorHandler } from '../../plugins/error-handler.js';
import { captureRawBody } from './billing-helpers.js';

const LIMIT = 1024 * 1024;

async function buildApp() {
  // bodyLimit well above the cap: only the hook may be what rejects.
  const app = Fastify({ bodyLimit: 16 * 1024 * 1024 });
  app.setErrorHandler(errorHandler);
  app.addHook('preParsing', captureRawBody);
  app.post('/hook', async (request) => ({ raw: request.rawBody, body: request.body }));
  await app.ready();
  return app;
}

const json = { 'content-type': 'application/json' };

describe('captureRawBody size cap', () => {
  it('keeps the raw body for a small payload', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/hook',
      headers: json,
      payload: '{"a":1}',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ raw: '{"a":1}', body: { a: 1 } });
  });

  it('accepts a body of exactly the limit', async () => {
    const app = await buildApp();
    const pad = 'x'.repeat(LIMIT - '{"p":""}'.length);
    const payload = `{"p":"${pad}"}`;
    expect(payload.length).toBe(LIMIT);
    const res = await app.inject({ method: 'POST', url: '/hook', headers: json, payload });
    expect(res.statusCode).toBe(200);
  });

  it('413s on a declared content-length over the limit without reading the body', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/hook',
      headers: { ...json, 'content-length': String(LIMIT + 1) },
      payload: '{}',
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('413s on a chunked body (no content-length) that grows past the limit', async () => {
    const app = await buildApp();
    const chunk = Buffer.alloc(256 * 1024, 'a');
    const payload = Readable.from([chunk, chunk, chunk, chunk, chunk]);
    const res = await app.inject({ method: 'POST', url: '/hook', headers: json, payload });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
