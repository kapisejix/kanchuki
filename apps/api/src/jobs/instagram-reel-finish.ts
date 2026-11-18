// instagram-reel-finish.ts — F-034 T2b: finish a Reel Instagram was still
// processing when the composer request gave up waiting (30 s).
//
// The composer wrote a PROCESSING SocialPost row and queued this job on the
// maintenance queue (`recordPendingReel`). Each attempt reads the container
// status ONCE; while Instagram is still processing, the attempt throws and
// BullMQ checks again a minute later (30 attempts). The last failed attempt
// flips the row to FAILED via `failStuckReel` (maintenance `failed` listener).
//
// ponytail: if Redis loses the job, the row stays PROCESSING with nothing to
// finish it. No sweep yet; add one (PROCESSING older than 1 h → FAILED) if
// that is ever seen.
import { decryptSecret, prisma } from '@kanchuki/db';
import { instagramContainerStatus, publishIgContainer } from '../lib/meta-graph.js';

export interface ReelFinishJobData {
  socialPostId: string;
  containerId: string;
}

export const REEL_TOO_SLOW_MESSAGE =
  'Instagram took too long to process the video, so it was not posted. Please try again.';
const REEL_REJECTED_MESSAGE =
  'Instagram could not process the video, so it was not posted. Please try again.';

export async function handleInstagramReelFinish(
  data: ReelFinishJobData,
): Promise<'posted' | 'failed' | 'skipped'> {
  const post = await prisma.socialPost.findUnique({
    where: { id: data.socialPostId },
    include: { account: true },
  });
  if (!post || post.status !== 'PROCESSING') return 'skipped';

  const token = decryptSecret(post.account.access_token_encrypted);
  const status = await instagramContainerStatus(data.containerId, token);

  if (status === 'ERROR' || status === 'EXPIRED') {
    await prisma.socialPost.updateMany({
      where: { id: post.id, status: 'PROCESSING' },
      data: { status: 'FAILED', error_message: REEL_REJECTED_MESSAGE },
    });
    return 'failed';
  }

  let postId: string | null = null;
  let permalink = '';
  if (status === 'FINISHED') {
    ({ postId, permalink } = await publishIgContainer(
      post.account.platform_account_id,
      token,
      data.containerId,
    ));
  } else if (status !== 'PUBLISHED') {
    // IN_PROGRESS or no status yet — BullMQ retries after the fixed backoff.
    throw new Error('Instagram is still processing the Reel');
  }
  // PUBLISHED: an earlier attempt published, then died before the row write.
  // The Reel is live; record it without the id rather than publish twice.

  // The Reel is live now — a row-write blip must not turn into a retry (the
  // next attempt would read PUBLISHED and lose the id) or a FAILED row.
  const write = () =>
    prisma.socialPost.updateMany({
      where: { id: post.id, status: 'PROCESSING' },
      data: {
        status: 'POSTED',
        external_post_id: postId,
        external_post_url: permalink || null,
        error_message: null,
      },
    });
  for (let attempt = 1; ; attempt++) {
    try {
      await write();
      return 'posted';
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
}

/** Last attempt failed: the Reel never went out, so the row says FAILED. */
export async function failStuckReel(data: ReelFinishJobData): Promise<void> {
  await prisma.socialPost.updateMany({
    where: { id: data.socialPostId, status: 'PROCESSING' },
    data: { status: 'FAILED', error_message: REEL_TOO_SLOW_MESSAGE },
  });
}
