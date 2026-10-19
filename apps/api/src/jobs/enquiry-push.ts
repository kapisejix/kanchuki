// F-046 slice 2 — new-enquiry push to the retailer team (Expo push service).
//
// Payload rule (F-037 / RC-066): an enquiry id and an item COUNT only. Never the
// customer's phone or name, never product names — a push is shown on a lock screen.
//
// Recipients are resolved HERE, at send time, from Staff.is_active: a removed
// person's device stops pinging without having to re-register. Owner devices
// (staff_id null) always receive. Catalog/support delegates never register
// (routes/push-devices.ts), so there is no role filter to get wrong.
//
// Delivery is at-least-once: if a later chunk of a >100-device send fails, the
// BullMQ retry re-sends the earlier chunks. A shop has a handful of devices, so one
// chunk is the norm; Expo collapses nothing, so this is a known ceiling, not a bug.
import { prisma } from '@kanchuki/db';
import { getPushQueue } from './queue.js';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const CHUNK = 100;
/** Expo publishes receipts about 15 minutes after a send. */
const RECEIPT_DELAY_MS = 15 * 60 * 1000;

export interface EnquiryPushJobData {
  retailer_id: string;
  enquiry_id: string;
  item_count: number;
}

export interface EnquiryPushReceiptsJobData {
  tickets: { id: string; token: string }[];
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  details?: { error?: string };
}

/** Ping the retailer team about a new enquiry. Lives here (not jobs/index.ts) so the two
 *  public enquiry routes import a light module instead of the whole jobs graph. jobId
 *  dedupes a double enqueue of the same enquiry; callers must catch — a push failure must
 *  never fail the customer's enquiry. Payload = an id and a count (no customer data). */
export async function addEnquiryPushJob(data: EnquiryPushJobData): Promise<void> {
  await getPushQueue().add('enquiry-push', data, {
    jobId: `enquiry-push-${data.enquiry_id}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 50 },
  });
}

async function expoPost<T>(url: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  // Optional: only needed if "Enhanced Security for Push Notifications" is on in Expo.
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function disableTokens(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  // Soft-disable (no DELETE grant for the app role, RC-049).
  await prisma.staffPushDevice.updateMany({
    where: { expo_token: { in: tokens }, disabled_at: null },
    data: { disabled_at: new Date() },
  });
}

export async function resolveRecipientTokens(retailerId: string): Promise<string[]> {
  const devices = await prisma.staffPushDevice.findMany({
    where: { retailer_id: retailerId, disabled_at: null },
    select: { expo_token: true, staff_id: true },
  });
  if (!devices.length) return [];
  const staffIds = [...new Set(devices.flatMap((d) => (d.staff_id ? [d.staff_id] : [])))];
  const active = staffIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: staffIds }, retailer_id: retailerId, is_active: true },
        select: { id: true },
      })
    : [];
  const activeIds = new Set(active.map((s) => s.id));
  return devices
    .filter((d) => d.staff_id === null || activeIds.has(d.staff_id))
    .map((d) => d.expo_token);
}

export async function handleEnquiryPush(
  data: EnquiryPushJobData,
): Promise<{ sent: number; disabled: number }> {
  const tokens = await resolveRecipientTokens(data.retailer_id);
  if (!tokens.length) return { sent: 0, disabled: 0 };

  const body =
    data.item_count > 0
      ? `${data.item_count} item${data.item_count === 1 ? '' : 's'} asked about`
      : 'A customer sent an enquiry';

  const pairs: { id: string; token: string }[] = [];
  const dead: string[] = [];
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const res = await expoPost<{ data?: ExpoTicket[] }>(
      EXPO_SEND_URL,
      chunk.map((to) => ({
        to,
        title: 'New enquiry',
        body,
        sound: 'default',
        priority: 'high',
        channelId: 'enquiries',
        data: { type: 'enquiry', enquiryId: data.enquiry_id },
      })),
    );
    const tickets = res.data ?? [];
    chunk.forEach((token, idx) => {
      const t = tickets[idx];
      if (t?.status === 'ok' && t.id) pairs.push({ id: t.id, token });
      else if (t?.details?.error === 'DeviceNotRegistered') dead.push(token);
    });
  }

  await disableTokens(dead);
  if (pairs.length) {
    await getPushQueue().add(
      'enquiry-push-receipts',
      { tickets: pairs } satisfies EnquiryPushReceiptsJobData,
      {
        delay: RECEIPT_DELAY_MS,
        attempts: 2,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );
  }
  return { sent: pairs.length, disabled: dead.length };
}

/** Delayed follow-up: the tickets above only say "accepted"; the receipt says whether
 *  the device was reachable. Disables tokens Expo reports as DeviceNotRegistered. */
export async function handleEnquiryPushReceipts(
  data: EnquiryPushReceiptsJobData,
): Promise<{ disabled: number }> {
  const tickets = data.tickets.slice(0, 1000);
  if (!tickets.length) return { disabled: 0 };
  const res = await expoPost<{ data?: Record<string, ExpoTicket> }>(EXPO_RECEIPTS_URL, {
    ids: tickets.map((t) => t.id),
  });
  const receipts = res.data ?? {};
  const dead = tickets
    .filter((t) => receipts[t.id]?.details?.error === 'DeviceNotRegistered')
    .map((t) => t.token);
  await disableTokens(dead);
  return { disabled: dead.length };
}
