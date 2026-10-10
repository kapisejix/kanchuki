import { NextResponse } from 'next/server';

// Scanner probes (/.git/config, /.env, /c/install.php) match the storefront
// [store]/[collection] route and used to render a 200 "not found" shell plus
// two API calls. Reject at the edge with a real 404 instead.
// ponytail: extension/dotfile list only; unknown real slugs still soft-404 (see docs/tasks/pending/storefront-soft-404.md §4.2)
export function middleware() {
  return new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: [
    '/(.*[.](?:[pP][hH][pP]|[aA][sS][pP][xX]?|[jJ][sS][pP]|[cC][gG][iI]|[sS][qQ][lL]|[bB][aA][kK]))',
    '/([.](?!well-known).*)',
  ],
};
