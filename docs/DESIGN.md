# Kanchuki — UI/UX Design Document

**Version:** 1.2  
**Date:** June 2026 (v1.0) · **Updated 2026-07-28:** Brand Identity palette/typography/tokens replaced with the "Loom" design system (Option A) — see `docs/design/emil-design.md` for the full audit, the four direction options considered, and why Loom was picked. · **Updated 2026-07-31:** corrected the "mobile has no design tokens" claim below (it does — see Design Tokens section) and closed the accessibility-label / Reduce Motion gaps flagged by an `/impeccable audit` pass on `apps/mobile` — see `docs/references/history/reports/2026-07-31-design-work.md`.  
**Tools:** Figma (design), Nativewind (mobile — design tokens ARE wired, see note below; this doc previously claimed otherwise), TailwindCSS (web — no component-primitive library installed; the "shadcn/ui" claim in v1.0 was inaccurate)

---

## Design Philosophy

**For Retailers (the hard part):**
- Simple enough for a 50-year-old shopkeeper who has never used software
- Hindi-friendly UI labels (even before full localization)
- Large touch targets (retailer often using phone with one hand while serving customer)
- Photos first — minimize text input
- Instant feedback — "AI is reading your photo..." skeleton loader

**For Customers (the easy part):**
- Beautiful browsing experience (like Instagram for clothes)
- Zero friction — no login, no app install
- WhatsApp native feel (they live in WhatsApp)
- Load fast on 3G

---

## Brand Identity

**Name:** Kanchuki  
**Tagline:** "Aapki dukan, AI ki taakat"  
*(Your store, AI's power)*

**Color Palette — "Loom" natural-dye system (Option A, `docs/design/emil-design.md` §3.1):**
```
Ink (primary):      oklch(35% 0.12 265)   — deep indigo, primary buttons/links/nav
Rust (accent):       oklch(48% 0.16 25)   — madder red, destructive actions + alert badges
Turmeric (highlight): oklch(78% 0.15 85)  — success/positive states, used sparingly
Cotton (surface/bg):  oklch(97% 0.01 90)  — warm off-white, not pure #fff
Charcoal (text):      oklch(20% 0.01 265) — body text
Stone (muted):        oklch(55% 0.01 265) — secondary text, borders
```
No separate green/red "Success"/"Error" tokens — Turmeric and Rust cover those semantic roles, keeping the palette to one accent family instead of five competing hues. Full 50–900 scales for Ink/Rust/Turmeric/Stone live in `apps/web/tailwind.config.ts`.

**Status:** live in `apps/web` (marketing page + tokens) as of 2026-07-28. **Also live in `apps/mobile`** (`apps/mobile/tailwind.config.js` has a full `ink`/`rust`/`turmeric`/`sand`/`cotton`/`charcoal` scale, verified 2026-07-31 during an `/impeccable audit` pass) — this doc previously claimed mobile had no tokens; that was stale. What mobile does NOT share with web: the `rust`/`turmeric`/`sand` hue values drifted from web's current palette (only `ink`/navy is pixel-matched via the shared `--color-ink-600` CSS var), and mobile has no dark-mode variant at all. Both are open gaps, not "no tokens."

**Typography (updated 2026-08-11):**
- Web marketing/content display headings: **MatterSemiMono** — brand font served via `next/font/local` from `apps/web/src/fonts/` (user-uploaded OTF files, weights 400/500/600/700), see `apps/web/src/app/layout.tsx`. Replaced the Space Grotesk stand-in (added 2026-08-11 Colabs redesign). Fallback stack is monospace to match the semi-mono character.
- Web UI/body + mobile: `Inter` (clean, professional)
- Customer storefronts (`/c/*`, `/store/*`) declare their own scoped `--font-display` (Bricolage) in their layouts — NOT affected by the marketing font change.
- Mobile display face: `Nunito` was the v1.0 plan; unverified whether it's actually wired anywhere in `apps/mobile` — treat as unconfirmed until checked, not as fact
- Fallback: System UI
- **Hindi/Devanagari coverage not yet verified for any of the above** — required before Year-1 Hindi localization ships (CLAUDE.md constraint); check before committing further to MatterSemiMono specifically

**Icon Style:** Lucide icons, thin-line weight (`strokeWidth: 1.5`, not Lucide's bold default) — matches the Loom "stitched line" direction, no new icon library added

---

## Retailer App Screens (React Native)

### Screen 1: Splash / Loading
- Kanchuki logo centered
- Tagline below
- Shimmer animation while loading session

---

### Screen 2: Onboarding (First Time)

**Step 1/6 — Welcome**
- Full-screen illustration: shopkeeper with tablet
- "Transform your store in minutes"
- [Get Started] CTA (prominent, full-width)

**Step 2/6 — Phone OTP**
- +91 phone number input (large, numeric keyboard)
- [Send OTP] button
- 6-digit OTP input (auto-submit when full)
- Resend OTP (with 30-second cooldown)

**Step 3/6 — Shop Setup**
- Shop Name (text field)
- City (dropdown + search)
- Primary Category (chips: Suits, Sarees, Kurtis, Mixed, etc.)
- GSTIN (optional at this step, skippable)

**Step 4/6 — Rack Setup**
- "How is your shop organized?" visual
- Preset options: By Rack (A/B/C), By Category, By Price Range
- Or skip: "I'll set this up later"

**Step 5/6 — Upload First Product**
- Camera button (large, centered)
- "Take a photo of any product in your store"
- Shows AI magic animation after photo taken
- AI-filled form appears (user sees auto-tagging in action)
- [Save Product] button

**Step 6/6 — Done!**
- Celebration animation
- "Your first product is ready"
- [Go to Dashboard] CTA

---

### Screen 3: Main Dashboard (Home)

**Top Bar:**
- Kanchuki logo + Shop name
- Notification bell (badge count)
- Profile avatar

**Quick Stats (horizontal cards):**
- Total Products: 247
- Collection Views Today: 34
- Enquiries Today: 8
- Pending Enquiries: 3

**Quick Actions (2×2 grid):**
- 📷 Add Product
- 👥 Add Customer
- 🔗 New Collection
- 🔍 Search Products

**Recent Collections (horizontal scroll):**
- Collection thumbnail + title + "12 views · 3 enquiries"

**Bottom Navigation:**
- Home / Catalog / Customers / Collections / More

---

### Screen 4: Add Product (Camera Flow)

**State 1: Camera View**
- Full-screen camera
- Frame guide: "Place product in frame"
- [Capture] button (large circle, bottom center)
- Gallery icon (bottom left) to pick existing photo
- Flash toggle (top right)

**State 2: AI Processing**
- Photo preview (dimmed)
- Centered card: "AI is analyzing your product..."
- Animated dots / progress bar
- Estimated time: "~8 seconds"

**State 3: AI Result**
- Photo preview (clear)
- Below: auto-filled form with ink highlight on AI-generated fields
- Fields: Category · Type · Colors · Fabric · Pattern · Occasion Tags
- Edit icon on each field
- Price field (empty — user fills)
- Location field: Rack / Shelf selector
- [Save Product] button (primary)
- [Re-take Photo] link

---

### Screen 5: Product Catalog

**Filter Bar (horizontal scroll chips):**
- All · Available · Sold · Suits · Sarees · Kurtis · Lehengas

**Sort:** Price ↑↓ · Newest · Most Viewed

**Product Grid (2 columns):**
- Product photo (tap for fullscreen)
- Below photo: Color dot + Price + Rack location
- Status badge (Available = green, Sold = red, Reserved = yellow)
- Long press: quick actions (Edit / Mark Sold / Delete)

**Search Bar (sticky top):**
- "Search by color, occasion, fabric..." placeholder
- Voice input button (🎤)
- Natural language search ("pink cotton wedding")

---

### Screen 6: In-Store AI Search

**Full-screen search experience:**
- Large text input with prominent cursor
- Suggested queries (tap to fill):
  - "Cotton suit under ₹2500"
  - "Wedding function heavy work"
  - "Something for office"
  - "Mother-in-law, 50s, festive"
- Voice input (🎤) — converts speech to text
- [Search] button

**Results Screen:**
- "Showing 12 products matching 'pink cotton wedding'"
- Product grid (2 columns) sorted by relevance
- Each card: Photo + Name + Price + Rack location
- Tap card: full product detail
- "Shortlist" button per card → builds trial list
- Shortlist tray (bottom bar): "3 selected · View Trial List"

---

### Screen 7: Customer List

**Search bar:** Search by name or phone  
**Customer cards:**
- Name + Phone (last 4 digits)
- Preference chips (Bright colors, Wedding, < ₹3000)
- Last visit date
- [View Profile] button

**Add Customer FAB (floating action button)**

---

### Screen 8: Customer Profile

**Header:** Name + Phone + Avatar (initial)  
**Preference Section:**
- Colors: [chips with color dots]
- Styles: [chips]
- Budget: ₹1000–3000
- Occasions: [chips]

**Action Buttons:**
- [Show Matching Products] → AI search pre-seeded with customer preferences
- [Create Collection for This Customer] → auto-picks matching products
- [WhatsApp] → opens WhatsApp chat with customer

**History:**
- Collections sent (with view/enquiry status)
- Products enquired about
- Products purchased (manual entry)

---

### Screen 9: Create Collection

**Step 1: Select Products**
- Grid of catalog (same as Catalog screen)
- Checkboxes overlay on each product
- Selected counter: "14 products selected"
- [Next] button

**Step 2: Collection Details**
- Title: text field ("Diwali Special 2026")
- Description: optional
- Valid for: 7 / 14 / 30 days (segmented control)
- Customer-specific: toggle "For a specific customer" → customer picker

**Step 3: Preview + Share**
- Rendered preview of customer-facing page
- [Copy Link] button (large, prominent)
- [Share on WhatsApp] button (green, WhatsApp icon)
- [Copy Link + Open WhatsApp] combo action

---

### Screen 10: Collection Analytics

**Collection header:** Title + Created date + Valid until  
**Stats grid:**
- Total Views: 47
- Unique Viewers: 31
- Products Favorited: 8
- Enquiries: 5

**Product breakdown table:**
- Product photo + name | Views | Favorites | Enquiries

**Enquiries list:**
- Customer name/number + "Interested in: [product name]" + timestamp
- [Reply on WhatsApp] button per enquiry

---

## Customer Web Screens (Next.js)

### Screen CW-1: Collection Page

**URL pattern:** `kanchuki.app/c/{collection-slug}`

**Header:**
- Shop name + city
- "Shared by [Shop Name]"
- Search/filter icon

**Product Grid:**
- 2 columns (mobile) / 3 columns (tablet)
- Product card: Photo + Name + Price + Color chips + ❤️ Favorite button
- Tag chips: Occasion, Fabric

**Sticky Bottom Bar:**
- Shortlisted count: "❤️ 3 saved"
- [Enquire on WhatsApp] button (green)

---

### Screen CW-2: Product Detail

**Photo:** Full-width, swipeable if multiple photos  
**Details:**
- Name, Price (range or exact)
- Color variants (dot swatches)
- Tags: Occasion, Fabric, Pattern, Neck, Sleeve
- Description

**Actions:**
- [❤️ Save to Favorites] toggle
- [Try This On] (Phase 1 — initially hidden)
- [Enquire on WhatsApp] → pre-filled message

**WhatsApp message template:**
```
Namaste! I saw your collection "[Collection Name]" and I'm interested in:

• [Product Name] - ₹[Price]
[Photo URL]

Please share availability and details.
```

---

### Screen CW-3: Favorites / Shortlist

- Simple list of hearted products
- [Clear All] link
- [Enquire About All Selected] → WhatsApp message with all products listed

---

### Screen CW-4: Try-On Flow — REMOVED

Removed in `chore/remove-unwanted-features` (2026-08-31). Virtual Try-On, the
cart/checkout screens, showroom booking, lookbooks and the 360° spin viewer are
no longer part of the product. See `docs/references/history/reports/2026-08-31-feature-teardown-spec.md`.

---

## TV/Display Mode (In-Store)

Retailer can switch to "TV Mode" — optimized for 40"+ screens connected to tablet

**Layout:**
- Full-screen product photo (left 60%)
- Product details panel (right 40%): Name, Price, Colors, Fabric, Location
- Navigation: Prev / Next product arrows
- Auto-slideshow mode (5s per product)

**Use case:** Retailer connects tablet to shop TV, rotates through shortlisted products for customer sitting across counter.

---

## Responsive Breakpoints

| Breakpoint | Context |
|-----------|---------|
| 320–480px | Mobile portrait (primary) |
| 481–768px | Mobile landscape / small tablet |
| 769–1024px | Tablet (retailer in-store) |
| 1025px+ | Desktop (admin, TV mode) |

---

## Accessibility Requirements

- All images: descriptive alt text (AI-generated from product tags)
- Color contrast: WCAG AA minimum (4.5:1 for text)
- Touch targets: minimum 44×44pt (Apple HIG), 48×48dp (Android MD)
- Loading states: skeleton screens (no layout shift)
- Error states: clear message + action
- Form validation: inline, not modal alert

**Mobile status (updated 2026-07-31, `apps/mobile`):**
- **Screen reader labels:** fixed. An `/impeccable audit` found 0 `accessibilityLabel` usage across all 48 screens despite 43+ files using icon-only `TouchableOpacity` controls (back buttons, remove/close/share/filter icons). Swept and added `accessibilityLabel`/`accessibilityRole="button"` to every icon-only control found (66 labels across 32 files) — see `docs/references/history/reports/2026-07-31-design-work.md` for the full audit report.
- **Reduce Motion:** fixed for the app's decorative animation — `src/hooks/useReduceMotion.ts` (wraps `AccessibilityInfo.isReduceMotionEnabled`) now gates the onboarding confetti overlay, the onboarding step-transition slide (crossfades instead when Reduce Motion is on, per HIG/Material guidance), the skeleton shimmer loop (dims instead of pulses), and the offline-banner slide-in (jumps instead of animating). Functional loading affordances (AI-processing spinner/progress bar, pinch-to-zoom photo viewer) were deliberately left alone — they carry state, not decoration.
- **Tab bar fixed 2026-07-31 (follow-up pass):** the 6-destination bottom tab bar flagged above is now 5 (Analytics moved to a top-level route, reachable via a Home header icon) — at the 3–5 platform guidance. Dark mode remains open (0 `useColorScheme` usage) — declined for this pass in favor of a light-only gradient/shadow/animation direction, see `docs/references/history/reports/2026-07-31-design-work.md`. (The one sub-44pt touch target it found — a remove-photo button in bulk upload — was fixed alongside the accessibility-label sweep.)

**Skill reference:** `accessibility` skill for WCAG 2.2 AA audit

---

## Loading States & Empty States

| State | What to Show |
|-------|-------------|
| Empty catalog | "Take your first photo" illustration + CTA |
| No search results | "No matching products. Try different words" + suggested searches |
| Uploading photo | Progress bar + "AI is reading your product..." |
| Collection 0 views | "Share this link with customers to start" |
| Failed AI tagging | "We couldn't read this photo. Add details manually" + form |

---

## Notification Design

**Push notifications (Phase 0):**
- New enquiry received: "📩 Priya liked 3 products in your Festive collection!"

**In-app notifications:**
- Collection view count milestone: "Your Diwali collection got 50 views!"
- New product suggestions from wholesaler (Phase 2)

---

## Design Tokens

**Web (`apps/web/tailwind.config.ts`) — "Black & Gold Elegance", live as of 2026-08-03** (previous repaints: Loom 2026-07-28 → Red Elegance 2026-07-29 → this one; this block was stale through both of those, corrected now):

```typescript
colors: {
  ink:      { /* 50–900 hex scale */ 600: 'var(--color-ink, #14213D)' },  // deep navy, primary
  rust:     { /* 50–900 hex scale */ 600: '#FCA311' },                     // regal gold, hero accent
  turmeric: { /* 50–900 hex scale */ 600: '#8A5A12' },                     // antique gold/bronze, grounding accent
  sand:     { /* 50–900 hex scale */ 200: '#E5E5E5' },                     // neutral grey
  cotton: '#FFFFFF',   // luminous white
  charcoal: '#000000', // bold black
  glow: '#FFC94D', veil: '#0B1322', // decorative hero-wash only (was icy/petal)
},
fontFamily: {
  sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],     // Inter
  display: ['var(--font-display)', 'Georgia', 'serif'],       // Fraunces
},
borderRadius: {
  'xl': '12px',   // selvedge-edge cards (§3.5, emil-design.md)
  '2xl': '16px',
  '3xl': '24px',
  full: '999px',  // buttons/badges — pill shape, not squircle
}
```

Every ramp is plain hex now (oklch dropped this pass) — removes the hand-conversion step between web and mobile that the previous two repaints each had to redo.

**Marketing/content pages (updated 2026-08-11):** the marketing + content pages (`apps/web/src/components/site/**`, the marketing page trees, legal pages) were repainted to a **Colabs-inspired palette** — additive, on top of the Black & Gold tokens below, NOT a replacement. New tokens in `apps/web/tailwind.config.ts`: `cream` (#F9F8F6 warm off-white canvas), `carbon` (#060606 near-black), `volt` (#D9DB4D yellow-lime accent), `cobalt` (#0046C7 link blue), plus modular card chips `terracotta` (#B1653B), `iris` (#5757A5), `moss` (#66662A), `fern` (#59C28A), `lilac` (#BFB9E3), `mint` (#32C58B), `sandal` (#DCB688), `mist` (#BED2F5). Structure per colabs.com.au: bold hero → infinite auto-scrolling `Marquee` of solid color service cards → editorial sections → big CTA. Lenis smooth scrolling on the marketing Navbar. The legacy `ink`/`rust`/`turmeric`/`sand` tokens stay untouched so the customer storefront and admin panel keep their Black & Gold identity. Reference: `docs/design/emil-design.md` §3.1 (which still documents the pre-Colabs values — the marketing repaint is tracked in CLAUDE.md's 2026-08-11 entry).

**Logo (updated 2026-08-11):** `apps/web/public/kanchuki-logo.png` — a user-supplied 884×176 dark-navy "Kanchuki" wordmark (red i-dot) used in the marketing Navbar + Footer. Replaced the interlaced-thread `KanchukiMark` SVG logomark (component deleted; favicon/OG images still use the old brand mark).

**Mobile (`apps/mobile/tailwind.config.js`) — pixel-identical to web as of this pass.** Same `ink`/`rust`/`turmeric`/`sand`/`cotton`/`charcoal` hex values, copied literally (no oklch→hex conversion needed anymore, since web dropped oklch too). `ink` stays wired to the same admin-configurable `--color-ink-600` CSS var via NativeWind's `vars()`. Shared-token package (`packages/shared`) still not built (`docs/design/emil-design.md` §3.4) — these two files are still kept in sync by hand, just a lower-risk hand-sync than before.

---

## Audit: `apps/mobile` Design Pass — 2026-08-03

`/impeccable audit` (native/React Native path) run against `apps/mobile`, source-level (no simulator in this environment — findings are code-verified, not visually verified on device). Triggered by a user report: "most screens are out of the mobile screen" during retailer registration, plus a request for a color/gradient/animation/motion polish pass. **Nothing in this section has been fixed yet — audit only, per user request ("report first, development after").**

### Score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3/4 | Labels + Reduce Motion fixed 2026-07-31; Dynamic Type scaling unverified (no device) |
| 2 | Performance | 3/4 | FlatList virtualization + blurhash/cache in `ProductCard` are solid; no issues found |
| 3 | Appearance & Theming | 3/4 | Tokens exist and are correctly hand-synced (verified via oklch→hex conversion — see correction below); 0 dark mode; gradient/shadow CTA treatment on only 12/~40 screens |
| 4 | Platform Conformance | 3/4 | Single icon set (Lucide), Expo Router idiomatic nav, 5-item tab bar — no web-shaped controls found |
| 5 | Adaptivity | 2/4 | `app.json` sets `supportsTablet: true` + `orientation: "portrait"` (locked) together — tablet claimed but portrait-locked and only 5/~40 screens are grid-adaptive (`useIsTablet`/`useGridColumns`, per 2026-07-31 pass) |
| **Total** | | **13/20** | **Acceptable — significant work needed** |

### P0 — registration screen overflow (the reported bug)

**`apps/mobile/app/auth/phone.tsx`** and **`apps/mobile/app/auth/otp.tsx`** — the very first screens a retailer sees — are the *only two full screens in the app* built as a fixed `flex-1 ... justify-between` layout with **no `ScrollView`** and **no `useSafeAreaInsets`** (confirmed by grep against all ~40 screens; every other screen either uses `ScrollView` or a virtualized `FlatList`). Top padding is a hardcoded `pt-20`/`pt-16`, bottom a hardcoded `pb-10` — neither adapts to notch/Dynamic Island/gesture-nav insets or to a taller system font size. On a short device (budget Android, common in this app's target market) or with accessibility font scaling on, the logo+heading+input block and the CTA+terms block are both pinned to opposite ends of a box that has nowhere to shrink — content clips or overlaps, and there is no scroll to recover it. This is exactly the reported symptom, and it is isolated to these two screens (`onboarding.tsx`, the step-by-step shop-setup flow that follows, already does this correctly — `ScrollView` + `useSafeAreaInsets` for its bottom bar).

Secondary compounding issue, same two files: `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — on Android, `behavior` is `undefined`, so keyboard avoidance relies entirely on `windowSoftInputMode`/`adjustResize` rather than an explicit RN-level fallback. Combined with no `ScrollView`, if resize doesn't kick in on a given Android build the phone-number input or OTP boxes can end up hidden behind the keyboard.

**Fix direction** (not yet applied): wrap both screens' content in `ScrollView` (`keyboardShouldPersistTaps="handled"`, matching `onboarding.tsx`'s pattern), swap the hardcoded `pt-*`/`pb-*` for `useSafeAreaInsets()`, and add explicit `behavior="height"` for Android in `KeyboardAvoidingView`.

### P1 — CTA visual hierarchy inconsistency

`GradientButton` (gradient fill + shadow + press-scale) exists and works well, but is used on only 12 of ~40 screens. The other ~28 use a flat `bg-ink-600 rounded-2xl` `AnimatedPressable` with no shadow — same interaction feel (press-scale is universal via `AnimatedPressable`, applied nearly everywhere), but visibly different weight/depth for what's semantically the same "primary action" role. Registration (`phone.tsx`, `otp.tsx`, `onboarding.tsx`) is flat; a first-time user's very first CTA doesn't get the app's best button.

### P2 — tablet/orientation contradiction (color-drift finding retracted)

**Correction (2026-08-03, same session):** the original version of this section claimed `rust`/`turmeric`/`sand` drift between `apps/mobile/tailwind.config.js` and `apps/web/tailwind.config.ts`. That was wrong — inherited from this doc's own stale "Design Tokens" section above, which still described the old "Loom" palette. Web actually repainted to "Red Elegance" on 2026-07-29 (see `docs/design/emil-design.md`), and mobile's hex values were correctly hand-synced to it: verified by converting web's oklch stops to sRGB hex directly (CSS Color 4 algorithm) — every stop checked (`rust-50/600/900`, `turmeric-50/500/900`, `sand-50/600/900`) is a pixel-exact match to mobile's hex. Only `ink` uses a live CSS-var mechanism; the rest are static but *correct*. The "Design Tokens" section above still needs a manual pass to replace its Loom-era swatch block with the current Red Elegance one — flagged, not fixed in this pass (out of scope of the mobile audit).

- `app.json`: **decided 2026-08-03 — committing to tablet.** `orientation` changed from locked `"portrait"` to `"default"` (sensor-based). `supportsTablet: true` (iOS) now matches reality for orientation; screen-by-screen tablet-adaptive layout coverage is still only 5/~40 screens — extending `useIsTablet`/`useGridColumns` to the rest is tracked as follow-up work, not done in this pass (no RN simulator in this environment to verify a blind sweep of ~35 screens).
- Zero `useColorScheme`/dark-mode usage anywhere in `apps/mobile` (known, previously declined).

### P3 — motion/polish gaps (the "make it feel professional" ask)

- **Icon animation:** zero icon-specific micro-animation exists — every icon gets the same generic `AnimatedPressable` press-scale (0.96 spring) and nothing else. No favorite-heart bounce, no bell-badge pulse on new enquiry, no checkmark pop on save.
- **Product slider:** already well-built — `apps/mobile/app/product/[id].tsx` has a swipeable `ScrollView` carousel, pagination dots, synced thumbnail strip, prev/next arrows, and pinch-to-zoom. Genuinely good; polish opportunity only (snap easing, dot scale-on-active), not a gap.
- **Gradients:** `expo-linear-gradient` is installed and used in exactly one place (`GradientButton`). No gradient backgrounds/headers/hero moments anywhere else — the "Loom" palette (`ink`→`ink-800`, `turmeric` accents) has room for a signature gradient treatment on hero/empty-state/celebration moments (onboarding step 6 confetti screen is the obvious first candidate).
- No haptics (`expo-haptics` not installed — would be a new dependency, not currently justified without a specific request).

### Positive findings

- `AnimatedPressable` press-scale is applied almost universally (39/~40 screens) — interaction feedback is consistent even where visual weight (gradient vs flat) isn't.
- `FlatList` used correctly everywhere lists appear (no manual `ScrollView`-wrapped-map anti-pattern).
- `ProductCard` handles the Android elevation/rounded-corner clipping bug correctly (separate outer/inner nodes) and has blurhash + error-state + cache-policy handling — genuinely solid.
- Prior 2026-07-31 audit's a11y-label and Reduce Motion fixes hold up — re-verified, not regressed.
- Single icon library (Lucide, thin-line) used consistently — no icon-set drift.

### Recommended actions (priority order)

1. **[P0] `/impeccable adapt`** — fix `auth/phone.tsx` + `auth/otp.tsx`: add `ScrollView`, swap fixed padding for `useSafeAreaInsets`, fix Android `KeyboardAvoidingView` behavior.
2. **[P1] `/impeccable polish`** — extend `GradientButton` to every screen's primary CTA (registration first), so visual weight matches semantic importance app-wide.
3. **[P2] `/impeccable colorize`** or a shared-token package — resolve the mobile/web `rust`/`turmeric`/`sand` drift; decide tablet support for real (`adapt`) or drop the claim.
4. **[P3] `/impeccable animate`** — icon micro-animations (favorite heart, notification badge, save checkmark) and a gradient treatment for hero/celebration moments (onboarding step 6 first), using the already-installed Reanimated 4 + `expo-linear-gradient` — no new dependencies needed.

Re-run `/impeccable audit` after fixes to confirm the score moved off 13/20.

---

## Design Direction — Audit & Vision (Emil Kowalski principles)

> Merged from the former `docs/design/emil-design.md`.


**Status:** Planning document. Nothing in this file is implemented — it's a punch list + creative direction for you to approve, reject, or remix before any code changes.
**Direction decided (2026-07-28):** Option A — "Loom" (textile-native). Options B/C/D remain documented in Part 2 as the alternatives considered and rejected, in case a specific surface later wants to borrow from one of them.
**Written:** 2026-07-28. **Scope:** `apps/web` (customer PWA + marketing + admin), `apps/mobile` (retailer RN app).
**Method:** Grounded in the actual repo state (see Part 1), then designed against Emil Kowalski's interaction-design philosophy (invisible detail, restrained motion, honest feedback) plus a structural-variety pass to make sure Kanchuki doesn't end up looking like every other "AI SaaS" template.

---

### Part 1 — What's actually there right now

I read the code before proposing anything. Three problems, none of them cosmetic:

#### 1.1 Your design system is fiction

`docs/design/DESIGN.md` documents a violet/amber palette (`#7C3AED` primary, `#F59E0B` secondary), Nunito for mobile, Inter for web, shadcn/ui + Nativewind as the component stack.

**None of that is what's actually built:**

| DESIGN.md says | Code actually has | Where |
|---|---|---|
| Primary `#7C3AED` (violet) | Primary is cyan/teal, `#0891B2`/`#06b6d4` scale | `apps/web/src/app/globals.css` |
| shadcn/ui + Radix | No `@radix-ui/*`, no `class-variance-authority`, no shadcn — zero `components/ui` folder | `apps/web/package.json` |
| Mobile token block (colors, spacing) defined in Nativewind config | `apps/mobile/tailwind.config.js` → `theme.extend: {}` — empty | `apps/mobile/tailwind.config.js` |

This isn't a nitpick — it means there is currently **no single source of truth** a designer, a new engineer, or an AI agent can read to know what Kanchuki looks like. Every screen has been styled ad hoc against whatever was already on the page next to it. That's how you get three shades of "primary blue" across five screens without anyone deciding it.

#### 1.2 No shared token layer between web and mobile

`packages/shared` and `packages/db` have no design-tokens file. Web colors live in `apps/web/src/app/globals.css` as raw CSS vars; mobile has nothing at all. There is no mechanism today for "we changed the brand accent" to propagate to both apps — you'd hand-edit two unrelated files and hope they match.

#### 1.3 What's actually built, so you know what's safe to reuse

- **Web:** Tailwind + CSS vars (no component-primitive library). Custom shadow tokens (`soft`, `soft-lg`), two animations (`fade-in`, `slide-up`). `framer-motion ^11.3.19` is already installed and used on the marketing page (`apps/web/src/app/page.tsx`, hero + nav).
- **Mobile:** NativeWind + `react-native-reanimated ~4.1.7`, already installed, config empty.
- **Admin:** 16 route sections under `apps/web/src/app/admin` (activity, billing, catalog-upload-tiers, database, plan-features, plan-limits, reports, retailers, support-tickets, team-members, etc.) — this is a real, data-dense internal tool, not a marketing surface. Treat it as one.
- **Marketing/landing:** `apps/web/src/app/page.tsx` + `sections/MarketingSections.tsx` (Features/How It Works/Pricing/FAQ), already framer-motion-animated.
- **Brand assets:** PWA icons only (`icon-192.png`, `icon-512.png`). No logo file, no wordmark treatment, no favicon design pass.

**Bottom line:** you don't have a "needs a redesign" problem, you have a "never had a design system" problem. Fixing that is higher leverage than any single animation polish pass — do Part 3 before Part 4.

---

### Part 2 — Four creative directions: pros, cons, pick one

You said the current design reads as generic AI output and you don't like the color, structure, or overall feel. Fair — that's exactly what happens when a palette gets picked ad hoc screen-by-screen instead of decided once. Rather than hand you one more single "trust me" direction, here are four genuinely different directions with honest trade-offs. Pick one, mix two, or reject all four and tell me why — that's useful signal too.

Every AI-SaaS template on Earth converges on the same look: violet-to-cyan gradient, Inter, glassmorphic cards, bento grid, `backdrop-blur-2xl` — which is close to what DESIGN.md currently specifies and part of why it feels generated, not designed. All four options below deliberately avoid that convergence point, but they disagree on *how*.

#### Option A — "Loom": textile-native (handloom, natural dye, drape)

Borrows from weaving and draping — the actual craft the product digitizes — instead of tech-brand visual grammar.

| Generic SaaS instinct | Loom instinct instead |
|---|---|
| Glassmorphic card, `backdrop-blur-2xl` | Flat card with a **selvedge edge** — a 2px woven-look border on one edge only, no blur |
| Violet/cyan gradient | **Natural dye palette**: indigo, madder red, turmeric, kumkum, marigold, undyed cotton |
| Generic spinner | **Spool** loader — thread winding/unwinding arc |
| Fade/slide page transition | **Drape** transition — content settles like cloth unfurling (skewed + compressed → eased into place) |
| Bento grid | **Bolt-and-swatch grid** — uneven card widths like fabric swatches pinned to a board |
| Inter everywhere | Warm editorial serif for headlines + clean grotesk for UI |

**Pros:** Directly ties to the *Kanchuki* name's etymology (§2.5) — a story no competitor can copy. Warm, culturally resonant for the actual Indian retail audience. Cheap to build (mostly flat color + typography + CSS transforms, no new libraries). Distinct from every fintech/AI-SaaS look on the market.
**Cons:** Real risk of tipping into "ethnic pattern as wallpaper" cliché if executed lazily — the doc's §2.2-equivalent guardrails matter more here than in any other option. Less immediately "credible SaaS" to an investor or Western enterprise buyer used to Stripe/Linear visual language. Needs someone with actual textile-craft sensitivity to execute well, not just a font swap.

#### Option B — "Ledger": mercantile, bookkeeping, khata-native

Borrows from the actual object your retailers already trust: the paper ledger/khata book, GST invoice, rubber stamp, postal register. Kraft-paper neutrals, stamped badges, monospace numerics, ruled lines instead of cards-with-shadows.

**Pros:** Matches the retailer's existing mental model exactly — small shop owners doing accounts, not "using an app." Cheapest option to build — almost entirely typographic and flat, minimal illustration/animation budget needed. Strong credibility for GST invoicing and admin/back-office screens specifically. Low execution risk — hard to get "ledger" tastefully wrong the way "ethnic pattern" can go wrong.
**Cons:** Weakest option for the customer-facing "wow" moment (WhatsApp collection link) — a ledger aesthetic undersells the fashion/visual side of the product. Can read as dry or dated on the marketing site if not balanced with strong photography. Doesn't touch the Kanchuki-name story at all unless deliberately threaded in separately.

#### Option C — "Studio Neon": bold fashion-editorial, high contrast

Borrows from fashion magazines and streetwear drops, not enterprise software: large cropped type, punchy saturated color blocks (not pastel, not glass), tilted/collaged product cards, confident asymmetry.

**Pros:** Feels genuinely fashion-forward — closer to what a fashion brand's own app looks like than what a B2B SaaS tool looks like. Best option for social/WhatsApp shareability and younger customer demographics. Furthest possible distance from "generic AI SaaS," since most AI tools are visually timid.
**Cons:** Highest execution risk — "bold" done badly reads as gaudy or amateur, and the margin for taste error is smaller than the other three options. Clashes with the seriousness GST invoicing/admin needs — would require a genuinely different visual language for admin vs. customer surfaces, not just a toned-down palette. Most expensive to build well (real art direction, not just token swaps). No inherent link to the Kanchuki name/story unless bolted on.

#### Option D — "Quiet Atelier": minimal, restrained, premium fashion-house

Borrows from the *back-office of a high-end tailoring atelier* — monochrome-plus-one-accent, generous whitespace, thin rules, small-caps labels, almost no color. Closer to Cos/Aesop/premium fashion-house digital presence than to SaaS or to Indian textile motifs.

**Pros:** Ages well — least likely of the four to look dated in three years. Easiest to keep consistent across web/mobile/admin without a large design team, since there's little decoration to keep in sync. Signals "premium tool," which supports the ₹4,999 Pro-tier pricing story.
**Cons:** Coldest, least culturally warm of the four — risks feeling disconnected from the actual community-driven, relationship-heavy Indian retail context the product serves. Whitespace-heavy layouts cost real screen space on small, data-dense mobile admin/retailer screens. Highest risk of *still* reading as "another minimal AI SaaS" if the type choice isn't distinctive enough — minimalism is the easiest genre to make generic by accident.

#### Decision: Option A — "Loom"

You picked A. Part 3 onward is now built out fully against it. B, C, and D stay documented above — not as leftover filler, but because a specific surface may still want to borrow a device from one of them later (e.g. if admin ever feels too decorated, Option B's ledger restraint is the fallback reference; if a marketing campaign wants a louder one-off page, Option C's boldness is the fallback reference). Treat B/C/D as a bench, not a bin.

#### What none of these mean

- Not literal cliché regardless of option — no stock rangoli patterns, no gold filigree, no "ethnic pattern as wallpaper" (Option A), no fake vintage paper-texture overload (Option B), no oversaturated gradient soup mistaken for "bold" (Option C), no sterile emptiness mistaken for "premium" (Option D).
- Not a rewrite, whichever you pick. Every recommendation below builds on the existing Tailwind/CSS-var/NativeWind stack — no new framework required to start.

#### 2.5 Founder story / About page — the etymology angle, made explicit

You liked the *Kanchuki* etymology thread enough that it's worth its own page, not just a design-rationale footnote. Proposal for a `/about` (or `/story`) page on the marketing site:

- **Structure:** one long-scroll editorial page (not a grid of icon-boxes like the rest of the marketing site) — this page is allowed to break the site's own layout rhythm because it's a narrative, not a feature list.
- **Opening:** lead with the word itself — what *kanchuki* meant (a tailored bodice/blouse worn under a saree/ghagra) and the one-line bridge to what the product does now (fitting technology to a garment trade that's always been about precise, personal fit). This is the single strongest hook in the whole site and currently unused anywhere.
- **Middle:** the actual founder story — why this problem, what was seen in real shops that made this worth building. **I don't have this content and won't invent it** — per the honest-copy discipline in this doc, no fabricated founder quotes, no invented "we started in a garage" narrative. You supply the real story; I can help structure and edit it once you have a draft.
- **Visual treatment:** whichever Option (A–D) you pick from above, this page is the natural home for that direction's *most* expressive version — e.g., under Option A, this is where the drape/thread motifs earn a literal illustration rather than just an interaction detail.
- **Close:** tie back to the product — the etymology isn't just trivia, it's the thesis statement ("we digitize fit and craft, the same thing the word always meant") — one line, not a hard sales pitch.

Add this to the Part 6 punch list once you've picked a direction — it's a marketing/content task as much as a design one, and it needs your real story before it needs any CSS.

---

### Part 3 — Concrete system (tokens, not vibes)

Built out against **Option A — Loom**, now that it's decided. Everything below is the actual system, not a hypothetical.

#### 3.1 Color — natural dye palette (replaces the violet/cyan mismatch)

Pick **one** accent as primary, not five competing hero colors. Recommendation: **Indigo** as primary (deep, legible, printable on GST invoices without looking like a toy), **Madder red** as the single "action/alert" accent, everything else neutral.

| Token | Value (OKLCH, swap to your exact ink) | Use |
|---|---|---|
| `--color-indigo` (primary) | `oklch(35% 0.12 265)` | primary buttons, links, active nav |
| `--color-madder` (accent) | `oklch(48% 0.16 25)` | destructive actions, "new"/urgent badges |
| `--color-turmeric` (highlight) | `oklch(78% 0.15 85)` | success/positive states, sparingly |
| `--color-cotton` (paper/base) | `oklch(97% 0.01 90)` | page background — warm off-white, not `#fff` |
| `--color-charcoal` (ink) | `oklch(20% 0.01 265)` | body text |
| `--color-muted` | `oklch(55% 0.01 265)` | secondary text |

This directly replaces the mismatched values in `apps/web/src/app/globals.css`, and becomes the first real content of the shared tokens file (3.4).

**Implementation note (2026-07-29 — "Red Elegance" re-hue):** the code that actually shipped kept the Tailwind key names from the *first* Loom pass (`ink`, `rust`, `turmeric`, `stone`) rather than the `indigo`/`madder` names proposed above — treat the table above as the reasoning, not the literal source of truth. Those same keys were then re-hued to a second palette ("Red Elegance": icy sky blue, sweet petal, juicy coral, tobacco brown, flaming cherry, cocoa) picked by the user, and `stone` was renamed to `sand` (admin's neutrals use Tailwind's *built-in* `stone-*` scale, which must stay untouched — see `apps/web/tailwind.config.ts` comment).

**Implementation note (2026-08-03 — "Black & Gold Elegance" re-hue, supersedes Red Elegance):** re-hued a third time from a user-supplied 5-swatch reference — bold black (`#000000`), deep navy (`#14213D`), regal gold (`#FCA311`), light grey (`#E5E5E5`), luminous white (`#FFFFFF`). Same Tailwind keys again (`ink`/`rust`/`turmeric`/`sand`/`cotton`/`charcoal`), only the hues and, this time, the *format* changed: every ramp moved from oklch to plain hex, since mobile could never parse oklch anyway (3.4) — one fewer hand-conversion step per repaint going forward. `icy`/`petal` (Red Elegance's two cool decorative notes) didn't fit a black-and-gold identity and were renamed `glow`/`veil` (gold glow / navy-black shadow). Current values, `apps/web/tailwind.config.ts` / `globals.css` / `apps/mobile/tailwind.config.js` (now a literal copy of web, not a derived one):

| Token | Base value | Use | Note |
|---|---|---|---|
| `ink` (primary) | `#14213D` at the 600 tier | primary buttons, links, active nav, brand accent | deep navy, exact reference swatch hex |
| `rust` (secondary → primary hero accent) | `#FCA311` at the 600 tier | hero accent — CTAs, links, section tags | regal gold, exact reference swatch hex |
| `turmeric` (tertiary) | `#8A5A12` at the 600 tier | grounding accent — badges, checkmarks, star fill | antique gold/bronze, a deeper step off the same gold hue (no separate swatch given) |
| `sand` (neutral) | `#E5E5E5` at the 200 tier | body text, borders, muted text | neutral grey, exact reference swatch hex — no longer warm-biased like Red Elegance's `sand` |
| `cotton` | `#FFFFFF` | page background | exact "luminous white" swatch |
| `charcoal` | `#000000` | body text / inverted (dark) section backgrounds | exact "bold black" swatch |
| `glow` / `veil` (was `icy`/`petal`) | `#FFC94D` / `#0B1322` | decorative-only hero wash, used sparingly | gold glow + navy-black shadow — not a full 10-step scale, flat colors |

#### 3.2 Typography

| Role | Face | Where |
|---|---|---|
| Display / marketing headlines / collection-link hero | A warm variable serif (e.g. Fraunces, Newsreader, or a licensed equivalent) | `apps/web` marketing + customer collection page only |
| UI / body / admin / retailer app | A clean grotesk already close to what's there (keep Inter here if licensing is a concern — the serif pairing is what creates distinctiveness, not banning Inter everywhere) | `apps/web` admin, `apps/mobile` |
| Hindi (Year-1 requirement per CLAUDE.md) | Confirm the chosen grotesk has a Devanagari companion (e.g. Noto Sans / Noto Serif pairing) *before* committing to a display face — this is a hard constraint, check it first | both |

Decide this before touching color — a font swap is the highest-leverage, lowest-risk change you can make, and it's the one DESIGN.md already got wrong (says Nunito/Inter, nobody's verified Devanagari coverage).

#### 3.3 Motion — restraint by surface, not by rule

Applying Emil's frequency framework (`emil-design-eng` skill) per surface, because "add delight" and "no animation, ever" are both correct — for different screens:

| Surface | Frequency seen | Motion budget |
|---|---|---|
| Retailer app (RN, photo upload, product list) | Used dozens of times/day by the same retailer | **Minimal.** Button press feedback (`scale(0.97)`) only. No page-transition flourish — retailers doing bulk uploads of 500+ SKUs will grow to hate anything slower than instant. |
| Admin panel | Power users, keyboard-heavy, tables | **Near zero.** No animated route transitions. Table row hover/sort feedback only. This is Raycast's "no animation is the optimal experience" case, applied to your internal tool. |
| Customer collection page (WhatsApp share link) | Opened once or a few times by each customer, it's the "wow" moment | **Highest budget on the whole product.** This is the one place the Drape transition, staggered product-card reveal, and try-on result reveal deserve real craft — first impression, low frequency, directly tied to conversion. |
| Marketing site | First-time visitors | Standard entrance animation, stagger on feature sections, nothing longer than ~400ms per Emil's UI duration ceiling. |

Concretely: don't let the marketing page's framer-motion energy leak into the retailer app. They should feel like different products made by people who understand each audience, which — per the frequency table above — they are.

#### 3.4 Fix the shared-token gap (the highest-priority structural item)

Today: web tokens live in `globals.css`, mobile has none, nothing shares. Fix:

1. Create one token source — either a small JSON/TS file in `packages/shared` (`packages/shared/src/design-tokens.ts`) or a `tokens.css` at repo root — containing every color, spacing, radius, and easing value from 3.1 above.
2. `apps/web/tailwind.config.ts` and `apps/mobile/tailwind.config.js` both `extend` from that one source instead of hardcoding values independently.
3. Delete the stale palette/font claims in `docs/design/DESIGN.md` and replace with whatever you actually approve from this doc — CLAUDE.md's own instruction #10 ("docs must track commits") applies here too: a design doc that lies about the palette is worse than no design doc.

This single change is what prevents this whole exercise from rotting the way DESIGN.md already has.

**Partially closed (2026-08-03, during the Black & Gold Elegance repaint):** step 1 exists now — `packages/shared/src/colors.ts` exports a `COLORS` object (same `ink`/`rust`/`turmeric`/`sand`/`cotton`/`charcoal` shape) — but scoped to what was actually causing pain: the ~40 `apps/mobile` screens hardcoding raw hex in RN literal props (`color=`, `placeholderTextColor=`, inline `style` objects) that a Tailwind className can't reach. Every one of those was migrated to `import { COLORS } from '@kanchuki/shared'`. Step 2 is **not** done — `tailwind.config.ts`/`tailwind.config.js` still hardcode their own copy of the same values, deliberately: those configs load at each platform's build time (Next's SWC / Metro), before `@kanchuki/shared`'s `dist/` output is guaranteed to exist, and wiring that import without a verified build-order guarantee risks breaking the whole app's styling (the exact failure mode §3.1 already warns about, from the oklch-in-Metro incident). Three files to edit on a future repaint now, not one — `tailwind.config.ts`, `tailwind.config.js`, `colors.ts` — down from ~45.

**Fully closed (2026-08-03, later the same day — "one-click repaint" theming):** the gap is now closed beyond step 2's original ask. `packages/shared/src/theme.ts` (new) defines the six admin-configurable brand tokens (`primary_color`/`accent_color`/`tertiary_color`/`background_color`/`text_color`/`surface_color`, mapping onto `ink-600`/`rust-600`/`turmeric-600`/`cotton`/`charcoal`/`sand-100`) + `DEFAULT_PLATFORM_THEME` + a pure `applyThemeOverrides(COLORS, theme)` overlay. The admin panel's Theme page (`apps/web/src/app/admin/settings/theme`) edits all six; the API (`apps/api/src/routes/admin-settings.ts`, audit-log key-value store) stores them; and the mobile retailer app fetches them at launch (`apps/mobile/src/lib/theme.tsx`) and: (a) sets all six as nativewind CSS vars (`--color-ink-600`, `--color-rust-600`, `--color-turmeric-600`, `--color-cotton`, `--color-charcoal`, `--color-sand-100`) so every `bg-*`/`text-*`/`border-*` class repaints live, and (b) exposes a reactive `colors` object (`useTheme()`) so every RN-literal-prop spot (`color=`, `placeholderTextColor=`, inline styles) also repaints — the ~196 `COLORS.*` references across ~35 screens were migrated to `colors.*` from `useTheme()`, and the remaining hardcoded hex (danger reds `#E3262D`, white headers, shadow tints, onboarding gradients, chart colors) was eliminated (new semantic `COLORS.danger`/`dangerSurface`/`dangerTint`/`chartAccent` keys). Changing the palette in admin now repaints the entire retailer app with no rebuild. Mobile `tailwind.config.js` keeps the static copy of the neutral ramp steps, but the six brand anchors are `var()`-driven. Web customer-facing surfaces remain primary-color-only by choice (see the Theme page note).

#### 3.5 Spacing, radius, elevation

| Token | Value | Note |
|---|---|---|
| `--space-*` | 4pt scale: 4/8/12/16/24/32/48/64 | Standard, nothing textile-specific here — don't invent a novel spacing unit just for theme's sake. |
| `--radius-card` | `12px` | Loom cards are closer to a folded fabric edge than a rounded-rect app tile — keep radius modest, not the `rounded-[2rem]` squircle look of glass-SaaS. |
| `--radius-pill` | `999px` | Buttons and badges only. |
| `--shadow-*` | Drop the existing `soft`/`soft-lg` shadow tokens as the primary elevation device | Loom elevation comes from the **selvedge edge** (3.6) and flat color contrast against `--color-cotton`, not drop shadows. Reserve a single hairline shadow (`0 1px 2px oklch(20% 0 0 / 6%)`) for floating/overlay elements only (modals, toasts) — everything sitting in normal document flow stays shadow-free. |

#### 3.6 Component vocabulary — the four Loom devices, specified

These are the concrete, buildable version of the table in Part 2.1. Each is a small, real spec — not a mood word.

**Selvedge-edge card** (replaces glass/shadow cards everywhere): flat `--color-cotton` or white background, `1px solid oklch(85% 0.01 90)` on three edges, and a **2px `--color-indigo` or `--color-madder` bar on the fourth edge only** (top on marketing cards, left on list-row cards) — this is the "selvedge" detail. `border-radius: var(--radius-card)`. No blur, no drop shadow in normal flow.

**Spool loader** (replaces spinner): a single arc (`stroke-dasharray` trick on an SVG circle, or a rotating conic-gradient mask) in `--color-indigo`, rotating continuously, `600–900ms` per revolution, `linear` easing per Emil's rule for constant motion. Reads as thread winding around a spool rather than a generic loading ring — same implementation cost as a spinner.

**Drape transition** (replaces fade/slide page transition): entering content starts at `transform: scaleY(0.96) skewX(-1deg); opacity: 0`, animates to `scaleY(1) skewX(0); opacity: 1` over `200–250ms` with `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`, per the emil-design-eng skill's strong-ease-out curve). Applies to the customer collection page and marketing sections only — never on admin or retailer-app routes (3.3/Part 4).

**Bolt-and-swatch grid** (replaces symmetric bento grid, marketing page only): a CSS grid with intentionally uneven `col-span`/`row-span` per card (e.g. 7/5/4/8 column splits on a 12-col grid, not 4/4/4), each card using the selvedge-edge treatment above. Collapses to single-column stack under 768px — no rotation/overlap tricks that would break on mobile.

#### 3.7 Iconography

Standard thick-stroke icon sets (Lucide's default weight, Font Awesome, Material) read as generic-SaaS on sight. For Loom: pick a **thin-line icon set** (Phosphor's "light" weight or Remix Line) at a consistent `1.5px` stroke — closer to a stitched line than a bold glyph. Apply uniformly across web, mobile, and admin; icon weight is one of the cheapest brand-consistency wins available and currently undecided anywhere in the codebase.

#### 3.8 Logo / wordmark direction

No logo file existed when this was written (Part 1.3) — only PWA icons. **Resolved 2026-08-11:** the user supplied `apps/web/public/kanchuki-logo.png` (884×176 dark-navy "Kanchuki" wordmark, red i-dot), now used in the marketing Navbar + Footer. It supersedes the interlaced-thread concept below (a `KanchukiMark` SVG implementing it was built and later deleted; favicon/OG images still use the old mark). Keep for reference / future brand work:

- **Wordmark-led, not symbol-led.** "Kanchuki" set in the chosen display serif (3.2) is likely stronger alone than inventing an abstract icon — the name itself is the asset (Part 2.5). Test the wordmark alone before assuming you need a mark.
- **If a mark is wanted alongside the wordmark:** the most defensible option is a small device built from **two crossed/interlaced thread lines** — literally warp-and-weft, matching the selvedge-edge motif already used in cards (3.6). Avoid literal garment silhouettes (a blouse/bodice icon) — too illustrative, ages badly, and reads closer to a clothing-brand logo than a software product's mark.
- **Favicon:** the interlaced-thread device (if built) works standalone at 16–32px in a way a wordmark cannot — build the mark with the favicon constraint in mind from the start, not as an afterthought crop of a larger logo.
- This needs an actual designer pass (typographic logo construction, optical spacing) — treat this bullet list as a creative brief, not a deliverable.

#### 3.9 Imagery / product photography direction

The customer collection page and marketing site live or die on product photography quality, more than any token in this doc. Direction: natural/window light over studio strobe-flat lighting, garments shown with visible drape and texture (not flattened product-catalog crops), avoid generic glossy stock-fashion photography for any marketing hero — it undercuts the "real shops, real retailers" honesty the rest of this doc argues for (Part 5.2). This is a photography-direction note for retailers/content team, not something CSS can fix.

---

### Part 4 — Applying Emil's interaction principles to real Kanchuki flows

Picking the four highest-value flows, not a generic checklist:

#### 4.1 Photo upload → AI auto-tag (retailer app, the core MVP loop)
- This is used dozens of times per session during bulk onboarding (F-001d). **No animation on the capture button itself** — instant shutter feedback only (scale 0.97 on press).
- The AI-tagging wait *is* a legitimate animation opportunity: a **spool loader** (2.1) instead of a generic spinner, because this is a moment retailers watch closely, and a distinctive loader here is free brand reinforcement at the single most-repeated moment in the product.
- When tags populate, don't have them pop in with a bounce — use a quick stagger fade (30–50ms between chips), matching Emil's stagger guidance. Bounce reads as "toy," and retailers are trying to get through 500 SKUs, not enjoy a delight moment.

#### 4.2 WhatsApp collection link → customer opens it (the moment that has to convert)
- This is the one screen worth the full Drape-transition treatment: product grid entrance staggered 40–60ms per card, `ease-out`, under 300ms per card.
- Favorite/heart interaction: standard scale-feedback + a filled-state color transition, no confetti — per Emil's "silent success over celebratory toast" principle, since this action repeats per product browsed.
- If/when VTO ships (post-MVP): the reveal of the try-on result is the single highest-leverage animation in the entire product — first thing built once VTO lands should be a considered, non-generic clip-path or blur-crossfade reveal, not a plain image swap.

#### 4.3 Admin data tables (16 route sections, all data-dense)
- Sort/filter changes: CSS transition on row reorder, never a full re-render flash.
- Suspend/unsuspend, block/unblock actions (F-015): these are rare, high-consequence actions — a deliberate confirm state (not a native `confirm()`) with the *slow-press, fast-release* asymmetry Emil describes for hold-to-delete patterns is appropriate here, since these are destructive-adjacent.
- Everything else in admin: keep it boring. This is the one surface where "boring" is the correct verdict, not a compromise.

#### 4.4 Buttons, everywhere
Every primary button in the product should get `transform: scale(0.97)` on `:active` — it's a 3-line CSS change, applies to web and mobile equivalently (RN: `Pressable` with a scale animated value), and it's the single cheapest "this app feels expensive" fix available. Currently absent everywhere per the codebase scan.

---

### Part 5 — Explicit anti-patterns for this project specifically

Beyond the generic slop list (glass cards, violet gradients, bento-by-default, Inter-everywhere) — two Kanchuki-specific ones:

1. **No heavy `backdrop-blur` anywhere in the retailer app.** Your retailers are on budget Android hardware in tier-2/3 cities with patchy connectivity (CLAUDE.md: "offline-first design" is a named constraint). Glassmorphism is a GPU tax you cannot afford on that hardware. Reserve blur, if used at all, for the customer PWA on modern phones — and even there, only on fixed/sticky elements, never scrolling content.
2. **No invented urgency patterns** ("Only 2 left!", fake countdown timers) on the customer collection page. Kanchuki's moat is trust-based, relationship-driven retail (Fashion DNA CRM, real human retailers). Manipulative dark-pattern urgency contradicts the actual product thesis and will read as cheap against the textile-craft direction in Part 2.

---

### Part 6 — Punch list (do these in this order)

0. ~~Pick a direction from Part 2.~~ **Done — Option A (Loom).**
1. **Resolve the DESIGN.md fiction.** Replace the violet/amber claims with the Loom palette (3.1) and font pairing (3.2) — right now DESIGN.md matches neither the old cyan reality nor this new plan.
2. **Verify Devanagari font coverage** for the chosen grotesk (3.2), before any typography work — Hindi Year-1 is a locked constraint, not a nice-to-have.
3. **Build the shared token source** (3.4) — one file, consumed by both Tailwind configs, containing 3.1/3.5's color/spacing/radius values. This is infrastructure, not decoration, and every later step depends on it existing.
4. **Add `scale(0.97)` active-state to every button** (web + mobile) — cheapest, highest-visibility fix, no dependencies.
5. **Build the selvedge-edge card and spool loader** (3.6) as the first two real components — everything else in the system (product cards, upload states) composes from these two primitives.
6. **Redesign the marketing page** (`apps/web/src/app/page.tsx` + `MarketingSections.tsx`) around the bolt-and-swatch grid (3.6) — this is your highest-visibility surface to strangers and currently just has generic framer-motion polish on a template-shaped layout.
7. **Write and build the founder story / About page** (§2.5) — needs your real story as input before any CSS; don't let this slip behind the visual work, it's the strongest differentiation asset you have and currently doesn't exist at all.
8. **Design the customer collection-link page** with the drape transition + staggered card reveal (3.6) — this is the actual conversion moment (CLAUDE.md success metric: ≥40% open rate, ≥15% enquiry-to-order).
9. **Leave the retailer app and admin panel alone, motion-wise**, beyond the button fix — per 3.3, restraint is correct there, not neglect.
10. **Commission the logo/wordmark** (3.8) — there currently isn't one (only PWA icons exist).

Items 1–5 are foundation and should happen before 6–10 — otherwise you're painting screens with a palette that isn't wired to survive the next feature commit.

---

### Open decisions I can't make for you

- Exact accent hues — I gave OKLCH starting points in 3.1, but "which specific indigo, which specific madder" is a brand call, not a technical one.
- Whether there's budget/appetite for a licensed display serif vs. a free alternative (Fraunces/Newsreader are open-source and solid choices if budget is a constraint).
- Whether to commission a logo mark (3.8) or run wordmark-only — both are legitimate, and it changes the favicon/app-icon work downstream.
- Your actual founder story for §2.5 — I structured the page, I didn't write the content, and won't invent it.
- Whether B/C/D (Part 2) ever get pulled off the bench for a one-off campaign page or a specific surface that Loom doesn't fit well.

---

## Design & UX Review — 2026-08-20

> Merged from the former `docs/design/design-review-2026-08-20.md`.


**Date:** 2026-08-20  
**Reviewed files:**
- `docs/references/research/feature-ideas-2026-07-30.md`
- `docs/references/design-inspiration/mobile-ui-ux.md`
- `docs/references/design-inspiration/marketing-landing.md`
- `docs/references/history/reports/2026-08-20-remaining-work.md`

---

### Part 1: Design & UX Assessment

#### What's Built vs. What the References Recommend

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

#### Strengths (What Works Well)

1. **Photo-first UX** — The entire retailer flow is built around photos: camera capture → AI auto-tag → catalog. No manual form filling. This matches the "photo-first" constraint in CLAUDE.md and is the right call for Indian SMB retailers who think in images, not text fields.

2. **WhatsApp-native distribution** — Collection links, enquiry flow, and catalog sharing are all WhatsApp-optimized. The wa.me link builder, contact gate, and bulk-send patterns are well-implemented. This is Kanchuki's moat and it's solid.

3. **AI Studio Shoots (FLUX Kontext)** — The template-based approach (4 curated presets, no free-text prompts) is the right UX decision. It removes decision fatigue for retailers while delivering professional results. The progress/ETA indicators we just added make the 10-60s wait transparent.

4. **Black & Gold Elegance brand system** — The shared `COLORS` module and consistent theming across mobile + web gives Kanchuki a premium feel that differentiates it from generic e-commerce builders. The Colabs-inspired marketing redesign (BUILD-LOG §25) is visually distinctive.

5. **Accessibility pass** — Labels, Reduce Motion, touch targets all hardened (BUILD-LOG §10). This is unusual for an Indian SMB product and shows maturity.

#### Weaknesses (What Needs Work)

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

### Part 2: Remaining Work Audit (from 20-August-changes.md)

#### Already Done (Completed in Previous Sessions)

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

#### Remaining Major Issues — Priority Phases

##### Phase A: Documentation Cleanup (1 hour)
| # | Item | Why It Matters |
|---|------|----------------|
| 5 | Update INDIA-RETAILER-GROWTH.md GST status | Stale docs cause wrong status reports. GST invoicing is marked "Not built" but it IS built. |
| D1 | Apply migrations 066–073 to production | 8 migrations sitting unapplied. BFL credit tracking (073) won't write rows until applied. |

##### Phase B: High-Value Gaps (1–2 weeks)
| # | Item | Impact |
|---|------|--------|
| 7 | Instagram Business Publishing | Blocked on Meta app review — cannot code until approved. Submit NOW if not already. |
| 15 | Auto-Built Per-Variant Collection Links | A/B testing is half-manual. Needs hidden collection status in schema. ~3 hours. |
| 16 | Seasonal Deep-Dive Dashboards | Campaign analytics lack year-over-year and regional views. Needs design decisions first. |
| 19 | L2 Ecommerce Checkout Verification | Code exists but CLAUDE.md still marks it "Planned." Needs audit + doc update. |

##### Phase C: External Dependencies (Waiting on Third Parties)
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

##### Phase D: Deferred / Future (Not Now)
| # | Item | Reason to Defer |
|---|------|-----------------|
| 6 | F-305 Multi-Store Management | Explicitly marked "DONT CODE" — scope underspecified |
| 12 | GPU Detection for V-Tone | Explicitly marked "DONT CODE" |
| 22 | Native In-App Microphone | Needs EAS dev build, not code |
| 23 | PWA/Retailer UI Language Toggle | No i18n framework installed, ~1 week effort |
| 25 | Customer-Facing Usual Size Self-Capture | Needs customer identity/login system |
| 26–34 | P4 Nice-to-haves | Future scope, no functional gap |

---

### Part 3: Final Verdict

#### Design Grade: B+

**What's working:** The core UX loops (photo → tag → catalog → WhatsApp share → customer browse → try-on) are well-designed and functional. The brand system is distinctive. Accessibility is above average for the market.

**What's missing:** The customer-facing PWA needs more depth (search, wishlist, notifications), empty states need illustration + CTA, and the retailer onboarding needs a guided wizard. These are Phase 1 improvements, not MVP blockers.

#### Code Health Grade: A-

**What's solid:** TypeScript clean across all 3 workspaces, comprehensive test coverage for auth/checkout/studio-shoot, consistent patterns (pollWithBackoff, AiUsageLog, Redis status), and thoughtful error handling (best-effort logging, graceful degradation).

**What's risky:** 8 unapplied migrations (066–073) means production is behind the schema. The MSG91 DLT registration blocker means OTP SMS delivery is still broken in production. These are operational risks, not code risks.

#### Recommended Next Actions (In Order)

1. **Apply migrations 066–073 to production** — 10 minutes, unblocks BFL tracking + partner network
2. **Update docs** — Mark GST invoicing as built in INDIA-RETAILER-GROWTH.md, mark L2 checkout as built in CLAUDE.md
3. **Submit Meta/Google API access requests** — External dependencies that block Phase C items
4. **Build retailer onboarding wizard** — Highest ROI for activation metrics (50 retailers target)
5. **Add illustrated empty states** — Quick win for perceived polish across the app

---

## Design Inspiration — Marketing Landing References

> Merged from the former `docs/references/design-inspiration/marketing-landing.md`.


### Award-Winning & Benchmark Sites

#### 1. Stripe — Marketing Homepage
**URL**: https://stripe.com

The gold standard for B2B SaaS landing pages. Clean typography, modular sections, subtle animations, and clear CTAs.

**What to study**:
- Hero section: single headline, subheadline, two CTAs, social proof badges.
- Alternating section layouts (text-left/image-right, then swapped).
- "Trusted by" logo marquee.
- Feature cards with icons and concise copy.
- Pricing table with clear tier differentiation.
- FAQ accordion.

---

#### 2. Linear — Marketing Homepage
**URL**: https://linear.app

Aesthetic, fast, and highly polished. Dark theme with subtle gradients and smooth scroll-triggered animations.

**What to study**:
- Dark-mode-first design with gradient accents.
- Smooth page transitions and reveal animations.
- "Built for" section with team logos.
- Feature bento-grid layout.
- Minimalist navigation with clear CTA.

---

#### 3. Vercel — Marketing Homepage
**URL**: https://vercel.com

Clean, developer-focused, with strong typography and subtle motion. Uses a consistent grid and generous whitespace.

**What to study**:
- Grid-based feature showcase.
- Integration logos in a clean grid.
- "Customers" section with case study snippets.
- Footer with organized link columns.

---

#### 4. Notion — Marketing Homepage
**URL**: https://www.notion.so

Warm, approachable, with illustration-led sections and clear value propositions.

**What to study**:
- Illustration + text alternating sections.
- "Teams" section with role-based landing.
- Testimonial carousel with video support.
- Simple pricing with FAQ below.

---

#### 5. Figma — Marketing Homepage
**URL**: https://www.figma.com

Design-forward, with strong visual hierarchy and brand consistency.

**What to study**:
- Hero with product mockup + headline.
- "Why Figma" section with icon cards.
- Customer logos as social proof.
- Bottom CTA with strong contrast.

---

### Layout Structures & Templates

#### 6. HubSpot — Free Landing Page Templates
**URL**: https://www.hubspot.com/free-templates/landing-pages

Free, responsive landing page templates. Good reference for standard section order and spacing.

**What to study**:
- Hero → Features → Social Proof → Pricing → FAQ → CTA structure.
- Form-focused landing pages.
- Thank-you page patterns.

---

#### 7. Unbounce — Landing Page Examples
**URL**: https://unbounce.com/landing-page-examples/

Curated examples across industries. Filter by "SaaS", "B2B", "Product" for relevant inspiration.

**What to study**:
- Long-form vs. short-form landing pages.
- Video hero backgrounds.
- Sticky CTA bars.
- Countdown timers and urgency patterns.

---

#### 8. Lapa Ninja — Landing Page Gallery
**URL**: https://www.lapa.ninja/

Daily curated landing page designs. Search "SaaS", "fashion", "ecommerce" for relevant examples.

**What to study**:
- Non-standard hero layouts (split screen, centered, asymmetric).
- Color scheme variety across dark/light themes.
- Mobile-responsive patterns.

---

#### 9. Awwwards — SOTD (Site of the Day)
**URL**: https://www.awwwards.com/website-of-the-day/

The highest-quality web design awards. Filter by "Site of the Day" for exceptional craft.

**What to study**:
- Advanced scroll animations and parallax.
- Custom cursor interactions.
- 3D and WebGL integrations.
- Typography-forward designs.

---

#### 10. Landing Folio
**URL**: https://landingfolio.com/

Curated landing page designs with real component screenshots. Search by industry or component type.

**What to study**:
- Header/navigation patterns.
- Hero section variations.
- Pricing table designs.
- Footer layouts.

---

### Design Systems & Style Guides

#### 11. Shopify Polaris
**URL**: https://polaris.shopify.com/

Design system for Shopify's admin and merchant-facing surfaces. Strong reference for e-commerce UI.

**What to study**:
- Component naming conventions.
- Color system with semantic tokens.
- Typography scale.
- Icon library and usage guidelines.

---

#### 12. Atlassian Design System
**URL**: https://atlassian.design/

Mature design system with strong documentation. Good reference for complex dashboard and marketing patterns.

**What to study**:
- Page layout templates.
- Data visualization patterns.
- Empty state designs.
- Navigation patterns.

---

#### 13. Carbon Design System (IBM)
**URL**: https://carbondesignsystem.com/

Enterprise-grade design system with strong accessibility and theming.

**What to study**:
- Grid and layout guidelines.
- Component states and variants.
- Theming with CSS variables.
- Pattern library (templates for common page types).

---

#### 14. MUI (Material UI) Templates
**URL**: https://mui.com/material-ui/getting-started/templates/

Pre-built landing page and dashboard templates using Material UI.

**What to study**:
- React component structure.
- Responsive grid implementations.
- Theme customization with `createTheme`.

---

### Color & Typography

#### 15. Typewolf — Typography Inspiration
**URL**: https://www.typewolf.com/

Curated typography examples from real websites. Search "SaaS", "minimal", "bold" for relevant pairings.

**What to study**:
- Display font + body font pairings.
- Font weight and size relationships.
- Letter spacing and line height trends.

---

#### 16. Fontjoy
**URL**: https://fontjoy.com/

AI-powered font pairing generator. Upload a reference image or generate random pairs.

**What to study**:
- Serif + sans-serif pairings.
- Monospace accents for technical products.
- Font contrast (geometric vs. humanist).

---

#### 17. Google Fonts — Trending Fonts
**URL**: https://fonts.google.com/

Browse trending and popular fonts. Filter by "display" for headings and "sans-serif" for body.

**What to study**:
- `Inter` (already used by Kanchuki) — optimal for UI text.
- `Space Grotesk` / `Matter SemiMono` alternatives for display.
- Variable fonts for performance.

---

### Animation & Interaction

#### 18. Awwwards — Motion Design
**URL**: https://www.awwwards.com/websites/motion/

Curated sites with exceptional motion design. Filter by "Minimal", "Interaction Design", "Animation".

**What to study**:
- Scroll-triggered reveals.
- Cursor-follow effects.
- Page transition animations.
- Loading and skeleton states.

---

#### 19. Codrops — Creative Frontend
**URL**: https://tympanus.net/codrops/

Tutorials and inspiration for creative frontend interactions. Search "landing page", "scroll animation".

**What to study**:
- Custom scroll implementations.
- SVG animations.
- 3D card effects.
- Text reveal animations.

---

#### 20. Minimal Gallery
**URL**: https://minimal.gallery/

Curated minimal web designs. Strong reference for clean, content-focused layouts.

**What to study**:
- Generous whitespace usage.
- Single-column layouts with clear hierarchy.
- Minimal color palettes with one accent.
- Typography-only hero sections.

---

### Industry-Specific (Fashion / Retail)

#### 21. Shopify — Fashion Store Examples
**URL**: https://www.shopify.com/fashion

Fashion-specific store examples and design trends.

**What to study**:
- Image-heavy homepage layouts.
- Collection page structures.
- Lookbook / editorial layouts.
- Size guide and fit finder patterns.

---

#### 22. BigCommerce — Fashion Ecommerce
**URL**: https://www.bigcommerce.com/blog/fashion-ecommerce-design/

Design trends and best practices for fashion e-commerce sites.

**What to study**:
- Mobile-first product grids.
- Video integration in product pages.
- Filter and sort UX.
- Wishlist and compare patterns.

---

#### 23. Webdesign Inspiration — Ecommerce
**URL**: https://www.webdesign-inspiration.com/web-designs/ecommerce

Curated e-commerce website designs. Search "fashion", "clothing", "boutique".

**What to study**:
- Brand storytelling through layout.
- Lookbook / magazine-style layouts.
- Checkout flow design.
- Account dashboard patterns.

---

### Section-Specific References

#### Hero Sections

| Source | URL | Style |
|--------|-----|-------|
| Stripe | https://stripe.com | Clean, centered, two CTAs |
| Linear | https://linear.app | Dark, gradient, product mockup |
| Vercel | https://vercel.com | Grid, case study cards |
| Notion | https://www.notion.so | Illustration-led, warm |

#### Feature Sections

| Source | URL | Style |
|--------|-----|-------|
| Shopify Polaris | https://polaris.shopify.com | Icon + text cards |
| Atlassian | https://atlassian.design | Alternating image/text |
| Carbon | https://carbondesignsystem.com | Grid cards with images |

#### Pricing Sections

| Source | URL | Style |
|--------|-----|-------|
| Stripe | https://stripe.com/pricing | 3-column, clear hierarchy |
| Linear | https://linear.app/pricing | Minimal, annual/monthly toggle |
| Notion | https://www.notion.so/pricing | Simple, comparison table |

#### FAQ Sections

| Source | URL | Style |
|--------|-----|-------|
| HubSpot | https://www.hubspot.com | Accordion, search |
| Stripe | https://stripe.com/faq | Categorized, expandable |
| Notion | https://www.notion.so/help | Search + categorized list |

#### Footer Sections

| Source | URL | Style |
|--------|-----|-------|
| Vercel | https://vercel.com | 4-column, organized links |
| Figma | https://www.figma.com | 5-column, social icons |
| Notion | https://www.notion.so | Minimal, single column |

---

### Kanchuki-Specific Inspiration

#### Indian Market Positioning

| Reference | URL | Why |
|-----------|-----|-----|
| PhonePe | https://phonepe.com | UPI-first payment UX |
| Razorpay | https://razorpay.com | Indian payment gateway design |
| Khatabook | https://khatabook.com | Small business app UX in India |
| Meesho | https://meesho.com | Social commerce / WhatsApp distribution |

#### B2B SaaS for SMBs

| Reference | URL | Why |
|-----------|-----|-----|
| Zoho | https://www.zoho.com | Multi-product SMB suite |
| Freshworks | https://www.freshworks.com | SMB-focused SaaS design |
| Groww | https://groww.in | Simple onboarding, clear pricing |

---

### Summary

| Use Case | Top References |
|----------|---------------|
| Overall Structure | Stripe, Linear, Vercel |
| Hero Variations | Linear, Notion, Stripe |
| Feature Grids | Shopify Polaris, Atlassian, Carbon |
| Pricing Tables | Stripe, Linear, Notion |
| FAQ Patterns | HubSpot, Stripe, Notion |
| Color Palettes | Coolors, Color Hunt, Adobe Color |
| Typography | Typewolf, Google Fonts, Fontjoy |
| Animation | Awwwards Motion, Codrops, Minimal Gallery |
| Fashion/RETAIL | Myntra, Ajio, Shopify Fashion |
| Indian Market | PhonePe, Razorpay, Khatabook, Meesho |

---

## Design Inspiration — Mobile UI/UX References

> Merged from the former `docs/references/design-inspiration/mobile-ui-ux.md`.


### Design Inspiration & Trend Sources

#### 1. Apple Human Interface Guidelines
**URL**: https://developer.apple.com/design/human-interface-guidelines/

The definitive reference for iOS design principles. Covers layout, typography, color, iconography, and interaction patterns. Use this as the baseline for native-feeling mobile experiences.

**Key takeaways for Kanchuki**:
- Use system fonts (SF Pro on iOS, Roboto on Android) for body text.
- Maintain 44pt minimum touch targets.
- Use semantic color names and dynamic type.
- Adhere to safe area insets for notch/home indicator.

---

#### 2. Material Design 3 (Material You)
**URL**: https://m3.material.io/

Google's latest design system with dynamic color, updated components, and flexible theming. Strong reference for Android-first experiences.

**Key takeaways for Kanchuki**:
- Dynamic color extraction from user's wallpaper.
- Updated color roles (primary, on-primary, primary-container, etc.).
- New component specs: Bottom sheets, navigation bars, FABs.
- Emphasis on large touch targets and accessible contrast.

---

#### 3. Dribbble — Mobile App Designs
**URL**: https://dribbble.com/search/mobile-app-design

Curated shots from top designers. Search for "fashion app", "ecommerce mobile", "retail app" for industry-specific inspiration.

**What to look for**:
- Card-based product grids with image-first layouts.
- Bottom navigation patterns for 3–5 primary sections.
- Empty states and onboarding flows.
- Micro-interactions (like, save, share buttons).

---

#### 4. Behance — Mobile UI/UX Case Studies
**URL**: https://www.behance.net/search/projects?search=mobile%20app%20UI

Full case studies with process, wireframes, and final designs. Search "fashion ecommerce", "retail app", "catalog app".

**What to look for**:
- Onboarding sequence designs.
- Product detail page layouts (image carousel + specs + actions).
- Filter and search UX patterns.
- Dark mode implementations.

---

#### 5. Mobbin — Mobile Design Patterns
**URL**: https://mobbin.com/

A searchable library of real app screenshots organized by pattern, flow, and platform. Free tier available.

**What to look for**:
- "Product grid" patterns for catalog browsing.
- "Bottom sheet" patterns for product detail / filters.
- "Empty state" patterns for no-data screens.
- "Onboarding" patterns for first-run experience.

---

#### 6. Pttrns — Mobile UI Patterns
**URL**: https://pttrns.com/

Curated iOS and Android patterns with code snippets. Focuses on interaction design and animation.

**What to look for**:
- "Shopping" category for e-commerce flows.
- "Onboarding" for signup/login patterns.
- "Profile" for retailer dashboard patterns.
- "Lists" for catalog browsing.

---

### Color Scheme References

#### 7. Coolors — Color Palette Generator
**URL**: https://coolors.co/

Generate and explore curated palettes. Use the "Explore" tab to find trending palettes.

**Recommended approach**:
- Start with a base hue (navy/indigo for Kanchuki's existing brand).
- Generate analogous or complementary accents.
- Test contrast ratios using the built-in accessibility checker.

---

#### 8. Color Hunt
**URL**: https://colorhunt.co/

Community-curated color palettes. Search "dark mode", "minimal", "elegant" for refined palettes.

**What to look for**:
- Palettes with 4–5 colors (primary, secondary, accent, background, text).
- High-contrast palettes for readability.
- Palettes with warm neutrals (cream, sand, charcoal).

---

#### 9. Adobe Color
**URL**: https://color.adobe.com/create/color-wheel

Advanced color wheel with accessibility checks, contrast ratios, and trend palettes.

**What to look for**:
- "Trends" section for current color directions.
- "Accessibility" tool for WCAG AA/AAA validation.
- "Extract Theme" from images (upload a product photo to generate a palette).

---

#### 10. Realtime Colors
**URL**: https://www.realtimecolors.com/

Preview color palettes on real UI components (buttons, cards, nav bars) in real time.

**What to look for**:
- How your palette looks on a mock phone screen.
- Button, card, and input states with your colors.
- Dark mode preview.

---

### Component & Interaction Libraries

#### 11. React Native Paper
**URL**: https://callstack.github.io/react-native-paper/

Material Design 3 components for React Native. Use as a reference for component specs and implementation.

**What to look for**:
- `BottomSheet` component specs.
- `Card` component with image, title, subtitle.
- `Button`, `IconButton`, `FAB` variants.
- `Searchbar` component.

---

#### 12. NativeBase
**URL**: https://nativebase.io/

Utility-first component library for React Native. Good reference for accessible, themeable components.

**What to look for**:
- `VStack` / `HStack` layout patterns.
- `Pressable` with ripple effects.
- `Avatar`, `Badge`, `Divider` components.
- Theming system with light/dark mode.

---

#### 13. Tamagui
**URL**: https://tamagui.dev/

Design system for React Native + Web. Strong TypeScript support and animation primitives.

**What to look for**:
- `Adapt` component for responsive layouts.
- `Button`, `Input`, `Sheet` primitives.
- Theme switching with CSS variables.
- Animation system with `animate` prop.

---

#### 14. Expo Snack — Community Examples
**URL**: https://snack.expo.dev/

Browse community Expo projects. Search "fashion", "catalog", "retail" for relevant examples.

**What to look for**:
- Image carousel implementations.
- Bottom sheet patterns.
- Pull-to-refresh and infinite scroll.
- Camera integration examples.

---

### Typography References

#### 15. Google Fonts — Inter
**URL**: https://fonts.google.com/specimen/Inter

The primary sans-serif font for Kanchuki mobile. Review the specimen for weight usage, spacing, and readability.

**What to look for**:
- Weight spectrum (400–700) for hierarchy.
- Number tabular figures for prices/statistics.
- Line height recommendations for mobile body text.

---

#### 16. Fontsource — Font Loading
**URL**: https://fontsource.org/

Self-hosted font loading for React Native. Reference for implementing custom brand fonts in the mobile app.

---

### Animation & Motion

#### 17. Reanimated 3 Documentation
**URL**: https://docs.swmansion.com/react-native-reanimated/

The animation library used in Kanchuki mobile. Reference for gesture-based animations, layout transitions, and shared element transitions.

**What to look for**:
- `withSpring` for natural-feeling transitions.
- `Gesture` and `GestureDetector` for swipe/pinch.
- `SharedTransition` for image detail transitions.
- `useAnimatedStyle` for performant style updates.

---

#### 18. Framer Motion for React Native (Motion)
**URL**: https://motion.dev/

If considering a web-consistent animation layer, Motion provides Framer Motion-like APIs for React Native.

---

### Accessibility

#### 19. WebAIM — Contrast Checker
**URL**: https://webaim.org/resources/contrastchecker/

Validate WCAG AA/AAA contrast ratios for your color palette.

---

#### 20. Stark (Figma Plugin)
**URL**: https://www.getstark.co/

Accessibility checker for Figma designs. Use during the design phase to catch contrast and touch target issues early.

---

### Industry-Specific Inspiration

#### 21. Myntra Mobile App
**URL**: https://play.google.com/store/apps/details?id=com.myntra.android

Leading Indian fashion e-commerce app. Study their catalog browsing, filters, product detail, and checkout flows.

**What to study**:
- Image-heavy catalog with clean typography.
- Size selector and color swatch patterns.
- Wishlist and bag interactions.
- WhatsApp-style share buttons.

---

#### 22. Ajio Mobile App
**URL**: https://play.google.com/store/apps/details?id=com.ril.ajio

Another major Indian fashion retailer. Strong reference for ethnic wear + western wear mixed catalogs.

**What to study**:
- Category navigation with images.
- Video integration in product listings.
- Size guide patterns.
- Offline browsing indicators.

---

#### 23. WhatsApp Business Catalog
**URL**: https://faq.whatsapp.com/general/channels/how-to-create-a-catalog

Since Kanchuki distributes via WhatsApp, study how WhatsApp Business catalogs present products.

**What to study**:
- Minimal product cards.
- Quick reply / enquire buttons.
- Image-first layout with minimal text.

---

### Prototyping & Design Tools

#### 24. Figma Community — Mobile UI Kits
**URL**: https://www.figma.com/community

Search "mobile UI kit", "ecommerce mobile", "fashion app" for free and paid templates.

---

#### 25. Figma Community — Design Systems
**URL**: https://www.figma.com/community/search?type=design_systems

Search "iOS design system", "Material Design 3", "Ant Design Mobile" for component libraries.

---

### Summary

| Category | Top 3 References |
|----------|-----------------|
| Design Principles | Apple HIG, Material Design 3, Mobbin |
| Color Palettes | Coolors, Color Hunt, Adobe Color |
| Component Specs | React Native Paper, NativeBase, Tamagui |
| Typography | Google Fonts (Inter), Fontsource |
| Animation | Reanimated 3, Motion |
| Industry | Myntra, Ajio, WhatsApp Business |
| Prototyping | Figma Community, Behance, Dribbble |
