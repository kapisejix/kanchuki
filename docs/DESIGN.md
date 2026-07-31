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
- **Still open:** dark mode (0 `useColorScheme` usage anywhere in `apps/mobile`) and the 6-destination bottom tab bar (exceeds the 3–5 destination guidance both platforms give) were flagged by the same audit and are not yet fixed — see the audit report for the full P0–P3 list. (The one sub-44pt touch target it found — a remove-photo button in bulk upload — was fixed alongside the accessibility-label sweep.)

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

**Web (`apps/web/tailwind.config.ts`) — live as of 2026-07-28:**

```typescript
colors: {
  ink:      { /* 50–900 scale, oklch hue 265 */ 600: 'oklch(35% 0.12 265)' },
  rust:     { /* 50–900 scale, oklch hue 25  */ 600: 'oklch(48% 0.16 25)' },
  turmeric: { /* 50–900 scale, oklch hue 85  */ 400: 'oklch(78% 0.15 85)' },
  stone:    { /* 50–900 scale, near-neutral  */ 500: 'oklch(55% 0.01 265)' },
  cotton: 'oklch(97% 0.01 90)',
  charcoal: 'oklch(20% 0.01 265)',
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

**Mobile (`apps/mobile/tailwind.config.js`) — wired, but not pixel-identical to web.** Has its own full `ink`/`rust`/`turmeric`/`sand`/`cotton`/`charcoal` scale (hex, not oklch — RN's style engine can't parse `oklch()` at all, see that file's comment). `ink` (navy/primary) is pixel-matched to web via the same `--color-ink-600` runtime CSS var (admin-configurable branding, set live through NativeWind's `vars()`). `rust`/`turmeric`/`sand` are NOT currently kept in sync with web's values — this is tracked as open work (see `docs/design/emil-design.md` §3.4, "shared token gap"); until resolved, don't assume mobile's accent colors match whatever web is currently showing.
