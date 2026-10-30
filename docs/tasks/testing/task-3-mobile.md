# Major Task 3 — Mobile (`apps/mobile`, Expo / React Native)

| ID | Small task | Do | Output |
| --- | --- | --- | --- |
| T3.1 | Typecheck + lint baseline | `rtk tsc --noEmit` and `rtk lint` in `apps/mobile`. Group by file/code. | `reports/T3.1-mobile-typecheck-lint.md` |
| T3.2 | Tests | Run mobile test script (check `apps/mobile/package.json`). If none exist for a screen group, list the 10 riskiest untested screens (auth, billing, plan-select, staff invite, enquiries, social composer). | `reports/T3.2-mobile-tests.md` |
| T3.3 | Dead code + teardown leftovers | `npx knip` in `apps/mobile`. Unused screens/components/hooks/api methods; calls to endpoints removed server-side (RC-007/012/013 shape). For each `*Api.*` client method, confirm a server route exists (Serena + grep `apps/api/src/routes`). | `reports/T3.3-mobile-dead-code.md` |
| T3.4 | API contract drift | Compare mobile response types to server shapes for: GST, billing, enquiries, customers, stock, plan limits (RC-008 field-name cross-wire, RC-055 paise vs rupees). | `reports/T3.4-mobile-contract-drift.md` |
| T3.5 | Error handling | Catch blocks replacing real `ApiError` with constant strings (RC-003/009), fake-success `.catch` fallbacks (RC-051), client timeouts vs slow endpoints (RC-064), double-submit guards (RC-015), unhandled promise rejections. | `reports/T3.5-mobile-errors.md` |
| T3.6 | Local data + secrets | Where tokens are stored (SecureStore vs AsyncStorage), logged values (`console.log` of tokens/phones), hard-coded keys, deep-link handlers (RC-041 `app-identity`), `app.json`/`eas.json` permissions + AD_ID guard. | `reports/T3.6-mobile-storage-secrets.md` |
| T3.7 | UX crashers | Render-time `undefined.x` on removed fields, effect dependency loops (RC-017), keyboard/safe-area (RC-042), Android back handling, offline behaviour when API unreachable. | `reports/T3.7-mobile-crashers.md` |

## Done when

Every T3.x has a report, `tsc` + `lint` green, orphan API client methods removed or ticketed.
