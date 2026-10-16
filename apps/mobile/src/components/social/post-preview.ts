import type { ComposeMedia } from './types';

/** One preview card: a platform and the name of the account it posts as. */
export interface PreviewTarget {
  platform: 'FACEBOOK' | 'INSTAGRAM';
  name: string;
}

/**
 * One card per platform with a selected account, headed by that account's
 * name (the first selected one when several share a platform). The preview
 * used to say "Your store" whatever Page was selected (RC-061).
 */
export function previewTargets(
  accounts: { id: string; platform: 'FACEBOOK' | 'INSTAGRAM'; account_name: string }[],
  targetIds: string[],
): PreviewTarget[] {
  const byPlatform = new Map<PreviewTarget['platform'], string>();
  for (const a of accounts) {
    if (targetIds.includes(a.id) && !byPlatform.has(a.platform)) {
      byPlatform.set(a.platform, a.account_name);
    }
  }
  return Array.from(byPlatform, ([platform, name]) => ({ platform, name }));
}

/**
 * The image the preview shows for the first media item. A video (the default
 * for a single product with a Ken Burns clip) has no image URL of its own, so
 * it shows the product photo as its poster — it used to show nothing (RC-061).
 */
export function previewCover(media: ComposeMedia[]): { url: string; isVideo: boolean } | null {
  const first = media[0];
  if (!first) return null;
  const url = first.kind === 'video' ? first.poster_url : first.url;
  return url ? { url, isVideo: first.kind === 'video' } : null;
}
