# Mobile unslop: direction, rules and screen checklist

**Status:** Tasks 1-4 and the owner-review fixes are done and merged to `main` (PRs #332, #336, #333, #334, #335). The owner checked them in Expo Go on 2026-11-24. They reach phones only with a new Android build.

## Direction

- **Product:** a catalog and WhatsApp selling tool for owners of Indian clothing stores.
- **Character:** unhurried, exact, shopkeeper-warm.
- **World:** a cloth shop counter, with fabric on shelves, a bill book and a painted signboard.
- **Moments:** real product photos, plus one navy-to-plum figure panel where a screen has a key number.
- **Signature:** Marcellus at its natural weight for shop names, screen titles and key figures, like a shop signboard. Never bold it.

## Rules

Use the existing tokens in `apps/mobile/tailwind.config.js`. Add no dependencies.

| Area | Rule |
|---|---|
| Scope | Visual only. Do not change logic, API calls, navigation, validation, prices, GST, permissions or data handling. |
| Accessibility | Keep labels, touch targets, keyboard handling, and loading, empty and error states. `GradientButton`, `WhiteButton` and `DangerButton` use their label as the accessibility label, so leave button text alone. |
| Legal text | Do not reword consent, terms, privacy or billing statements. |
| Type | Marcellus has no `font-bold`, `fontWeight` or `letterSpacing`. Inter uses `font-medium` or `font-semibold`, never `font-bold` or `font-extrabold`. Minimum text size is 11px. |
| Labels | Sentence case. Remove `uppercase tracking-wider`. Codes such as GSTIN and referral codes keep their tracking. |
| Color | Text: `spaceCadet-900`, `heliotrope-600`, `heliotrope-500`. Accent: fuchsia only for the active tab, links, the current input and unread badges. Red, amber and green carry status only. |
| Missing tokens | `heliotrope-400` and `spaceCadet-600` do not exist. Use `heliotrope-500` and `heliotrope-600`. |
| Icons | Lucide only, no emoji. Muted color `#5A3962` or `#6B4773`, with no tinted tile behind each icon. |
| Surfaces | Cards use `rounded-2xl` with a `lavender-200` hairline. No colored glow. Floating buttons use a soft navy shadow. |
| Gradient | Navy to plum only on `GradientButton` and at most one key panel per screen. |
| Copy | No greetings, exclamation marks, "luxury", "seamless" or "AI-powered". Do not invent claims. |
| Theme variables | `ink-600`, `rust-600`, `turmeric-600` and `sand-100` are set from the admin theme. Keep them. Other `sand` and `ink` tints may move to `lavender`, `heliotrope` and `spaceCadet`, but check the surface first: camera screens are black. |
| Buttons | `button-styles.md` still applies: owner-approved gradient, radius 16, uppercase labels and navy icons. Do not restyle the three shared buttons without owner approval. |

## Open owner decisions

1. Web-variant dark and red buttons use 10px uppercase labels by owner decision (2026-10-16). They are the smallest text left on the unslopped screens. They stay until the owner decides.
2. Home "Scan Barcode / QR" opens Store Profile, not a scanner. Left alone because navigation is out of scope.
3. Home shows the Analytics tile twice for roles that can see it. Left alone because removing it changes navigation entries.
4. Home shows "PRO STORE" if the plan value is missing. Left alone because it is plan-related display logic.

## Checklist (81 screens)

`[x]` means the visual pass is done in code. Expo Go confirmation is tracked separately below.

### Task 1: shared components, auth, join, onboarding, tabs (12)

Expo Go check: **done by owner 2026-11-24**.

- [x] `auth/phone`
- [x] `auth/otp`
- [x] `join`
- [x] `onboarding`
- [x] `(tabs)/index`
- [x] `(tabs)/catalog`
- [x] `(tabs)/category`
- [x] `(tabs)/collections`
- [x] `(tabs)/customers`
- [x] `(tabs)/add` (redirect only, nothing to change)
- [x] `(tabs)/growth` (renders `growth/index`, restyled in Task 3)
- [x] `(tabs)/social` (renders `settings/social`, restyled in Task 4)

Shared components changed: `ProductCard`, `ScreenHeader`, `UsageCard`, `SetupChecklist`, tab bar. `GradientButton`, `WhiteButton` and `DangerButton` are intentionally unchanged.

### Task 2: products, categories, collections, customers (20)

Expo Go check: **done by owner 2026-11-24**.

- [x] `product/[id]`
- [x] `product/[id]/add-color`
- [x] `product/[id]/add-photos` (no visual issues found)
- [x] `product/add`
- [x] `product/bulk`
- [x] `product/bulk-onboard`
- [x] `product/catalog-import`
- [x] `product/scan` (no visual issues found)
- [x] `product/sell`
- [x] `product/try-on`
- [x] `category/[id]`
- [x] `category/[id]/add-products`
- [x] `category/new`
- [x] `collection/[id]`
- [x] `collection/new`
- [x] `customer/[id]`
- [x] `customer/add`
- [x] `enquiries`
- [x] `enquiry-try-on`
- [x] `ai-search`

### Task 3: growth and social (28)

Merged in PR #334. Expo Go check: **done by owner 2026-11-24**.

Left alone on purpose:

- Campaign message templates keep their emoji because customers receive that text.
- `PostPreview` keeps the published-post layout. Its photo box became a fixed 4:5 frame during the owner-review fixes (see below).
- Owner approved rewording 9 button labels on Translate, Videos and the integration screens (2026-11-23).
- `social/ai-design` keeps its own gradient button, which matches `GradientButton`.
- `settings/social` said `Connected!`. Task 4 changed it and its test together.

- [x] `growth/index`
- [x] `growth/aggregators`
- [x] `growth/ai-campaign`
- [x] `growth/analytics`
- [x] `growth/campaign/[id]`
- [x] `growth/campaign-new`
- [x] `growth/campaigns`
- [x] `growth/engagement`
- [x] `growth/gst`
- [x] `growth/integrations`
- [x] `growth/integrations/facebook`
- [x] `growth/integrations/fb-ads`
- [x] `growth/integrations/google-ads`
- [x] `growth/integrations/google-business`
- [x] `growth/integrations/instagram`
- [x] `growth/integrations/whatsapp`
- [x] `growth/inventory`
- [x] `growth/promotion-form`
- [x] `growth/promotions`
- [x] `growth/ratings`
- [x] `growth/translate`
- [x] `growth/videos`
- [x] `social/ai-design`
- [x] `social/create`
- [x] `social/design`
- [x] `social/schedule/index`
- [x] `social/schedule/new`
- [x] `social/schedule/[id]`

### Task 4: settings, staff, billing, analytics, store profile, showcase (21)

Merged in PR #335. Expo Go check: **done by owner 2026-11-24**.

- [x] `settings/index`
- [x] `settings/catalog-upload`
- [x] `settings/deleted-products`
- [x] `settings/help-support`
- [x] `settings/social`
- [x] `settings/staff`
- [x] `settings/support-sessions`
- [x] `settings/whatsapp-catalog`
- [x] `staff/index`
- [x] `staff/catalog-tickets`
- [x] `staff/retailer-onboard`
- [x] `staff/support-session`
- [x] `staff/tickets`
- [x] `billing`
- [x] `analytics`
- [x] `store-profile`
- [x] `showcase-designs/index`
- [x] `showcase-designs/browse`
- [x] `showcase-designs/new`
- [x] `showcase-designs/[id]`
- [x] `showcase-designs/view/[id]`

### Fixes after owner review (2026-11-24)

Owner Expo Go results, as reported:

1. Social post preview: "i want real product image in preview ... it works good when i post the product, then why not its not showing the preview image."
2. Bottom bar: "social show on all Play build, i want complete 5 icons on bottom nav bar, there is no option to hide it from plan or something else."
3. Product detail: "it still showing me old video generation, but i developed vedio generation feature using seedance API ... when retailer click on the Generate video button just before AI Studio. must be AI Video."
4. After those fixes: "checked all".

| Fix | Commit |
|---|---|
| Marcellus weight and spacing restored on headings; catalog duplicate filter and header icons removed; text links became outline buttons | `28e7676e`, `c99ee5b1`, `f406bf34`, `e88af33f` |
| Shared buttons keep their width while loading | `58486b68` |
| `DangerButton` red painted on an inner view (Disconnect showed white text) | `9f5db288` |
| Social & Marketing Channels card buttons full width | `1df7016e` |
| Reconfigure uppercase with icon, next to Disconnect | `dce44eda` |
| Social settings Post button full width | `ff915dc4` |
| Post preview photo: fixed 4:5 box, whole photo shown. Sizing the box from `onLoad` looped on Android and left the grey placeholder | `6975a81a` |
| Social shown in every build: `META_SOCIAL_ENABLED` is always `true` (owner decision, replaces the `EXPO_PUBLIC_META_SOCIAL` Play gate) | `664f7112` |
| Product detail: the old pan/zoom Video button before AI Studio is now AI Video (F-034). Shown on every plan; a plan without AI video gets the server's reason on tap | `a6317c05` |

AI Video needs admin settings per plan: AI Promo Videos feature, an `AI_VIDEO` limit, an enabled video model, and published video styles. Facebook and Instagram connect still depends on Meta App Review.

Merging does not reach phones. After Task 4, a new Android build is needed.
