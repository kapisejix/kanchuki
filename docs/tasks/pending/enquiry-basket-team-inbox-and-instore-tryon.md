# Enquiry basket → team inbox → in-store try-on (retailer/manager only)

**Status:** 🔴 Idea / design only — not approved, no F-number assigned, nothing built. **D8 decided 2026-10-16** (₹4/try-on budget unit, self-hosted CatVTON kept); D1–D7 await the owner's review — see §11 (decision register + next-session prompt).
**Filed:** 2026-10-16. **Related:** `catvton-runpod-tryon-launch.md` (F-040), `whatsapp-managed-sending.md` (F-035),
`customer-engagement-analytics.md` (F-037), `docs/PRO-REQUIREMENTS.md` (enquiry + staff sections).
**Source:** two owner questions asked in one session; the first (§1) is a code-read explanation, the second (§2–§8) is the design.

---

## 1. Question 1 — "What prompt does AI Studio Shoot use, and is real-person-photo + garment the same as Try-On?"

### 1.1 What retailers get today

AI Studio Shoot takes **one product photo** (not a person photo). Code: `apps/api/src/lib/studio-shoot.ts`.
The retailer picks a style (a `studio_styles` row, seeded from `packages/shared/src/studio-styles.ts`).
The API assembles the prompt in `buildStudioPromptContext` (line ~494):

```
{SCENE_GUARD} {garmentSpec} {style prompt, person-swapped} {colorEnforcement}
```

| Piece | Text / behaviour |
|---|---|
| `SCENE_GUARD` (line 226) | "Edit ONLY the background, setting and scene of this photograph. Keep the garment itself pixel-identical to the input: exact same colour, dye, print, pattern, embroidery, fabric, cut, drape and proportions. Do not recolour, restyle or regenerate the clothing." |
| `garmentSpec` (line 200) | "The garment in the photograph is a {subtype / category}. The product is named "{name}". Preserve its exact garment type, cut and silhouette — do NOT substitute it for a different garment. Reproduce how it is worn exactly as photographed…" |
| Style prompt | Scene wording from the DB. On the **MODEL** tab the person is swapped per product demographic (`PERSON_CLAUSE`: "a graceful adult Indian woman fashion model", "a dignified adult Indian man fashion model", teen/kid variants). Adds a hem-length clause when `length_cm` is set, and a "head-to-hip only, never invent trousers" clause for top-only garments. On the **PRODUCT** tab (e.g. PS-03) the prompt removes any person and re-presents the garment on a headless torso dress form. |
| `colorEnforcement` (line 543) | "CRITICAL COLOR ACCURACY: Absolutely preserve the garment's exact fabric dye, color tone, embroidery, and saturation… neutral 5500K daylight-balanced CRI-98 key lighting." |

Default engine = FLUX Kontext (an *edit* model: changes the scene, leaves garment pixels alone).
On a MODEL shot the model is **invented by the AI** — it is not a real person.

### 1.2 The real-person pipeline already exists — but only on the admin bench

Engines `vton_kontext` / `vton_gemini` run `runTwoStepStudio` (line 330):

```
human photo ──► FASHN v1.5 try-on (garment = product photo) ──► scene swap (Kontext | Gemini)
```

- Step 1 `generateFashnTryon(humanImageUrl, productImageUrl)` (`fal-client.ts:257`) is garment-conditioned: the real product goes on the real person. This is try-on.
- Step 2 (optional) prompt: "This photograph already shows the correct model wearing the correct garment: preserve the person, their face, their pose and the clothing exactly… change ONLY the background, environment and lighting."
- No person supplied → step 0 generates a plain frontal reference (`MODEL_REFERENCE_PROMPT`).
- **Gap:** `humanImageUrl` is only passed from the admin bench (`admin-photo-cleanup.ts:289`, field `model_image_url`). The retailer route and job (`jobs/studio-shoot.ts`) never pass it, so a retailer cannot upload a real person's photo into Studio Shoot today.

### 1.3 Is it the same as the Try-On feature?

Same idea (selected garment on a real person), **different tools**:

| | Studio Shoot real-person path | F-040 Virtual Try-On |
|---|---|---|
| Model | FASHN v1.5 (Fal) + scene render | CatVTON on a RunPod worker |
| Purpose | catalogue / marketing image | "how does it look on *this* person" |
| Output | 576×864 from FASHN; scene-model res after step 2 | worker image |
| Consent / quota | none | consent gate, dual quota, withdrawal + deletion sweep (RC-044) |
| Status | admin bench only | built, flag `VIRTUAL_TRY_ON_V2` OFF |

**Recommendation:** for "show this article on a real person" use **F-040**, not Studio Shoot — it already carries the consent and quota gates a real-person photo needs. Known limits for both: plain frontal full-body photos work best; multi-piece Indian outfits (suit + dupatta) are the likeliest to go wrong.

---

## 2. Question 2 — what the owner asked

1. Customer picks 3–4 articles in their select list → can they **send the selection to the retailer and team**, so **any team member can reply on the customer's WhatsApp**?
2. Based on that selection, **only the retailer or manager** runs the try-on on **their own mobile**, in front of the customer. The customer never uses try-on on their own phone.
3. Wanted: the detailed process, and this document.

---

## 3. What exists today (verified in code 2026-10-16)

### 3.1 Customer selection ("select list")

- Customer web favourites live in **browser localStorage per collection slug** (`apps/web/src/app/c/[slug]/components/CollectionView.tsx` → `lib/wishlist`). Nothing server-side, so the store cannot see what a shopper hearted.
- A logged-in passport shopper also has `CustomerWishlistItem` (server table, unique per account+product, `retailer_id` stored) — separate from the localStorage list.
- `POST /v1/public/collections/:slug/favorite` only increments `favorite_count`; no per-customer tracking.

### 3.2 Enquiry

`POST /v1/public/collections/:slug/enquire` (`apps/api/src/routes/public/public-collections.ts:221`):

- accepts `product_id` **and** `product_ids[]` (max 20), `customer_name`, `customer_phone`, `message`;
- **stores only one product**: `CollectionEnquiry` has a single `product_id`; the `product_ids` array is used **only to build the WhatsApp text** — the other 2–3 products are not recorded;
- returns a `wa.me/<retailer.phone>?text=…` URL. The **customer's own WhatsApp opens**, addressed to the retailer's **single** phone number. That is the only delivery channel — there is no push/notification to the retailer or staff, and the product list in the text is built from raw ids (`name: id`), not names.
- Retailer sees enquiries via `GET /collections/:id` (last 50) and can `PATCH /collections/:id/enquiries/:enquiryId` (status). There is no cross-collection "Enquiries" inbox, no assignment, no reply tracking. `EnquiryStatus` enum exists (`NEW` default).

### 3.3 Team

- Retailer-side team = `Staff` rows (`role`: `owner | manager | salesperson`), invited via `StaffInvite` / join-by-phone login (commit `83b8800e`). (`TeamMember` in the schema is **Kanchuki's internal** marketing/support team — not the retailer's staff.)
- Route access is a default-deny allowlist in `apps/api/src/plugins/auth.ts:170-228`:
  - **manager** → `*` on `/v1/products`, `/v1/collections`, `/v1/growth/*` (listed subset), `GET /v1/customers` (phone masked server-side), etc.
  - **salesperson** → `GET /v1/products`, `GET /v1/collections`, `POST /v1/customers`, `GET /v1/retailers/me` only.
- Staff must never see a customer's full phone (`maskPhoneForRequest`). Campaign send already encodes the rule: non-owners may send **only** through the server-side WhatsApp API path, because manual `wa.me` links would expose numbers.

### 3.4 Try-on (F-040)

- `POST /v1/products/:id/try-on` is **dual-identity** (`products-tryon.ts`): Bearer token ⇒ retailer/staff in-store flow (product must belong to that retailer, `customer_account_id` null, counts against retailer quota, consent `IN_STORE`, re-taken each generation); cookie-only ⇒ passport shopper from the customer web (counts against customer quota).
- Because `/v1/products` is a wildcard in the manager allowlist and **GET-only** for salesperson, the try-on `POST` is **already reachable by owner + manager and blocked (403) for salesperson**. This matches the owner's "retailer and manager only" — needs one test to pin it (E7).
- Mobile screen exists: `apps/mobile/app/product/try-on.tsx` (+ `TryOnConsent.tsx`), entry button on `product/[id].tsx` shown only when `features` includes `VIRTUAL_TRY_ON_V2`.
- **Customer web try-on also exists** (`passport-tryon.ts`, `try_on_enabled` in `public-products.ts:224`), switched on by the **same** plan feature. For the owner's rule ("customer won't use it") this must be separated — see §5.4.
- Wearer photo is never persisted (in-process stash → worker → gone); only the generated image is stored (R2 key, presigned per read); withdrawal deletes it. `TryOnJob` has no column for the input photo.

---

## 4. Proposed process (end to end)

```
CUSTOMER (own phone, web PWA)                 STORE (retailer app: owner / manager / salesperson)
─────────────────────────────                 ───────────────────────────────────────────────────
1. Browse store, ♥ products
2. Basket shows 3–4 picks
3. Taps "Send to <Store>"
   (name + phone, or passport login)
        │  one POST, all product_ids
        ▼
4. API saves ONE enquiry with ALL products ──►  5. Push + in-app badge to owner + managers
                                                  (salespeople optional) — "Priya hearted 4 items"
                                                6. Enquiries inbox: card with the 4 products
                                                7. Staff taps "Take" → assigned (first wins);
                                                   others see "Being handled by Ravi"
                                                8. Staff replies on WhatsApp (see §5.3)
                                                9. If customer is in store: "Try on with customer"
                                                   (owner/manager only) — §5.4
                                                10. Staff marks Replied / Visited / Closed
```

Customer-facing result: they get a WhatsApp reply from the store, and — if in store — see the try-on on the **staff's** phone.

---

## 5. Design detail

### 5.1 Capture the whole selection (fixes the "only 1 product stored" gap)

Preferred: **extend `CollectionEnquiry`** instead of a new table (smallest change; analytics and `enquiry_count` already read it):

| Column | Why |
|---|---|
| `product_ids String[]` | the whole selection; keep `product_id` as the first for back-compat |
| `assigned_staff_id String?` | who took it |
| `assigned_at`, `first_reply_at` | response-time metric + "first to tap" lock |
| `last_reply_by_staff_id String?` | audit |
| `source String` (`COLLECTION` \| `PASSPORT`) | where it came from |
| `try_on_done Boolean` / count | closes the loop with F-040 |

Migration **proposed only** (CLAUDE.md: never run migrations from the agent; check `docs/DATABASE.md` first). `enquire` route change: persist `product_ids` (validate every id belongs to `collection.retailer_id` — today unchecked), and build the WhatsApp text from **product names**, not ids.
Customer side: add "Send my picks to the store" on the wishlist page that posts the localStorage list in one call; for passport users, read `CustomerWishlistItem` for that retailer.

### 5.2 Notify the team

- Retailer app: new **Enquiries** inbox (owner + manager; salesperson read + take — owner decision D2), unread badge.
- Push to every active staff device of that retailer (Expo push). **Verify** retailer-side push registration exists first — F-036 push is customer PWA only; if retailer push is missing, v1 = in-app badge + 30 s poll.
- Respect F-037 / SECURITY: no customer phone in push payloads.

### 5.3 How a team member replies on the customer's WhatsApp — three options

The hard constraint: a manual `wa.me/<customer number>` link **exposes the number** to the device, which conflicts with the staff phone-masking rule. Options:

| Option | How it works | Build | Number exposed to staff? | Notes |
|---|---|---|---|---|
| **A. Shared WhatsApp Business number + Linked Devices** | Customer's wa.me message lands in the store's one WhatsApp Business number; owner links up to 4 devices (staff phones/tablet). Any linked device replies natively. | **Zero code** — only enquiry text/product names (5.1) | Yes (it is in WhatsApp itself) | Works today; team shares one inbox; limit 4 devices. Best for v1. |
| **B. "Reply on WhatsApp" button (wa.me) from inbox** | Tap → opens the staff member's own WhatsApp to the customer's number. | small | **Yes** — breaks masking | Only acceptable if the owner decides staff may see numbers; log who tapped. Owner always allowed. |
| **C. In-app reply via WhatsApp Cloud API** | Staff types in the app; server sends from the store's WABA; replies logged per staff. Number never leaves the server. | large — needs inbound webhook + 24 h service window / templates; F-009 manual credentials exist, **F-035 (managed sending) planned** | **No** | The "right" long-term answer; consistent with the campaign-send rule. Blocked on F-035. |

**Recommendation:** ship **A** now (document it in retailer onboarding + enquiry card copy), keep the inbox's "Taken by / replied" state in-app, and plan **C** under F-035. Treat **B** as an owner-only fallback. Open decision D1.

### 5.4 Try-on: retailer/manager only, on the staff phone

What to change, minimal:

1. **Separate the customer path from the plan flag.** `VIRTUAL_TRY_ON_V2` currently turns on **both** surfaces. Add a second switch (plan feature `CUSTOMER_TRY_ON` or a hard constant, default **off**) and make `public-products.ts:224` (`try_on_enabled`) and `passport-tryon.ts` honour it → server-side 404 for shoppers, same pattern as the existing gate (a 404, never 200-with-hidden-flag). Result: `VIRTUAL_TRY_ON_V2` on ⇒ retailer app only.
2. **Role gate:** already effectively owner + manager (§3.4). Add a test in `staff-access.test.ts` pinning: manager `POST /v1/products/:id/try-on` ⇒ allowed, salesperson ⇒ 403. If a salesperson should be allowed later, add one allowlist line.
3. **From the inbox:** on an enquiry card, button **"Try on with customer"** (hidden for salesperson). Opens a multi-product flow built on the existing `product/try-on.tsx`:
   - staff takes **one** wearer photo (customer standing in store, full length) and records in-store consent **after the customer agrees** — re-taken for each generation (`consent_method = IN_STORE`);
   - the app runs one try-on job per selected product (3–4 jobs), reusing the on-device photo in memory (the API stashes it in-process per job and never persists it), polling `GET …/try-on/status`;
   - results appear as a swipeable gallery on the **staff phone** only; staff shows it to the customer;
   - on exit the app discards the on-device wearer photo; generated images are stored under the retailer (presigned per read, withdrawable) — consider "do not keep" as the v1 default.
4. **Quota:** each product = 1 try-on against the retailer's monthly quota (owner's example: 100/month ⇒ ~25–33 enquiry sessions). Show remaining quota on the screen; admin controls the number per plan (already built).
5. **Remote customers:** the flow assumes the customer is physically present — the staff photographs them. If the customer is remote there is no wearer photo. Receiving a customer's photo over WhatsApp for try-on is a **separate consent** case — out of scope v1 (D4).
6. **Sharing the try-on result to the customer's WhatsApp** is also out of scope v1: it is a stored photo of a real person; needs its own consent text.

### 5.5 Privacy (SECURITY.md — read §12–18 before building)

- Enquiry stores customer name/phone → covered by the existing customer consent modal (`CustomerConsentModal.tsx`); confirm retention rules.
- Wearer photo never persisted (T6 rule) — the new multi-product loop must **not** leak it to R2/DB/BullMQ payloads. Keep the in-process stash path; only the device holds it.
- Staff never receive a full customer number via API (except D1 option B for the owner).
- Every access to the enquiry inbox is retailer-scoped (`retailer_id`); `product_ids` must be validated against the retailer.

---

## 6. Task breakdown (proposed)

| # | Task | Size | Depends |
|---|---|---|---|
| E1 | Persist `product_ids` + validate ownership + names in WhatsApp text (migration proposed) | S | — |
| E2 | Customer web: "Send my picks to store" from wishlist (localStorage + passport source) | S | E1 |
| E3 | Retailer app: Enquiries inbox (list, unread badge, status, Take/assign, replied-by) | M | E1 |
| E4 | Push/in-app notify to owner + managers (verify retailer push exists first) | S–M | E3 |
| E5 | Reply path v1 = Option A (shared Business number + linked devices) — docs + card copy only | XS | E3 |
| E6 | Split customer try-on off `VIRTUAL_TRY_ON_V2` (new `CUSTOMER_TRY_ON`, default off, server 404) | S | — |
| E7 | `staff-access.test.ts`: manager allowed / salesperson blocked on try-on POST | XS | — |
| E8 | "Try on with customer" multi-product session screen from an enquiry (owner/manager) | M | E3, F-040 launch |
| E9 | Option C in-app WhatsApp reply (inbound webhook, service window, templates) | L | F-035 |
| E10 | Docs: PRO-REQUIREMENTS entry (assign F-number), BUILD-LOG, PLAN.md, tasks index | XS | owner approval |
| E12 | Try-on top-up packs (D6b): add `TRY_ON_GENERATION` to the addon-checkout enum + admin resource-pack list; seed 25/50/100 at ₹8 ex-GST; decide expiry (month-end vs carry-over) | S | F-040 launch |

Launch gates that still apply (from `catvton-runpod-tryon-launch.md`): `VIRTUAL_TRY_ON_V2` is OFF; the RunPod template tag must be re-pointed to the image carrying the `person_image_base64` handler; owner enables per plan from admin; consent screen T4 satisfied.

---

## 7. Open decisions for the owner

- **D1 Reply channel:** A now (shared Business number, linked devices) → C later via F-035? Or allow B (staff see numbers) for managers?
- **D2 Who sees the inbox:** owner + manager only, or salesperson can also see/take?
- **D3 Auto-assign vs first-to-take:** first-to-take (proposed) vs round-robin among on-duty staff.
- **D4 Remote customers:** v1 in-store only (proposed), or allow a customer-sent photo over WhatsApp later?
- **D5 Keep the generated try-on image?** Discard after the session (proposed v1) vs keep for N days (needs retention notice + withdraw UX).
- **D6 Quota math:** one product = one try-on; is 100/month enough for 3–4-item sessions?
- **D7 Studio Shoot real-person upload:** leave bench-only (proposed; F-040 covers the use case).

## 8. Verified 2026-10-17 (read-only code check)

- **(a) Retailer push: NOT present.** No `expo-notifications`, `getExpoPushTokenAsync`, `expo-server-sdk` or `push_token` anywhere under `apps/`. E4 v1 = in-app unread badge + poll; real push is a separate release (needs the package, a device-token table, a send path).
- **(b) Inbound WhatsApp webhook: catalog only.** `apps/api/src/routes/webhooks/whatsapp-catalog.ts` handles catalog / out-of-stock fields; no handler for customer `messages`. E9 (option C) needs a new inbound-messages webhook plus the 24 h window and templates.
- **(c) `EnquiryStatus`** (`packages/db/prisma/schema.prisma:52`): `NEW`, `SEEN`, `REPLIED`, `CLOSED`.
- **(d) Add-on rail exists but excludes try-on:** `POST /billing/addon-checkout` (`billing-addons.ts:22`) and admin `resource-packs` (`admin-resource-packs.ts:15`) do not list `TRY_ON_GENERATION` → task E12.
- **Still unverified:** live `plan_pricing` values (migration 074 seed is stale); RunPod `workersMin`/`workersMax`; whether purchased add-on packs expire at month-end or carry over; effort to make try-on results "discard on exit" (D5) given F-040 stores results in R2 today; WhatsApp's linked-device limit (doc says 4).

---

## 9. Decisions D1–D7 explained in plain terms (owner is reviewing — answers pending)

**Owner status 2026-10-16:** reviewing this whole document; has not answered D1–D7 yet. Nothing is built until answered/approved.
Minimum answers needed before E1 starts: **D1, D2, D6**. Everything else defaults to the proposal.

### D1 — How does a team member reply to the customer on WhatsApp?

The customer sends the enquiry from their own WhatsApp. To reply, someone must message the customer's number. The platform hides full customer numbers from staff (manager/salesperson see masked numbers). So: may staff see the number?

| Option | What staff do | Staff see number? | Effort |
|---|---|---|---|
| **A. One shared Business number** | Store has one WhatsApp Business number. Owner links up to 4 phones/tablets via WhatsApp "Linked Devices". Customer message lands there; any linked phone replies. | Yes, inside WhatsApp itself (normal for any shop) | None — setup guide + better enquiry text (product names) |
| **B. "Reply on WhatsApp" button in app** | Tap opens the staff member's own WhatsApp to the customer's number | Yes — breaks the masking rule | Small |
| **C. Reply inside the Kanchuki app** | Staff type in-app; server sends via WhatsApp Cloud API; number never reaches the phone | No | Large — inbound webhook, 24 h reply window, templates; blocked on F-035 |

Recommendation: **A now, C later**. Owner question to answer: *is it acceptable that staff see customer numbers inside WhatsApp (A), or must numbers stay hidden (forces waiting for C)?*

### D2 — Who sees the Enquiries inbox?

Roles: owner (everything) / manager (edit products, run campaigns) / salesperson (view-only catalog, add customers).
- Owner + manager only — simpler/safer; salesperson on the shop floor can't help.
- Owner + manager + salesperson can take and reply — more hands, more customer data exposed to the lowest role.
- Salesperson can see but not take/reply — middle option.
Try-on stays owner + manager only whatever is chosen here.

### D3 — Who gets an enquiry?
First-to-tap "Take" owns it (proposal) vs round-robin auto-assign among on-duty staff.

### D4 — Remote customers
Try-on needs the customer in the shop (staff take the photo). v1 = in-store only (proposal). Alternative: customer sends a photo over WhatsApp later — needs a separate consent flow.

### D5 — Keep the generated try-on image?
Delete after the session (proposal, privacy-safest) vs keep N days (needs retention notice + withdraw UX).

### D6 — Try-on quota
One product = one try-on = one quota unit. A customer with 4 picks uses 4. At 100/month that is ~25 customers. Is 100 right? (See §10 for what each unit costs.)

### D7 — Studio Shoot with a real person's photo
Leave admin-bench only (proposal); F-040 covers the use case.

---

## 10. What does one product try-on cost? (asked 2026-10-16)

### 10.1 It is GPU time, not AI tokens
The F-040 try-on path calls the CatVTON model on a RunPod serverless GPU (`packages/ai/src/tryon.ts` → `POST {endpoint}/runsync`). **No LLM / Claude / token usage is involved** — no vision call, no prompt, no tokens (grep of `apps/api/src/jobs/tryon.ts` found no Claude/Anthropic/vision call). Cost = **GPU-seconds** billed by RunPod. Counting tokens does not apply; the billing unit is **one try-on = one quota credit = ~one GPU run**.

### 10.2 Per-try-on cost (numbers recorded in `style-match-lite.md` §9.1, checked 2026-09-26)

| Path | Per try-on (USD) | ≈ INR (₹88/$) | Basis |
|---|---|---|---|
| **Self-hosted CatVTON on RunPod (the chosen path)** | **~$0.0345** | **~₹3.0** | A100 serverless ~$2.72/hr × measured 45.9 s run (`executionTime: 45884 ms`, confirmed 2026-07-11) |
| Managed FASHN API (comparison, not chosen) | $0.075 on-demand / ~$0.049 at volume commitment | ~₹6.6 / ~₹4.3 | quoted price |

### 10.3 What that means in your use cases

| Scenario | Self-hosted CatVTON | FASHN on-demand (comparison) |
|---|---|---|
| 1 product | ~₹3 | ~₹6.6 |
| 1 enquiry session, 4 products | ~₹12 (4 × ₹3) | ~₹26 |
| 100 try-ons / month (owner's example retailer quota) | ~₹300 | ~₹660 |
| 100 try-ons as share of plan price | ~6 % of Starter ₹4,999, ~3 % of Growth ₹9,999, ~2 % of Pro ₹14,999 (ex-GST) | ~13 % / 7 % / 4 % |

Time: ~46 s per try-on; four products run one after another ≈ **3 minutes** unless the endpoint has more than one worker (`workersMax`) and the app fires jobs in parallel.

### 10.4 Caveats — numbers above are floors, not guarantees
- The ₹3 figure is one measured **warm** run. **Cold starts** (worker spinning up) add seconds; RunPod bills worker time while it initialises — verify against the RunPod pricing page / your invoice before quoting a final price. *(Not verified in this session.)*
- **Failed and withdrawn jobs still burn the GPU.** The code meters a mid-run withdrawal on purpose (`catvton-runpod-tryon-launch.md` ~lines 1001, 1056) — retries and failures raise the real average above ₹3.
- **Idle cost:** if the endpoint is kept warm (`workersMin > 0`) you pay for idle GPU time; at `workersMin = 0` you pay only for runs but accept cold starts. Current value not verified (needs the owner's RunPod key).
- **USD→INR:** ₹88/$ assumed (matches the ~₹3 / ~₹6.6 in the older doc). The bill is in USD; the real cost moves with the exchange rate.
- **Hidden costs:** R2 storage for kept results (small; ≤80 KB-class images) and dev/ops time (the ops tax that argued against self-hosting in §9.2 of `style-match-lite.md`). Neither is in the per-try-on number.
- **No cost logging yet for this path:** unlike AI tagging (`ai_usage_log`), no usage/cost row was found in `jobs/tryon.ts`. If you want per-retailer try-on cost in the admin dashboard, add it (new task E11, below). Quota counters (`QuotaResourceType`) already count *how many* try-ons, which × ₹3 gives an estimate.

### 10.5 How to use these numbers for pricing
- Pick a monthly quota per plan: cost to you ≈ quota × ₹3 (worst case, all used) — add ~30 % buffer for cold starts / retries → plan on **₹4 per try-on** when budgeting.
  - 100/month → ~₹400 worst-case
  - 4-product enquiry session → ~₹16 budgeted
- Admin controls the quota per plan live (built, F-040); numbers can be tuned after the first month of real usage.

### 10.6 Extra task from this question

| # | Task | Size | Depends |
|---|---|---|---|
| E11 | Log per-try-on GPU seconds (RunPod `executionTime`) + estimated cost to an admin-visible table/report so real average cost replaces the ₹3 estimate | S | F-040 launch |

### 10.7 D8 — ✅ DECIDED 2026-10-16 (owner)
- **Budget unit = ₹4 per try-on in plan math** (₹3 measured compute + ~30 % buffer for cold starts / retries / failed jobs). 100 try-ons/month ≈ **₹400 worst case**; a 4-product enquiry session ≈ **₹16**.
- **Engine stays self-hosted CatVTON-on-RunPod** (the F-040 chosen path). FASHN is **not** adopted; it remains documented only as a comparison/fallback (`style-match-lite.md` §9.1). Reason: cheapest per-image number (~₹3 vs ~₹6.6) and already built; kept for near-future use.
- **Revisit trigger:** replace the ₹4 estimate with real average cost once E11 (GPU-seconds logging) has about one month of data. Nothing is priced into a plan yet — D8 only fixes the *planning unit*; plan-level quotas are still to be set (D6).
- Not yet done: no plan quota edited, no code changed, no docs outside this file updated (PRO-REQUIREMENTS / PLAN.md updates wait for approval — task E10).

---

## 11. Decision register + next-session prompt (saved 2026-10-16)

### 11.1 Decision register

| ID | Decision | State | My recommendation |
|---|---|---|---|
| D1 | Reply channel (A shared Business number + linked devices / B wa.me button / C in-app Cloud API) | ✅ **Decided 2026-10-17: A now, C later with F-035.** Staff may see customer numbers inside WhatsApp itself; B (wa.me button) not offered; the API still never returns a full customer number to staff. Caveat: `retailer.phone` (the wa.me target) must be the shared Business number. Under A, `REPLIED` is marked by hand in-app. | — |
| D2 | Who sees the Enquiries inbox | ✅ **Decided 2026-10-17: Option 1.** Owner, manager and salesperson all see, take, and mark replied/closed. Reassign = owner + manager only. Try-on = owner + manager only (salesperson 403, pinned by E7). Phone stays masked server-side for non-owners. Needs one new salesperson allowlist line in `auth.ts` (stays default-deny). Optional "Needs try-on" flag (salesperson → manager) is not in the first release. | — |
| D3 | Assignment | ✅ **Decided 2026-10-17: first-to-tap "Take".** Other staff see "Being handled by <name>"; owner + manager can reassign. No round-robin, no on-duty roster. Under D1-A the app cannot prevent two people replying in WhatsApp at once. | — |
| D4 | Remote customers | ✅ **Decided 2026-10-17: in-store only.** Staff photographs the customer in the shop; no customer-sent photos over WhatsApp. Remote customers still get the enquiry and a WhatsApp reply, just no try-on. Revisit after the first month of real use. | — |
| D5 | Keep generated try-on image | ✅ **Decided 2026-10-17: discard after the session.** Nothing kept; re-viewing means a new try-on (another quota unit). No retention notice or withdraw UX needed in v1. Open build check before E8: F-040 stores results in R2 today, so "discard" is new behaviour (delete on exit, or never persist) and its effort is unread. A "keep N days" option can come later with a notice. | — |
| D6 | Try-on quota per plan | ✅ **Decided 2026-10-17: Starter 40 / Growth 100 / Pro 200 try-ons per month** (worst case ₹160 / ₹400 / ₹800 at ₹4, i.e. 3.2 / 4.0 / 5.3 % of the CLAUDE.md prices — live `plan_pricing` values NOT verified, seed in migration 074 is stale). Admin can tune live. **Plus: a retailer who hits the limit can buy more try-ons (top-up pack).** Code finding 2026-10-17: the add-on rail exists (`POST /billing/addon-checkout` Razorpay payment link + `ADDON_PRICING` + admin `resource-packs`) but `TRY_ON_GENERATION` is in NEITHER enum (`billing-addons.ts:22`, `admin-resource-packs.ts:15`), so the top-up needs a new task (E12). Pack sizes/prices not yet decided (open D6b). | — |
| D6b | Try-on top-up packs | ✅ **Decided 2026-10-17: 25 / 50 / 100 try-ons at ₹8 each ex-GST → ₹200 / ₹400 / ₹800** (2× the ₹4 cost unit; GST +18 % on top). Admin-editable via resource packs. Needs E12 (add `TRY_ON_GENERATION` to the checkout enum + admin pack list). Open: whether purchased packs expire at month-end or carry over — `QuotaAddonPurchase` expiry rule NOT yet read. | — |
| D7 | Studio Shoot real-person upload | ✅ **Decided 2026-10-17: leave admin-bench only.** F-040 try-on covers "garment on a real person" with consent + quota + deletion sweep; Studio Shoot has none of those. Revisit only if a retailer asks for real-person catalogue shoots. | — |
| **D8** | **Budget unit for try-on** | ✅ **Decided 2026-10-16: ₹4 per try-on; self-hosted CatVTON kept as the engine** | — |

### 11.2 Suggested build order (once D1, D2, D6 are answered)

1. **E7** pin manager-allowed / salesperson-blocked try-on in `staff-access.test.ts` (tiny, no risk).
2. **E1** store all `product_ids` + validate they belong to the retailer + product names in WhatsApp text (migration *proposed*, owner applies).
3. **E6** split customer try-on off `VIRTUAL_TRY_ON_V2` (new flag default off, server 404).
4. **E3 + E2** Enquiries inbox (retailer app) + "Send my picks to store" (customer web).
5. **E4** notifications — first verify whether retailer push exists; fall back to in-app badge + poll.
6. **E5** reply path A = docs/copy only.
7. **E8** "Try on with customer" session screen — only after F-040 launch gates are cleared.
8. **E11** try-on cost logging — ship with or right before F-040 launch so real cost data starts accruing.
9. **E9** in-app WhatsApp reply — only when F-035 lands.
10. **E10** doc sync (PRO-REQUIREMENTS, PLAN.md, README index, BUILD-LOG) in the same session as each build.

### 11.3 Suggested starting try-on quotas (D6) — at ₹4 per try-on (D8), worst case if fully used

| Plan (ex-GST) | Try-ons / month | Worst-case cost | % of plan price | ≈ 4-product sessions |
|---|---|---|---|---|
| Starter ₹4,999 | 40 | ₹160 | 3.2 % | 10 |
| Growth ₹9,999 | 100 | ₹400 | 4.0 % | 25 |
| Pro ₹14,999 | 200 | ₹800 | 5.3 % | 50 |

These are suggestions only, not decided. Admin can change them live (F-040 quota is admin-editable), so the first month can run conservatively. Customer-side (phone-OTP) quota is irrelevant while customer try-on stays off (E6).

### 11.4 Risks to keep in front of the decision

- **Launch gates unchanged:** `VIRTUAL_TRY_ON_V2` is OFF; RunPod template tag must be re-pointed to the image with the `person_image_base64` handler; `workersMax`/`workersMin` unverified (needs the owner's RunPod key); consent screen T4.
- **Quality risk:** the old removal reason (multi-piece garments: suit + dupatta, sherwani sets) is not proven fixed — readymade-only scope narrows it but does not remove it. Run an accuracy pass on real Kanchuki products before promising it to retailers.
- **Privacy:** a stored photo of a real person; keep the "wearer photo never persisted" rule through the multi-product loop (SECURITY.md §12–18 needs human review for governance changes).
- **Cost truth:** ₹4 is an estimate until E11 produces real averages.

### 11.5 PROMPT for the next session (copy–paste)

```
Read docs/tasks/pending/enquiry-basket-team-inbox-and-instore-tryon.md in full
(especially §3 what exists, §5 design, §9 decisions explained, §10 try-on cost,
§11 decision register). Also read docs/tasks/pending/catvton-runpod-tryon-launch.md
(F-040) and CLAUDE.md's AI Agent Operational Control Policy before touching code.

CONTEXT
- Feature: customer picks 3–4 products -> sends ONE enquiry -> whole team sees it in an
  Enquiries inbox -> a team member replies on WhatsApp -> if the customer is in the
  store, ONLY owner/manager runs the F-040 try-on on THEIR OWN phone (customer never
  tries on from their own phone).
- Already decided: D8 — budget Rs 4 per try-on in plan math (Rs 3 compute + ~30% buffer,
  100 try-ons/month ~ Rs 400 worst case); engine stays self-hosted CatVTON-on-RunPod.
  Do not switch to FASHN. Nothing is priced into a plan yet.
- Nothing is built. Migrations are PROPOSED ONLY — never applied by the agent.

MY ANSWERS (I will fill these in before sending):
- D1 reply channel: ____   (your recommendation: A now, C later with F-035)
- D2 inbox visibility:  ____   (rec: owner+manager take/reply; salesperson read-only + hand-off)
- D3 assignment: ____   (rec: first-to-tap Take)
- D4 remote customers: ____   (rec: in-store only v1)
- D5 keep try-on image: ____   (rec: discard after session)
- D6 quotas per plan: ____   (rec table in section 11.3: 40 / 100 / 200)
- D7 Studio Shoot real-person upload: ____   (rec: leave bench-only)

WHAT I WANT THIS SESSION
1. Update the decision register (section 11.1) with my answers, then show me the diff
   and wait for my "apply" before editing any code.
2. Verify the three "not verified" items in section 8 by reading code: (a) does the
   retailer app register devices for push, (b) is there an inbound WhatsApp webhook for
   the retailer WABA beyond F-307 catalog sync, (c) the full EnquiryStatus enum.
   Report findings before designing E4/E9.
3. Propose (do not run) the migration for E1 (extend CollectionEnquiry: product_ids,
   assigned_staff_id, assigned_at, first_reply_at, last_reply_by_staff_id, source,
   try_on_done) after checking docs/DATABASE.md and SECURITY.md; show the SQL + rollback.
4. Start the build in the order in section 11.2, smallest first: E7 (test) -> E1 -> E6.
   After each step run typecheck + the relevant tests (staff-access.test.ts,
   security.test.ts, the try-on route tests) and tell me the result honestly.
5. Keep docs in sync in the same session (rule 10 in CLAUDE.md): this task file,
   docs/tasks/README.md index row, PRO-REQUIREMENTS (assign an F-number), BUILD-LOG.

CONSTRAINTS
- Default-deny staff allowlist in apps/api/src/plugins/auth.ts must stay default-deny;
  staff must never receive a full customer phone number via API (except where I
  explicitly chose D1 option B for the owner).
- Wearer photo is never persisted anywhere (no R2, DB, or BullMQ payload).
- Try-on gate stays server-side (404 when the flag is off), never UI-only.
- No railway up, no production migrations, no CLAUDE.md edits without my approval.
- Use rtk-prefixed commands; reply in caveman style but write code/docs/commits normally.
```

### 11.6 My additional suggestions (not yet decisions)

1. **Treat D1-A as the launch path** — it needs no new infrastructure and lets the team start replying the day the inbox ships; schedule C as a separate project tied to F-035.
2. **Ship E1 + E7 even before the inbox** — fixing "only the first product is stored" immediately improves analytics and the WhatsApp text, and the test locks the role boundary.
3. **Do an accuracy bake-off before E8:** run 20 real catalog products (10 readymade single-piece, 10 sets) through the live worker once it is re-pointed, and decide the supported categories from the result.
4. **Default try-on to "view only, nothing kept"** — it removes the largest privacy question (D5) and the R2 storage cost, and can be relaxed later.
5. **Show the staff member the remaining quota and an estimated cost before running** ("4 try-ons, ~₹16") — keeps usage conscious and prevents surprise overage.
6. **Re-evaluate FASHN only if** CatVTON quality fails the bake-off on common categories; keep the engine behind one interface so it can be swapped without redoing the inbox.

### 11.7 Release plan — ✅ approved by owner 2026-10-17 (supersedes §11.2 ordering)

Principle: ship only what has no GPU dependency first; try-on waits for the F-040 launch gates (flag OFF, RunPod image re-point, accuracy bake-off).

**Release 1 — basket → inbox → take (no try-on, no push)**

| Order | Task | Note |
|---|---|---|
| 1 | E7 | test: manager allowed / salesperson 403 on try-on POST |
| 2 | E6 | split customer try-on off `VIRTUAL_TRY_ON_V2`; must land BEFORE the flag is ever flipped |
| 3 | E1 | persist all `product_ids`, validate they belong to the retailer, names in WhatsApp text; migration PROPOSED only — columns `product_ids`, `assigned_staff_id`, `assigned_at` |
| 4 | E2 | customer web "Send my picks to the store" |
| 5 | E3 | Enquiries inbox: Take, status NEW/SEEN/REPLIED/CLOSED, reassign (owner + manager), one new salesperson allowlist line (default-deny kept) |
| 6 | E4-lite | unread badge + poll, no push |
| 7 | E5 | onboarding + card copy: use the shared Business number; check `retailer.phone` is that number |

**Release 1 progress:**
- E7 ✅ built 2026-10-17 — `apps/api/src/plugins/staff-access.test.ts` pins manager `POST /v1/products/:id/try-on` (+ status GET) allowed, salesperson 403; mutation-checked (removing the manager `/v1/products` rule fails it). Branch `feat/enquiry-r1-t1-staff-test`.
- E6 ✅ built 2026-10-17 — `CUSTOMER_TRY_ON_ENABLED = false` in `apps/api/src/lib/features.ts`. Customer (cookie-only) try-on POST + status → 404, `GET /passport/try-on/consent` → 404, public product `try_on_enabled` false with no PlanFeature read. In-store Bearer path unchanged; `POST /passport/try-on/withdraw` stays live (Q2). Branch `feat/enquiry-r1-t2-customer-tryon-off`.
- E1 ✅ built 2026-10-17 — enquire route stores every product (`product_ids`, deduped, `product_id` first, max 20), all validated against the collection's retailer before any write (422 otherwise), WhatsApp text names products. Schema + **migration `130_enquiry_inbox` PROPOSED, not applied** (adds `product_ids`, `assigned_staff_id`, `assigned_at` + backfill). ⚠️ Apply 130 BEFORE deploying this code. RC-066 fixed (enquiry phone masked for non-owners on GET `/collections/:id` + PATCH status). Branch `feat/enquiry-r1-t3-enquiry-products` (PR #96).
- E2 ✅ built 2026-10-17 — web proxies `api/c/[slug]/enquire` + `api/[store]/[collection]/enquire` (status + JSON passthrough); wishlist "Send my picks to the store" sends ONE POST with localStorage ids ∪ this store's passport wishlist rows, opens the API `whatsapp_url`, falls back to the client wa.me link on any non-200; sync ref guard (RC-015); disabled at 0 picks. Branch `feat/enquiry-r1-t4-send-picks` (PR #97).
- E3 ✅ built 2026-10-17 — `GET /v1/collections/enquiries` (retailer-scoped, newest 100, masked phone, products with name/photo, `assigned_to {id,name}`, `assignees` for owner + manager only), `GET …/enquiries/unread-count` (NEW only), `POST …/enquiries/:id/take` (CAS on `assigned_staff_id IS NULL` → 409 `ENQUIRY_TAKEN` "Being handled by <name>"; owner stores `retailer.id`, Q1), `PATCH …/enquiries/:id/assign` (owner + manager; target must be an active staff of this shop or the owner). `request.staffId` added in `auth.ts`; salesperson allowlist gains exactly `POST …/enquiries/:id/take` + `PATCH /v1/collections/:id/enquiries/:enquiryId` (default-deny kept). Support/catalog delegates cannot take or reassign. Mobile `app/enquiries.tsx` + home "Enquiries" tile + `staffCan` keys `enquiries` / `enquiries.assign`. Branch `feat/enquiry-r1-t5-inbox`.

Deferred columns (add when something reads them): `first_reply_at`, `last_reply_by_staff_id`, `source`, `try_on_done`.

**Release 2 — try-on (after F-040 launch gates + accuracy bake-off):** E11 GPU-seconds logging; E8 "Try on with customer" session screen (owner + manager, discard on exit per D5); E12 top-up packs.

**Release 3:** real push notifications (new infra); E9 in-app WhatsApp replies once F-035 lands.

Not in any release for now: the salesperson "Needs try-on" flag (D2 optional), "keep image N days" (D5), remote try-on (D4).
