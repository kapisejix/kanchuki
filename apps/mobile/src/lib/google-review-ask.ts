/** "Ask for a Google review" over the retailer's own WhatsApp (client-side wa.me, no API/quota). */
export function buildGoogleReviewAskMessage(a: {
  customerName: string;
  shopName: string;
  reviewUrl: string;
}): string {
  return `Hi ${a.customerName}, thank you for shopping at ${a.shopName}! If you liked it, please leave us a quick Google review: ${a.reviewUrl}`;
}

/** Consent attested, owner only (staff phones are masked with •), place id set. */
export function canAskGoogleReview(a: {
  consentGiven?: boolean;
  phone: string;
  isOwner: boolean;
  placeId?: string | null;
}): boolean {
  return a.consentGiven === true && a.isOwner && !!a.placeId && !a.phone.includes('•');
}
