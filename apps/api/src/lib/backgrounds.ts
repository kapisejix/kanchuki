// F-028 auto-contrast background selection.
// The admin manages a global backdrop library (F-011, admin-media.ts). Each
// backdrop carries a stored tone (LIGHT/DARK, computed from its average
// luminance at upload time, admin-overridable). When a product photo is
// cleaned without an explicit retailer-picked background, the pipeline picks
// the newest ACTIVE backdrop whose tone OPPOSES the garment:
//   dark garment  → LIGHT backdrop
//   light garment → DARK backdrop
// No matching backdrop (or an unclassified/mid-tone garment) falls back to
// the plain white default exactly as before.
import { prisma } from '@kanchuki/db';

export async function pickContrastBackground(tone: 'dark' | 'light'): Promise<string | null> {
  const row = await prisma.backgroundImage.findFirst({
    where: { is_active: true, tone: tone === 'dark' ? 'LIGHT' : 'DARK' },
    orderBy: { created_at: 'desc' },
  });
  return row?.image_url ?? null;
}
