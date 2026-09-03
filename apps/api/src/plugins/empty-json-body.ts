import type { FastifyRequest } from 'fastify';

/**
 * Fastify v5 rejects `Content-Type: application/json` with an empty body
 * (FST_ERR_CTP_EMPTY_JSON_BODY, 400) before route handlers run. The admin
 * panel's shared adminMutateOptions() always sends that header, so bodyless
 * admin mutations (POST /retailers/:id/unsuspend, /feature, /unfeature,
 * /customers/:id/unblock, several DELETEs) 400 every time. This parser treats
 * an empty JSON body as {} — routes that need real fields still fail Zod
 * validation.
 *
 * Register with:
 *   server.addContentTypeParser('application/json', { parseAs: 'string' }, parseJsonAllowEmpty)
 */
export function parseJsonAllowEmpty(
  _req: FastifyRequest,
  body: string | Buffer,
  done: (err: (Error & { statusCode?: number }) | null, value?: unknown) => void,
): void {
  const text = typeof body === 'string' ? body : body.toString('utf8');
  if (text.trim() === '') {
    done(null, {});
    return;
  }
  try {
    done(null, JSON.parse(text));
  } catch {
    const err = new Error('Invalid JSON body') as Error & { statusCode?: number };
    err.statusCode = 400;
    done(err);
  }
}
