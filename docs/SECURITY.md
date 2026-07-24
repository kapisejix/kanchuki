# Kanchuki — Security Model

**Version:** 1.0  
**Date:** June 2026  
**Standard:** OWASP Top 10, India PDPB (Personal Data Protection Bill)  
**Skill reference:** `security-and-hardening`, `security-review`

---

## Security Priorities

1. **Customer photo privacy** — VTO photos must never be stored permanently without explicit consent
2. **Retailer data isolation** — no cross-tenant data leakage
3. **Authentication** — phone OTP with rate limiting, no password guessing
4. **AI cost abuse** — prevent malicious actors from triggering expensive AI calls
5. **WhatsApp token security** — Meta API credentials must never be exposed

---

## 1. Authentication & Authorization

### Retailer Authentication

**Method:** Phone OTP via Supabase Auth  
**Flow:**
```
1. Retailer enters +91 phone number
2. OTP sent via SMS (Supabase → Twilio/MSG91)
3. OTP valid for 10 minutes, 6 digits
4. Correct OTP → Supabase JWT issued (access_token: 15min, refresh_token: 30 days)
5. All API calls: Authorization: Bearer {access_token}
```

**Rate limiting:**
- Max 3 OTP requests per phone per 15 minutes
- Max 5 failed OTP attempts per phone per hour → 1-hour lockout
- IP-level rate limit: 10 OTP requests per IP per hour

### JWT Validation

```typescript
// All protected routes
fastify.addHook('preHandler', async (request, reply) => {
  const token = request.headers.authorization?.split(' ')[1];
  if (!token) return reply.status(401).send({ error: 'Unauthorized' });
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return reply.status(401).send({ error: 'Invalid token' });
  
  // Attach retailer context
  request.retailerId = user.id;
});
```

### Staff Authorization

- Staff accounts created by retailer (owner role only)
- Role-based: `owner` > `manager` > `salesperson`
- Salesperson: can search products, serve customers, create collections
- Manager: + can add products, add customers
- Owner: full access including billing, staff management

---

## 2. Tenant Isolation

**Critical:** Multiple retailers on one database. Data must never cross tenant boundaries.

### Database Layer (PostgreSQL RLS)

```sql
-- Every table has retailer_id
-- RLS policies enforced at DB level
-- Even if API code has a bug, DB won't return wrong tenant's data

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Retailer policy
CREATE POLICY "retailers_own_data" ON products
  USING (retailer_id = (SELECT id FROM retailers WHERE auth_user_id = auth.uid()));
```

### API Layer

- Every query includes `WHERE retailer_id = request.retailerId`
- Even with RLS as backstop, API never queries without tenant filter
- No shared resource IDs that could be guessed (use cuid2, not sequential int IDs)

### Storage Layer (Cloudflare R2)

- Object keys include `retailer_id` prefix: `retailers/{retailer_id}/products/...`
- Presigned upload URLs scoped to retailer prefix only
- Download URLs: signed with 1-hour expiry (no permanent public URLs for product photos)

---

## 3. Customer Photo Privacy (VTO)

**This is the highest-risk area for trust.**

### Privacy Rules

1. **No permanent storage without consent** — Customer try-on input photos are deleted immediately after job completes.
2. **Explicit consent modal** — Customer must tap "I agree" before photo upload. Cannot be skipped.
3. **No sharing** — Try-on input photos never shared with retailer or any third party.
4. **Result lifetime** — Result images expire after 24 hours. Not permanently accessible.
5. **No biometric data** — We do not extract, store, or process facial recognition or biometric data.

### VTO Photo Lifecycle

```
Customer uploads photo
  → Stored in R2 at try_on_jobs/{job_id}/input.jpg (PRIVATE bucket)
  → TryOnJob record created: customer_photo_r2_key set
  → AI processes (V-Tone API call)
  → Result stored at try_on_jobs/{job_id}/result.jpg (PRIVATE bucket, 24h expiry)
  → Input photo DELETED: customer_photo_r2_key nulled, customer_photo_deleted_at set
  → TryOnJob.result_url: signed URL valid 24h only
  → After 24h: cron job deletes result, result_r2_key nulled
```

### Consent Modal Text (must not change without legal review)

```
Before we proceed, please know:
• Your photo is used only to preview this outfit on you.
• Your photo is NOT stored after the preview is ready.
• Your photo is NOT shared with the shop or anyone else.
• The preview image will be available for 24 hours only.

By tapping 'Continue', you agree to these terms.
```

---

## 3b. Training-Data Consent (F-102d — separate opt-in, off by default)

Everything in §3 above still applies unconditionally — every try-on's input
photo is deleted after processing regardless of what follows here. This
section covers a **second, independent, unchecked-by-default** checkbox that
lets a customer additionally allow Kanchuki to keep a copy of that one
try-on's photos to improve the try-on model. It must never be implied by, or
bundled into, the required processing consent in §3.

### Rules

1. **Opt-in, not opt-out.** Checkbox defaults to unchecked on every screen
   (web `TryOnModal`, mobile `in-store` try-on). No dark patterns — same
   visual weight as an unchecked checkbox, not a pre-ticked box.
2. **Retailer never sees this data.** `TrainingPhotoConsent` has no
   `retailer_id` column and no RLS policy grants the `authenticated`
   (retailer) role any access — only the backend's service-role key can read
   or write it (migration `008_training_photo_consent`). This is a
   deliberate architectural choice, not a "second database": Kanchuki runs
   one Postgres instance for the whole platform, and tenant isolation is via
   Row Level Security policies, not separate physical databases per tenant —
   this table simply has zero retailer-facing policies, same mechanism that
   already isolates one retailer's data from another's.
3. **Separate storage from the normal try-on lifecycle.** Consented copies
   live under R2 prefix `training-data/`, distinct from `tryon-results/` and
   `tryon-preprocessed/`, and are **not** covered by the 24h-expiry cleanup
   cron that deletes normal try-on results. They persist until a
   deletion/retention policy is defined (not yet built — see Open Items).
4. **Versioned consent.** Every `TrainingPhotoConsent` row records the exact
   `consent_version` string shown at capture time
   (`apps/api/src/jobs/process-tryon.ts::TRAINING_CONSENT_VERSION`), so a
   later change to the consent copy never retroactively changes what an
   earlier customer is understood to have agreed to.
5. **Failure is non-fatal.** If the training-copy write fails, the customer's
   try-on result is unaffected — this consent path runs after the result is
   already returned to the customer.

### Open items (flagged, not yet built)

- Retention/deletion policy for `training-data/` — now implemented (180-day
  cleanup cron at `apps/api/src/jobs/cleanup-training-data.ts`). See §3c for
  the companion revocation flow. Earlier sessions' "not built" notes are
  superseded.
- India's DPDP Act 2023 treats this as processing personal data requiring
  clear, specific, informed consent — the copy above was written to be
  specific about scope, but has **not** had a legal review pass. Treat as
  a placeholder needing sign-off before this ships to real customers, same
  status as the original consent text below.

---

## 3c. Training-Data Consent Revocation (F-102d — token-based, no login)

Customers who opted in to training-data collection (§3b) receive a
`revocation_token` — a random, unguessable cuid2 string (~64 chars, generated
by Prisma `@default(cuid())`) that serves as a bearer credential to prove
ownership of a specific `TrainingPhotoConsent` record. No customer account,
password, or retailer involvement is needed.

### Revocation Flow

```
1. Customer opts in at try-on time (unchecked checkbox → they check it)
2. Try-on completes → process-tryon.ts saves TrainingPhotoConsent
   → Prisma auto-generates revocation_token via @default(cuid())
3. TryOnJob poll response includes revocation_token in response body
4. Result screen shows: "You opted in. Revoke consent and delete my photos"
5. Link opens /consent/revoke?token=<token> (web) or system browser (mobile)
6. Customer sees confirmation page with warning: "This cannot be undone"
7. On confirm → POST /v1/consent/revoke { token }
8. API:
   a. Looks up TrainingPhotoConsent by revocation_token (unique index)
   b. Deletes 3 R2 objects (customer.jpg, garment.jpg, result.jpg) via
      Promise.allSettled — best-effort, individual failures logged but
      do not block the DB row deletion
   c. Deletes TrainingPhotoConsent DB row
9. Response: "Consent revoked, data deleted."
```

### Token Properties

| Property | Value |
|----------|-------|
| Generation | `@default(cuid())` in Prisma (delegates to `createId` from `@paralleldrive/cuid2`) |
| Length | ~24-28 characters, base36 encoded |
| Entropy | ~128 bits (cuid2 spec) |
| Storage | `training_photo_consents.revocation_token` — UNIQUE indexed |
| Lifetime | Permanent — deleted when the row is purged by the 180-day retention cron (§10) |
| Exposure | Returned to customer via try-on result screen, stored in-memory only on the client |

### Authentication Model

`POST /v1/consent/revoke` is **deliberately unprotected by the authPlugin** —
customers do not have user accounts or JWTs. Instead, the `revocation_token`
itself is the sole authentication credential. This is a bearer-token model:

- **Token = proof of ownership.** Possession of a valid token is sufficient
  to delete that token's associated training data. No additional factors.
- **No brute-force enumeration.** The token space (cuid2, ~128 bits of
  entropy) is too large for online guessing within the rate limit
  (5 requests/min per IP).
- **No timing side-channels.** The `findUnique` query + `validationError`
  response for invalid tokens uses the same code path regardless of whether
  the token exists, preventing response-time oracle attacks.
- **No valid/invalid token leakage.** The error message for an unknown token
  is intentionally vague: "Invalid or expired revocation token" — does not
  reveal whether the token format was valid but not found.

### Rate Limiting

| Scope | Limit | Mechanism |
|-------|-------|-----------|
| Per-IP (POST /v1/consent/revoke) | 5 requests per minute | Fastify route-level `config.rateLimit` (`@fastify/rate-limit`) |
| Per-IP (global) | 200 requests per minute | Fastify plugin-level rate limit (fallback) |

300 attempts per hour × ~128-bit token space makes brute force infeasible.

### What Gets Deleted

When a customer revokes, the following is permanently removed:

| Resource | Location | Deletion Method |
|----------|----------|----------------|
| Customer photo | R2 `training-data/{jobId}/customer.jpg` | `deleteObject()` via S3 API |
| Garment photo | R2 `training-data/{jobId}/garment.jpg` | `deleteObject()` via S3 API |
| Try-on result | R2 `training-data/{jobId}/result.jpg` (if non-null) | `deleteObject()` via S3 API |
| Consent record | `training_photo_consents` row | `prisma.delete()` |

**NOT affected by revocation:**
- The customer's original try-on result (`tryon-results/{jobId}/result.jpg`)
  — this is covered by the normal 24h-expiry policy (§3), not the training
  store, and is untouched by revocation.
- Any `TryOnJob` record — revocation only touches `TrainingPhotoConsent`.

### Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Attacker guesses a valid revocation_token | **Very low** — 128-bit token space, rate-limited to 5/min/IP | Attacker deletes a customer's training data (no data exposure, only deletion) | cuid2 entropy + rate limiting + vague error messages |
| Attacker intercepts a revocation link in transit | **Low** — HTTPS required for all customer-facing pages | Attacker can delete that link's training data | TLS 1.3 on all endpoints; link is single-use in practice (deletion idempotent) |
| Attacker steals revocation_token from client-side storage | **Low** — token stored in-memory only (React state), never in localStorage/cookies | Attacker can delete that session's training data | In-memory only; no persistent client-side storage of the token |
| Insider (employee) deletes training data via DB access | **Medium** — service-role key has full access | Any training data can be deleted by an insider | Audit logging in `audit_logs` is planned but not yet implemented for consent operations |
| Mass token guessing (distributed, many IPs) | **Low** — requires many distinct IPs each hitting the 5/min limit | Could delete a handful of training records per hour | No programmatic way to enumerate valid tokens — each guess is a separate DB lookup with no batch endpoint |
| Revoked customer claims data was not deleted | **Low** — deletion is synchronous and confirmed | Reputational risk | `prisma.delete()` is strongly consistent; R2 `deleteObject` is read-after-write consistent. Both confirm success before the API responds. |

### Open Items

- **No audit logging.** Successful and failed revocation attempts are not
  recorded in `audit_logs`. Add before launch for compliance (DPDP Act §25).
- **No secondary verification.** A bearer token is the sole auth factor.
  Consider an email/SMS confirmation step for high-value accounts, but this
  requires storing a customer contact method — which the existing
  `TrainingPhotoConsent` deliberately does not (it has no customer PII).
- **No expiration on the revocation link itself.** If a customer copies the
  URL and never uses it, the token remains valid until the 180-day retention
  cleanup job (`apps/api/src/jobs/cleanup-training-data.ts`) purges the row.
  This is acceptable — the worst case is that an old, leaked link could
  delete stale data.

---

## 4. API Security

### Rate Limiting

```typescript
// Per-retailer rate limits (via Redis)
const limits = {
  '/products': { window: '1m', max: 60 },           // 60 products/min
  '/products/upload-url': { window: '1m', max: 20 }, // 20 uploads/min
  '/ai/tag': { window: '1h', max: 200 },              // 200 AI tags/hour
  '/collections': { window: '1m', max: 30 },
  '/try-on': { window: '1h', max: req.plan.try_on_credits }, // plan limit
};

// Global IP rate limit
// 1000 requests per IP per minute (prevent DDoS)
```

### Input Validation

All API inputs validated with Zod:
```typescript
const CreateProductSchema = z.object({
  price_min: z.number().min(0).max(1000000),
  price_max: z.number().min(0).max(1000000).optional(),
  category: z.string().max(100),
  primary_color: z.string().max(50),
  // ... all fields bounded and typed
});
```

- No direct object passthrough to DB queries
- JSONB `metadata` field: validated structure, size limit 10KB
- String fields: max length enforced
- File uploads: size limit 10MB, MIME type whitelist (image/jpeg, image/png, image/webp)

### SQL Injection Prevention

- Prisma ORM: parameterized queries always
- No raw SQL with user input. Exception: pgvector queries use Prisma raw with bound parameters:
  ```typescript
  await prisma.$queryRaw`
    SELECT id FROM product_embeddings
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${limit}
  `;
  ```

### XSS Prevention

- Customer web (Next.js): React auto-escapes by default
- All product text fields: sanitized with `dompurify` before render
- Content-Security-Policy header: no inline scripts
- No `dangerouslySetInnerHTML` without sanitization

### CSRF Protection

- API: Stateless JWT (no cookies) — CSRF not applicable for API
- Admin web (cookie-based): CSRF token on all mutating requests
- `SameSite=Strict` on admin session cookies

---

## 5. File Upload Security

### Malware Prevention

- Never serve uploaded files with execution permission
- Files served from R2 CDN (not from API server — no SSRF risk)
- MIME type validation server-side (not just from client header):
  ```typescript
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const detectedType = await fileTypeFromBuffer(buffer);
  if (!allowedTypes.includes(detectedType?.mime)) {
    throw new Error('Invalid file type');
  }
  ```

### File Size Limits

- Product photo: max 10MB (server rejects), app compresses to < 500KB before upload
- PDF catalog (Phase 2): max 50MB
- VTO customer photo: max 5MB

### Storage Key Structure (Non-Guessable)

```
retailers/{retailer_id}/products/{product_id}/{cuid}.webp
```
- `cuid` is non-guessable (no sequential IDs)
- All URLs are signed with expiry (no permanent public URLs)

---

## 6. WhatsApp API Security (Phase 2)

### Token Management

- Meta App Secret: stored in Railway secrets (environment variable)
- Never in code, never in git
- Webhook verify token: random 32-char string, stored in env

### Webhook Validation

```typescript
// Verify all incoming webhooks from Meta
const validateWebhook = (payload: string, signature: string): boolean => {
  const expected = crypto
    .createHmac('sha256', process.env.META_APP_SECRET!)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(`sha256=${expected}`),
    Buffer.from(signature)
  );
};
```

### Message Rate Limiting

- Never send more than 1 message per 24h per customer without opt-in
- Honor opt-out immediately (STOP keyword → mark customer as opted-out)
- Log all sent messages in audit trail

---

## 7. Secrets Management

**Rules:**
- Zero secrets in code or git (enforced via pre-commit hook)
- All secrets via environment variables
- Development: `.env` file (gitignored)
- Production: Railway secrets (encrypted at rest)

**Secret rotation schedule:**
- Supabase service role key: rotate every 90 days
- Razorpay keys: rotate after any breach suspicion
- Meta App Secret: rotate immediately if exposed
- Claude API key: monitor usage for anomalies daily

**`.env.example` in repo:**
```bash
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...  # NEVER commit actual value
CLAUDE_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
RAZORPAY_KEY_ID=rzp_...
RAZORPAY_KEY_SECRET=...      # NEVER commit actual value
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...     # NEVER commit actual value
VTONE_API_URL=...           # Fashion V-Tone self-hosted endpoint
META_APP_SECRET=...           # Phase 2
META_VERIFY_TOKEN=...         # Phase 2
```

---

## 8. Infrastructure Security

### Network

- API not directly exposed to internet (Cloudflare proxy)
- Database: not publicly accessible (Supabase internal network)
- Redis: not publicly accessible (Upstash TLS only)
- All internal service communication: TLS 1.3

### Headers

```typescript
// Fastify security headers
app.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "*.r2.dev", "*.cloudflare.com"],
      scriptSrc: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
```

### Admin Panel

- Admin users: email + password + TOTP (Google Authenticator)
- IP allowlist for admin panel (office IPs only)
- All admin actions: logged in audit_logs with before/after state

---

## 9. Data Privacy (India PDPB Compliance)

### What We Collect

| Data | Type | Purpose | Retention |
|------|------|---------|-----------|
| Retailer phone | PII | Authentication | Until account deletion |
| Retailer shop name, city, GSTIN | Business data | Service delivery | Until account deletion |
| Customer name, phone | PII (retailer-entered) | CRM | Until customer deleted by retailer |
| Customer fashion preferences | PII | Fashion DNA AI | Until deleted |
| Customer try-on photo | Sensitive PII | VTO processing | **Deleted immediately after processing** |
| Collection view data | Anonymous session | Analytics | 90 days |
| Payment data | Financial | Billing compliance | 7 years |

### Data Subject Rights (Customer)

Customers can:
- Request deletion of their interaction data (via retailer)
- Request deletion of try-on results (via UI — before 24h expiry)
- Opt-out of WhatsApp messages (Phase 2)

### Data Processing Agreements

- Anthropic (Claude API): DPA in place, data not used for training
- OpenAI (Embeddings): DPA in place, data not used for training
- Fashion V-Tone v1.5 (VTO): self-hosted, no third-party data sharing

---

## 10. Security Testing Checklist

Before each major release:

- [ ] Run Prisma query audit (no raw queries with user input)
- [ ] Run `npm audit` for dependency vulnerabilities
- [ ] Test IDOR: can retailer A access retailer B's resources?
- [ ] Test rate limiting: trigger OTP limit, AI tagging limit
- [ ] Test file upload: upload non-image (PDF, EXE) — must reject
- [ ] Test VTO photo cleanup: verify input photo deleted from R2 after job
- [ ] Test collection link: unauthenticated user can view but not admin
- [ ] Test JWT expiry: expired token → 401
- [ ] Verify no secrets in git history (trufflehog scan)
- [ ] Verify CSP headers on all pages

**Skill reference:** Use `security-bounty-hunter` skill for pre-launch audit.

---

## 11. L2 Ecommerce Checkout — Retailer Payment Credentials (F-302/F-307, planned)

**Status:** Architecture decided 2026-07-24, not yet built. Recorded here so the design is threat-modeled before implementation starts, not after.

### 11.1 Why direct-to-retailer first (Stage A)

Kanchuki's own Razorpay account (used for subscription billing today) must **never** touch a retailer's sale money. If it did — even transiently — that's acting as a payment aggregator under RBI rules, which requires a PA license (slow, expensive, not something to back into by accident). Stage A avoids this entirely: each retailer's checkout money flows through *their own* Razorpay account, using *their own* KYC. Kanchuki only stores the credentials needed to call the Razorpay API on the retailer's behalf and to verify webhooks — it never custodies funds.

Stage B (Razorpay Route, F-307) intentionally reintroduces Kanchuki as merchant-of-record for lower retailer friction — that's a deliberate compliance trade-off to make consciously later, not a default. Before enabling Stage B for real money: confirm current RBI marketplace-payment guidance with Razorpay support and legal counsel. Do not treat Route's marketing description as a substitute for that sign-off.

### 11.2 Credential storage — reuses F-012, does not reinvent it

`RetailerPaymentAccount.razorpay_key_secret_encrypted` and `.razorpay_webhook_secret_encrypted` use the exact same `encryptSecret()`/`decryptSecret()` functions from `packages/db/src/secrets.ts` (AES-256-GCM, keyed by the existing `ENCRYPTION_MASTER_KEY` env var) that F-012's admin-managed `IntegrationSetting` table already uses. The difference is scope, not mechanism: `IntegrationSetting` is one row per platform-wide key name (admin-only writes); `RetailerPaymentAccount` is one row per retailer (retailer-authenticated writes, scoped to their own `retailer_id` like every other retailer table).

- `razorpay_key_id` is not secret (Razorpay's own docs treat it as safe to expose client-side, same as a Stripe publishable key) — stored plaintext, returned to the client to initialize Razorpay Checkout.js.
- `razorpay_key_secret` and the webhook secret are always encrypted at rest, never returned to any client, never logged.
- Same masking convention as F-012's admin UI (`maskSecret()` — show only the last 4 characters) applies to any retailer-facing "connected account" display.
- RLS: `RetailerPaymentAccount` follows the standard retailer-isolation policy (§2) — a retailer can only read/write their own row. No cross-retailer read path, including for Super Admin support tooling (support should see *that* an account is connected, never the decrypted secret).

### 11.3 Webhook signature verification — verify before trusting anything in the payload

Razorpay's webhook POSTs to `/v1/public/webhooks/razorpay` are **not** scoped to a specific retailer in the URL — a naive design would trust a `retailer_id` path/query param to pick which webhook secret to verify against, which lets an attacker point the verification at a *different* retailer's (weaker or attacker-known) secret. Instead:

```
1. Parse payload.payment.entity.order_id (Razorpay's own field, present on every payment webhook)
2. Look up the local Order by razorpay_order_id — this is the ONLY trusted way to find which retailer this webhook belongs to
3. Load that Order's retailer's RetailerPaymentAccount.razorpay_webhook_secret_encrypted, decrypt it
4. Verify the request signature (HMAC-SHA256 over the raw body) against THAT secret, using crypto.timingSafeEqual — same pattern as the existing Meta webhook validator in §6
5. Only after signature verification passes: read event type, update Order.status, mark Product SOLD
```

If the `order_id` doesn't resolve to a local `Order`, or the signature check fails, respond 400 and do nothing else — never branch on payload contents before verification succeeds.

### 11.4 Checkout PII (address, phone)

- Shipping address is a per-order snapshot (`Order.shipping_address` JSON), not a reusable customer-profile entity — no customer account exists anywhere else in this app, so there is nothing to attach a reusable address to. Same "retailer-owned, not shared cross-tenant" principle as existing `Customer` PII (§9) applies to `Order.customer_name`/`customer_phone`.
- Retention: same 7-year GST/IT compliance window as `SubscriptionPayment` (see `docs/DATABASE.md` retention table) — orders are financial records, not marketing data, so they don't get the shorter customer-interaction retention windows.
- If a retailer disconnects their payment account, delete (not soft-delete) the encrypted key/secret columns immediately — a disconnected credential has no legitimate reason to persist, unlike business records which are soft-deleted by convention (§ Design Principles, `docs/DATABASE.md`).

### 11.5 Open items (must resolve before this ships, not deferred silently)

- Rate limiting on `/v1/public/webhooks/razorpay` and the checkout-creation endpoint (prevent an attacker from spamming order creation to lock a product in RESERVED status — needs a per-IP or per-session limit plus the auto-expiry cron already planned in `docs/PLAN.md`)
- Audit logging for payment-account connect/disconnect and for every order status transition (extends the existing `AuditLog` model, same as every other sensitive admin action in §8)
- Legal review of the Stage B (Route) compliance posture before enabling it for any retailer

### 11.6 Payment integrity — never trust the client for money

This is the section that answers "is it hacker-proof": no payment integration is "100% secure" as an absolute, but every known class of e-commerce payment attack below has a specific, standard mitigation. Skipping any one of these is how real breaches happen — this list is the actual bar, not a nice-to-have.

- **Amount tampering.** The checkout POST body must never include a trusted `total_amount` field. Server recomputes the order total from `OrderItem` × the *snapshotted* product price (`Product.price_min` at add-to-cart time, same snapshot principle as `docs/DATABASE.md` `OrderItem.price_snapshot`) before creating the Razorpay order. A client that submits a manipulated total gets silently overridden by the server-computed figure, never trusted.
- **Fake "success" callback.** Razorpay Checkout.js's client-side `handler` callback fires in the browser — a modified/scripted client could invoke it without a real payment ever happening. The client callback is allowed to update the UI optimistically ("confirming your payment…") but **must never by itself flip `Order.status` to `PAID`**. That transition only happens after either (a) the client-submitted `razorpay_payment_id`/`razorpay_order_id`/`razorpay_signature` triple is verified server-side via HMAC (Razorpay's documented payment-verification signature, distinct from the webhook signature in §11.3), or (b) the async webhook confirms it. Both paths converge on the same server-side verified transition — the webhook is the durable source of truth if the callback path is ever skipped (tab closed mid-payment, etc.).
- **Webhook replay.** An attacker who somehow captures a valid webhook payload could resend it. Mitigation: the `Order` status transition is idempotent — only `PENDING_PAYMENT → PAID` is a valid transition; a webhook for an already-`PAID` order is a no-op, not a re-process. Additionally reject webhooks whose Razorpay timestamp is older than a few minutes, narrowing the replay window even further.
- **Webhook source spoofing.** Signature verification (§11.3) is the primary control. Defense in depth: allowlist Razorpay's published webhook source IPs at the edge (Cloudflare, already in the stack) in addition to the signature check — belt and suspenders, not a substitute for the signature check.

### 11.7 Inventory race condition (double-sell)

This catalog models one `Product` row as one physical, one-off garment (`AVAILABLE`/`SOLD`, not a stock-count SKU) — so two customers checking out the same product at the same moment is a real double-sell risk, not a theoretical one. Order-creation must reserve the product with an atomic conditional update inside the same DB transaction as the `Order`/`OrderItem` insert:

```
UPDATE products SET status = 'RESERVED' WHERE id = ? AND status = 'AVAILABLE'
-- Prisma: updateMany({ where: { id, status: 'AVAILABLE' }, data: { status: 'RESERVED' } })
-- then check result.count === 1 — if 0, someone else got there first, reject the checkout
```

A read-then-write (`findUnique` check status, then separately `update`) is the classic TOCTOU bug here — two concurrent requests can both pass the read check before either writes. The conditional `updateMany` + rowcount check closes that window.

### 11.8 Retailer account takeover — a new risk this feature introduces

Every other feature in this app, a compromised retailer login costs that retailer their own data. This feature is different: a compromised retailer login lets an attacker **redirect where that retailer's future sale money goes** — by changing the connected `RetailerPaymentAccount` to an attacker-controlled Razorpay account. This is a materially higher-value target than anything else in the platform today and needs its own controls, not just the existing OTP login (§1):

- **Step-up re-authentication** (re-enter OTP) specifically on connect/change/disconnect of the payment account — not covered by an already-valid session token alone.
- **Out-of-band notification** (SMS/WhatsApp) to the retailer's registered phone whenever the payment account changes — so a real retailer notices an attacker's change even if the attacker is mid-session.
- **Audit log** every connect/change/disconnect with before/after state (extends existing `AuditLog`, §8) — already listed in §11.5, called out again here because it's the primary forensic trail for this specific risk.

### 11.9 PCI-DSS scope

Using Razorpay Checkout.js (hosted modal/iframe) means **raw card numbers never touch Kanchuki's servers or JavaScript execution context** — card entry happens inside Razorpay's own iframe. This keeps Kanchuki in the lightest PCI-DSS tier (SAQ-A: "fully outsourced payment processing"), not the heavy SAQ-D tier that applies to anyone who handles card data directly.

**This holds only as long as card entry stays inside Razorpay's hosted UI.** Never build a custom card-number/CVV input field — that would pull the platform into full PCI-DSS scope (network segmentation, quarterly ASV scans, annual audit) for no product benefit Razorpay's own hosted checkout doesn't already provide.

### 11.10 Anonymous order lookup (IDOR)

Checkout has no customer account (§11.4), so an order-status/confirmation page is keyed by `Order.id` alone unless deliberately hardened. `Order.id` is a non-guessable cuid2 (same convention as every other ID in this app, §2), but relying on ID-secrecy alone is weak defense if a link ever leaks via browser history, analytics tooling, or a shared screenshot. Require the checkout phone number as a second factor before rendering address/payment details on any order-lookup page — same bearer-plus-verification posture as the existing `revocation_token` pattern (§3c), not full authentication, but not ID-alone either.
