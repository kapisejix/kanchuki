'use client'

import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  DashboardSkeleton,
  BillingSkeleton,
  ReportsSkeleton,
  RetailersSkeleton,
  CustomersSkeleton,
  SupportTicketsSkeleton,
  AuditLogSkeleton,
  AddonPurchasesSkeleton,
  PlanLimitsSkeleton,
  PlanFeaturesSkeleton,
  RetailerDetailSkeleton,
  BackupSkeleton,
  QuerySkeleton,
  RateLimitsSkeleton,
  AiConfigSkeleton,
  NotificationsSkeleton,
  SettingsSkeleton,
  OperationsSkeleton,
  PendingApprovalsSkeleton,
  DeploymentsSkeleton,
  BackgroundImagesSkeleton,
  IntegrationsSkeleton,
  TeamMembersSkeleton,
  ActivitySkeleton,
  RetailerActivitySkeleton,
} from '@/components/skeletons/Skeletons'

function AdminLoading() {
  const pathname = usePathname()

  // Show the appropriate skeleton based on the current admin route
  const skeleton = (() => {
    if (pathname === '/admin') return <DashboardSkeleton />
    if (pathname.startsWith('/admin/billing')) return <BillingSkeleton />
    if (pathname.startsWith('/admin/reports')) return <ReportsSkeleton />
    if (pathname.startsWith('/admin/retailers') && pathname !== '/admin/retailers') return <RetailerDetailSkeleton />
    if (pathname.startsWith('/admin/retailers')) return <RetailersSkeleton />
    if (pathname.startsWith('/admin/customers')) return <CustomersSkeleton />
    if (pathname.startsWith('/admin/support-tickets')) return <SupportTicketsSkeleton />
    if (pathname.startsWith('/admin/audit-log')) return <AuditLogSkeleton />
    if (pathname.startsWith('/admin/addon-purchases')) return <AddonPurchasesSkeleton />
    if (pathname.startsWith('/admin/plan-features')) return <PlanFeaturesSkeleton />
    if (pathname.startsWith('/admin/plan-limits')) return <PlanLimitsSkeleton />
    if (pathname.startsWith('/admin/database/backup')) return <BackupSkeleton />
    if (pathname.startsWith('/admin/database/query')) return <QuerySkeleton />
    if (pathname.startsWith('/admin/settings/rate-limits')) return <RateLimitsSkeleton />
    if (pathname.startsWith('/admin/settings/ai-config')) return <AiConfigSkeleton />
    if (pathname.startsWith('/admin/settings/notifications')) return <NotificationsSkeleton />
    if (pathname.startsWith('/admin/settings')) return <SettingsSkeleton />
    if (pathname.startsWith('/admin/operations/pending')) return <PendingApprovalsSkeleton />
    if (pathname.startsWith('/admin/operations/deployments')) return <DeploymentsSkeleton />
    if (pathname.startsWith('/admin/operations')) return <OperationsSkeleton />
    if (pathname === '/admin/activity') return <ActivitySkeleton />
    if (pathname.startsWith('/admin/retailers') && pathname.endsWith('/activity')) return <RetailerActivitySkeleton />
    if (pathname.startsWith('/admin/background-images')) return <BackgroundImagesSkeleton />
    if (pathname.startsWith('/admin/integrations')) return <IntegrationsSkeleton />
    if (pathname.startsWith('/admin/team-members')) return <TeamMembersSkeleton />
    // Fallback for any other admin page
    return null
  })()

  if (skeleton === null) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center justify-center min-h-[60vh]"
      >
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-sm">Loading...</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {skeleton}
    </motion.div>
  )
}

export default AdminLoading
