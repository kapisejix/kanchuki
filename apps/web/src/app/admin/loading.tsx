'use client'

import { usePathname } from 'next/navigation'
import { PageSkeleton, type SkeletonVariant } from '@/components/skeletons/Skeletons'

// Pick the skeleton shape from the route. Anything not listed falls through
// to 'table' (the most common admin layout).
function variantFor(pathname: string): SkeletonVariant {
  if (pathname === '/admin') return 'dashboard'
  if (pathname.startsWith('/admin/billing')) return 'dashboard'
  if (pathname.startsWith('/admin/reports')) return 'dashboard'
  if (pathname.startsWith('/admin/addon-purchases')) return 'dashboard'
  if (pathname.startsWith('/admin/settings')) return 'form'
  if (pathname.startsWith('/admin/operations')) return 'form'
  if (pathname.startsWith('/admin/database/backup')) return 'form'
  if (pathname.startsWith('/admin/database/query')) return 'form'
  if (pathname.startsWith('/admin/integrations')) return 'form'
  if (pathname.startsWith('/admin/background-images')) return 'form'
  if (pathname.startsWith('/admin/plan-limits')) return 'form'
  if (pathname.startsWith('/admin/plan-features')) return 'form'
  return 'table'
}

export default function AdminLoading() {
  return <PageSkeleton variant={variantFor(usePathname())} />
}
