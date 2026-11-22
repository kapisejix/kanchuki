// Facebook/Instagram stay hidden until Meta App Review passes. Unset = hidden, so a
// release build needs no CI or eas.json change. Set EXPO_PUBLIC_META_SOCIAL=true to show.
// ponytail: entry points only; a typed deep link to /social/* still opens. Server is unchanged.
export const META_SOCIAL_ENABLED = process.env.EXPO_PUBLIC_META_SOCIAL === 'true';
