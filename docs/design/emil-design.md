# Kanchuki Design Direction — Audit & Vision

**Status:** Planning document. Nothing in this file is implemented — it's a punch list + creative direction for you to approve, reject, or remix before any code changes.
**Direction decided (2026-07-28):** Option A — "Loom" (textile-native). Options B/C/D remain documented in Part 2 as the alternatives considered and rejected, in case a specific surface later wants to borrow from one of them.
**Written:** 2026-07-28. **Scope:** `apps/web` (customer PWA + marketing + admin), `apps/mobile` (retailer RN app).
**Method:** Grounded in the actual repo state (see Part 1), then designed against Emil Kowalski's interaction-design philosophy (invisible detail, restrained motion, honest feedback) plus a structural-variety pass to make sure Kanchuki doesn't end up looking like every other "AI SaaS" template.

---

## Part 1 — What's actually there right now

I read the code before proposing anything. Three problems, none of them cosmetic:

### 1.1 Your design system is fiction

`docs/DESIGN.md` documents a violet/amber palette (`#7C3AED` primary, `#F59E0B` secondary), Nunito for mobile, Inter for web, shadcn/ui + Nativewind as the component stack.

**None of that is what's actually built:**

| DESIGN.md says | Code actually has | Where |
|---|---|---|
| Primary `#7C3AED` (violet) | Primary is cyan/teal, `#0891B2`/`#06b6d4` scale | `apps/web/src/app/globals.css` |
| shadcn/ui + Radix | No `@radix-ui/*`, no `class-variance-authority`, no shadcn — zero `components/ui` folder | `apps/web/package.json` |
| Mobile token block (colors, spacing) defined in Nativewind config | `apps/mobile/tailwind.config.js` → `theme.extend: {}` — empty | `apps/mobile/tailwind.config.js` |

This isn't a nitpick — it means there is currently **no single source of truth** a designer, a new engineer, or an AI agent can read to know what Kanchuki looks like. Every screen has been styled ad hoc against whatever was already on the page next to it. That's how you get three shades of "primary blue" across five screens without anyone deciding it.

### 1.2 No shared token layer between web and mobile

`packages/shared` and `packages/db` have no design-tokens file. Web colors live in `apps/web/src/app/globals.css` as raw CSS vars; mobile has nothing at all. There is no mechanism today for "we changed the brand accent" to propagate to both apps — you'd hand-edit two unrelated files and hope they match.

### 1.3 What's actually built, so you know what's safe to reuse

- **Web:** Tailwind + CSS vars (no component-primitive library). Custom shadow tokens (`soft`, `soft-lg`), two animations (`fade-in`, `slide-up`). `framer-motion ^11.3.19` is already installed and used on the marketing page (`apps/web/src/app/page.tsx`, hero + nav).
- **Mobile:** NativeWind + `react-native-reanimated ~4.1.7`, already installed, config empty.
- **Admin:** 16 route sections under `apps/web/src/app/admin` (activity, billing, catalog-upload-tiers, database, plan-features, plan-limits, reports, retailers, support-tickets, team-members, etc.) — this is a real, data-dense internal tool, not a marketing surface. Treat it as one.
- **Marketing/landing:** `apps/web/src/app/page.tsx` + `sections/MarketingSections.tsx` (Features/How It Works/Pricing/FAQ), already framer-motion-animated.
- **Brand assets:** PWA icons only (`icon-192.png`, `icon-512.png`). No logo file, no wordmark treatment, no favicon design pass.

**Bottom line:** you don't have a "needs a redesign" problem, you have a "never had a design system" problem. Fixing that is higher leverage than any single animation polish pass — do Part 3 before Part 4.

---

## Part 2 — Four creative directions: pros, cons, pick one

You said the current design reads as generic AI output and you don't like the color, structure, or overall feel. Fair — that's exactly what happens when a palette gets picked ad hoc screen-by-screen instead of decided once. Rather than hand you one more single "trust me" direction, here are four genuinely different directions with honest trade-offs. Pick one, mix two, or reject all four and tell me why — that's useful signal too.

Every AI-SaaS template on Earth converges on the same look: violet-to-cyan gradient, Inter, glassmorphic cards, bento grid, `backdrop-blur-2xl` — which is close to what DESIGN.md currently specifies and part of why it feels generated, not designed. All four options below deliberately avoid that convergence point, but they disagree on *how*.

### Option A — "Loom": textile-native (handloom, natural dye, drape)

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

### Option B — "Ledger": mercantile, bookkeeping, khata-native

Borrows from the actual object your retailers already trust: the paper ledger/khata book, GST invoice, rubber stamp, postal register. Kraft-paper neutrals, stamped badges, monospace numerics, ruled lines instead of cards-with-shadows.

**Pros:** Matches the retailer's existing mental model exactly — small shop owners doing accounts, not "using an app." Cheapest option to build — almost entirely typographic and flat, minimal illustration/animation budget needed. Strong credibility for GST invoicing and admin/back-office screens specifically. Low execution risk — hard to get "ledger" tastefully wrong the way "ethnic pattern" can go wrong.
**Cons:** Weakest option for the customer-facing "wow" moment (WhatsApp collection link) — a ledger aesthetic undersells the fashion/visual side of the product. Can read as dry or dated on the marketing site if not balanced with strong photography. Doesn't touch the Kanchuki-name story at all unless deliberately threaded in separately.

### Option C — "Studio Neon": bold fashion-editorial, high contrast

Borrows from fashion magazines and streetwear drops, not enterprise software: large cropped type, punchy saturated color blocks (not pastel, not glass), tilted/collaged product cards, confident asymmetry.

**Pros:** Feels genuinely fashion-forward — closer to what a fashion brand's own app looks like than what a B2B SaaS tool looks like. Best option for social/WhatsApp shareability and younger customer demographics. Furthest possible distance from "generic AI SaaS," since most AI tools are visually timid.
**Cons:** Highest execution risk — "bold" done badly reads as gaudy or amateur, and the margin for taste error is smaller than the other three options. Clashes with the seriousness GST invoicing/admin needs — would require a genuinely different visual language for admin vs. customer surfaces, not just a toned-down palette. Most expensive to build well (real art direction, not just token swaps). No inherent link to the Kanchuki name/story unless bolted on.

### Option D — "Quiet Atelier": minimal, restrained, premium fashion-house

Borrows from the *back-office of a high-end tailoring atelier* — monochrome-plus-one-accent, generous whitespace, thin rules, small-caps labels, almost no color. Closer to Cos/Aesop/premium fashion-house digital presence than to SaaS or to Indian textile motifs.

**Pros:** Ages well — least likely of the four to look dated in three years. Easiest to keep consistent across web/mobile/admin without a large design team, since there's little decoration to keep in sync. Signals "premium tool," which supports the ₹4,999 Pro-tier pricing story.
**Cons:** Coldest, least culturally warm of the four — risks feeling disconnected from the actual community-driven, relationship-heavy Indian retail context the product serves. Whitespace-heavy layouts cost real screen space on small, data-dense mobile admin/retailer screens. Highest risk of *still* reading as "another minimal AI SaaS" if the type choice isn't distinctive enough — minimalism is the easiest genre to make generic by accident.

### Decision: Option A — "Loom"

You picked A. Part 3 onward is now built out fully against it. B, C, and D stay documented above — not as leftover filler, but because a specific surface may still want to borrow a device from one of them later (e.g. if admin ever feels too decorated, Option B's ledger restraint is the fallback reference; if a marketing campaign wants a louder one-off page, Option C's boldness is the fallback reference). Treat B/C/D as a bench, not a bin.

### What none of these mean

- Not literal cliché regardless of option — no stock rangoli patterns, no gold filigree, no "ethnic pattern as wallpaper" (Option A), no fake vintage paper-texture overload (Option B), no oversaturated gradient soup mistaken for "bold" (Option C), no sterile emptiness mistaken for "premium" (Option D).
- Not a rewrite, whichever you pick. Every recommendation below builds on the existing Tailwind/CSS-var/NativeWind stack — no new framework required to start.

### 2.5 Founder story / About page — the etymology angle, made explicit

You liked the *Kanchuki* etymology thread enough that it's worth its own page, not just a design-rationale footnote. Proposal for a `/about` (or `/story`) page on the marketing site:

- **Structure:** one long-scroll editorial page (not a grid of icon-boxes like the rest of the marketing site) — this page is allowed to break the site's own layout rhythm because it's a narrative, not a feature list.
- **Opening:** lead with the word itself — what *kanchuki* meant (a tailored bodice/blouse worn under a saree/ghagra) and the one-line bridge to what the product does now (fitting technology to a garment trade that's always been about precise, personal fit). This is the single strongest hook in the whole site and currently unused anywhere.
- **Middle:** the actual founder story — why this problem, what was seen in real shops that made this worth building. **I don't have this content and won't invent it** — per the honest-copy discipline in this doc, no fabricated founder quotes, no invented "we started in a garage" narrative. You supply the real story; I can help structure and edit it once you have a draft.
- **Visual treatment:** whichever Option (A–D) you pick from above, this page is the natural home for that direction's *most* expressive version — e.g., under Option A, this is where the drape/thread motifs earn a literal illustration rather than just an interaction detail.
- **Close:** tie back to the product — the etymology isn't just trivia, it's the thesis statement ("we digitize fit and craft, the same thing the word always meant") — one line, not a hard sales pitch.

Add this to the Part 6 punch list once you've picked a direction — it's a marketing/content task as much as a design one, and it needs your real story before it needs any CSS.

---

## Part 3 — Concrete system (tokens, not vibes)

Built out against **Option A — Loom**, now that it's decided. Everything below is the actual system, not a hypothetical.

### 3.1 Color — natural dye palette (replaces the violet/cyan mismatch)

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

### 3.2 Typography

| Role | Face | Where |
|---|---|---|
| Display / marketing headlines / collection-link hero | A warm variable serif (e.g. Fraunces, Newsreader, or a licensed equivalent) | `apps/web` marketing + customer collection page only |
| UI / body / admin / retailer app | A clean grotesk already close to what's there (keep Inter here if licensing is a concern — the serif pairing is what creates distinctiveness, not banning Inter everywhere) | `apps/web` admin, `apps/mobile` |
| Hindi (Year-1 requirement per CLAUDE.md) | Confirm the chosen grotesk has a Devanagari companion (e.g. Noto Sans / Noto Serif pairing) *before* committing to a display face — this is a hard constraint, check it first | both |

Decide this before touching color — a font swap is the highest-leverage, lowest-risk change you can make, and it's the one DESIGN.md already got wrong (says Nunito/Inter, nobody's verified Devanagari coverage).

### 3.3 Motion — restraint by surface, not by rule

Applying Emil's frequency framework (`emil-design-eng` skill) per surface, because "add delight" and "no animation, ever" are both correct — for different screens:

| Surface | Frequency seen | Motion budget |
|---|---|---|
| Retailer app (RN, photo upload, product list) | Used dozens of times/day by the same retailer | **Minimal.** Button press feedback (`scale(0.97)`) only. No page-transition flourish — retailers doing bulk uploads of 500+ SKUs will grow to hate anything slower than instant. |
| Admin panel | Power users, keyboard-heavy, tables | **Near zero.** No animated route transitions. Table row hover/sort feedback only. This is Raycast's "no animation is the optimal experience" case, applied to your internal tool. |
| Customer collection page (WhatsApp share link) | Opened once or a few times by each customer, it's the "wow" moment | **Highest budget on the whole product.** This is the one place the Drape transition, staggered product-card reveal, and try-on result reveal deserve real craft — first impression, low frequency, directly tied to conversion. |
| Marketing site | First-time visitors | Standard entrance animation, stagger on feature sections, nothing longer than ~400ms per Emil's UI duration ceiling. |

Concretely: don't let the marketing page's framer-motion energy leak into the retailer app. They should feel like different products made by people who understand each audience, which — per the frequency table above — they are.

### 3.4 Fix the shared-token gap (the highest-priority structural item)

Today: web tokens live in `globals.css`, mobile has none, nothing shares. Fix:

1. Create one token source — either a small JSON/TS file in `packages/shared` (`packages/shared/src/design-tokens.ts`) or a `tokens.css` at repo root — containing every color, spacing, radius, and easing value from 3.1 above.
2. `apps/web/tailwind.config.ts` and `apps/mobile/tailwind.config.js` both `extend` from that one source instead of hardcoding values independently.
3. Delete the stale palette/font claims in `docs/DESIGN.md` and replace with whatever you actually approve from this doc — CLAUDE.md's own instruction #10 ("docs must track commits") applies here too: a design doc that lies about the palette is worse than no design doc.

This single change is what prevents this whole exercise from rotting the way DESIGN.md already has.

**Partially closed (2026-08-03, during the Black & Gold Elegance repaint):** step 1 exists now — `packages/shared/src/colors.ts` exports a `COLORS` object (same `ink`/`rust`/`turmeric`/`sand`/`cotton`/`charcoal` shape) — but scoped to what was actually causing pain: the ~40 `apps/mobile` screens hardcoding raw hex in RN literal props (`color=`, `placeholderTextColor=`, inline `style` objects) that a Tailwind className can't reach. Every one of those was migrated to `import { COLORS } from '@kanchuki/shared'`. Step 2 is **not** done — `tailwind.config.ts`/`tailwind.config.js` still hardcode their own copy of the same values, deliberately: those configs load at each platform's build time (Next's SWC / Metro), before `@kanchuki/shared`'s `dist/` output is guaranteed to exist, and wiring that import without a verified build-order guarantee risks breaking the whole app's styling (the exact failure mode §3.1 already warns about, from the oklch-in-Metro incident). Three files to edit on a future repaint now, not one — `tailwind.config.ts`, `tailwind.config.js`, `colors.ts` — down from ~45.

### 3.5 Spacing, radius, elevation

| Token | Value | Note |
|---|---|---|
| `--space-*` | 4pt scale: 4/8/12/16/24/32/48/64 | Standard, nothing textile-specific here — don't invent a novel spacing unit just for theme's sake. |
| `--radius-card` | `12px` | Loom cards are closer to a folded fabric edge than a rounded-rect app tile — keep radius modest, not the `rounded-[2rem]` squircle look of glass-SaaS. |
| `--radius-pill` | `999px` | Buttons and badges only. |
| `--shadow-*` | Drop the existing `soft`/`soft-lg` shadow tokens as the primary elevation device | Loom elevation comes from the **selvedge edge** (3.6) and flat color contrast against `--color-cotton`, not drop shadows. Reserve a single hairline shadow (`0 1px 2px oklch(20% 0 0 / 6%)`) for floating/overlay elements only (modals, toasts) — everything sitting in normal document flow stays shadow-free. |

### 3.6 Component vocabulary — the four Loom devices, specified

These are the concrete, buildable version of the table in Part 2.1. Each is a small, real spec — not a mood word.

**Selvedge-edge card** (replaces glass/shadow cards everywhere): flat `--color-cotton` or white background, `1px solid oklch(85% 0.01 90)` on three edges, and a **2px `--color-indigo` or `--color-madder` bar on the fourth edge only** (top on marketing cards, left on list-row cards) — this is the "selvedge" detail. `border-radius: var(--radius-card)`. No blur, no drop shadow in normal flow.

**Spool loader** (replaces spinner): a single arc (`stroke-dasharray` trick on an SVG circle, or a rotating conic-gradient mask) in `--color-indigo`, rotating continuously, `600–900ms` per revolution, `linear` easing per Emil's rule for constant motion. Reads as thread winding around a spool rather than a generic loading ring — same implementation cost as a spinner.

**Drape transition** (replaces fade/slide page transition): entering content starts at `transform: scaleY(0.96) skewX(-1deg); opacity: 0`, animates to `scaleY(1) skewX(0); opacity: 1` over `200–250ms` with `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`, per the emil-design-eng skill's strong-ease-out curve). Applies to the customer collection page and marketing sections only — never on admin or retailer-app routes (3.3/Part 4).

**Bolt-and-swatch grid** (replaces symmetric bento grid, marketing page only): a CSS grid with intentionally uneven `col-span`/`row-span` per card (e.g. 7/5/4/8 column splits on a 12-col grid, not 4/4/4), each card using the selvedge-edge treatment above. Collapses to single-column stack under 768px — no rotation/overlap tricks that would break on mobile.

### 3.7 Iconography

Standard thick-stroke icon sets (Lucide's default weight, Font Awesome, Material) read as generic-SaaS on sight. For Loom: pick a **thin-line icon set** (Phosphor's "light" weight or Remix Line) at a consistent `1.5px` stroke — closer to a stitched line than a bold glyph. Apply uniformly across web, mobile, and admin; icon weight is one of the cheapest brand-consistency wins available and currently undecided anywhere in the codebase.

### 3.8 Logo / wordmark direction

No logo file exists today (Part 1.3) — only PWA icons. Concept direction, not a finished mark:

- **Wordmark-led, not symbol-led.** "Kanchuki" set in the chosen display serif (3.2) is likely stronger alone than inventing an abstract icon — the name itself is the asset (Part 2.5). Test the wordmark alone before assuming you need a mark.
- **If a mark is wanted alongside the wordmark:** the most defensible option is a small device built from **two crossed/interlaced thread lines** — literally warp-and-weft, matching the selvedge-edge motif already used in cards (3.6). Avoid literal garment silhouettes (a blouse/bodice icon) — too illustrative, ages badly, and reads closer to a clothing-brand logo than a software product's mark.
- **Favicon:** the interlaced-thread device (if built) works standalone at 16–32px in a way a wordmark cannot — build the mark with the favicon constraint in mind from the start, not as an afterthought crop of a larger logo.
- This needs an actual designer pass (typographic logo construction, optical spacing) — treat this bullet list as a creative brief, not a deliverable.

### 3.9 Imagery / product photography direction

The customer collection page and marketing site live or die on product photography quality, more than any token in this doc. Direction: natural/window light over studio strobe-flat lighting, garments shown with visible drape and texture (not flattened product-catalog crops), avoid generic glossy stock-fashion photography for any marketing hero — it undercuts the "real shops, real retailers" honesty the rest of this doc argues for (Part 5.2). This is a photography-direction note for retailers/content team, not something CSS can fix.

---

## Part 4 — Applying Emil's interaction principles to real Kanchuki flows

Picking the four highest-value flows, not a generic checklist:

### 4.1 Photo upload → AI auto-tag (retailer app, the core MVP loop)
- This is used dozens of times per session during bulk onboarding (F-001d). **No animation on the capture button itself** — instant shutter feedback only (scale 0.97 on press).
- The AI-tagging wait *is* a legitimate animation opportunity: a **spool loader** (2.1) instead of a generic spinner, because this is a moment retailers watch closely, and a distinctive loader here is free brand reinforcement at the single most-repeated moment in the product.
- When tags populate, don't have them pop in with a bounce — use a quick stagger fade (30–50ms between chips), matching Emil's stagger guidance. Bounce reads as "toy," and retailers are trying to get through 500 SKUs, not enjoy a delight moment.

### 4.2 WhatsApp collection link → customer opens it (the moment that has to convert)
- This is the one screen worth the full Drape-transition treatment: product grid entrance staggered 40–60ms per card, `ease-out`, under 300ms per card.
- Favorite/heart interaction: standard scale-feedback + a filled-state color transition, no confetti — per Emil's "silent success over celebratory toast" principle, since this action repeats per product browsed.
- If/when VTO ships (post-MVP): the reveal of the try-on result is the single highest-leverage animation in the entire product — first thing built once VTO lands should be a considered, non-generic clip-path or blur-crossfade reveal, not a plain image swap.

### 4.3 Admin data tables (16 route sections, all data-dense)
- Sort/filter changes: CSS transition on row reorder, never a full re-render flash.
- Suspend/unsuspend, block/unblock actions (F-015): these are rare, high-consequence actions — a deliberate confirm state (not a native `confirm()`) with the *slow-press, fast-release* asymmetry Emil describes for hold-to-delete patterns is appropriate here, since these are destructive-adjacent.
- Everything else in admin: keep it boring. This is the one surface where "boring" is the correct verdict, not a compromise.

### 4.4 Buttons, everywhere
Every primary button in the product should get `transform: scale(0.97)` on `:active` — it's a 3-line CSS change, applies to web and mobile equivalently (RN: `Pressable` with a scale animated value), and it's the single cheapest "this app feels expensive" fix available. Currently absent everywhere per the codebase scan.

---

## Part 5 — Explicit anti-patterns for this project specifically

Beyond the generic slop list (glass cards, violet gradients, bento-by-default, Inter-everywhere) — two Kanchuki-specific ones:

1. **No heavy `backdrop-blur` anywhere in the retailer app.** Your retailers are on budget Android hardware in tier-2/3 cities with patchy connectivity (CLAUDE.md: "offline-first design" is a named constraint). Glassmorphism is a GPU tax you cannot afford on that hardware. Reserve blur, if used at all, for the customer PWA on modern phones — and even there, only on fixed/sticky elements, never scrolling content.
2. **No invented urgency patterns** ("Only 2 left!", fake countdown timers) on the customer collection page. Kanchuki's moat is trust-based, relationship-driven retail (Fashion DNA CRM, real human retailers). Manipulative dark-pattern urgency contradicts the actual product thesis and will read as cheap against the textile-craft direction in Part 2.

---

## Part 6 — Punch list (do these in this order)

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

## Open decisions I can't make for you

- Exact accent hues — I gave OKLCH starting points in 3.1, but "which specific indigo, which specific madder" is a brand call, not a technical one.
- Whether there's budget/appetite for a licensed display serif vs. a free alternative (Fraunces/Newsreader are open-source and solid choices if budget is a constraint).
- Whether to commission a logo mark (3.8) or run wordmark-only — both are legitimate, and it changes the favicon/app-icon work downstream.
- Your actual founder story for §2.5 — I structured the page, I didn't write the content, and won't invent it.
- Whether B/C/D (Part 2) ever get pulled off the bench for a one-off campaign page or a specific surface that Loom doesn't fit well.
