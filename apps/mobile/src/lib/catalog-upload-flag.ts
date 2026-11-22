// Paid on-site catalog upload stays out of the Play build until Google confirms in
// writing that it is exempt from Play Billing. Unset = hidden, so no CI or eas.json
// change is needed. Set EXPO_PUBLIC_CATALOG_UPLOAD=true to show.
export const CATALOG_UPLOAD_ENABLED = process.env.EXPO_PUBLIC_CATALOG_UPLOAD === 'true';
