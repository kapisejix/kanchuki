'use client'

/**
 * BONEYARD INTEGRATION DEMO
 * ─────────────────────────
 * 
 * This file demonstrates how Boneyard (boneyard-js) would replace the
 * manual Tailwind skeleton components for the /admin/retailers page.
 * 
 * CURRENT APPROACH (what we have now):
 *   - 22 hand-crafted skeleton components in Skeletons.tsx
 *   - Each uses <P> (pulse div) + <ShimmerOverlay> + manual widths
 *   - Must be manually updated when page layouts change
 * 
 * BONEYARD APPROACH (what this demo shows):
 *   - <Skeleton name="retailers" loading={isLoading}> wraps real content
 *   - Boneyard snapshots the real UI at build time via headless browser
 *   - Generates pixel-perfect .bones.json layout files automatically
 *   - Animations: pulse, shimmer, or solid — configurable per skeleton
 * 
 * BUILD COMMAND:
 *   npx boneyard-js build
 *   → Visits the app, finds every <Skeleton name="...">, snapshots layout
 *   → Outputs ./src/bones/retailers.bones.json
 *   → Import once: import './bones/registry'
 * 
 * WATCH MODE (dev):
 *   npx boneyard-js build --watch
 *   → Re-captures on every HMR update automatically
 */

// ── 1. Wrap real content with <Skeleton> ───────────────────────
//
// Instead of manually designing:
//   <P className="h-7 w-32 rounded-lg" />  ← ✗ Manual widths
//   <P className="h-10 flex-1 rounded-xl" /> ← ✗ Approximate
//
// You wrap the actual working component:
//
//   import { Skeleton } from 'boneyard-js/react'
//   import './bones/registry'  // once at app entry
//
//   function RetailersPage() {
//     const [loading, setLoading] = useState(true)
//     const [retailers, setRetailers] = useState<Retailer[]>([])
//
//     useEffect(() => {
//       fetch('/api/retailers')
//         .then(r => r.json())
//         .then(data => { setRetailers(data); setLoading(false) })
//     }, [])
//
//     return (
//       <div className="space-y-6">
//         <Skeleton name="retailers-header" loading={loading}>
//           <div className="flex items-center gap-3">
//             <h1 className="text-2xl font-bold">Retailers</h1>
//           </div>
//         </Skeleton>
//
//         <Skeleton name="retailers-filters" loading={loading}>
//           <div className="flex flex-wrap gap-3">
//             <input placeholder="Search..." />
//             <select>{/* state filter */}</select>
//             <select>{/* plan filter */}</select>
//           </div>
//         </Skeleton>
//
//         <Skeleton name="retailers-table" loading={loading}
//           animate="shimmer"
//           stagger={80}
//           transition={300}
//         >
//           <table>{/* full table with real data */}</table>
//         </Skeleton>
//       </div>
//     )
//   }

// ── 2. Or wrap the entire page in one Skeleton ─────────────────
//
// For simpler pages, a single <Skeleton> with a "name" prop
// captures the entire page layout as one snapshot:
//
//   <Skeleton name="retailers-page" loading={loading}>
//     <div className="space-y-6">
//       <header>...</header>
//       <form>...</form>
//       <table>...</table>
//     </div>
//   </Skeleton>
//
// The skeleton renders with shimmer animation and 80ms stagger
// between individual "bones" (as configured in boneyard.config.json).

// ── 3. Props comparison ────────────────────────────────────────
//
// | Prop       | Our Manual Approach     | Boneyard                  |
// |------------|-------------------------|---------------------------|
// | animation  | animate-pulse (CSS)    | 'pulse' | 'shimmer' | 'solid' |
// | stagger    | manual per-div delays  | true=80ms or custom ms   |
// | transition | none (instant swap)    | fade-out when done (ms)  |
// | dark mode  | separate classes       | built-in darkColor prop  |
// | fidelity   | approximate widths     | pixel-perfect from DOM   |
// | maintenance| update by hand         | re-run `boneyard-js build`|
// | build step | none                   | headless browser capture  |

// ── 4. Integration with loading.tsx ────────────────────────────
//
// Boneyard works at the component level, not the route level.
// The existing admin loading.tsx skeleton routing stays the same,
// but each <Skeleton> wrapper self-manages its loading state:
//
// BEFORE (loading.tsx renders RetailersSkeleton manually):
//   if (pathname.startsWith('/admin/retailers'))
//     return <RetailersSkeleton />
//
// AFTER (loading.tsx delegates to Boneyard, or renders nothing):
//   if (pathname.startsWith('/admin/retailers'))
//     return null  // <Skeleton> in the page component handles it
//
// This is the key migration path: move loading state from the
// route-level skeleton to page-level <Skeleton> wrappers.

// ── 5. What changes in package.json ───────────────────────────
//
// "scripts": {
//   "bones": "npx boneyard-js build",
//   "bones:watch": "npx boneyard-js build --watch",
//   "dev": "next dev & npm run bones:watch"
// }

// ── 6. Trade-offs summary ──────────────────────────────────────
//
// Pros of Boneyard:
//   ✓ Pixel-perfect skeletons — auto-synced to real UI
//   ✓ Built-in shimmer, pulse, solid animations
//   ✓ Stagger, transition, dark mode out of the box
//   ✓ Works cross-framework (React, Vue, Svelte, etc.)
//   ✓ Less manual code to maintain
//
// Cons of Boneyard:
//   ✗ Adds build step (headless browser) — slower CI/tests
//   ✗ External dependency with potential breaking changes
//   ✗ Generated .bones.json files must be committed to git
//   ✗ Overkill for simple pages (dashboard cards, etc.)
//   ✗ Our 22 skeletons already exist and work well

export function BoneyardDemo() {
  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-lg font-bold mb-4">Boneyard Integration Demo</h2>
      <p className="text-sm text-gray-600 mb-4">
        See the inline comments in this file for a full walkthrough.
        Key files for the integration:
      </p>
      <ul className="text-sm space-y-2 text-gray-700 list-disc pl-5">
        <li><code>boneyard.config.json</code> — config at web app root</li>
        <li><code>./src/bones/registry</code> — generated registry (committed to git)</li>
        <li><code>*.bones.json</code> — generated layout snapshots (committed to git)</li>
        <li>
          <code>&lt;Skeleton name=&quot;retailers&quot; loading=&#123;loading&#125;&gt;</code>
          — wraps real content in page components
        </li>
        <li>
          <code>npx boneyard-js build</code> — run after layout changes
        </li>
      </ul>
    </div>
  )
}

export default BoneyardDemo
