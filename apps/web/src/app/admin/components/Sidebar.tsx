'use client';

import { resetAdminFetchCache } from '@/lib/admin-fetch';
import { adminRoleCanReach } from '@kanchuki/shared';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ActivitySquare,
  Archive,
  BarChart3,
  BookOpen,
  Bot,
  Bug,
  Flag,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  ClipboardList,
  Clock,
  Cpu,
  CreditCard,
  DatabaseBackup,
  Gauge,
  Gift,
  GitBranch,
  Handshake,
  HardDrive,
  History,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Package,
  Palette,
  Percent,
  Receipt,
  RefreshCw,
  Settings,
  Share2,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Tags,
  Terminal,
  Ticket,
  Users,
  UsersRound,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Leaf = { label: string; href: string; icon: LucideIcon; superAdminOnly?: boolean };
type Group = { label: string; icon: LucideIcon; superAdminOnly?: boolean; children: Leaf[] };
type NavItem = Leaf | Group | { separator: true };

const FLYOUT_WIDTH = 224;

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    children: [
      { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { label: 'Activity Feed', href: '/admin/activity', icon: ActivitySquare },
      { label: 'Retailer Discovery', href: '/admin/discovery', icon: MapPin },
    ],
  },
  {
    label: 'Retailers & Network',
    icon: Store,
    children: [
      { label: 'Retailers', href: '/admin/retailers', icon: Store },
      { label: 'Customers', href: '/admin/customers', icon: Users },
      { label: 'Engagement', href: '/admin/engagement', icon: Activity },
      { label: 'Aggregators', href: '/admin/aggregators', icon: RefreshCw },
      { label: 'WhatsApp Catalog', href: '/admin/whatsapp-catalog', icon: MessageCircle },
    ],
  },
  {
    label: 'Catalog',
    icon: Package,
    children: [
      { label: 'Default Categories', href: '/admin/default-categories', icon: LayoutGrid },
      { label: 'Default Attributes', href: '/admin/default-attributes', icon: Tags },
      { label: 'Catalog Upload Tiers', href: '/admin/catalog-upload-tiers', icon: Package },
      { label: 'Suits Designs', href: '/admin/suits-designs', icon: Sparkles },
      { label: 'Design Categories', href: '/admin/suits-design-categories', icon: Tags },
      { label: 'Ratings & Reviews', href: '/admin/ratings', icon: Star },
    ],
  },
  {
    label: 'Creative',
    icon: Palette,
    children: [
      { label: 'Studio Styles', href: '/admin/studio-styles', icon: Clapperboard },
      { label: 'Photo Cleanup Test', href: '/admin/photo-cleanup-test', icon: Wand2 },
      { label: 'My Style', href: '/admin/my-style', icon: Palette },
      { label: 'Festivals', href: '/admin/festivals', icon: CalendarDays },
      { label: 'Design Library', href: '/admin/design-templates', icon: Share2 },
      { label: 'AI Designs', href: '/admin/ai-custom-designs', icon: Wand2 },
      { label: 'Social Publishing', href: '/admin/social', icon: Megaphone },
      { label: 'Google Business', href: '/admin/gbp', icon: MapPin },
    ],
  },
  {
    label: 'Team & Support',
    icon: UsersRound,
    children: [
      { label: 'Team Members', href: '/admin/team-members', icon: UsersRound },
      { label: 'Support Tickets', href: '/admin/support-tickets', icon: Ticket },
      { label: 'Bug Reports', href: '/admin/bug-reports', icon: Bug },
      { label: 'AI Content Reports', href: '/admin/ai-content-reports', icon: Flag },
      { label: 'Contact Submissions', href: '/admin/contact-submissions', icon: Mail },
      { label: 'Survey Submissions', href: '/admin/survey', icon: ClipboardList },
    ],
  },
  {
    label: 'Reports',
    icon: BarChart3,
    children: [
      { label: 'Overview', href: '/admin/reports', icon: BarChart3 },
      { label: 'GST Reports', href: '/admin/reports/gst', icon: Receipt },
      { label: 'AI Usage', href: '/admin/ai-usage', icon: Bot },
      {
        label: 'Try-On GPU Usage',
        href: '/admin/try-on-usage',
        icon: Cpu,
      },
      {
        label: 'Storage Report',
        href: '/admin/storage-report',
        icon: DatabaseBackup,
      },
    ],
  },
  {
    label: 'Finance',
    icon: CreditCard,
    children: [
      { label: 'HSN Rules', href: '/admin/hsn-rules', icon: Receipt, superAdminOnly: true },
      {
        label: 'Billing & Invoices',
        href: '/admin/billing',
        icon: CreditCard,
        superAdminOnly: true,
      },
      { label: 'Commission', href: '/admin/commission', icon: Percent, superAdminOnly: true },
      {
        label: 'Referral Program',
        href: '/admin/referral-settings',
        icon: Handshake,
        superAdminOnly: true,
      },
      { label: 'Referral Monitor', href: '/admin/referral', icon: Gift, superAdminOnly: true },
      {
        label: 'Addon Purchases',
        href: '/admin/addon-purchases',
        icon: ShoppingCart,
        superAdminOnly: true,
      },
      { label: 'Plan Limits', href: '/admin/plan-limits', icon: Gauge, superAdminOnly: true },
      {
        label: 'Resource Packs',
        href: '/admin/resource-packs',
        icon: Layers,
        superAdminOnly: true,
      },
      {
        label: 'Plan Features',
        href: '/admin/plan-features',
        icon: CheckSquare,
        superAdminOnly: true,
      },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    superAdminOnly: true,
    children: [
      { label: 'General Settings', href: '/admin/settings', icon: Settings, superAdminOnly: true },
      {
        label: 'Integrations & API Keys',
        href: '/admin/integrations',
        icon: KeyRound,
        superAdminOnly: true,
      },
      { label: 'AI Providers', href: '/admin/ai-providers', icon: Bot, superAdminOnly: true },
      { label: 'AI Config', href: '/admin/settings/ai-config', icon: Cpu, superAdminOnly: true },
      {
        label: 'Rate Limits',
        href: '/admin/settings/rate-limits',
        icon: Gauge,
        superAdminOnly: true,
      },
      { label: 'Theme', href: '/admin/settings/theme', icon: Palette, superAdminOnly: true },
    ],
  },
  {
    label: 'Operations',
    icon: Shield,
    children: [
      {
        label: 'Operations Overview',
        href: '/admin/operations',
        icon: Shield,
      },
      {
        label: 'Deployments',
        href: '/admin/operations/deployments',
        icon: GitBranch,
      },
      {
        label: 'Deployment Gate',
        href: '/admin/operations/gate',
        icon: Activity,
      },
      { label: 'Audit Log', href: '/admin/audit-log', icon: History },
      {
        label: 'Database Health',
        href: '/admin/database/status',
        icon: Activity,
      },
      {
        label: 'Server Memory',
        href: '/admin/server-memory',
        icon: Activity,
      },
      {
        label: 'Query Console',
        href: '/admin/database/query',
        icon: Terminal,
        superAdminOnly: true,
      },
      {
        label: 'Backup & Restore',
        href: '/admin/database/backup',
        icon: HardDrive,
      },
      {
        label: 'Deletion Vault',
        href: '/admin/database/deletion-vault',
        icon: Archive,
      },
      {
        label: 'Support Sessions',
        href: '/admin/support-sessions',
        icon: KeyRound,
      },
    ],
  },
];

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
  onLogout,
  role = 'SUPER_ADMIN',
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onLogout: () => void;
  role?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openGroup, setOpenGroup] = useState<{ label: string; top: number; left: number } | null>(
    null,
  );

  const focusFlyout = useRef(false);
  const flyoutTrigger = useRef<HTMLButtonElement | null>(null);

  const handleLogout = () => {
    // Clearing sessionStorage alone is not enough — the layout keeps its
    // `authed` state, so the dashboard would stay mounted. onLogout tells the
    // layout to flip back to the login screen.
    sessionStorage.removeItem('admin_key');
    // The CSRF cookie+token pair is tied to the old session — drop the
    // cached token so the next login starts clean.
    resetAdminFetchCache();
    router.push('/admin');
    onLogout();
  };

  const isLinkActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  const isSuperAdmin = role === 'SUPER_ADMIN';

  // A nav entry is Super-Admin-only if its own flag says so OR the shared
  // access list says so. The flag is per-entry and easy to forget when adding a
  // route — deriving from the list is what keeps the nav from advertising a
  // surface that the API and the page guard would both refuse (RC-034).
  // Accepts NavItem (including `{ separator: true }`) and narrows, so a
  // separator or a group is never mistaken for a link.
  const isSuperAdminOnlyItem = (entry: NavItem) => {
    const href = 'href' in entry ? entry.href : undefined;
    const flagged = 'superAdminOnly' in entry && entry.superAdminOnly === true;
    // adminRoleCanReach covers Super-only AND the Admin-only tier (Operations, Reports...)
    // that MARKETING_MANAGER / SUPPORT_MANAGER must not see (owner decision 2026-11-03).
    return flagged || !adminRoleCanReach(role, href);
  };

  const filteredNavItems = NAV_ITEMS.filter((item) => {
    if (isSuperAdminOnlyItem(item) && !isSuperAdmin) {
      return false;
    }
    return true;
  })
    .map((item) => {
      if ('children' in item) {
        const visibleChildren = item.children.filter(
          (child) => !isSuperAdminOnlyItem(child) || isSuperAdmin,
        );
        return { ...item, children: visibleChildren };
      }
      return item;
    })
    .filter((item) => {
      if ('children' in item && item.children.length === 0) return false;
      return true;
    });

  // Hover opens a group for mouse users. Click/tap and Enter open it too, so
  // touch and keyboard can reach every page; keyboard focus moves into the flyout
  // because it is portalled to <body> and is otherwise out of tab order.
  const openFlyout = (label: string, row: HTMLElement) => {
    const rect = row.getBoundingClientRect();
    setOpenGroup({
      label,
      top: rect.top,
      left: Math.max(8, Math.min(rect.right, window.innerWidth - FLYOUT_WIDTH - 8)),
    });
  };

  const focusRing =
    'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/60';

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={onMobileClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-60 flex-col border-r border-white/[0.08] bg-gray-950 transition-transform duration-200 ease-out ${
          collapsed ? 'lg:w-16' : ''
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center border-b border-white/[0.08] px-4">
          <Link href="/admin" className={`flex items-center gap-2 rounded-md ${focusRing}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-sm font-semibold text-gray-950">
              K
            </span>
            {!collapsed && (
              <span className="truncate whitespace-nowrap text-sm font-medium text-white">
                Kanchuki Admin
              </span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
          {filteredNavItems.map((item, index) => {
            if ('separator' in item) {
              return <div key={`sep-${index}`} className="my-2 border-t border-white/[0.08]" />;
            }

            if ('children' in item) {
              const isGroupActive = item.children.some((c) => isLinkActive(c.href));
              const isOpen = openGroup?.label === item.label;

              return (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={(e) => openFlyout(item.label, e.currentTarget)}
                  onMouseLeave={() => setOpenGroup(null)}
                >
                  <button
                    type="button"
                    aria-label={item.label}
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    onClick={(e) => {
                      // detail === 0 means the click came from the keyboard.
                      if (e.detail === 0) {
                        focusFlyout.current = true;
                        flyoutTrigger.current = e.currentTarget;
                      }
                      openFlyout(item.label, e.currentTarget.parentElement as HTMLElement);
                    }}
                    className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm transition-colors ${focusRing} ${
                      isGroupActive
                        ? 'bg-white/[0.08] text-white'
                        : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                    }`}
                  >
                    <item.icon size={16} strokeWidth={1.5} className="shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 whitespace-nowrap text-left">{item.label}</span>
                        <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-gray-500" />
                      </>
                    )}
                  </button>

                  {isOpen &&
                    openGroup &&
                    createPortal(
                      <div
                        ref={(el) => {
                          if (el && focusFlyout.current) {
                            focusFlyout.current = false;
                            el.querySelector('a')?.focus();
                          }
                        }}
                        // Flush against the trigger (no gap) so the pointer never leaves the
                        // hover zone on the way in; clamped + scrollable so tall groups
                        // (Settings & Operations) can't run off the bottom of the viewport.
                        style={{
                          position: 'fixed',
                          top: Math.max(
                            8,
                            Math.min(openGroup.top, window.innerHeight - 8 - (item.children.length * 36 + 16)),
                          ),
                          left: openGroup.left,
                          width: FLYOUT_WIDTH,
                          maxHeight: 'calc(100vh - 16px)',
                        }}
                        className="z-50 overflow-y-auto rounded-lg border border-white/[0.08] bg-gray-900 p-1 shadow-lg"
                        onMouseEnter={() => setOpenGroup(openGroup)}
                        onMouseLeave={() => setOpenGroup(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setOpenGroup(null);
                            flyoutTrigger.current?.focus();
                          }
                        }}
                        onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                            setOpenGroup(null);
                          }
                        }}
                      >
                        {item.children.map((child) => {
                          const childActive = isLinkActive(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              aria-current={childActive ? 'page' : undefined}
                              onClick={() => {
                                onMobileClose();
                                setOpenGroup(null);
                              }}
                              className={`flex h-9 items-center gap-2 rounded-md px-3 text-sm transition-colors ${focusRing} ${
                                childActive
                                  ? 'bg-white/[0.08] text-white'
                                  : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                              }`}
                            >
                              <child.icon size={16} strokeWidth={1.5} className="shrink-0" />
                              <span className="whitespace-nowrap">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>,
                      document.body,
                    )}
                </div>
              );
            }

            const isActive = isLinkActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                aria-current={isActive ? 'page' : undefined}
                className={`flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors ${focusRing} ${
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                }`}
              >
                <item.icon size={16} strokeWidth={1.5} className="shrink-0" />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="space-y-0.5 border-t border-white/[0.08] p-2">
          <div className="flex h-12 items-center gap-2 px-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-gray-300">
              <Shield size={16} strokeWidth={1.5} />
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <p className="truncate text-xs font-medium text-gray-200">Admin</p>
                <p className="truncate text-xs text-gray-500">Platform manager</p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out"
            className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-gray-400 transition-colors hover:bg-white/[0.04] hover:text-gray-200 ${focusRing}`}
          >
            <LogOut size={16} strokeWidth={1.5} className="shrink-0" />
            {!collapsed && <span className="whitespace-nowrap">Sign out</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={onToggle}
          className="absolute -right-3 top-20 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-white/[0.08] bg-gray-800 text-gray-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60 lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft
            size={14}
            strokeWidth={1.5}
            className={`transition-transform duration-150 ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>
      </aside>
    </>
  );
}

export default Sidebar;
