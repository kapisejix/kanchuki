# Kanchuki — Security Model

**Version:** 1.1  
**Date:** July 2026  
**Standard:** OWASP Top 10, India PDPB (Personal Data Protection Bill)  
**Skill reference:** `security-and-hardening`, `security-review`

---

## Security Priorities

1. **Customer photo privacy** — product photos are retailer-owned; customer-uploaded photos are not collected (Virtual Try-On removed 2026-08-31)
2. **Retailer data isolation** — no cross-tenant data leakage
3. **Authentication** — phone OTP with rate limiting, no password guessing
4. **AI cost abuse** — prevent malicious actors from triggering expensive AI calls
5. **WhatsApp token security** — Meta API credentials must never be exposed
6. **Operational control** — no automated operations without explicit admin approval

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

## 3. Customer Photo Privacy (VTO) — REMOVED

Virtual Try-On was removed in `chore/remove-unwanted-features` (2026-08-31,
migration 082). No customer photo is uploaded for garment compositing anywhere
in the product any more; `try_on_jobs`, `customer_measurements` and their R2
prefixes (`try_on_jobs/`, `tryon-results/`, `tryon-preprocessed/`) no longer
exist. §§3b and 3c below (training-data consent + revocation) are removed with
it. See `docs/references/history/reports/2026-08-31-feature-teardown-spec.md`.

---

## 3b. Training-Data Consent — REMOVED

Removed with Virtual Try-On (`chore/remove-unwanted-features`, 2026-08-31).
`training_photo_consents`, the `training-data/` R2 prefix, the 180-day cleanup
cron and the consent-version tracking no longer exist.

**Retailer-facing notice (2026-09-24):** because no photo is collected for
training any more, the notice that replaces the old consent copy states that
directly — "we do not use your photos to train AI models" — together with what
photos *are* used for and the 15-day deletion window. Live at
`https://kanchuki.app/privacy` → *Product photos and AI training* (reachable
from the app's Settings → Legal). Copy + assertions recorded for legal review
in `docs/references/guides/photo-retention-notice.md`.

---

## 3c. Training-Data Consent Revocation — REMOVED (was: F-102d — token-based, no login)

Removed with Virtual Try-On (`chore/remove-unwanted-features`, 2026-08-31). The
`/consent/revoke` endpoint, `revocation_token`, and the whole training-data
deletion flow no longer exist.

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
DATABASE_URL_REPLICA=postgresql://...  # Read-replica / backup database
BACKUP_DATABASE_URL=postgresql://...   # Cold backup / disaster recovery
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
META_APP_SECRET=...           # Phase 2
META_VERIFY_TOKEN=...         # Phase 2
ENCRYPTION_MASTER_KEY=...     # F-012 secrets encryption
ADMIN_EMAIL=admin@kanchuki.com
ADMIN_PASSWORD_HASH=...       # scrypt salt:hash format
ADMIN_TOTP_SECRET=...         # Google Authenticator compatible
ADMIN_API_KEY=...             # API key for admin endpoints
ADMIN_IP_ALLOWLIST=...        # Comma-separated IPs/CIDRs
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
| Customer preferences (colour/style/budget/size) | PII (retailer-entered) | CRM | Until customer deleted by retailer |
| Collection view data | Anonymous session | Analytics | 90 days |
| Payment data | Financial | Billing compliance | 7 years |

### Data Subject Rights (Customer)

Customers can:
- Request deletion of their CRM record (via retailer)
- Opt-out of WhatsApp messages (Phase 2)

### Data Processing Agreements

- Anthropic (Claude API): DPA in place, data not used for training
- OpenAI (Embeddings): DPA in place, data not used for training

---

## 10. Security Testing Checklist

Before each major release:

- [ ] Run Prisma query audit (no raw queries with user input)
- [ ] Run `npm audit` for dependency vulnerabilities
- [ ] Test IDOR: can retailer A access retailer B's resources?
- [ ] Test rate limiting: trigger OTP limit, AI tagging limit
- [ ] Test file upload: upload non-image (PDF, EXE) — must reject
- [ ] Test collection link: unauthenticated user can view but not admin
- [ ] Test JWT expiry: expired token → 401
- [ ] Verify no secrets in git history (trufflehog scan)
- [ ] Verify CSP headers on all pages
- [ ] Run security test suite: `npx vitest run src/routes/security.test.ts`
- [ ] Run admin login test suite: `npx vitest run src/routes/admin.login.test.ts`

**Skill reference:** Use `security-bounty-hunter` skill for pre-launch audit.

---

## 11. L2 Ecommerce Checkout — Retailer Payment Credentials — REMOVED

Removed in `chore/remove-unwanted-features` (2026-08-31, migration 082). The
`orders` / `order_items` / `retailer_payment_accounts` tables, the enums
`PaymentMode` / `RouteOnboardingStatus` / `OrderStatus`, the `/checkout/*` and
`/public/webhooks/razorpay` route trees, and all customer cart/checkout UI are
gone; retailer Razorpay credentials are no longer stored or accepted. Kanchuki's
own Razorpay account still handles **subscription billing** (see the Billing
section) — that path is unchanged, as is the `IntegrationSetting` /
`encryptSecret()` machinery it shares with F-012.

If retailer-facing checkout is rebuilt later, the RBI payment-aggregator
constraint still applies: Kanchuki's billing account must never custody a
retailer's sale money without a PA licence or a Razorpay Route
merchant-of-record arrangement signed off by legal.

---

## 12. Operational Governance — No Auto-Operations Without Approval

**NEW — July 2026.** This section defines the governance model: no operation runs without explicit human approval.

### 12.1 Principle

Kanchuki follows a **human-in-the-loop** model for every operation that affects production data, deployment, or API credentials. Automated systems (cron jobs, CI/CD, AI agents) may propose actions but must never execute them without explicit approval from an authorized human.

### 12.2 Operations Requiring Approval

| Operation | Approval Gate | Mechanism |
|-----------|---------------|-----------|
| Deployment to production | ✅ Required | Manual `git push` to `main` + approval in Railway dashboard |
| Database schema migration | ✅ Required | Manually run `prisma migrate deploy` via admin panel button |
| Database backup | ✅ Required | Manually triggered from admin dashboard |
| Database restore | ✅ Required | Manually triggered + confirmation dialog |
| Delete retailer data | ✅ Required | Admin panel with confirmation + audit log |
| Change payment credentials | ✅ Required | Step-up OTP + admin approval |
| Add/modify admin users | ✅ Required | TOTP-authenticated admin + audit log |
| Modify plan limits/pricing | ✅ Required | Admin panel with before/after logged |
| Modify plan feature matrix (F-013) | ✅ Required | Admin panel with before/after logged |
| Suspend/unsuspend retailer or staff account (F-015) | ✅ Required | Admin panel, reason required, audit log |
| Block/unblock a customer (F-015) | ✅ Required | Admin panel, reason required, audit log |
| Restore a record from the Deletion Vault (F-016) | ✅ Required | Admin panel, manual, audit log — never automated |
| Billing change (extend trial, change plan) | ✅ Required | Admin panel with audit log |
| AI model configuration changes | ✅ Required | Admin panel (not via env vars alone) |
| API key rotation | ✅ Required | Admin integrations screen |
| Export customer/sales data | ✅ Required | Admin panel with audit log |
| Trigger bulk notifications to retailers | ✅ Required | Admin panel with confirmation |
| Send test emails/SMS | ✅ Required | Admin panel |

### 12.3 Operations That Run Automatically (Approved)

The following are stateless, non-destructive, or time-critical — they run without approval:

| Operation | Why Auto |
|-----------|----------|
| Cache invalidation / Redis TTL | Performance, no data impact |
| Rate limit counters | Performance, no data impact |
| Collection view analytics | Read-only aggregation |
| Email/SMS delivery (system-generated) | Already consented at signup |

---

## 13. Database Backup & Disaster Recovery

### 13.1 Architecture

Kanchuki maintains **three database layers** for maximum safety:

| Layer | Purpose | Provider | Access |
|-------|---------|----------|--------|
| **Primary** (Supabase) | Live runtime — all reads/writes | Supabase PostgreSQL 16 | API server, admin dashboard (read-only) |
| **Replica / Warm Standby** | Read-replica for admin queries, analytics | Separate PostgreSQL instance (Railway/independent) | Admin dashboard (read-only) |
| **Cold Backup** | Disaster recovery, point-in-time restore | Separate provider (e.g., independent VPS or backup service) | Admin dashboard (trigger restore) |

### 13.2 Backup Schedule

| Backup Type | Frequency | Retention | Target |
|-------------|-----------|-----------|--------|
| Continuous WAL archiving | Real-time | 7 days | Supabase built-in |
| Daily full backup | Every 24h | 30 days | Replica database |
| Weekly full backup | Every Sunday | 12 months | Cold backup database |
| Monthly archive | 1st of month | 7 years | Cold backup (GST compliance) |
| Manual backup | On demand | Permanent (until manually deleted) | Admin dashboard trigger |

### 13.3 What's Implemented vs Not Implemented

**Backup and query infrastructure — mostly built:**

- [x] **`BACKUP_DATABASE_URL` env var** — can be set for backup target
- [x] **Backup automation script** — `apps/api/src/jobs/backup-database.ts` (BullMQ job)
- [x] **Admin dashboard backup page** — `/admin/database/backup` with trigger, list, restore UI
- [x] **Admin dashboard restore page** — restore button per backup entry with confirmation dialog
- [x] **Admin query runner** — `/admin/database/query` read-only SQL console against replica
- [x] **Scheduled backup cron** — daily (2 AM) + weekly (Sunday) BullMQ jobs at `apps/api/src/jobs/index.ts`
- [ ] **Backup integrity check** — automated restore verification on the replica (not yet built)
- [ ] **Disaster recovery runbook** — step-by-step recovery procedure (not yet written)

### 13.4 `.env` Changes Required

```bash
# Add to .env.example, .env, and all deployment environments:
BACKUP_DATABASE_URL=postgresql://user:password@backup-host:5432/kanchuki_backup
```

---

## 14. Admin Dashboard — Database Console & Backup Management

### 14.1 Required Features (Not Built)

The admin dashboard needs the following **new pages** and API endpoints:

#### Backend API Endpoints (all under `/v1/admin/`)

| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| `POST` | `/admin/backup/create` | Trigger a full database backup | ✅ Built |
| `GET` | `/admin/backups` | List all available backups with metadata | ✅ Built |
| `POST` | `/admin/backups/:id/restore` | Restore database from a specific backup | ✅ Built |
| `DELETE` | `/admin/backups/:id` | Delete a specific backup | ✅ Built |
| `POST` | `/admin/query` | Run a read-only SQL query against the replica | ✅ Built |
| `GET` | `/admin/query/history` | List recent queries with results | ❌ Not built (query history not persisted) |
| `GET` | `/admin/database/status` | Database connection status, size, table counts | ✅ Built |

#### Admin Dashboard Pages (Next.js)

| Route | Purpose | Status |
|-------|---------|--------|
| `/admin/database` | Database management hub (landing page) | ❌ Not built (no separate hub, links go directly to pages) |
| `/admin/database/backup` | Create and manage backups | ✅ Built |
| `/admin/database/query` | SQL query console (read-only) | ✅ Built |
| `/admin/database/status` | DB health, size, connection info | ✅ Built |
| `/admin/audit-log` | View audit log entries with filters | ✅ Built |

### 14.2 Query Runner Security

The SQL query runner must:
- Connect **only** to the replica/backup database, never to the primary
- Enforce **read-only** mode — block `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`
- Set a **statement timeout** (e.g., 30 seconds)
- Set a **row limit** (e.g., 1000 rows returned)
- Log every query with: admin identity, timestamp, SQL text (truncated to 500 chars), duration, row count
- Never return raw `DATABASE_URL` or connection strings to the client

---

## 15. AI Agent & Automation Control

### 15.1 Principle

No AI agent (Claude, GPT, or any LLM) can execute destructive, mutating, or financially-impactful operations without explicit human authorization. This applies to:
- The AI coding assistant editing this codebase
- Any future AI agent integrated into the platform
- Automated scripts and cron jobs
- CI/CD pipeline actions

### 15.2 Controlled Operations for AI Agents

| Operation | Allowed? | Condition |
|-----------|----------|-----------|
| Read files | ✅ Yes | Always |
| Search code | ✅ Yes | Always |
| Propose code changes | ✅ Yes | Always |
| **Apply code changes** | ⚠️ **Review Required** | Human must review diff before approving |
| **Run database migrations** | ❌ **Never** | Only from admin dashboard with approval |
| **Modify production env vars** | ❌ **Never** | Only through admin integrations screen |
| **Trigger deployment** | ❌ **Never** | Manually via Railway dashboard |
| **Modify CI/CD config** | ❌ **Never** | Requires PR review + merge |
| Run tests | ✅ Yes | Read-only, no side effects |
| Run typecheck | ✅ Yes | Read-only, no side effects |
| Generate documentation | ✅ Yes | Read-only |
| Answer questions | ✅ Yes | Read-only |
| Start local dev server | ✅ Yes | Local only |
| Install npm packages | ⚠️ **With oversight** | Must not modify lockfile without review |

### 15.3 CLAUDE.md Policy

The `CLAUDE.md` file at the project root contains the AI agent's operational instructions. It must always include:

```markdown
## AI Agent Operational Control
- This AI agent MUST NOT modify production environment variables
- This AI agent MUST NOT trigger deployments
- This AI agent MUST NOT run database migrations
- This AI agent MUST NOT execute terminal commands that modify the production database
- This AI agent MUST present all code changes for human review before applying
- THIS FILE (CLAUDE.md) must only be modified by a human or with explicit human approval
```

### 15.4 Enforcement

Since AI agent compliance is **advisory** (agents follow instructions but can't be technically restricted from reading/writing files), the following technical controls complement the policy:

- **Pre-commit hooks** — block commits containing hardcoded secrets or connection strings (via `.husky/pre-commit` or `.git/hooks/pre-commit`)
- **CI pipeline** — separate build/test from deploy steps; deploy requires manual Railway approval
- **Branch protection** — `main` branch requires PR review for all changes
- **Secrets scanning** — automated scanning for secrets in commit history
- **Environment separation** — production credentials never available in local development

---

## 16. Admin Control Center — Full Ownership

### 16.1 What You (The Admin) Control

| Resource | How You Control It | Status |
|----------|-------------------|--------|
| **Who can login** | Admin TOTP + IP allowlist | ✅ Implemented |
| **Secrets & keys** | Admin integrations screen (encrypted) | ✅ Implemented |
| **Plan limits & pricing** | Admin plan-limits screen | ✅ Implemented |
| **Retailer limits** | Per-retailer overrides | ✅ Implemented |
| **Retailer accounts** | View, extend trial, change plan, delete | ✅ Implemented |
| **Background images** | Upload, toggle, delete | ✅ Implemented |
| **Audit logs** | All admin actions logged | ✅ Implemented |
| **Database backups** | Manual trigger, schedule, restore page | ✅ Implemented |
| **Database queries** | Read-only SQL console at /admin/database/query | ✅ Implemented |
| **Database health** | Status page at /admin/database/status | ✅ Implemented |
| **Deployment control** | Deployment gate page at /admin/operations/gate | ✅ Implemented |
| **Rate limit tuning** | Rate limits page at /admin/settings/rate-limits | ✅ Implemented |
| **AI model config** | AI config page at /admin/settings/ai-config | ✅ Implemented |
| **Notification center** | Pending approvals at /admin/operations/pending | ✅ Implemented |
| **Plan feature matrix (F-013)** | Checkbox grid per plan tier, live toggle at /admin/plan-features | ✅ Implemented |
| **Retailer/customer activity tracking (F-014)** | Activity pages at /admin/activity, /admin/retailers/:id/activity | ✅ Implemented |
| **Account suspension (F-015)** | Suspend/unsuspend retailer/staff, block/unblock customer UI | ✅ Implemented |
| **Deletion Vault (F-016)** | Vault lookup page at /admin/database/deletion-vault | ✅ Implemented |
| **DB guardrails (F-017 / §19)** | Role separation + triggers + CI guard + purge cron | ✅ Implemented |

### 16.2 One Dashboard to Rule Everything

The admin dashboard should eventually become a **single control center** with:

```
Admin Dashboard
├── Overview (stats, recent activity, alerts)
├── Retailers (list, detail, actions)
├── Subscriptions (plans, billing, invoices)
├── Database (NEW)
│   ├── Status — connection health, size, table counts
│   ├── Backup — create, list, restore
│   └── Query Console — read-only SQL with history
├── Operations (NEW)
│   ├── Pending Approvals — operations awaiting your okay
│   ├── Audit Log — all actions with filters
│   └── Deployment Log — recent deploys with status
├── Integrations (F-012)
├── Plan Limits (F-010)
├── Background Images (F-011)
└── Settings (admin accounts, IP allowlist, TOTP config)
```

---

## 17. Future Security Roadmap

### Phase A (Next Sprint) — Foundation

- [ ] **Backup database setup** — provision second PostgreSQL instance, wire `BACKUP_DATABASE_URL`
- [ ] **Backup script** — `scripts/backup-database.ts` for manual and scheduled backups
- [ ] **Admin database page** — `/admin/database` with status view
- [ ] **Admin backup page** — create, list, download backups

### Phase B (Month 2) — Query & Monitor

- [ ] **Admin query runner** — read-only SQL console against replica
- [ ] **Scheduled backup cron** — daily + weekly automated backups
- [ ] **Backup integrity check** — automated verification
- [ ] **Database status monitoring** — size, connections, replication lag

### Phase C (Month 3) — Full Control

- [ ] **Admin notification center** — pending operations requiring approval
- [ ] **Deployment approval workflow** — manual gate in CI/CD
- [ ] **Rate limit live tuning** — adjust without redeploy
- [ ] **AI model config UI** — switch models, adjust parameters
- [ ] **Disaster recovery runbook** — step-by-step documented procedure

### Phase D (Month 4) — Permission Matrix, Trust & Safety, DB Guardrails

- [x] **`plan_features` table + `/admin/plan-features` grid** (F-013)
- [x] **`hasFeature()` gate wired into every plan-gated route** (F-013)
- [x] **`AuditLog` writes added to all retailer/staff mutation routes** — schema already exists, most routes don't call it yet (F-014)
- [x] **Admin activity pages**: `/admin/retailers/:id/activity`, `/admin/retailers/:id/customers/:id/activity`, `/admin/activity` (F-014)
- [x] **Suspension fields + admin suspend/unsuspend UI** (F-015)
- [x] **Customer block/unblock + enquiry rejection for blocked customers** (F-015)
- [x] **Provision `VAULT_DATABASE_URL` Postgres instance, INSERT-only role** (F-016)
- [x] **`vaultDelete()` helper wired into every soft-delete call site** (F-016)
- [x] **`/admin/database/deletion-vault` lookup page** (F-016)
- [x] **Postgres role separation** — revoke DELETE/TRUNCATE/DROP/ALTER/CREATE from the app runtime role (§19)
- [x] **`BEFORE DELETE OR TRUNCATE` triggers** on business tables (§19)
- [x] **CI grep guard** blocking raw `.delete()` on business models outside the purge-cron allowlist (§19)

---

## 18. Compliance & Audit

### 18.1 Audit Log Schema

The `AuditLog` model in Prisma already exists. All admin actions must log:

| Field | Example |
|-------|---------|
| `actor_id` | `admin_001` |
| `actor_type` | `admin` |
| `action` | `CHANGE_PLAN` |
| `resource_type` | `Retailer` |
| `resource_id` | `retailer_abc` |
| `metadata` | `{"before": {"plan": "STARTER"}, "after": {"plan": "GROWTH"}}` |
| `ip_address` | `103.45.67.89` |
| `created_at` | `2026-07-25T10:00:00Z` |

### 18.2 Audit Log Viewer

An audit log viewer page (`/admin/audit-log`) must be built with:
- Filter by action type, actor, resource, date range
- Expandable rows showing before/after metadata
- Export to CSV for compliance reporting
- Retention: 3 years minimum

---

## 19. Database Guardrails — Preventing AI-Agent/Application Delete Access (F-017, built)

**Added 2026-07-26.** §15 already states policy ("AI agents must never run migrations or destructive commands"), enforced today only by advisory instructions in `CLAUDE.md`. This section is the **technical** enforcement layer — a Postgres permission error, not just an instruction an agent could misread or a bug could bypass. Layered defense: any one layer failing still leaves the others standing.

### 19.1 Layer 1 — Postgres role separation (the actual control)

| Role | Grants | Who/what holds credentials |
|---|---|---|
| `kanchuki_app` | `SELECT, INSERT, UPDATE` on all business tables. **No `DELETE`, `TRUNCATE`, `DROP`, `ALTER`, `CREATE`.** | API server (`DATABASE_URL`), local dev, any AI coding agent's working `.env` |
| `kanchuki_migrator` | Full DDL + `DELETE`/`TRUNCATE`, for schema migrations only | Human only — run interactively via `prisma migrate deploy` or the admin dashboard's migration-trigger button (§12.2). **Never** written to any `.env` file, Railway env var used by the API service, or any location an AI agent's session can read. |
| `kanchuki_purge` | `SELECT, INSERT, UPDATE` (inherits `kanchuki_app`) + `DELETE` on exactly the purge-cron tables. **No `TRUNCATE`, `DROP`, or DDL.** | `PURGE_DATABASE_URL` — read **only** by the 30-day purge cron (`apps/api/src/jobs/purge-soft-deleted.ts` via `getPurgePrisma()`). Never used as `DATABASE_URL`. The job still sets `app.allow_hard_delete = 'true'` inside each transaction, so the Layer-2 triggers remain the second barrier even for this role. |
| `kanchuki_vault_writer` | `INSERT` only on `deletion_vault` DB (F-016) | App's vault-write path only |
| `kanchuki_replica_reader` | `SELECT` only, against the replica (§13/§14) | Admin query console |

#### Role Creation SQL

Run these commands as a Postgres superuser (e.g., `postgres` role) against the primary database:

```sql
-- Create the application role — used by the API server, local dev, and AI coding agents
CREATE ROLE kanchuki_app WITH LOGIN PASSWORD 'generate-a-strong-password';
GRANT CONNECT ON DATABASE kanchuki TO kanchuki_app;
GRANT USAGE ON SCHEMA public TO kanchuki_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO kanchuki_app;
REVOKE DELETE, TRUNCATE, DROP, ALTER, CREATE ON ALL TABLES IN SCHEMA public FROM kanchuki_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO kanchuki_app;

-- Create the migrator role — human-only, never in any .env file
CREATE ROLE kanchuki_migrator WITH LOGIN PASSWORD 'generate-a-different-password' INHERIT;
GRANT kanchuki_app TO kanchuki_migrator; -- inherits app-level SELECT/INSERT/UPDATE
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kanchuki_migrator;
-- Full privileges on future tables too
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO kanchuki_migrator;

-- The 30-day purge cron uses the dedicated kanchuki_purge role (DELETE on the
-- purge tables only, connected via PURGE_DATABASE_URL, never DATABASE_URL) —
-- see scripts/setup-role-separation.sql. It sets the app.allow_hard_delete
-- session flag inside each transaction to pass the Layer-2 triggers.
```

After creating the roles, update `DATABASE_URL` in `.env` and Railway to use `kanchuki_app` credentials.

The `kanchuki_migrator` credentials must **never** appear in any `.env` file or Railway env var that the API server or any AI coding agent's session can read. Only a human operator running `prisma migrate deploy` interactively should use them.

This is the load-bearing control: even a fully-trusted, fully-compromised, or simply buggy line of application code (written by a human or an AI agent) **cannot** issue a `DELETE`/`DROP`/`TRUNCATE` against the primary database, because the credentials it runs with don't have that grant at the database level. Application-layer soft-delete conventions (`deleted_at`) become the only way to remove data through `kanchuki_app` — not a convention anyone has to remember to follow correctly.

#### Row-Level Security must name the backend roles explicitly (RC-030)

PRIVILEGES and RLS are two different checks, and the first one being right says nothing about the second. 50 tables carry `ENABLE ROW LEVEL SECURITY`; **every policy in the schema targets `authenticated` or `anon`** — the Supabase PostgREST roles — and **not one names `kanchuki_app` or `kanchuki_purge`**, the roles the backend actually connects as. RLS is default-deny, and for `SELECT`/`UPDATE`/`DELETE` a denial is not an error: the statement succeeds and affects **zero rows**. Nothing logs, nothing fails, the transaction commits.

So the backend's access to all 50 tables rested on `pg_class_ownercheck`: `kanchuki_purge` is a member of `kanchuki_app`, so for any table `kanchuki_app` **owns**, both roles are treated as owners and skip RLS entirely. That worked — but it is an accident of which role happened to run which migration (base schema via Prisma, 083–089 via the admin runner on `DATABASE_URL_MIGRATOR`, others from dev machines on the `kanchuki_app`-scoped `.env`), it is per-table, and nothing verified or documented it. Where it did not hold, the operation deleted nothing and reported success.

Migration `111_backend_role_rls_policies` replaces the accident with an explicit `FOR ALL` policy naming both backend roles, for the 24 tables the purge path touches. Three details are load-bearing:

- **`FOR ALL`, not `FOR DELETE`.** `purgeTable()` selects a batch of ids and exits its loop when the batch is empty; `fetchR2Keys()` selects keys before the rows go; `purgeChildren()` scopes its `DELETE` through `SELECT id FROM retailers`. Under a `DELETE`-only policy every one of those `SELECT`s still returns nothing — the sweep would keep silently deleting nothing *while a policy sat there making it look fixed*.
- **`USING (true)` is not a widening.** The policy names only the two backend roles, it is `PERMISSIVE` (so it ORs with the existing `authenticated`/`anon` policies rather than replacing them), and RLS is a filter — it cannot grant a privilege. `kanchuki_app` still cannot `DELETE`, because the `REVOKE DELETE` above is a privilege check that runs *before* RLS is consulted. The PostgREST isolation is untouched.
- **A policy, not `ALTER ROLE … BYPASSRLS`.** `BYPASSRLS` needs superuser, so it could only ever be applied by hand in the SQL Editor and could never ride `prisma migrate deploy` — exactly the RC-029 failure (a fix that lives only in a hand-run script). A per-table policy is ordinary DDL, and it keeps the grant visible in the schema instead of silently covering future tables.

`apps/api/src/jobs/purge-rls-policy.test.ts` re-derives the required set from `schema.prisma`, the migration history and both purge jobs, and fails if migration 111's array drifts from it in **either** direction — a missing entry means a sweep that silently does nothing, a stale one is the RC-029 failure returning. `purge-rls-live.test.ts` is the executed proof (opt-in, `PURGE_RLS_TEST_DATABASE_URL`): it runs the same `CREATE POLICY` statement the migration runs against scratch tables and shows (a) no policy → row survives silently, (b) `FOR DELETE` → row *still* survives, (c) migration 111's policy → the row goes.

### 19.2 Layer 2 — DB triggers (belt-and-suspenders)

```sql
CREATE OR REPLACE FUNCTION prevent_hard_delete() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_hard_delete', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Hard delete blocked by guardrail trigger on %', TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Applied to every business table (products, customers, retailers, collections, ...)
CREATE TRIGGER guard_products_delete
  BEFORE DELETE OR TRUNCATE ON products
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_hard_delete();
```

Only the purge-cron job (running as the `kanchuki_purge` scoped role via `PURGE_DATABASE_URL`, with `SET app.allow_hard_delete = 'true'` granted narrowly to it) can clear the session flag that lets this pass. Even if `kanchuki_app` somehow retained DELETE (misconfiguration, role change mistake), the trigger still blocks it — and the purge role itself is blocked by the same trigger unless it sets the flag.

### 19.3 Layer 3 — Code-level guard (CI)

- No raw `prisma.<model>.delete()` calls on business models anywhere in the codebase except the allowlisted purge-cron file (`apps/api/src/jobs/purge-soft-deleted.ts`, once built)
- CI grep check (same mechanism as the existing secrets-scanning pre-commit hook, §15.4): fails the PR if a new raw `.delete(` call appears on a business model outside that allowlist
- Same check flags raw `DROP TABLE`/`TRUNCATE`/`DELETE FROM ... ` (no WHERE) in any `.sql` file outside `packages/db/prisma/migrations/`

### 19.4 Layer 4 — Deletion Vault (F-016) as the recovery backstop

If every guardrail above somehow fails (compromised `kanchuki_migrator` credentials, a Postgres admin-level breach), the Deletion Vault (`docs/database/DATABASE.md` "Deletion Vault") is a **separate database, separate provider, separate credentials, INSERT-only even for the app**. A primary-DB compromise that can delete data cannot also delete the vault's copy of that data, because the vault's write path never has UPDATE/DELETE grants to begin with — not even accidentally.

### 19.5 What this does NOT protect against

Being direct about the actual threat model, not just checklisting: role separation stops the *application/agent* layer from deleting data. It does **not** stop someone with direct Supabase dashboard / Postgres superuser access from doing so — that's a separate control (Supabase org access restricted to named humans, MFA required, §7 Secrets Management). An AI coding agent operating through Claude Code never has Supabase dashboard credentials, only whatever `DATABASE_URL` sits in the local `.env` — so keeping `kanchuki_app`-scoped (not `postgres` superuser) credentials in that `.env` is the actual thing that matters here, not a policy statement in `CLAUDE.md` alone.

### 19.6 What was built (2026-07-26)

| Component | File | Status |
|---|---|---|
| **Postgres role separation** | Infra config — REVOKE DELETE/TRUNCATE/DROP/ALTER/CREATE from `kanchuki_app` | Docs in §19.1, apply via `psql` as superuser |
| **`BEFORE DELETE OR TRUNCATE` triggers** | `packages/db/prisma/migrations/037_db_guardrails/migration.sql` | ✅ Migration with `prevent_hard_delete()` function + triggers on 8 business tables |
| **CI grep guard** | `scripts/check-delete-guard.sh` | ✅ Scans for `.delete()` on business models + destructive SQL outside migrations. Added to `.github/workflows/ci.yml` |
| **Allowlist** | `apps/api/src/jobs/purge-soft-deleted.ts` (once built) | ✅ Placeholder in grep guard — only this file can hard-delete |

---

**Document version:** 1.2  
**Last updated:** July 26, 2026  
**Next review:** October 2026 or before any major deployment

---

## Disaster Recovery Runbook

> Merged from the former `docs/references/guides/disaster-recovery.md`.


**Audience:** owner / on-call operator. **Last reviewed:** 2026-09-24.
**Scope:** production (`api.kanchuki.app`, `kanchuki.app`, the Kanchuki mobile app).

> **Read this before you need it.** Every scenario below assumes you are under pressure.
> Steps that are dashboard-only are marked **(dashboard)**; steps that need a terminal are
> marked **(CLI)**. Nothing in this document authorizes a destructive action without a
> verified backup — when in doubt, stop and take another backup first.

---

#### 0. What's where (data inventory)

| Data | Where it lives | Backup story | Loss impact |
|---|---|---|---|
| Retailers, products, photos metadata, customers, collections, subscriptions, referral ledger, audit log | **Supabase Postgres 16** (prod project; pooled `DATABASE_URL` for traffic, direct non-pooler connection for migrations) | Supabase **automated daily backups + Point-in-Time Recovery** (plan-dependent retention — check the dashboard, don't assume) | **Severe** — this is the business. Recovered by PITR, not by re-running code. |
| Product photos, banners, logos, generated images, invoices, showcase designs | **Cloudflare R2** bucket `kanchuki-prod` (+ other buckets) | No versioning configured by default — **verify in the R2 dashboard** | **Severe for photos** — DB rows reference R2 keys; losing objects breaks every image. |
| Session state, rate-limit counters, OTP slots, BullMQ job queues + repeatable schedules, public-response cache | **Upstash Redis** | **None — treated as ephemeral** | **Low for data, medium for operations**: in-flight jobs are lost and repeat schedules must be re-registered (see §6). OTP slots are 10-minute-lived anyway. |
| Deletion Vault (snapshots of hard-deleted records) | **Separate Railway Postgres** (`VAULT_DATABASE_URL`, INSERT-only `vault_app`) | Railway Postgres backups (verify in dashboard) | **Medium** — compliance/audit value, not live traffic. |
| App + API containers | **Railway** (two services: API, Web) | Deploys are rebuilt from **GitHub `main`**; Railway keeps the last N deployments for rollback | **Low** — a rebuild restores the app. |
| Fashion V-Tone (try-on) service | Self-hosted on **Hetzner CX43**, shared-secret auth | Rebuildable from the repo + model weights re-download | **Low/medium** — try-on degrades; it is not in the MVP launch path. |
| Secrets / config | Railway service variables + Admin → Integrations (DB-backed) | Not backed up by us; recoverable from the owners' password managers | **High if lost** — see §7. |

##### Targets

| Metric | Target | Reality |
|---|---|---|
| **RPO** (max data loss) | ≤ 24 h, ideally minutes | Bounded by Supabase backup/PITR granularity. **Confirm the actual retention on the Supabase plan — this is an owner action, not a code fact.** |
| **RTO** (time to restore) | ≤ 4 h for DB; ≤ 30 min for a bad deploy | PITR restore is the long pole and is done by Supabase, not us. |

---

#### 1. Before anything else (first 5 minutes of any incident)

1. **Stop writing.** If the corruption is ongoing (a runaway job, a bad migration, a rogue bulk delete), the fastest way to bound the damage is to stop the writers.
   - **(dashboard)** Railway → API service → **⋯ → Pause** (or scale to 0). Web can stay up; it will show API errors, which is honest.
2. **Write down the time** (IST and UTC). Every recovery point is expressed relative to this.
3. **Do not run `railway up`.** Ever. It ships your laptop's files, not GitHub's — that is a documented cause of real incidents here. Redeploy from GitHub only.
4. **Open a timeline doc** and timestamp every action. Post-incident review depends on it.
5. **Announce** (retailers on WhatsApp/status page if the outage is visible; internal team in the ops channel).

---

#### 2. Scenario A — Database loss or corruption (Supabase Postgres)

**Symptoms:** mass 500s, `relation does not exist`, data visibly wrong/reverted, a bad migration applied.

##### 2a. Recover from a bad migration (most common)

If the migration only *added* something, roll forward with a corrective migration (preferred — never hand-edit prod). If it *destroyed* data:

1. **(dashboard)** Supabase → your project → **Database → Backups**. Confirm the newest
   pre-incident restore point.
2. **Clone first, restore second.** Create a **restore to a new project / branch**, not over
   the live one. Verify the data there.
3. Only after verification, point `DATABASE_URL` / `DATABASE_URL_POOLER` at the restored
   instance **(dashboard)** Railway → API service → Variables. Railway restarts the service.
4. Re-run any migrations that landed *after* the restore point but are still wanted:
   **(CLI)** from `packages/db`, with the **migrator** URL only:
   ```bash
   DATABASE_URL="$DATABASE_URL_MIGRATOR" npx prisma migrate deploy
   ```
   ⚠️ Migrations 083–089 and 063/104–117 were applied **by hand from the Supabase SQL
   Editor**, so `_prisma_migrations` has **zero rows** for them. `migrate deploy` may try to
   re-apply them. Check `docs/database/` and the migration files' own idempotency before
   running it against a restored DB; when unsure, apply the missing ones by hand and insert
   the `_prisma_migrations` rows to reconcile.
5. **(CLI)** Verify: `curl https://api.kanchuki.app/health` → `{"status":"ok"}`.

##### 2b. PITR (point-in-time) restore

Same shape as 2a but with a timestamp: Supabase → **Backups → Point in Time**, pick the last
known-good moment (just before the incident start in §1.2), restore to a **new** instance,
verify, then repoint. Do not restore over live.

##### 2c. Lost the pooler suffix / role passwords

Connection failures with `password authentication failed` are usually **not** a database
incident. Supabase pooler usernames **must** be `<role>.<project_ref>` (e.g.
`kanchuki_app.thpqcylmcxokajxoerjx`) — a bare `kanchuki_app` is rejected. See
`docs/INFRA-SETUP.md` for the role list (`kanchuki_app`, `kanchuki_migrator`,
`kanchuki_purge`, `vault_app`) and re-run `scripts/setup-role-separation.sql` if roles are
missing.

##### 2d. Deletion Vault

If `VAULT_DATABASE_URL` is down, vault writes fail but request traffic continues (the vault is
a write-only side channel). Restore the Railway Postgres from its own backups. The vault is
**INSERT-only by design** — never "fix" it by granting SELECT/UPDATE to `vault_app`.

---

#### 3. Scenario B — Bad deploy / bad build (Railway)

**Symptoms:** 502s, crash loop, a feature regression that shipped, a build that succeeded but
behaves wrong.

1. **(dashboard)** Railway → the affected service → **Deployments** → pick the last known-good
   deployment → **Redeploy**.
   - Prefer **Redeploy** (re-runs the build from that deployment's commit) over a rollback
     hack. It keeps "Deployed via GitHub" true.
2. Confirm the deploy source reads **"Deployed via GitHub"**. If it says "Deployed via CLI",
   someone ran `railway up` — flag it, and re-deploy from GitHub to make the state honest.
3. If the failure is the **web** service only and *every* path 502s with
   `x-railway-fallback: true`, this is the **domain-target-port drift** documented in
   `docs/DEPLOY.md` — the container is healthy but the edge routes to the wrong port. Fix it
   without a redeploy:
   - **(CLI)** `railway domain list --service <name>` vs the app's logged listening port.
   - **(CLI)** `railway domain update --port <actual-port> <domain-id> --service <name>`.
4. If the deploy failed because of an **env var** change, fix the variable and use
   **(dashboard) Redeploy** — no code change needed.

**Guardrail:** the deploy flow is *push to `main` → Railway auto-deploys*. There is no
supported path that deploys from a local working copy.

---

#### 4. Scenario C — R2 storage loss / accidental object deletion

**Symptoms:** images 404 or render broken; `ProductPhoto.url` rows point at missing keys.

1. **(dashboard)** Cloudflare → R2 → `kanchuki-prod` → check object count and whether
   versioning/lifecycle rules exist. **If versioning is off, deleted objects are
   unrecoverable** — this is the highest-risk gap in the stack; the owner should enable
   versioning or a lifecycle backup *before* an incident.
2. What **is** recoverable without R2 backups:
   - DB rows (URLs, keys, metadata) survive in Postgres — restore them via §2, not R2.
   - Photos still on retailer devices / the original uploads can be re-uploaded.
3. **Do not** "repair" by deleting DB rows that reference missing objects — that hides the
   outage and loses the metadata needed to re-link re-uploaded files.
4. Rebuild the public URL prefix if the custom domain changed: `R2_PUBLIC_URL` **(dashboard)**
   → Redeploy. `NEXT_PUBLIC_*` values are baked in at build time, so the **web** service must
   rebuild too.

---

#### 5. Scenario D — Redis (Upstash) loss

**Symptoms:** OTP send fails ("Could not start a secure OTP session"), social connect fails,
jobs stop running, rate limits reset.

**Redis is treated as ephemeral.** Nothing here needs to be *restored*; things need to be
*re-registered*.

1. **(dashboard)** Upstash → confirm the database exists and the `REDIS_URL` matches.
   A common false alarm: the first Redis-touching request after an idle sleep fails once.
   The lazyConnect handshake race was **fixed** — do not re-diagnose this as a timeout bug.
2. **OTP slots / rate limits / public cache** rebuild themselves on next use. No action.
3. **BullMQ queues:** in-flight jobs are gone. Confirm the critical ones re-enqueue:
   - Purge-soft-deleted (30-day cron) — runs nightly; a missed night is caught the next.
   - Catalog full-sync, R2 compression, referral qualify/accrue/payout — all repeatable
     schedules. **If you changed a cron env var (e.g. `CATALOG_SYNC_CRON`) on a live
     deployment, the old repeat schedule can survive in Redis and duplicate.** After any
     Redis wipe, verify the repeatable-job set matches the intended schedules and remove
     strays.
4. Re-run a targeted check for whichever job's lane is critical (e.g. trigger one manual
   catalog sync from the admin panel) rather than waiting for the schedule.

---

#### 6. Scenario E — Region / host outage (Railway, Supabase, Upstash, Cloudflare)

| Down | Impact | Mitigation |
|---|---|---|
| **Railway** (API or Web) | App/API unreachable | Railway status page; if the API is down, the mobile app and storefront fail. No self-hosted fallback. Wait it out; do not redeploy into a broken platform. |
| **Supabase** | Total outage — no auth, no data | Managed; Supabase status page. This is a single point of failure: **post-launch, enable a read replica (B-002)** so read-only storefront traffic survives a primary failure. |
| **Upstash** | OTP login fails; jobs pause; caching degrades (public cache is fail-open) | See §5. |
| **Cloudflare / R2** | Images break; CDN down | R2 outage ≠ site down (storefront HTML is served by Railway), but it looks broken to shoppers. Cloudflare status page. |
| **Hetzner** (V-Tone) | Try-on unavailable | Not in the MVP launch path; degrade silently. |

---

#### 7. Scenario F — Secret compromise (rotate in this order)

Rotate **in dependency order**: a consumer must be restarted with the new value after the
provider issues it, or you get an outage in the middle of a security incident.

1. **Database credentials** first — if the DB is compromised, everything else is moot.
   - **(dashboard)** Supabase → reset role passwords → update `DATABASE_URL`,
     `DATABASE_URL_POOLER`, `PURGE_DATABASE_URL` on the API service → Redeploy.
   - Railway vault Postgres: reset `vault_app`, update `VAULT_DATABASE_URL`.
2. **Supabase service key + JWT secret** — resets every live session (users re-login). Expected.
3. **R2 keys** — issue new token, update `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, remove
   the old token, Redeploy. Photo writes/reads break between the two steps, so do it in one sitting.
4. **Redis password** — Upstash → rotate → update `REDIS_URL` → Redeploy. Expect one failed
   first request per new connection.
5. **Payment + messaging + AI keys** — Razorpay (`KEY_ID`/`KEY_SECRET`/`WEBHOOK_SECRET`),
   RazorpayX payout keys + `RAZORPAYX_WEBHOOK_SECRET`, MSG91 (`AUTHKEY`/`TEMPLATE_ID`/
   `WEBHOOK_SECRET`), Anthropic/OpenAI, Meta app secret, Fal.ai, Gemini, BFL.
   - RazorpayX/payments webhook secrets are **deliberately separate** — rotating one must
     never require rotating the other.
6. **Auth/JWT secrets** — `COOKIE_SECRET`, `TEAM_JWT_SECRET`, `ADMIN_API_KEY`,
   `REVALIDATION_SECRET` (note: `REVALIDATION_SECRET` must be set on **both** the API and web
   services or `/api/revalidate` 401s), `VAULT_DATABASE_URL`'s companion secrets.
7. **Review/test bypasses** — if leaked, unset `OTP_TEST_BYPASS`/`OTP_TEST_PHONES` and
   `REVIEW_PHONE`/`REVIEW_OTP` immediately. They are the shortest path to a session.

**After rotating:** grep every service's variables for the old value (Railway variables are
per-service; it is easy to update one and forget the other), redeploy both services, and
verify `/health`, an OTP login, and one Razorpay webhook test event.

---

#### 8. Known gaps (stated, not hidden)

| Gap | Risk | Owning action |
|---|---|---|
| **R2 has no confirmed versioning/backup** | Deleted or corrupted objects are unrecoverable; photos are the product | Owner: enable R2 versioning or a scheduled backup export |
| **Supabase retention is plan-dependent** | RPO could be 24 h+ on a lower plan | Owner: confirm PITR window on the current plan |
| **Single database, no read replica** | A Supabase failure is a total outage | B-002 (post-pilot) |
| **`_prisma_migrations` has gaps** (083–089, 063/104–117 applied by hand) | `migrate deploy` on a restored DB may re-apply or skip | Owner/§1.1: reconcile runner rows |
| **No off-platform copy of the deletion vault** | Vault loss ends compliance history | Owner: confirm Railway Postgres backup retention |
| **Secrets live only in Railway + password manager** | Losing both means re-issuing everything | Keep the password-manager entries current (no secrets in the repo) |

---

#### 9. Post-incident checklist

- [ ] Writers un-paused; `/health` green; a real login + a real storefront page verified.
- [ ] Data-loss window stated in IST/UTC and confirmed against the restore point.
- [ ] Any hand-applied SQL recorded in `docs/database/` and, where a migration was bypassed,
      in `_prisma_migrations`.
- [ ] New root cause filed in `docs/root-cause/root-cause issues.md` (**RC-###**) if code or
      process caused it, referenced from the fix commit.
- [ ] The gap that made this incident possible is added to §8 with an owner, or closed.
- [ ] Credentials rotated per §7 if compromise was even suspected.
- [ ] Timeline + a short blameless write-up shared with the team.

---

## Retailer-Facing Photo Retention & AI-Training Notice

> Merged from the former `docs/references/guides/photo-retention-notice.md`.


**Purpose:** the copy a retailer is actually shown about how their photos are used, kept, and
deleted — plus the placement decision and the assertions a reviewer must verify.
**Built:** 2026-09-24 (launch-readiness §7A.6). **Legal review:** pending (board §7B.1).

---

#### 1. What this is (and what it deliberately is not)

The original launch item was a **training-photo** retention/deletion notice — written when
F-102d collected try-on photos for model training under a per-photo consent. **That programme no
longer exists:** Virtual Try-On and the whole training-data pipeline were removed on
2026-08-31 (`chore/remove-unwanted-features`, migration `082`). `training_photo_consents`, the
`training-data/` R2 prefix, the 180-day cleanup cron and the revocation-token flow are gone
(`docs/SECURITY.md` §3b/§3c).

So a notice about *training photos* would describe a feature that does not exist — the
RC-025/RC-038 shape (a contract described in prose, implemented nowhere). The notice built
instead states the thing that is true and that a retailer actually needs:

> **We do not use your photos to train AI models** — and here is exactly what we do use them
> for, how long we keep them, and how to delete them.

This is both the honest version and the stronger one: it replaces an ambiguous omission with an
explicit negative.

---

#### 2. Placement

**Live at `https://kanchuki.app/privacy` → section “Product photos and AI training”.**

Why the privacy policy, and why not a new in-app screen:

| Option | Verdict |
|---|---|
| **Web privacy policy** (`apps/web/src/app/privacy/page.tsx`) | **Chosen.** The retailer app's **Settings → Legal → Privacy Policy** row already opens `${WEB_URL}/privacy` (`apps/mobile/app/settings/index.tsx`), so this reaches retailers immediately with **no mobile release**. It is also where DPDP data-rights replies point (`notice-versions.ts` `full_notice_url`), so it is the surface a regulator or a customer would read. |
| New mobile screen or Settings row | Rejected for now. It would need an **EAS build** to reach anyone, and the build is already queued for other changes; a notice that cannot ship is not a notice. Revisit if a dedicated in-app screen is wanted later. |
| A standalone `/privacy/photos` page | Rejected — splits one policy across two URLs, and the policy is the document that gets reviewed. |

**Drift warning:** the copy below is a **verbatim copy of the page**, and the page is the live
source. Any edit to that section must be re-quoted here and re-reviewed (see §5). A test
(`apps/web/src/app/privacy/__tests__/page.test.tsx`) fails if any of the load-bearing
statements disappears.

---

#### 3. The copy (verbatim from the page)

> **Product photos and AI training**
>
> **We do not use your photos to train AI models.** A photo a retailer uploads is used only for
> the features that retailer asks for — auto-tagging category, colour and fabric; background
> clean-up and studio-style catalog images; a short promotional video; and publishing to the
> storefront or a connected social account.
>
> That applies to our AI providers too: a photo is sent to a provider only to perform the
> specific operation requested, under a contract that does not permit the provider to use it to
> train its own models. An earlier consent-based programme that collected try-on photos for
> model training was withdrawn and removed on 31 August 2026, and no photos are collected for
> training now.
>
> **How long a photo is kept, and how to delete it.** A photo is kept while it belongs to a
> live product, design, or account. Delete the photo or the product in the app and it disappears
> from your catalog immediately; the stored file is soft-deleted at once and permanently purged
> after 15 days — including the copy in our write-only recovery vault (see above). Deleting a
> retailer account removes its photos the same way. To have a photo deleted sooner, email
> privacy@kanchuki.app.

**Page updated:** “Last updated: September 24, 2026”.

---

#### 4. Facts the copy asserts, and where each comes from

Each claim must be re-checkable — if the underlying fact changes, the copy is wrong, not just
stale.

| Claim | Source of truth | Notes |
|---|---|---|
| Photos are used only for tagging / background / studio / video / publishing | `apps/api/src/lib/studio-shoot.ts`, `photo-cleanup.ts`, the AI provider registry (F-023) | These are the only destinations a product photo is sent to. **Re-verify if a new use for photos is added.** |
| Providers are contracted **not to train** on the data | `docs/SECURITY.md` (Anthropic: DPA in place, data not used for training; OpenAI: same) | Applies to the vision/generation providers in use. A **new provider must be added here** only after the same contract exists. |
| The training programme was removed on 31 August 2026 | `migration 082_remove_unwanted_features` (2026-08-31), `docs/SECURITY.md` §3b/§3c, `docs/database/no-feature-want.md` | Not "paused" — removed. Nothing collects photos for training today. |
| Purged after **15 days**, incl. the recovery vault | `PURGE_AFTER_DAYS = 15` in `apps/api/src/jobs/purge-soft-deleted.ts` | Verified 2026-09-24. **If that constant changes, the policy text must change with it** — a 30-day code change with 15-day copy is a false statement to a regulator. |
| Email route for earlier deletion | `privacy@kanchuki.app` (grievance officer, same page) | Must be a monitored inbox. |

---

#### 5. What legal must review (§7B.1)

- [ ] Is **“We do not use your photos to train AI models”** supportable as written across **all**
      providers in the current registry — i.e. do the executed terms actually exclude training,
      for every provider, including the image/video generators (Fal.ai, Google Gemini, BFL) and
      not only the vision tagger?
- [ ] Is the **15-day** purge + vault wording an accurate description of the deletion process,
      including whether a provider may briefly retain a copy in logs/caches under *its* retention
      schedule? (This is the most likely gap: our purge is ours; theirs is theirs.)
- [ ] Does stating the **historical** training programme (“withdrawn and removed”) create any
      disclosure obligation for data already collected under the old consent before 2026-08-31?
- [ ] Is the notice **discoverable enough** under DPDP for a retailer whose only surface is the
      mobile app (currently: one tap away via Settings → Legal), or is an in-app screen required?
- [ ] Confirm the **updated date** convention and whether a versioned notice record is needed
      (compare the shopper-facing `notice-versions.ts` pattern).

---

#### 6. Change procedure

1. Edit `apps/web/src/app/privacy/page.tsx`.
2. Re-quote the section verbatim in §3 and bump “Last updated”.
3. Run `npx vitest run src/app/privacy/__tests__/page.test.tsx` (it fails if the no-training
   claim, the 15-day figure, the removal date, or the deletion route is dropped).
4. Re-request legal review (§7B.1) before merge if any §4 fact changed.
