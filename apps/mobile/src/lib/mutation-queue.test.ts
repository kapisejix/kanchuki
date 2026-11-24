import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api/api-error';
import {
  clearQueue,
  dequeueSellMutation,
  dequeueStatusMutation,
  enqueueSellMutation,
  enqueueStatusMutation,
  getQueue,
  getSellQueue,
  isRetryable,
} from './mutation-queue';

// In-memory expo-file-system mock. The queue writes real JSON through the
// File/Directory classes, so this exercises the actual enqueue → getQueue →
// dequeue round-trip (not a stubbed return). Paths.document.uri is a plain
// string, matching the native module's shape.
const { memory, FakeFile, FakeDirectory } = vi.hoisted(() => {
  const memory = new Map<string, string>();

  class FakeDirectory {
    uri: string;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    create(): void {}
    delete(): void {}
  }

  class FakeFile {
    uri: string;
    exists: boolean;
    constructor(uri: string) {
      this.uri = uri;
      this.exists = memory.has(uri);
    }
    create(_opts?: { overwrite?: boolean }): void {
      if (!memory.has(this.uri)) {
        memory.set(this.uri, '');
        this.exists = true;
      }
    }
    write(content: string): void {
      memory.set(this.uri, content);
      this.exists = true;
    }
    async text(): Promise<string> {
      return memory.get(this.uri) ?? '';
    }
    delete(): void {
      memory.delete(this.uri);
      this.exists = false;
    }
  }

  return { memory, FakeFile, FakeDirectory };
});

vi.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///documents/' } },
  File: FakeFile,
  Directory: FakeDirectory,
}));

describe('mutation-queue', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('returns an empty queue when no file exists yet', async () => {
    expect(await getQueue()).toEqual([]);
  });

  it('persists an enqueued status mutation and reads it back', async () => {
    await enqueueStatusMutation('prod-1', 'SOLD');

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ productId: 'prod-1', status: 'SOLD' });
    expect(typeof queue[0]?.id).toBe('string');
    expect(typeof queue[0]?.queuedAt).toBe('number');
  });

  it('appends multiple mutations in order', async () => {
    await enqueueStatusMutation('prod-1', 'SOLD');
    await enqueueStatusMutation('prod-2', 'RESERVED');

    const queue = await getQueue();
    expect(queue.map((m) => [m.productId, m.status])).toEqual([
      ['prod-1', 'SOLD'],
      ['prod-2', 'RESERVED'],
    ]);
  });

  it('dequeues only the matching mutation', async () => {
    await enqueueStatusMutation('prod-1', 'SOLD');
    await enqueueStatusMutation('prod-2', 'RESERVED');

    const queue = await getQueue();
    await dequeueStatusMutation(queue[0]!.id);

    const remaining = await getQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.productId).toBe('prod-2');
  });

  it('survives a "restart" — persisted JSON is re-read from the same file', async () => {
    await enqueueStatusMutation('prod-1', 'SOLD');

    // The file bytes persist in `memory`, which the File mock treats as
    // already-existing on re-construction — same as reading back from disk.
    const reloaded = await getQueue();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.productId).toBe('prod-1');
  });

  it('returns an empty queue on corrupt JSON instead of throwing', async () => {
    memory.set('file:///documents/kanchuki-cache/mutation-queue.json', '{not json');
    expect(await getQueue()).toEqual([]);
  });

  it('swallows write failures (offline/disk errors never throw to the caller)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalWrite = FakeFile.prototype.write;
    FakeFile.prototype.write = () => {
      throw new Error('disk full');
    };
    try {
      await enqueueStatusMutation('prod-1', 'SOLD');
      // Failed write must not throw — the queue call completes silently,
      // and no partial/corrupt state is left behind.
      expect(await getQueue()).toEqual([]);
    } finally {
      FakeFile.prototype.write = originalWrite;
      warn.mockRestore();
    }
  });
});

// F-047 T7: a bill confirmed offline is queued under its bill id and replayed later.
describe('sell queue', () => {
  const lines = [{ product_id: 'p1', size: 'M', quantity: 2 }];
  const names = { p1: 'Red kurti' };

  beforeEach(() => {
    memory.clear();
  });

  it('persists a queued bill and reads it back', async () => {
    await enqueueSellMutation('bill-1', lines, names);
    const q = await getSellQueue();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: 'bill-1', lines, names });
    expect(typeof q[0]?.queuedAt).toBe('number');
  });

  it('queues one entry per bill id (re-enqueue is a no-op)', async () => {
    await enqueueSellMutation('bill-1', lines, names);
    await enqueueSellMutation('bill-1', lines, names);
    await enqueueSellMutation('bill-2', lines, names);
    expect((await getSellQueue()).map((m) => m.id)).toEqual(['bill-1', 'bill-2']);
  });

  it('dequeues only the matching bill', async () => {
    await enqueueSellMutation('bill-1', lines, names);
    await enqueueSellMutation('bill-2', lines, names);
    await dequeueSellMutation('bill-1');
    expect((await getSellQueue()).map((m) => m.id)).toEqual(['bill-2']);
  });

  it('keeps the status queue and the sell queue apart', async () => {
    await enqueueStatusMutation('prod-1', 'SOLD');
    await enqueueSellMutation('bill-1', lines, names);
    expect(await getQueue()).toHaveLength(1);
    expect(await getSellQueue()).toHaveLength(1);
  });

  it('returns an empty sell queue on corrupt JSON', async () => {
    memory.set('file:///documents/kanchuki-cache/sell-queue.json', '{not json');
    expect(await getSellQueue()).toEqual([]);
  });

  // RC-107: queued bills must not replay under the next account's token.
  it('clearQueue removes queued bills too', async () => {
    await enqueueStatusMutation('prod-1', 'SOLD');
    await enqueueSellMutation('bill-1', lines, names);
    await clearQueue();
    expect(await getQueue()).toEqual([]);
    expect(await getSellQueue()).toEqual([]);
  });

  it('reports a failed write instead of pretending the bill was queued', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalWrite = FakeFile.prototype.write;
    FakeFile.prototype.write = () => {
      throw new Error('disk full');
    };
    try {
      await expect(enqueueSellMutation('bill-1', lines, names)).resolves.toBe(false);
    } finally {
      FakeFile.prototype.write = originalWrite;
      warn.mockRestore();
    }
  });

  // Review: a failed read used to read as "empty", and the next write erased every queued bill.
  it('never overwrites a sell queue file it could not parse', async () => {
    const uri = 'file:///documents/kanchuki-cache/sell-queue.json';
    memory.set(uri, '{truncated');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(enqueueSellMutation('bill-1', lines, names)).resolves.toBe(false);
    await dequeueSellMutation('bill-9');
    expect(memory.get(uri)).toBe('{truncated');
    warn.mockRestore();
  });

  it('treats a non-array sell queue file as unreadable, not as a list', async () => {
    const uri = 'file:///documents/kanchuki-cache/sell-queue.json';
    memory.set(uri, '{}');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getSellQueue()).toEqual([]);
    await expect(enqueueSellMutation('bill-1', lines, names)).resolves.toBe(false);
    expect(memory.get(uri)).toBe('{}');
    warn.mockRestore();
  });

  // Review: enqueue and the replay's dequeue each read-modify-write the whole file.
  it('a dequeue and an enqueue racing do not lose either change', async () => {
    await enqueueSellMutation('bill-A', lines, names);
    await Promise.all([dequeueSellMutation('bill-A'), enqueueSellMutation('bill-B', lines, names)]);
    expect((await getSellQueue()).map((m) => m.id)).toEqual(['bill-B']);
  });

  it('five enqueues in the same tick all land', async () => {
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => enqueueSellMutation(id, lines, names)));
    expect((await getSellQueue()).map((m) => m.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns true when the bill was persisted', async () => {
    await expect(enqueueSellMutation('bill-1', lines, names)).resolves.toBe(true);
  });
});

// RC-115: a 4xx can never succeed on replay, so queueing it loops forever.
describe('isRetryable', () => {
  it.each([
    ['network failure (status 0)', new ApiError('NETWORK_ERROR', 'x', 0), true],
    ['timeout (408)', new ApiError('TIMEOUT', 'x', 408), true],
    ['rate limited (429)', new ApiError('RATE_LIMITED', 'x', 429), true],
    ['server error (500)', new ApiError('INTERNAL', 'x', 500), true],
    ['bad gateway (502)', new ApiError('BAD_GATEWAY', 'x', 502), true],
    ['validation (422)', new ApiError('VALIDATION', 'x', 422), false],
    ['not found (404)', new ApiError('NOT_FOUND', 'x', 404), false],
    ['forbidden (403)', new ApiError('FORBIDDEN', 'x', 403), false],
    ['unauthorized (401)', new ApiError('UNAUTHORIZED', 'x', 401), false],
  ])('%s', (_label, err, expected) => {
    expect(isRetryable(err)).toBe(expected);
  });

  it('treats a non-ApiError throw (raw fetch failure) as retryable', () => {
    expect(isRetryable(new TypeError('Network request failed'))).toBe(true);
  });
});
