# 2026-09-11 — OTP/FB/AI-Studio Fixes + CI Lint Fix + Build-Tracking Failure

**Branch:** `fix/otp-android-keyboard` → merged to `main`, then a follow-up pass on `main`
**Status:** ⚠️ Original pass: code fixes committed + CI green, 2 of 3 UI bugs unconfirmed on device.
**Follow-up pass (below):** CI/GitHub-check audit done, the one real CI failure fixed, both open bugs re-root-caused from source. Still **not** confirmed on device — see §3.

---

## 0. Follow-up pass — what this second review found

The question was: *which GitHub checks are failing, especially "Claude Code", and what are the real code issues?* Answered from `gh` (read-only) + the working tree, not from assumption.

### 0a. There is no "Claude Code" check in this repository

```
$ gh workflow list --all
Android Release (AAB)   active  353112094
CI                      active  308902953
Deploy to Railway       active  311166156

$ gh api repos/kapisejix/kanchuki/commits/main/check-runs --jq '.check_runs[] | .name'
build-aab
e2e-web
build
unit-web
quality
```

`.github/workflows/` on `main` contains exactly three files (`ci.yml`, `deploy.yml`, `android-release.yml`) and all five checks come from `github-actions`. **Nothing named "Claude Code" runs here.** If a "Claude Code" entry is visible in the GitHub UI it is a GitHub App installed on the account/repo, not something defined in this repo — it can't be fixed by editing code, and it doesn't gate merges (PR #14 and #1 show only `quality` / `build` / `e2e-web` / `unit-web`).

### 0b. `main` is currently green — all 5 checks pass

| Check | Status on `main` @ `0305d589` |
|---|---|
| `quality` | ✅ success |
| `unit-web` | ✅ success |
| `build` | ✅ success |
| `e2e-web` | ✅ success |
| `build-aab` | ✅ success |
| combined commit statuses | ✅ success |

So "GitHub isn't clearing all the checks" is not true of `main` right now. What *is* true:

1. **One real CI failure did happen and is content-independent → RC-019.** Run `34618428005` (commit `a628518b`, docs-only) failed `e2e-web` on `customer-collection.spec.ts` — twice, including retry #1. The next commit `0305d589` — also docs-only — passed. Same code, different result. Fixed this pass (§2a).
2. **Two abandoned open PRs have red `quality`:** PR **#14** (`fix/mobile-typecheck-taste-analytics`, opened 2026-08-31) and PR **#1** (`railway/code-change-XSklm4`, opened 2026-07-12). Both predate the lint/CRLF cleanup and neither is on `main`. Anything they fix is either already fixed or no longer relevant. Recommendation: **close them** (not merge) — they exist only as permanently-red noise.
3. **188 Biome `warn`-level diagnostics in `apps/api`.** Not failures — `pnpm lint` exits 0 (`warn` ≠ error) — but they flood every CI log. `noNonNullAssertion`, mostly in tests.
4. **Node 20 deprecation warning on every workflow run:** `actions/setup-node@v4`, `actions/upload-artifact@v4`, `pnpm/action-setup@v4`, `actions/setup-java@v4` all target Node 20 and are force-run on Node 24. Warning only; not a failure.

### 0c. Local quality gate reproduced (so the CI result is verifiable, not asserted)

| Command | Result |
|---|---|
| `pnpm --filter @kanchuki/mobile typecheck` | clean |
| `pnpm --filter @kanchuki/mobile lint` | clean |
| `pnpm --filter @kanchuki/mobile test` | 79/79 pass (15 files) |
| `pnpm --filter @kanchuki/web typecheck` | clean |
| `pnpm lint` (whole repo) | exit 0 — `apps/web` clean, `apps/api` 188 warnings |
| `playwright test -c playwright.customer.config.ts -g "collection pages work offline"` | 1 passed |

### 0d. Pre-production checklist — yes, it exists, and no, it was not used

`docs/LAUNCH-READINESS-AUDIT.md` (447 lines) is the pre-production gate: every item tagged `P0` (blocks a safe launch) / `P1` / `P2`, with a "how to use this doc" section. It exists and was **not** consulted before CI-green was reported as "ready" in the earlier pass — a real process gap, now recorded under §4.

---

## 1. What actually shipped in the first pass (code-confirmed, CI-green)

| Commit | What |
|---|---|
| `faf2d64d` | RC-015 (OTP double-send, `phone.tsx` + `ContactGate.tsx`), RC-016 (FB reconnect loop, `facebook-auth.ts`), RC-017 (AI Studio tab-stomp, `ProductStudioModal.tsx`) |
| `49d140df` | `apps/api` lint — `.gitattributes` + CRLF→LF normalize (137 files) + 5 real Biome errors |
| `ae6e32dd` | `apps/mobile` lint — 5 ESLint `react/no-unescaped-entities` |
| `c14cc6f3` | `android.versionCode` 2→3 (2 was already used on Play Console) |
| `a628518b` | RC-015/016/017 detail entries in `docs/root-cause/root-cause issues.md` |
| `0305d589` | RC-015/016/017 rows in `CLAUDE.md` tracker (human-approved) |

CI on `main` @ `0305d589`: quality/lint/build/e2e-web all green. `apps/api` tests 960/960.

---

## 2. Fixes applied in the follow-up pass

### 2a. RC-019 — flaky offline-fallback e2e test (the one real CI failure)

`apps/web/e2e/customer-collection.spec.ts` → `collection pages work offline via the service worker`.

**Root cause:** the test simulated "no network" with `context.setOffline(true)` only. That blocks the *page's* network stack, not reliably a `fetch()` issued from inside the **service worker**. When the SW's fetch got through to the still-running `next start` server, `/c/never-visited` returned its real 307 redirect, the browser followed it, and the precached `/offline` page was never used — heading never appeared. Timing-dependent, which is why a docs-only commit failed and the next docs-only commit passed.

**Fix:**
1. `context.route('**/c/never-visited', (route) => route.abort('internetdisconnected'))` — `context.route`, unlike `page.route`, *does* intercept service-worker requests, so "no network" is deterministic at the layer the SW fetches from and the fallback path is the only path left.
2. `expect.poll` that `/offline` is actually in the precache **before** going offline — a missed install-time precache now fails in 10s naming the real cause instead of a 15s "element not found" timeout at the last assertion.

**Proof:** `playwright test -c playwright.customer.config.ts -g "collection pages work offline"` → 1 passed (offline test itself 10.5s, vs the 20s twice-retried failure in CI). `apps/web` `tsc --noEmit` clean.

### 2b. RC-018 — FB/IG connect always shows Facebook's credentials login form

`apps/mobile/src/lib/facebook-auth.ts`.

**Correcting the earlier diagnosis:** the screenshot is **not** the app's `connectViaWeb()` path. `connectViaWeb()` calls `Linking.openURL(authUrl)`, which opens the system browser — with an address bar and tabs. The screenshot has no browser chrome at all, full-screen with the 3-button nav bar: that is the **Facebook Android SDK's own WebView login dialog**, i.e. the native SDK path *is* running (which also matches the code — `react-native-fbsdk-next` is a real dependency and the `app.json` plugin config is present, so the dynamic import resolves).

**Root cause:** `logOut()` was called **immediately before every** `logInWithPermissions()` — the RC-016 fix. That clears the SDK's on-device session unconditionally, so every attempt starts with no session and Facebook must re-authenticate from scratch → the email/password form. RC-016 was fixing a real bug (Disconnect deleted only the server-side row, leaving a dead on-device session that looped), but it fixed it by destroying the cached session on the happy path too, permanently converting one-tap "Continue as \<account\>" into "type your password". The device also has no Facebook app installed, so the SDK's `NATIVE_WITH_FALLBACK` behaviour lands on its own WebView dialog instead of the native app switch.

**Fix:** ask for a token **first**, without touching the session (an existing session is returned with no UI); only if that returns no usable token — the genuine RC-016 case — clear the session with `logOut()` and retry **once**. Also narrowed the dynamic-import `catch`: a module that is installed but throws while loading (bundle/native failure in a release build) now raises a real error instead of being silently mislabelled `FacebookAuthUnavailable` and dropping the retailer into the web OAuth flow.

**Proof:** `apps/mobile` `tsc --noEmit` clean, `expo lint` clean, mobile vitest 79/79.

**Still open — Meta-side, not code:** with no Facebook app installed on the device, the SDK's own web dialog is expected and will still ask for credentials. For a genuine one-tap flow: install the Facebook app on the test device, or put the Meta app in Live mode with the test account added as Tester/Admin **and** the Android release key hash registered (Meta dashboard → Settings → Advanced → Android key hashes).

### 2c. RC-017 — AI Studio style selection hardened

`apps/mobile/src/components/product-detail/ProductStudioModal.tsx`.

`faf2d64d` removed `activeList` from the effect's dependency array, which removes the specific trigger but leaves the vulnerable *shape*: the selection is still stored state reconciled by an effect, so any future dependency change or re-render can re-introduce the stomp. It is now **derived** — `pickedSlug` stores only the retailer's explicit tap (`null` = none) and `selectedSlug` falls back to `activeList[0]` at render time, so no effect can ever overwrite a tap. The pick clears only on tab change or modal reopen (`[tab, visible]`), both intentional resets.

**Proof:** `apps/mobile` `tsc --noEmit` clean, `expo lint` clean, mobile vitest 79/79.

---

## 3. Still open — do not trust "fixed" until re-verified on device

### 3a. Which AAB was actually uploaded to Play Console — UNKNOWN

Four `android-release.yml` runs on 2026-09-11:

| Run ID | Triggered by | Completed | versionCode in `app.json` at that HEAD |
|---|---|---|---|
| `34612164008` | Claude (session) | **cancelled** — user said stop | n/a |
| `34612919927` | **not Claude** — unaccounted for | 14:54 | `2` (before `c14cc6f3`) |
| `34617176198` | Claude (session, after versionCode bump) | 15:36 | `3`, has all fixes above |
| `34619372677` | **not Claude** — unaccounted for | 15:59 | `3`, docs-only diff |

Nobody confirmed which run's artifact was downloaded and uploaded. The "version code 2 already used" error is consistent with the 14:54 build (`34612919927`) — which *does* contain `faf2d64d` (merged 13:41) but predates the versionCode bump.

Separately and more importantly: **uploading a new `.aab` does not change the app on the phone.** Play's closed-testing track has to process and roll the release out, and the tester has to update from Play. A screenshot cannot currently distinguish "the fix isn't in the build" from "the phone is still running the old one" — which is why §5 recommends a build-info footer.

**Action before the next test round:** record the GH Actions run ID + commit SHA alongside the versionCode in `docs/PLAY-STORE-RELEASES.md` at trigger time.

### 3b. AI Studio + FB/IG — re-test protocol

For both bugs, the screenshot alone cannot confirm or refute the fix:

- **AI Studio:** the screenshot shows the *default-on-open* state (first style selected) — identical whether the bug exists or not. The bug was "tap a different style → it snaps back". Re-test: open AI Studio → tap the 2nd/3rd style → confirm it stays selected → Generate uses the tapped style.
- **FB/IG:** re-test on a build that includes this pass's `facebook-auth.ts` change, ideally with the Facebook app installed on the device.

Neither was verified by install-and-tap on a real device in either pass — only by code review + CI.

---

## 4. Process gaps identified (self-audit)

1. **No build-provenance tracking.** Nothing records which GH Actions run + commit SHA produced the uploaded `.aab`. Partially addressed by `docs/PLAY-STORE-RELEASES.md` (versionCode log) — still missing the run-ID/SHA column.
2. **`docs/LAUNCH-READINESS-AUDIT.md` exists and was not consulted** before declaring CI green / "ready".
3. **RC-### entries were not written at fix-time** — backfilled after the user asked, violating the tracker's own rule ("every bug that ships must be recorded here").
4. **No on-device confirmation loop.** Everything verified via code review + CI (tsc/lint/tests), nothing by install-and-tap on a real device.
5. **A fix was reported as "done" without checking which code path the symptom was actually on.** RC-016's `logOut()` fix was applied to the native SDK path while the reported symptom was read as the web-fallback path; it turned out to be the SDK's own WebView dialog, and the fix itself created RC-018.
6. **"CI is green" was reported without confirming `main` vs. the artifact under test.** Multiple builds ran outside the session's visibility.

---

## 5. Recommendations (proposed, not applied)

- **Add a build-info footer to mobile Settings** (git SHA + build time injected at build). A screenshot from a tester then unambiguously identifies which code is running — currently impossible from the UI alone. This is the single highest-value fix for the "I rebuilt and it still doesn't work" loop.
- **Record run-ID + commit SHA** in `docs/PLAY-STORE-RELEASES.md` at trigger time, not after the fact.
- **Close PRs #14 and #1** — abandoned branches, permanently red, not on `main`.
- **Bump the workflow actions off Node 20** (`actions/setup-node` v4→v7, `actions/upload-artifact` v4→v7, `pnpm/action-setup` v4→v6, `actions/setup-java` v4→v6) — clears the deprecation warning on every run. Deliberately **not** applied this pass: a wrong major silently breaks the whole pipeline and it cannot be verified without a real CI run on a branch.
- **Burn down the 188 `apps/api` Biome warnings** (mostly `noNonNullAssertion` in tests) so CI logs are readable and a new real error isn't hidden in the noise.
- **Read `docs/LAUNCH-READINESS-AUDIT.md` explicitly** before declaring any session "ready to build" — not just lint/test status.

---

## 6. RC entries

| ID | Root cause | Where |
|---|---|---|
| RC-017 | AI Studio style selection stomped on re-render (stored state + effect) | hardened to derived selection this pass |
| RC-018 | `LoginManager.logOut()` before every FB login → Facebook always asks for credentials | fixed this pass |
| RC-019 | `context.setOffline(true)` doesn't reliably block service-worker fetches → flaky offline e2e | fixed this pass |

Full detail: `docs/root-cause/root-cause issues.md`.

**Not yet done:** the matching RC-018/RC-019 rows in the `CLAUDE.md` root-cause tracker — `CLAUDE.md` needs explicit human approval before it can be edited (Operational Control Policy).
