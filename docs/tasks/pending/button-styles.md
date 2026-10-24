# Button Style Spec — web reference → mobile (Expo Go pilot first)

**Status: ✅ Pilot merged (PR #87); only the pilot screens use the new look, rollout to other screens not started.** Pilot screens only (list in
"Pilot screens so far" below). All other screens are unchanged — `GradientButton` default look is exactly
as before; the new look is opt-in via `variant="web"`; `WhiteButton`, `DangerButton`, `BrandIcon` are new.
Web: only "Share Product" text + navy like-heart changed. v7 build skipped; all testing in Expo Go.

Source of truth = customer web product sheet + suit-detail page. **Owner decisions (2026-10-16):**
- text/icon = dark navy `#231F48`; **icons in white buttons are navy** (no green WhatsApp / pink / orange).
- **radius 16 for all buttons** (web uses 24; owner chose 16 for mobile after testing).
- dark↔dark, white↔white; **Disconnect/Delete = solid red `#DC2626` bg + white text**.
- white button = sentence case, 14px bold, light `shadow-sm`, border `#E0E1F6` (matches suit-detail
  WhatsApp / Copy link / Visit store).
- dark + red buttons carry the navy `shadow-lg` glow (offset 8, opacity .25, radius 12, elevation 10).
- Connect Account has a white right-side arrow (`iconRight`).
- **mobile labels must never be cut off** (wrap, button grows).

## 1. Dark button (primary CTA) — web `ProductDetailSheet.tsx:851`

```
w-full py-3.5 px-3 rounded-3xl
bg-gradient-to-r from-[#231F48] to-[#560A39]      left → right
text-white  flex items-center justify-center gap-2
shadow-lg shadow-[#231F48]/25
label: text-xs font-extrabold uppercase tracking-wider
```

React Native equivalent (`GradientButton`):

| Property | Value |
|---|---|
| Gradient | `['#231F48', '#560A39']`, `start {x:0,y:0}`, `end {x:1,y:0}` (**horizontal**, was diagonal) |
| Radius | **16** (`radius` prop, default 16 on the web variant; signature variant stays 24) |
| Padding | vertical 14, horizontal 12; `minHeight: 48` |
| Content | icon + label **centred**, gap 8; no arrow badge unless `accentBadge` passed; optional white `iconRight` |
| Label | 12 / weight 800 / uppercase / letterSpacing 0.8 / white |
| Shadow | color `#231F48`, offset `{0,8}`, opacity 0.25, radius 12, elevation 10. **The wrapper needs `backgroundColor: '#231F48'` + `borderRadius: 24`** or Android draws no shadow (gradient child has no fill of its own). Same shadow on `WhiteButton` (owner 2026-10-16). |
| Disabled | opacity 0.5, no shadow |
| Press | existing `AnimatedPressable` scale |

## 2. White button — web `DesignShareActions.tsx:74` + `ProductDetailSheet.tsx:870`

```
bg-white  border border-[#E0E1F6]  rounded-3xl (24)
text-[#231F48] font-bold  shadow-sm
icon: #231F48 (navy)  — never coloured
```

React Native equivalent (new `WhiteButton`, to be created):

| Property | Value |
|---|---|
| Fill / border | `#FFFFFF` / 1 px `#E0E1F6` |
| Radius | **16** (`radius` prop, default 16) |
| Padding | vertical 14, horizontal 12; `minHeight: 48` |
| Content | icon + label centred, gap 8 |
| Label | **14 / 700 / `#231F48` / sentence case** (suit-detail style); `uppercase` prop exists but unused |
| Icon | `#231F48`, size 14–16 |
| Shadow | web `shadow-sm`: `#231F48`, offset `{0,1}`, opacity 0.08, radius 3, elevation 2 |
| Disabled | opacity 0.5 |

### Pilot screens so far (opt-in, everything else unchanged)

| Screen | Done |
|---|---|
| `settings/index.tsx` | Sign Out, OTP modal, WhatsApp modal |
| `growth/index.tsx` | Create Campaign, + New Campaign |
| `growth/integrations.tsx` (Social & Marketing Channels) | brand icons (`BrandIcon`), Connect / Reconfigure / Disconnect |
| `growth/integrations/{instagram,facebook,whatsapp,fb-ads,google-ads}.tsx` | dark `GradientButton variant="web"`, `WhiteButton` (docs link, Test, Verify), `DangerButton` (Disconnect), 📸/💾 emoji removed |
| `social/create.tsx` (Create Post) | Publish now / Done / Connect in Settings → dark web variant; result-sheet platform tiles → `BrandIcon`. Chips/list rows left as-is (not buttons). |
| `social/schedule/{index,new,[id]}.tsx` | all CTAs → dark web variant; Pause/Resume, Skip, Edit, Retry, Style post, AI caption, AI Studio → `WhiteButton`; End plan → `DangerButton`; platform tiles → `BrandIcon`. Toggle chips, steppers, icon-only tools, style-picker rows left as-is. |
| `growth/{campaigns,promotions,videos,translate,templates,aggregators}.tsx` | CTAs → dark web variant; Cancel/Close/Copy/Regenerate/Generate-video → `WhiteButton` (navy icons); ✨📤📋🔄 emoji in button labels removed. `analytics.tsx` has no buttons. Left: header `+` icon buttons, filter chips, icon-only trash/sync, marketplace/template emoji tiles (C-03). |
| **All remaining screens (2026-10-16)** | Every plain `<GradientButton>` in `app/**` + `src/components/**` (48 uses) → `variant="web"` (skipped 4 with `colors=`/`accentBadge` overrides: `ProductStudioModal` x3, `collection/[id]` accent QR, Home QR CTA). Hand-built buttons → shared components: `gmb`, `(tabs)/collections`, `(tabs)/customers`, `plan-select`, `billing`, `analytics`, `store-profile` (Save Image / Delete QR → White/Danger), `settings/support-sessions` (Deny/Approve/End access), `settings/staff` (Cancel, Delete Forever, Copy, Share), `product/[id]` (Ask for Review, Try On Customer → White), camera-permission buttons x3 (white on black). Left: coloured WhatsApp/emerald CTA in `staff.tsx`, banner/hero gradients, selected-card gradients, chips. |
| `settings/social.tsx` (Social Media) | Facebook `BrandIcon`, Connect / Post (dark), History / Connect another Page (white), Disconnect (red) |

**Size reduction (owner 2026-10-16, after testing):** web-variant dark/red labels 12→**10px**, white label 14→**12px**; padding 14/12→**12/10**, minHeight 48→**44**. Signature (default) variant unchanged.

**Not yet migrated (next):** `growth/{campaign-new,promotion-form,ai-campaign,campaign/[id],inventory,analytics}`, `(tabs)/*`, onboarding, plan-select, store-profile, product add/edit,
customer screens, collection/category screens; 15 files hard-code the navy→plum gradient; 12 hand-build white buttons.

New components: `WhiteButton`, `DangerButton` (solid red `#DC2626`, white label, same radius/shadow), `BrandIcon` (FontAwesome brand glyphs from `@expo/vector-icons`, available via Expo but not listed in `apps/mobile/package.json`).

## 3. Full text on mobile buttons (no cut-off)

Cause found: `GradientButton.tsx:94` sets `numberOfLines={1}` and the label wrapper has `flexShrink: 1`,
so long labels are clipped ("CONNECT …", "SAVE & C…"). 70 `numberOfLines={1}` sites exist in `apps/mobile`,
0 `adjustsFontSizeToFit`.

Rule for both button components: **remove `numberOfLines`**, let the label wrap to a second line, grow
the button height (`minHeight`, never fixed `height`), `textAlign: 'center'`. Keep label short where possible.

## 4. Mobile audit (2026-10-16)

| Finding | Count |
|---|---|
| Files using `GradientButton` | 54 (148 uses incl. tests) |
| Files using `AnimatedPressable` | 93 files, 455 `<AnimatedPressable` |
| Raw `<Pressable` / `<TouchableOpacity` left | 9 / 4 |
| Files hard-coding the `#560A39` gradient themselves (not via `GradientButton`) | 15: `(tabs)/customers`, `(tabs)/index`, `ai-search`, `analytics`, `auth/phone`, `collection/[id]`, `customer/[id]`, `growth/analytics`, `growth/index`, `growth/integrations`, `growth/inventory`, `growth/translate`, `onboarding`, `plan-select`, `store-profile` |
| Files hand-building white/bordered (`#E0E1F6`) buttons | 12 |
| Truncating labels | `GradientButton` itself (root cause) + 70 `numberOfLines={1}` sites |

## 5. Rollout plan

1. Update `GradientButton` (horizontal gradient, centred, wrap text) and add `WhiteButton`.
2. **Pilot on one screen in Expo Go** (owner picks; suggestion: `growth/integrations/gmb.tsx` or `settings/index.tsx` — they have both a dark and a white button and a truncation bug).
3. Owner approves look → migrate the 15 hand-gradient files, then the 12 white-button files, then the rest of `AnimatedPressable` CTAs.
4. CI guard: no inline `#560A39` / `#E0E1F6` button styles outside the two components (audit step 4.6).
5. Re-check screens B, C, J (audit) for truncation.

## 6. Web changes done in the same session

- `ProductDetailSheet.tsx`: "Share it with friends" → **"Share Product"**; like heart icon navy.
- Design page (`DesignShareActions`, `designs/[id]/page.tsx`): WhatsApp green icon and pink "Visit store" → navy — **pending owner OK**.
