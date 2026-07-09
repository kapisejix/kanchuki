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
  → AI processes (CatVTON API call)
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
CATVTON_API_URL=...           # CatVTON self-hosted endpoint
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
- CatVTON (VTO): self-hosted, no third-party data sharing

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
