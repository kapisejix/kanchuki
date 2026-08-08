// Web origin for external links (terms, privacy, try-on, collection share, etc.)
// Single source instead of per-screen copies — same fallback as the production
// domain used by apps/web metadataBase and tryon/in-store.tsx.
export const WEB_URL = process.env['EXPO_PUBLIC_WEB_URL'] ?? 'https://kanchuki.app'
