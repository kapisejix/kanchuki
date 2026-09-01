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
it. See `docs/database/no-feature-want.md`.

---

## 3b. Training-Data Consent — REMOVED

Removed with Virtual Try-On (`chore/remove-unwanted-features`, 2026-08-31).
`training_photo_consents`, the `training-data/` R2 prefix, the 180-day cleanup
cron and the consent-version tracking no longer exist.

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

If every guardrail above somehow fails (compromised `kanchuki_migrator` credentials, a Postgres admin-level breach), the Deletion Vault (`docs/DATABASE.md` "Deletion Vault") is a **separate database, separate provider, separate credentials, INSERT-only even for the app**. A primary-DB compromise that can delete data cannot also delete the vault's copy of that data, because the vault's write path never has UPDATE/DELETE grants to begin with — not even accidentally.

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
