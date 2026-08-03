# Kanchuki — UI/UX Design Document

**Version:** 1.2  
**Date:** June 2026 (v1.0) · **Updated 2026-07-28:** Brand Identity palette/typography/tokens replaced with the "Loom" design system (Option A) — see `docs/design/emil-design.md` for the full audit, the four direction options considered, and why Loom was picked. · **Updated 2026-07-31:** corrected the "mobile has no design tokens" claim below (it does — see Design Tokens section) and closed the accessibility-label / Reduce Motion gaps flagged by an `/impeccable audit` pass on `apps/mobile` — see `docs/design/design-work.md`.  
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

**Typography:**
- Web display/marketing headlines: `Fraunces` (warm variable serif) — added 2026-07-28, see `apps/web/src/app/layout.tsx`
- Web UI/body + mobile: `Inter` (clean, professional)
- Mobile display face: `Nunito` was the v1.0 plan; unverified whether it's actually wired anywhere in `apps/mobile` — treat as unconfirmed until checked, not as fact
- Fallback: System UI
- **Hindi/Devanagari coverage not yet verified for any of the above** — required before Year-1 Hindi localization ships (CLAUDE.md constraint); check before committing further to Fraunces specifically

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

### Screen CW-4: Try-On Flow (Phase 1)

**Step 1:** "Upload your photo to try this outfit"
- Privacy notice: "Your photo is used only to generate the preview. It is not stored."
- [Upload Photo] button → file picker or camera
- Sample "good photo" guide

**Step 2:** Processing
- "AI is working..." animation (fun, not scary)
- Estimated: 20–30 seconds

**Step 3:** Result
- Side-by-side: Original photo | Try-on result
- [Save Image] button
- [Share with Family] button (native share sheet)
- [Try Another Outfit] button

---

## TV/Display Mode (In-Store)

Retailer can switch to "TV Mode" — optimized for 40"+ screens connected to tablet

**Layout:**
- Full-screen product photo (left 60%)
- Product details panel (right 40%): Name, Price, Colors, Fabric, Location
- Navigation: Prev / Next product arrows
- Try-On button (triggers flow on connected tablet)
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
- **Screen reader labels:** fixed. An `/impeccable audit` found 0 `accessibilityLabel` usage across all 48 screens despite 43+ files using icon-only `TouchableOpacity` controls (back buttons, remove/close/share/filter icons). Swept and added `accessibilityLabel`/`accessibilityRole="button"` to every icon-only control found (66 labels across 32 files) — see `docs/design/design-work.md` for the full audit report.
- **Reduce Motion:** fixed for the app's decorative animation — `src/hooks/useReduceMotion.ts` (wraps `AccessibilityInfo.isReduceMotionEnabled`) now gates the onboarding confetti overlay, the onboarding step-transition slide (crossfades instead when Reduce Motion is on, per HIG/Material guidance), the skeleton shimmer loop (dims instead of pulses), and the offline-banner slide-in (jumps instead of animating). Functional loading affordances (AI-processing spinner/progress bar, pinch-to-zoom photo viewer) were deliberately left alone — they carry state, not decoration.
- **Tab bar fixed 2026-07-31 (follow-up pass):** the 6-destination bottom tab bar flagged above is now 5 (Analytics moved to a top-level route, reachable via a Home header icon) — at the 3–5 platform guidance. Dark mode remains open (0 `useColorScheme` usage) — declined for this pass in favor of a light-only gradient/shadow/animation direction, see `docs/design/design-work.md`. (The one sub-44pt touch target it found — a remove-photo button in bulk upload — was fixed alongside the accessibility-label sweep.)

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
- Low try-on credits (Phase 1): "You have 10 try-ons remaining this month"

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
