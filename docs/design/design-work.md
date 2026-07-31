# Design Work — Skill Workflow + Reference Sources

Status: Step 1 (audit) run on `apps/mobile`, 2026-07-31 — score 10/20 "Acceptable, significant work needed." Two P1 findings (accessibility labels, Reduce Motion) hardened same day. See "Mobile audit results" below for the full report and what's still open.

## Skill workflow (recap)

| Step | Skill | Purpose |
|---|---|---|
| 1. Audit | `/impeccable` | Diagnose before touching anything — hierarchy, spacing, color, motion gaps |
| 2. Build path | `/redesign-existing-projects` (existing surface) or `/hallmark` / `/high-end-visual-design` (new surface) | Pick redesign vs greenfield approach |
| 3. Visual direction (optional) | `/imagegen-frontend-web` or `/imagegen-frontend-mobile` | Reference images only, no code, look before building |
| 4. Shadows/borders/gradients/cards | `/high-end-visual-design` | Exact recipes for premium look |
| 5. Color/palette/fonts | `/ui-ux-pro-max` | Cross-check against locked tokens in `apps/web/tailwind.config.ts` (marketing) — admin stays plain gray/cyan by design |
| 6. Animation | `/find-animation-opportunities` → `/improve-animations` → `/animation-vocabulary` (naming) → `ecc:motion-foundations`/`motion-patterns`/`motion-ui`/`motion-advanced` → `/apple-design` (mobile) → `/emil-design-eng` (final polish) | Find gaps, plan, implement, polish |
| 7. Icons | `/apple-design` + `ecc:motion-ui` (motion), `/ui-ux-pro-max` (static picks) | No dedicated icon skill |
| 8. Final taste-check | `/design-taste-frontend-v1` (installed) | Run last, catches remaining generic/AI-slop |
| 9. Charts/dashboards | `/dataviz` | Separate from general UI color rules — admin `/admin/reports` |

Per-surface intensity:
- **Marketing web** (`apps/web` public pages): full workflow, steps 1→8
- **Admin panel** (`apps/web/admin`): steps 1→8 but LIGHT touch — CLAUDE.md says admin stays motion/decoration-restrained on purpose, don't over-animate
- **Mobile** (`apps/mobile`, RN/Expo): steps 1→8, heavy on step 6's `apple-design` (gesture/spring physics) and step 5's RN-stack knowledge in `ui-ux-pro-max`

---

## Reference sources (copy/modify starting points)

These are living platforms — they refresh with current-year trends continuously rather than shipping dated snapshots, so "2026 design" = whatever's trending on them right now, not a fixed page. Check them fresh each time, don't rely on this list being frozen-accurate.

### Frontend (marketing web — `apps/web` public pages)

| Site | What you get |
|---|---|
| [Awwwards](https://www.awwwards.com/) | Award-winning full sites, current visual/motion trends, filter by style |
| [Godly](https://godly.website/) | Curated cutting-edge web design, heavy on motion/interaction |
| [Land-book](https://land-book.com/) | Landing page gallery, filterable by industry/style |
| [Lapa Ninja](https://www.lapa.ninja/) | Free landing page inspiration, categorized |
| [Httpster](https://httpster.net/) | Handpicked design showcase |
| [SaaS Landing Page](https://saaslandingpage.com/) | SaaS-specific landing pages — closest fit to Kanchuki's marketing site |
| [Tailwind UI](https://tailwindui.com/) | Paid, copy-paste Tailwind component code — direct match to your stack |
| [shadcn/ui](https://ui.shadcn.com/) | Free, copy-paste React + Tailwind components, current default for premium-feeling React UI |
| [Aceternity UI](https://ui.aceternity.com/) | Free animated React/Tailwind components — gradients, hover effects, scroll animations |
| [Magic UI](https://magicui.design/) | Free animated components built for Next.js + Tailwind + Framer Motion — matches your stack exactly |
| [HyperUI](https://www.hyperui.dev/) | Free Tailwind component snippets, no framework lock-in |
| [Flowbite](https://flowbite.com/) | Tailwind component library + blocks, free tier copy-paste |
| [Figma Community](https://www.figma.com/community/) | Free full design systems/UI kits, search "SaaS dashboard 2026" or similar |

### Admin dashboard (`apps/web/admin`)

| Site | What you get |
|---|---|
| [Tremor](https://tremor.so/) | React dashboard components (charts, KPI cards) built on Tailwind — pairs with `/dataviz` skill |
| [Untitled UI](https://www.untitledui.com/) | Paid, extremely thorough dashboard/admin component set + Figma files |
| [shadcn/ui blocks](https://ui.shadcn.com/blocks) | Free dashboard block layouts (sidebar, tables, stat cards) |
| [Tailwind UI — Application UI](https://tailwindui.com/components) | Paid, dedicated admin/app-shell section (sidebars, tables, forms, stats) |
| [Cruip](https://cruip.com/) | Free + paid admin dashboard templates, Tailwind-based |
| [Refactoring UI](https://www.refactoringui.com/) | Not a component site — the book/reference behind most of the above; explains WHY these layouts work |

### Mobile screens (`apps/mobile`, React Native/Expo)

| Site | What you get |
|---|---|
| [Mobbin](https://mobbin.com/) | Largest real-app screen library (iOS/Android), searchable by flow/pattern — the standard reference for "how does a real app do X" |
| [Page Flows](https://pageflows.com/) | Full user-flow recordings from real apps, not just static screens |
| [Screenlane](https://screenlane.com/) | Curated mobile UI screenshots by category |
| [NativeBase](https://nativebase.io/) / [Gluestack UI](https://gluestack.io/) | Copy-paste React Native component libraries |
| [Tamagui](https://tamagui.dev/) | RN + web universal component library, current for cross-platform 2026-era RN apps |
| [React Native Reanimated examples](https://docs.swmansion.com/react-native-reanimated/examples) | Animation/gesture reference matching `/apple-design` skill's spring-physics guidance |
| [Figma Community](https://www.figma.com/community/) | Search "mobile app UI kit 2026" for free full-screen mockup sets to copy/modify |

---

## Notes

- All links above are established platforms, not one-off pages — verify current content yourself before copying, since these refresh independently of this doc.
- Stack match matters more than trend match: prioritize shadcn/ui, Magic UI, Tailwind UI, Tremor (web/admin) and NativeBase/Gluestack/Tamagui (mobile) since they're copy-paste compatible with Kanchuki's actual stack (Next.js+Tailwind, RN/Expo) — the pure-inspiration sites (Awwwards, Mobbin, etc.) are for direction, not literal code.

---

## Mobile audit results (`/impeccable audit`, 2026-07-31)

Native audit of `apps/mobile` (React Native/Expo), scored against `ios.md`/`android.md`. Full report given inline in-session; summary here for future reference.

**Score: 10/20 — Acceptable, significant work needed.** Reads as genuinely native (expo-router, `Alert.alert`, `SafeAreaProvider`, no disabled back-gesture), not a web port.

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 1 | 0 `accessibilityLabel` across 48 files; 0 Reduce Motion handling |
| 2 | Performance | 3 | `FlatList` correctly used on the 3 high-volume screens; images resized pre-upload |
| 3 | Appearance & Theming | 2 | 0 dark mode; mobile's rust/turmeric/sand tokens drifted from web's current palette |
| 4 | Platform Conformance | 2 | 6-destination bottom tab bar (spec ceiling: 3–5) |
| 5 | Adaptivity | 2 | Only 4/48 screens have any window-size awareness |

**Fixed same day (P1 harden pass):**
- Added `src/hooks/useReduceMotion.ts`, gated onboarding confetti + step-slide (crossfade instead), skeleton shimmer (dim instead of pulse), offline-banner slide (instant instead of animated). Functional loading/gesture animation (AI-processing spinner, pinch-zoom) left untouched — they carry state, not decoration.
- Swept every `lucide-react-native` icon import across the app for icon-only `TouchableOpacity`/`Pressable` controls with no visible label. Added `accessibilityLabel`/`accessibilityRole="button"` to 66 spots across 32 files (back buttons, remove/close/share/filter/FAB icons). Selection chips with `{selected && <Check/>}` overlays were left as-is — they already carry a visible text label, just don't announce `accessibilityState.selected`; flagged as a smaller follow-up, not silent.
- Also fixed the P3 touch-target finding in passing: `hitSlop={8}` added to the 24×24px remove-photo button in `app/product/bulk.tsx` (was below the 44pt/48dp minimum).
- Corrected `docs/DESIGN.md`'s stale claim that mobile has no design tokens — it does (verified in `apps/mobile/tailwind.config.js`), the doc just hadn't been updated after that work landed.

**Still open (not part of this pass):** dark mode, 6-tab bottom nav (recommend `/impeccable shape` to redesign down to spec), tablet/window-size adaptivity, mobile/web accent-color drift (rust/turmeric/sand), `accessibilityState` on selection chips. Re-run `/impeccable audit` on `apps/mobile` after any of these land to track score.
