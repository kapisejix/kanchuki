# Task M: Multi-Language AI — Future Work (Gaps)

**Status:** Partial — Core built (descriptions + campaign/WhatsApp messages in 7 languages, AI search with Hindi/Hinglish voice via keyboard dictation). **Data groundwork landed** (migration 063 + shared SUPPORTED_LOCALES + API preferred_locale field). Full sub-tasks deferred post-launch.

**⚠️ Correction:** The original assumption that "i18n infrastructure already in place (uses i18next / expo-localization)" is **FALSE** — verified 2026-08-18: zero i18n code exists in either app. The "Retailer app UI language toggle" and "PWA language toggle" sub-tasks require building i18n from scratch, making them significantly larger than the original "Low/Low-Medium" estimates.

### Groundwork Landed (2026-08-18)

| What | Status | Detail |
|---|---|---|
| `retailers.preferred_locale` column | ✅ Built | Migration `063` (not yet applied). `TEXT DEFAULT 'en-IN'`. |
| `SUPPORTED_LOCALES` shared constant | ✅ Built | `packages/shared/src/constants/index.ts` — 8 locales with BCP-47 codes, native names, script types. |
| `preferred_locale` in retailer API | ✅ Built | `PUT /me` accepts it (zod validated). `GET /me` returns it. |
| i18n infrastructure | ❌ Not built | No i18next/expo-localization anywhere. Required by both PWA and retailer toggle sub-tasks. |

---

## Gap Summary

| Sub-Feature | Status | Blocker / Notes |
|---|---|---|
| Native in-app microphone | ❌ Not built | Requires **dev build** (Expo dev client / custom native module). Keyboard dictation is the current fallback path. |
| PWA language toggle | ❌ Not built | Customer-facing PWA needs a language selector to switch UI + content locale. |
| Retailer app UI language toggle | ❌ Not built | Retailer mobile app needs a settings entry to switch the entire app UI locale (independent of content language). |

---

## Current Implementation (Built)

- **AI product descriptions** — Generated in 7 languages via Claude, placeholders preserved.
- **Campaign & WhatsApp message translation** — Same 7 languages, same placeholder preservation.
- **AI Search screen** — Hindi/Hinglish transliteration search works; voice input via **keyboard dictation** (OS-level, no native mic).

Languages supported: Hindi, Hinglish (Devanagari + Romanized), Tamil, Telugu, Marathi, Gujarati, Bengali.

---

## Required Work

### 1. Native In-App Microphone (Dev Build)

- **Platform:** iOS + Android
- **Approach:** Expo dev client with `expo-av` / `expo-speech-recognition` or custom native module (React Native Voice / @react-native-community/voice).
- **Permissions:** `RECORD_AUDIO` (Android), `NSMicrophoneUsageDescription` (iOS).
- **Integration point:** `apps/mobile/app/(tabs)/ai-search.tsx` — replace keyboard-dictation fallback with native mic button.
- **Fallback:** Keep keyboard dictation for Expo Go / web users.

### 2. PWA Language Toggle

- **Location:** Customer-facing PWA (collection view, product detail, enquiry flow).
- **UI:** Top-bar or bottom-sheet language picker (flag + native name).
- **Persistence:** `localStorage` / cookie (`preferred_locale`).
- **Scope:** Switches both **UI strings** (i18n) and **AI-generated content** (descriptions, messages) to selected locale.
- **Fallback chain:** Selected locale → retailer's default locale → Hindi → English.

### 3. Retailer App UI Language Toggle

- **Location:** Retailer mobile app → Settings → Language.
- **UI:** Radio list of supported locales (same 7 languages).
- **Persistence:** Sync to `Retailer.preferred_locale` (new column) + local AsyncStorage for instant switch.
- **Scope:** Entire app UI (navigation, labels, forms, errors). Content language (AI descriptions) remains driven by customer locale or campaign locale.

---

## Database Changes

| Table | Column | Type | Notes |
|---|---|---|---|
| `retailers` | `preferred_locale` | `TEXT` | Default `en-IN`. Used for retailer UI language. |

> No migration exists yet. Add via `ALTER TABLE "retailers" ADD COLUMN "preferred_locale" TEXT DEFAULT 'en-IN';`

---

## Acceptance Criteria

- [ ] Native mic works on **dev build** (iOS + Android) for AI search voice input.
- [ ] PWA language picker persists selection and switches UI + content locale correctly.
- [ ] Retailer app Settings → Language toggles full app UI locale instantly (no reload).
- [ ] All 7 languages render correctly (Devanagari + Romanized for Hindi/Hinglish).
- [ ] Keyboard dictation remains functional as fallback for non-dev-build users.

---

## Effort Estimate

| Sub-Task | Effort | Priority |
|---|---|---|
| Native mic (dev build setup + integration) | Medium | P1 |
| PWA language toggle (UI + i18n wiring) | Low-Medium | P1 |
| Retailer app language toggle (settings + persistence) | Low | P1 |

**Total:** ~2–3 weeks (can parallelize PWA + retailer toggle).

---

## Dependencies

- Expo dev client configured for the project (required for native mic).
- i18n infrastructure already in place (uses `i18next` / `expo-localization` — verify).
- `Retailer.preferred_locale` column migration.

---

## References

- Main roadmap: `docs/INDIA-RETAILER-GROWTH.md` (Feature M, line 263–279)
- Build log: `docs/BUILD-LOG.md` §47
- AI search screen: `apps/mobile/app/(tabs)/ai-search.tsx`
- PWA entry: `apps/web/src/app/[store]/page.tsx` (or equivalent)