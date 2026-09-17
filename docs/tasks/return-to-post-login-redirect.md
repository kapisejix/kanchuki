# `return_to` is written but never read — shoppers bounced to `/` can't get back (and can't log in there)

**Status:** ✅ **FIXED 2026-09-17** — see §8 for what actually shipped (the approach differs from the §4.3 recommendation: a dedicated `/login` route, option **(d)**). Filed during F-036 Phase A (Task 2) and deliberately not bundled into that diff.
**Created:** 2026-09-17
**Owner:** customer web / passport
**Related docs:** `docs/tasks/customer-pwa-store-list-and-push-notifications.md` (F-036 — where this surfaced), `docs/customer/customer-qr-identity-solution.md`, `apps/web/src/app/(shopper)/layout.tsx`, `apps/web/src/app/[store]/components/ContactGate.tsx`

---

## 1. The bug

`apps/web/src/app/(shopper)/layout.tsx` guards every `/my-*` page. When the visitor
has no passport session it redirects them to the marketing home page **with a
return path attached**:

```ts
router.replace(`/?return_to=${encodeURIComponent(pathname)}`)   // layout.tsx:37 and :44
```

The comment right above it says *"so they can log in and come back."* **Nothing
reads that parameter.** Grep of `apps/web/src` at filing time: **2 writes, 0 reads.**

So the "come back" half of the guard was never implemented. The visitor is dumped
on `/` and must re-find their way manually.

### Why it matters more than it looks

There is **no login affordance on `/` at all.** The only place in the entire
customer web app that can complete a passport OTP is
`apps/web/src/app/[store]/components/ContactGate.tsx` (`otp/send` at `:200`,
`otp/verify` at `:261`) — i.e. **a store catalog page**. The home page has no
login surface.

So the redirect target is not merely "loses the return path" — it is a page where
the customer **cannot log in**. Completing OTP somewhere else (a store page) still
doesn't bring them back, because nothing consumes `return_to`.

---

## 2. Who it affects

| Surface | Effect |
|---|---|
| `/my-profile` | Pre-existing. Unauthenticated visit → `/` → cannot log in there → never sees profile. |
| `/my-stores` | New in F-036 Phase A. Same path. Made more visible because `manifest.json` `start_url` now points the installed home-screen icon at `/my-stores`, so an unauthenticated icon launch lands on `/`. |

Both go through the same unchanged guard, so this is **one bug on one code path**,
not two.

---

## 3. Why it was deferred rather than fixed inline

Owner decision, 2026-09-17:

- It is pre-existing and broader than F-036 (it affects `/my-profile`, which
  predates this feature).
- Bundling it into the F-036 diff would blur what F-036 actually touched — the
  Phase A change is "a store list + an installable icon", and a post-login
  redirect framework is neither.
- It needs a product decision (§4.3) that is not F-036's to make.

---

## 4. Fix design (needs one product decision)

### 4.1 Read and honour `return_to` after a successful verify — required

At every point where `POST /api/passport/otp/verify` succeeds, if a return target
is pending, send the customer there instead of staying put. Today the only such
point is `ContactGate.handleVerifyOtp` (`ContactGate.tsx:261`), which currently
opens `PassportSheet` in place — that behaviour must be preserved for customers
who arrived organically (no `return_to`), and only overridden when a return target
exists.

### 4.2 Validate the target before navigating — **required, security**

`return_to` is attacker-controllable. A naive `router.push(searchParams.get('return_to'))`
is a textbook **open redirect** (phishing: `?return_to=https://evil.example`).
Validation rules, all mandatory:

- must start with a single `/` (reject `//evil.com` — protocol-relative);
- reject `/\` (browsers normalise a backslash to `/`, so `/\evil.com` escapes too);
- reject any scheme (`https:`, `javascript:`, `data:`) — test on the **decoded**
  value, since `%2F%2F` and `%6Aavascript:` decode after parsing;
- resolve against the app origin and re-check the result is same-origin, rather
  than trusting the string;
- cap the length; fall back to `/my-stores` on any rejection.

This is why the parameter should be treated as an untrusted input at the *navigation*
boundary, not only where it is written. Check `docs/SECURITY.md` before implementing
(instruction 3 in `CLAUDE.md`).

### 4.3 Where does the bounce land? — **product decision, blocks a clean fix**

Honouring `return_to` (§4.1) is necessary but not sufficient: the customer is sent
to `/`, which cannot log them in. Options:

- **(a) Add a minimal login entry to `/`** — a small "Log in" affordance that opens
  the same phone+OTP sheet. Cleanest, most work, touches the marketing page.
- **(b) Land the bounce on the shopper's most recent visited store** and carry
  `return_to` through `ContactGate`, which already works there. Zero new login UI,
  but couples the `(shopper)` layout to visit data and gives a shopper with no
  visits nothing to land on.
- **(c) Leave the bounce destination alone and only fix §4.1** — smallest change,
  but incomplete for a customer who is on `/` with no way in. Only worth doing as
  an explicit stopgap.

Recommendation: **(a)**, with **(b)** as the fallback for a shopper who has visits
and no session. Confirm before building.

### 4.4 Where to carry the pending target

Prefer reading it from the URL on the landing page and threading it through to the
verify handler, so the value stays visible and bookmarkable. `sessionStorage` is the
alternative if the target must survive a store-context switch (e.g. option (b)),
but it adds a second source of truth — pick one, don't do both.

---

## 5. Build order

1. Validation helper + its tests (pure function, no React) — §4.2 rules.
2. Thread the pending target from the landing page to `handleVerifyOtp`.
3. Honour it on success in `ContactGate` (`ContactGate.tsx:261`), preserving the
   existing `PassportSheet` path when there is no target.
4. §4.3 product decision → implement the chosen bounce target.
5. Update the misleading comment in `(shopper)/layout.tsx:36` to reflect what the
   parameter is actually used for.

## 6. Testing

- Unit: the validation helper — accepts `/my-stores`, `/my-profile?tab=x`; rejects
  `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:alert(1)`,
  `%2F%2Fevil.com`, no-leading-slash, and over-length input; all fall back safely.
- Component/route: verify success with a pending valid target navigates there;
  verify success with no target keeps the current in-place `PassportSheet` behaviour
  (regression guard — this is the behaviour that must not change).
- Manual: anonymous visit to `/my-stores` → confirm the bounce → complete OTP →
  confirm arrival back on `/my-stores` (the actual acceptance test for this task).
- `apps/mobile` is unaffected by this work.

## 7. Out of scope

- Any change to the passport OTP/session API itself (client-side + layout only).
- Redirect-after-login for the **retailer** app surfaces.
- F-036 push notifications (Phase B) — unrelated.

---

## 8. What shipped (2026-09-17)

### The route choice — a new option (d), not §4.3's (a)

§4.3 recommended **(a)** "add a minimal login entry to `/`" and asked for confirmation
before building. Confirmed as: **a dedicated `/login` customer route**.

Why it beat (a): `/` is the **retailer-facing marketing page** ("Your store on
WhatsApp… Start Free Trial"). Putting customer auth on it changes that page's job
and buries a shopper's only way in behind retailer copy. A purpose-built route
keeps the marketing page untouched and doubles as a real login entry point for
organic visitors — which did not exist anywhere outside a store catalog page.

### Files

| Piece | File |
|---|---|
| Validation helper (pure, §4.2 rules) | `apps/web/src/lib/return-to.ts` (`sanitizeReturnTo`, `readReturnTo`, `DEFAULT_RETURN_TO`, `RETURN_TO_PARAM`) |
| Login route | `apps/web/src/app/login/page.tsx` (server: sanitises `?return_to=` before it reaches the client; `robots: noindex`) + `LoginForm.tsx` (client: phone → OTP → navigate) |
| Guard write site | `apps/web/src/app/(shopper)/layout.tsx` — `/?return_to=…` → `/login?return_to=…`, value run through `sanitizeReturnTo` before it is written |

### §4.2 validation — all five rules, plus decoding to a fixed point

Implemented in `sanitizeReturnTo`, which **never throws and always returns a
same-origin path** (falling back to `/my-stores`):

- must start with a single `/`; `//host` (protocol-relative) rejected;
- any `\` rejected outright — browsers normalise it to `/`, so `/\evil.com` escapes;
- control characters (CR/LF/NUL) rejected;
- percent-decoded **up to 3 times** before judging, so `%2F%2Fevil.com` and
  `%252F%252Fevil.com` cannot hide behind an encoding layer;
- finally resolved against a sentinel origin with `new URL()` and required to stay
  on it, then rebuilt from the parsed parts — the string checks are not trusted to
  have been exhaustive;
- length capped at 512; non-strings (including a repeated `?return_to=a&return_to=b`)
  fall back.

Applied at **both** ends: the guard validates before writing, `page.tsx` validates
before handing the value to the client, and `LoginForm` validates again immediately
before `router.replace` — the navigation is the boundary that matters.

### Deviation from §4.1/§5: `ContactGate` was not touched

§5 planned to thread the target through `ContactGate.handleVerifyOtp` and honour it
on success there. That turned out to be unnecessary — the shopper never has to pass
through a store page to log in — and skipping it means the §6 regression guard ("no
pending target keeps the in-place `PassportSheet` behaviour") is satisfied **by
construction**: `ContactGate` and `PassportSheet` are not in the diff at all.

### A claim in the first draft that was wrong (recorded so it is not re-derived)

The first implementation justified `clearPassportCache()` before navigating with
"`passport-client` caches a *negative* result for 30s, so the guard would read it
and bounce straight back to `/login`." **That was false.** `getPassport` guards its
cache with `if (cachedSession && …)` — a stored `null` is falsy, so a negative result
is **never** served; only positive sessions are memoised. Proven empirically: the
live `/my-stores` round trip still passes with `clearPassportCache()` removed.

The call is kept (it is the right thing to do before handing off identity, and it
stops a *stale positive* session being read during the transition, plus guards
against a future change that starts caching negatives), but the comment and the test
now say that rather than describing a failure mode that does not exist. `clearPassportCache`
had no callers anywhere in the app before this — the login flow is its first.

### Verification

- **Live browser round trip** (`apps/web/e2e/customer-my-stores.spec.ts`, prod build +
  Chrome): anonymous `/my-stores?tab=orders` → guard bounces to
  `/login?return_to=%2Fmy-stores%3Ftab%3Dorders` → phone + OTP → **lands back on
  `/my-stores?tab=orders` signed in**, with the list rendered. This is §6's manual
  acceptance test, automated — and the query string is part of the assertion, so a
  guard that dropped it fails the run.
- **Open redirect, live**: `/login?return_to=https://evil.example/phish` → completes
  login → lands on the local origin at `/my-stores`, never `evil.example`.
- Unit: `lib/__tests__/return-to.test.ts` (35), `login/__tests__/{LoginForm,page}` (12 + 11),
  `(shopper)/__tests__/layout.test.tsx` (4 — the guard's write site, including a
  hostile-pathname case).
- Full gates: web tsc clean, `pnpm test` 9/9 turbo tasks (web **242/242**), `pnpm lint` 6/6,
  all five CI guard scripts, 10/10 customer e2e.

### Query string is carried too

The guard builds the target from `pathname` **plus `window.location.search`**, so a
shopper intercepted on `/my-stores?tab=orders` returns to that exact URL rather than
to the bare path. It reads `window.location` rather than `useSearchParams()` for two
reasons: the guard runs in an effect so it is browser-only by definition, and
`useSearchParams()` in a layout with no Suspense boundary would force every guarded
route out of static rendering.

The validator keeps a query string (it is part of the same-origin path it returns)
while still refusing anything that leaves the origin. Proven live: the round-trip
e2e enters on `/my-stores?tab=orders` and its post-login predicate requires
`tab=orders` to come back — a guard that dropped the query fails on a bare pathname
match otherwise.

### Still open

- iOS "Add to Home Screen" remains Phase C of F-036.
- The **hash** is not carried (only path + query), matching the original ask.
