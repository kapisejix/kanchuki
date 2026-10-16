# Button Style Spec — web reference → mobile (Expo Go pilot first)

**Status: 🧪 Pilot built (2026-10-16), Expo Go test pending.** Pilot = **2 mobile screens only**:
`apps/mobile/app/settings/index.tsx` (Sign Out, OTP modal, WhatsApp modal) and
`apps/mobile/app/growth/index.tsx` (Create Campaign, + New Campaign). All other screens are unchanged —
`GradientButton` default look is exactly as before; the new look is opt-in via `variant="web"`, and
`WhiteButton` is new (used on Settings only). Web: only "Share Product" text + navy like-heart changed.
Owner tests in Expo Go, then approves rollout. v7 build skipped for now.

Source of truth = customer web product sheet. Owner decisions (2026-10-16): text/icon = dark navy
`#231F48`; **all icons in white buttons are navy** (no green WhatsApp / pink / orange icons); radius **24
everywhere**; dark↔dark, white↔white; coloured buttons (green Enquire, red delete) keep their colour;
**mobile labels must never be cut off**.

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
| Radius | 24 |
| Padding | vertical 14, horizontal 12; `minHeight: 48` |
| Content | icon + label **centred**, gap 8; no arrow badge unless `accentBadge` passed |
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
| Radius | 24 |
| Padding | vertical 14, horizontal 12; `minHeight: 48` |
| Content | icon + label centred, gap 8 |
| Label | 12 / 700 / `#231F48`; uppercase on product-sheet style, sentence case on design-page style (pick one per screen group) |
| Icon | `#231F48`, size 16–17 |
| Shadow | same as dark button: `#231F48`, offset `{0,8}`, opacity 0.25, radius 12, elevation 10 (owner: same shadow on all buttons) |
| Disabled | opacity 0.5 |

### Pilot screens so far (opt-in, everything else unchanged)

| Screen | Done |
|---|---|
| `settings/index.tsx` | Sign Out, OTP modal, WhatsApp modal |
| `growth/index.tsx` | Create Campaign, + New Campaign |
| `growth/integrations.tsx` (Social & Marketing Channels) | brand icons (`BrandIcon`), Connect / Reconfigure / Disconnect |
| `growth/integrations/{instagram,facebook,whatsapp,fb-ads,google-ads}.tsx` | dark `GradientButton variant="web"`, `WhiteButton` (docs link, Test, Verify), `DangerButton` (Disconnect), 📸/💾 emoji removed |

New components: `WhiteButton`, `DangerButton` (red, same radius/shadow), `BrandIcon` (FontAwesome brand glyphs from `@expo/vector-icons`, available via Expo but not listed in `apps/mobile/package.json`).

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
