# Design & UX Review — Final Verdict

**Date:** 2026-08-20  
**Reviewed files:**
- `docs/design/feature-ideas-2026-07-30.md`
- `docs/references/mobile-ui-ux.md`
- `docs/references/marketing-landing.md`
- `docs/20-August-changes.md`

---

## Part 1: Design & UX Assessment

### What's Built vs. What the References Recommend

| Reference Area | Recommended | Kanchuki Status | Verdict |
|---------------|-------------|-----------------|---------|
| **Apple HIG** — 44pt touch targets, system fonts, safe areas | Enforced via accessibility audit (BUILD-LOG §10) | ✅ Done |
| **Material Design 3** — dynamic color, bottom sheets, FABs | Expo NativeWind + custom theme (Black & Gold Elegance) | ✅ Done |
| **Mobbin patterns** — product grid, bottom sheet, empty states | ProductGallery, ProductDetailSheet, onboarding screens exist | ✅ Done |
| **Myntra/Ajio** — image-heavy catalog, size selector, color swatches | Product detail with size chips, color variants, photo carousel | ✅ Done |
| **Reanimated 3** — spring animations, gesture handling | AnimatedPressable, gallery swipe, lightbox transitions | ✅ Done |
| **Typewolf/Fontjoy** — typography pairings | Inter for body, Matter SemiMono for display (BUILD-LOG §25) | ✅ Done |
| **Stripe/Linear** — hero, features, pricing, FAQ | Marketing page redesigned with Loom Design System (BUILD-LOG §5, §25) | ✅ Done |
| **PhonePe/Khatabook** — Indian SMB UX, UPI-first | OTP login, Razorpay UPI, INR-only pricing | ✅ Done |

### Strengths (What Works Well)

1. **Photo-first UX** — The entire retailer flow is built around photos: camera capture → AI auto-tag → catalog. No manual form filling. This matches the "photo-first" constraint in CLAUDE.md and is the right call for Indian SMB retailers who think in images, not text fields.

2. **WhatsApp-native distribution** — Collection links, enquiry flow, and catalog sharing are all WhatsApp-optimized. The wa.me link builder, contact gate, and bulk-send patterns are well-implemented. This is Kanchuki's moat and it's solid.

3. **AI Studio Shoots (FLUX Kontext)** — The template-based approach (4 curated presets, no free-text prompts) is the right UX decision. It removes decision fatigue for retailers while delivering professional results. The progress/ETA indicators we just added make the 10-60s wait transparent.

4. **Black & Gold Elegance brand system** — The shared `COLORS` module and consistent theming across mobile + web gives Kanchuki a premium feel that differentiates it from generic e-commerce builders. The Colabs-inspired marketing redesign (BUILD-LOG §25) is visually distinctive.

5. **Accessibility pass** — Labels, Reduce Motion, touch targets all hardened (BUILD-LOG §10). This is unusual for an Indian SMB product and shows maturity.

### Weaknesses (What Needs Work)

1. **Customer PWA is thin** — The customer-facing Next.js PWA has basic catalog browsing, cart, and try-on, but lacks:
   - Product search/filter on the storefront (only retailer-side AI search exists)
   - Wishlist persistence (favorites are session-only without login)
   - Order history for repeat customers
   - Push notifications for new arrivals or price drops
   
   The PWA is the customer's entire experience of Kanchuki. Right now it's functional but not sticky.

2. **No onboarding wizard for retailers** — The first-time experience is abrupt. There's an `onboarding_step` field in the schema but no guided wizard screen that walks a new retailer through: upload first product → set shop name → connect WhatsApp → send first collection link. The 50-retailer MVP target depends on activation, and activation depends on a smooth first-5-minutes experience.

3. **Empty states are generic** — Many screens show a plain "No data yet" message. The references (Mobbin, Stripe) recommend illustrated empty states with a clear CTA. For example:
   - Empty catalog → illustration + "Upload your first product" button
   - Empty orders → illustration + "Share a collection link to get started"
   - Empty customers → illustration + "Scan a QR to capture your first customer"

4. **Color swatch UX is basic** — The color chips in ProductGallery show a small circle + text label. Myntra/Ajio use larger, more tappable swatches with a selected ring animation. The current implementation works but doesn't feel premium.

5. **Marketing page has no social proof** — The Colabs-inspired redesign is visually strong but lacks:
   - Real retailer testimonials or case studies
   - Live retailer count ("50+ stores trust Kanchuki")
   - Before/after product photos (raw → AI studio shoot)
   - Video demo of the 30-second product upload flow

6. **No dark mode** — The references (Material Design 3, Mobbin) heavily feature dark mode. Kanchuki is light-only. Not critical for MVP but a common expectation for modern apps.

---

## Part 2: Remaining Work Audit (from 20-August-changes.md)

### Already Done (Completed in Previous Sessions)

| # | Item | Status |
|---|------|--------|
| 1 | Partner Network Manager Schema | ✅ Done |
| 2 | Partner Network Manager Migrations + Mobile UI | ✅ Done |
| 3 | F-021 Product & Store Ratings | ✅ Done |
| 4 | F-303 Order Management & Delivery Tracking | ✅ Done |
| 8 | Polling Exponential Backoff | ✅ Done (all 3 systems) |
| 9 | Progress/ETA Indicators | ✅ Done (studio shoot mobile UI) |
| 10 | BFL Credit Consumption Tracking | ✅ Done (AiUsageLog + migration 073) |
| 11 | Image Size Validation Before BFL Submit | ✅ Done |
| 13 | Product Gallery Lazy Loading | ✅ Done (already had `loading="lazy"`) |
| 14 | Color Chip Disabled State for SOLD Variants | ✅ Done (opacity + disabled + Sold text) |

### Remaining Major Issues — Priority Phases

#### Phase A: Documentation Cleanup (1 hour)
| # | Item | Why It Matters |
|---|------|----------------|
| 5 | Update INDIA-RETAILER-GROWTH.md GST status | Stale docs cause wrong status reports. GST invoicing is marked "Not built" but it IS built. |
| D1 | Apply migrations 066–073 to production | 8 migrations sitting unapplied. BFL credit tracking (073) won't write rows until applied. |

#### Phase B: High-Value Gaps (1–2 weeks)
| # | Item | Impact |
|---|------|--------|
| 7 | Instagram Business Publishing | Blocked on Meta app review — cannot code until approved. Submit NOW if not already. |
| 15 | Auto-Built Per-Variant Collection Links | A/B testing is half-manual. Needs hidden collection status in schema. ~3 hours. |
| 16 | Seasonal Deep-Dive Dashboards | Campaign analytics lack year-over-year and regional views. Needs design decisions first. |
| 19 | L2 Ecommerce Checkout Verification | Code exists but CLAUDE.md still marks it "Planned." Needs audit + doc update. |

#### Phase C: External Dependencies (Waiting on Third Parties)
| # | Item | Blocker |
|---|------|---------|
| D2 | Meta app review for Instagram | Submit via Meta for Developers dashboard |
| D3 | Google Business Profile API access | Submit via Google API Console |
| D4 | DLT registration of MSG91 sender ID | MSG91 dashboard, 2–7 working days |
| D5 | Mobile EAS build with MSG91 widget | `eas build` with widget env vars |
| 17 | F-022 Auto-Post to Google Business Profile | Blocked on D3 |
| 18 | F-302 Razorpay Route Split-Payments | Blocked on legal/compliance sign-off |
| 20 | Facebook Local Awareness Ads | Code exists, needs testing with real Meta credentials |
| 21 | Google Local Service Ads | Code exists, needs testing with real Google Ads credentials |

#### Phase D: Deferred / Future (Not Now)
| # | Item | Reason to Defer |
|---|------|-----------------|
| 6 | F-305 Multi-Store Management | Explicitly marked "DONT CODE" — scope underspecified |
| 12 | GPU Detection for V-Tone | Explicitly marked "DONT CODE" |
| 22 | Native In-App Microphone | Needs EAS dev build, not code |
| 23 | PWA/Retailer UI Language Toggle | No i18n framework installed, ~1 week effort |
| 25 | Customer-Facing Usual Size Self-Capture | Needs customer identity/login system |
| 26–34 | P4 Nice-to-haves | Future scope, no functional gap |

---

## Part 3: Final Verdict

### Design Grade: B+

**What's working:** The core UX loops (photo → tag → catalog → WhatsApp share → customer browse → try-on) are well-designed and functional. The brand system is distinctive. Accessibility is above average for the market.

**What's missing:** The customer-facing PWA needs more depth (search, wishlist, notifications), empty states need illustration + CTA, and the retailer onboarding needs a guided wizard. These are Phase 1 improvements, not MVP blockers.

### Code Health Grade: A-

**What's solid:** TypeScript clean across all 3 workspaces, comprehensive test coverage for auth/checkout/studio-shoot, consistent patterns (pollWithBackoff, AiUsageLog, Redis status), and thoughtful error handling (best-effort logging, graceful degradation).

**What's risky:** 8 unapplied migrations (066–073) means production is behind the schema. The MSG91 DLT registration blocker means OTP SMS delivery is still broken in production. These are operational risks, not code risks.

### Recommended Next Actions (In Order)

1. **Apply migrations 066–073 to production** — 10 minutes, unblocks BFL tracking + partner network
2. **Update docs** — Mark GST invoicing as built in INDIA-RETAILER-GROWTH.md, mark L2 checkout as built in CLAUDE.md
3. **Submit Meta/Google API access requests** — External dependencies that block Phase C items
4. **Build retailer onboarding wizard** — Highest ROI for activation metrics (50 retailers target)
5. **Add illustrated empty states** — Quick win for perceived polish across the app
