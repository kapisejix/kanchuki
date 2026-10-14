'use client';

import { useEffect } from 'react';

// Invite links are shared as https (chat apps only linkify http/https), so the
// member lands here in a browser. Try to hand off to the installed app once;
// the visible buttons remain the fallback when the browser blocks it.
export function AutoOpenApp({ deepLink, intentLink }: { deepLink: string; intentLink: string }) {
  useEffect(() => {
    const isAndroid = /android/i.test(navigator.userAgent);
    window.location.href = isAndroid ? intentLink : deepLink;
  }, [deepLink, intentLink]);
  return null;
}
