// RC-172 follow-up, OWNER-RUN via scripts/sweep-deleted-account-style.ts. Accounts erased before the
// fix still hold the photo-derived My Style profile; null those four columns on deleted accounts
// only. UPDATE, never DELETE (RC-049). Resumable: a re-run only sees what is still set.
// (The measurement columns from migration 161 did not exist when those accounts were erased.)
import { prisma } from '@kanchuki/db';

const WHERE = {
  deleted_at: { not: null },
  OR: [
    { skin_undertone: { not: null } },
    { skin_depth: { not: null } },
    { body_frame: { not: null } },
    { style_profile_at: { not: null } },
  ],
};

export async function sweepDeletedAccountStyle(opts: { apply: boolean }) {
  const matched = await prisma.customerAccount.count({ where: WHERE });
  if (!opts.apply || matched === 0) return { apply: opts.apply, matched, updated: 0 };
  const { count } = await prisma.customerAccount.updateMany({
    where: WHERE,
    data: {
      skin_undertone: null,
      skin_depth: null,
      body_frame: null,
      style_profile_at: null,
      profile_source: null, // migration 171: erasure clears where the undertone came from too
    },
  });
  return { apply: true, matched, updated: count };
}
