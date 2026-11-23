# Mobile unslop: direction, rules and screen checklist

**Status:** Task 1 built on `design/mobile-unslop-task-1`. Not merged and not checked in Expo Go. Tasks 2-4 must not start until Task 1 is merged.

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
| Buttons | `button-styles.md` still applies: owner-approved gradient, radius 16, uppercase labels and navy icons. Do not restyle the three shared buttons without owner approval. |

## Open owner decisions

1. Web-variant dark and red buttons use 10px uppercase labels by owner decision (2026-10-16). They are the smallest text left on the unslopped screens. They stay until the owner decides.
2. Home "Scan Barcode / QR" opens Store Profile, not a scanner. Left alone because navigation is out of scope.
3. Home shows the Analytics tile twice for roles that can see it. Left alone because removing it changes navigation entries.
4. Home shows "PRO STORE" if the plan value is missing. Left alone because it is plan-related display logic.

## Checklist (81 screens)

`[x]` means the visual pass is done in code. Expo Go confirmation is tracked separately below.

### Task 1: shared components, auth, join, onboarding, tabs (12)

Expo Go check: **pending owner**.

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

- [ ] `product/[id]`
- [ ] `product/[id]/add-color`
- [ ] `product/[id]/add-photos`
- [ ] `product/add`
- [ ] `product/bulk`
- [ ] `product/bulk-onboard`
- [ ] `product/catalog-import`
- [ ] `product/scan`
- [ ] `product/sell`
- [ ] `product/try-on`
- [ ] `category/[id]`
- [ ] `category/[id]/add-products`
- [ ] `category/new`
- [ ] `collection/[id]`
- [ ] `collection/new`
- [ ] `customer/[id]`
- [ ] `customer/add`
- [ ] `enquiries`
- [ ] `enquiry-try-on`
- [ ] `ai-search`

### Task 3: growth and social (28)

Built on `design/mobile-unslop-task-3`. Expo Go check: **pending owner**.

Left alone on purpose:

- Campaign message templates keep their emoji because customers receive that text.
- `PostPreview` is unchanged because it must match the published post.
- The `Generate Luxury Description` button on `growth/translate` keeps its label under the button-text rule. Owner decides whether to reword it.
- `social/ai-design` keeps its own gradient button, which matches `GradientButton`.
- `settings/social` still says `Connected!`. Task 4 should change it and its test together.

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

- [ ] `settings/index`
- [ ] `settings/catalog-upload`
- [ ] `settings/deleted-products`
- [ ] `settings/help-support`
- [ ] `settings/social`
- [ ] `settings/staff`
- [ ] `settings/support-sessions`
- [ ] `settings/whatsapp-catalog`
- [ ] `staff/index`
- [ ] `staff/catalog-tickets`
- [ ] `staff/retailer-onboard`
- [ ] `staff/support-session`
- [ ] `staff/tickets`
- [ ] `billing`
- [ ] `analytics`
- [ ] `store-profile`
- [ ] `showcase-designs/index`
- [ ] `showcase-designs/browse`
- [ ] `showcase-designs/new`
- [ ] `showcase-designs/[id]`
- [ ] `showcase-designs/view/[id]`

Merging does not reach phones. After Task 4, a new Android build is needed.
