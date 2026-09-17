# `return_to` is written but never read — shoppers bounced to `/` can't get back (and can't log in there)

**Status:** 📋 Filed — not fixed. Filed during F-036 Phase A (Task 2); deliberately **not** bundled into that diff.
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
