// Google Business Profile availability for one retailer — the ONE function every GBP route
// and the dashboard checklist consult, so they cannot disagree (RC-073 shape).
//
// Available = the retailer's plan has GOOGLE_BUSINESS_PROFILE (fails closed: no row = OFF)
//           AND a Super Admin has connected the shared Google identity
//           AND an admin has marked Google's API access approved.
// Any one missing => the integration simply does not exist for the retailer.

import { prisma } from '@kanchuki/db';
import { hasFeature } from './features.js';
import { GBP_KEYS, gbpApiApproved, getGbpSetting } from './google-business.js';

export async function gbpAvailable(retailerId: string): Promise<boolean> {
  if (!(await hasFeature(retailerId, 'GOOGLE_BUSINESS_PROFILE'))) return false;
  const [token, approved] = await Promise.all([
    getGbpSetting(GBP_KEYS.refreshToken),
    gbpApiApproved(),
  ]);
  return !!token && approved;
}

export async function gbpLinked(retailerId: string): Promise<boolean> {
  const link = await prisma.gbpLink.findUnique({
    where: { retailer_id: retailerId },
    select: { status: true },
  });
  return link?.status === 'LINKED';
}
