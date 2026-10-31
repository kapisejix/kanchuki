// What a Retailer row looks like on the wire. The row carries integration ciphertext, KYC object
// pointers and the auth user id; managers, salespeople and support delegates can all fetch the
// profile, so those columns never leave the server (H2-5, RC-143). Both profile responses
// (GET /me and PUT /me) go through toRetailerDto so a new secret column is added in ONE place —
// retailers-dto.test.ts reads schema.prisma and fails if a secret-looking column is missing here.
export const RETAILER_SECRET_FIELDS = [
  'auth_user_id',
  'whatsapp_api_access_token',
  'fb_ads_access_token',
  'google_ads_refresh_token',
  'google_ads_developer_token',
  // KYC: the object key and its permanent public url point at the same Aadhaar/GST scan (H5-1).
  'kyc_gst_r2_key',
  'kyc_gst_url',
  'kyc_aadhar_front_r2_key',
  'kyc_aadhar_front_url',
  'kyc_aadhar_back_r2_key',
  'kyc_aadhar_back_url',
] as const;

export type RetailerSecretField = (typeof RETAILER_SECRET_FIELDS)[number];

export function toRetailerDto<T extends object>(row: T): Omit<T, RetailerSecretField> {
  const out = { ...row } as Record<string, unknown>;
  for (const field of RETAILER_SECRET_FIELDS) delete out[field];
  return out as Omit<T, RetailerSecretField>;
}
