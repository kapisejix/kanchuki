# Kanchuki — Claude Code Skills & MCP Tools

**Version:** 1.0  
**Date:** June 2026  
**Purpose:** Which Claude Code skills and MCP servers are active/recommended for this project

---

## How to Use This File

When starting a new development session on Kanchuki:
1. Load `skill://codebase-onboarding` if new to repo
2. Load task-specific skills listed below before starting
3. Use MCP tools for their designated purposes
4. Always `rtk` prefix bash commands (see root `CLAUDE.md`)

---

## Active MCP Servers

| MCP Server | Tools | When to Use |
|-----------|-------|------------|
| **serena** | Code intelligence, semantic search | Finding symbols, understanding code flow, cross-file refactoring |
| **Sanity** | Content management | NOT used in this project |
| **headroom** | Budget monitoring | Track token usage during long sessions |

### Serena Usage
Serena provides LSP-level code intelligence without spinning up a full language server:
```
# Before any refactor: find all references
serena: find references to function X

# Before adding a new API endpoint: check existing patterns
serena: how are Fastify routes structured in this codebase?

# Before schema migration: understand all usages
serena: where is the `products` table queried?
```

---

## Skills by Development Phase

### Phase 0: MVP (Month 1–4)

#### Backend API (Node.js + Fastify)
- `skill://backend-patterns` — API route structure, middleware, error handling
- `skill://api-design` — REST endpoint design, pagination, versioning
- `skill://fastapi-patterns` — Fastify-specific patterns (note: skill covers FastAPI concepts applicable to Fastify)
- `skill://error-handling` — Typed errors, retry logic, circuit breakers
- `skill://observability-and-instrumentation` — Logging (pino), metrics, tracing

#### Database
- `skill://postgres-patterns` — Query optimization, indexing, JSONB, pgvector
- `skill://database-migrations` — Prisma migrations, zero-downtime changes
- `skill://prisma-patterns` — ORM patterns, transaction handling, connection pooling

#### React Native (Retailer App)
- `skill://react-patterns` — Component patterns, state management
- `skill://frontend-patterns` — State, performance, mobile-first patterns
- `skill://frontend-a11y` — Accessibility for mobile UI

#### Next.js (Customer Web)
- `skill://frontend-ui-engineering` — Production-quality UI components
- `skill://react-performance` — Bundle size, server components, lazy loading
- `skill://nextjs-turbopack` — Next.js 14 App Router patterns

#### Security
- `skill://security-and-hardening` — OWASP, input validation, auth
- `skill://security-review` — Pre-feature security checklist
- `skill://api-design` — Secure API design patterns

#### Authentication
- `skill://security-review` — Auth flow security
- Uses Supabase Auth SDK directly (no custom auth skill needed)

#### Testing
- `skill://python-testing` / `skill://tdd-workflow` — TDD methodology (adapt to TypeScript)
- `skill://test-driven-development` — Test-first approach for critical paths
- `skill://e2e-testing` — Playwright for collection link customer web tests

#### Deployment
- `skill://deployment-patterns` — Railway, CI/CD, health checks, rollbacks
- `skill://docker-patterns` — Containerization (if needed)
- `skill://ci-cd-and-automation` — GitHub Actions pipeline

#### Code Quality
- `skill://code-review-and-quality` — Pre-PR review
- `skill://typescript-reviewer` — TypeScript type safety review
- `skill://coding-standards` — Naming, readability conventions

---

### Phase 1: AI Features (Month 5–8)

#### AI / ML
- `skill://mle-workflow` — AI pipeline design, evaluation, monitoring
- `skill://cost-aware-llm-pipeline` — Model routing, cost optimization, caching
- `skill://agent-architecture-audit` — Audit AI integration quality
- `skill://observability-and-instrumentation` — AI cost monitoring, latency tracking
- `skill://performance-optimization` — VTO input-quality pipeline (bg-removal preprocessing before `triggerCatVTON`, per `docs/PRO-REQUIREMENTS.md` F-102 / ADR-006)

#### Vector Search
- `skill://postgres-patterns` — pgvector indexing, IVFFlat tuning
- `skill://performance-optimization` — Query performance for similarity search

---

### Phase 2: WhatsApp + B2B (Month 9–12)

#### WhatsApp Integration
- `skill://api-connector-builder` — WhatsApp Cloud API integration pattern
- `skill://security-and-hardening` — Webhook validation, token security

#### Background Jobs
- `skill://backend-patterns` — BullMQ job queue patterns

---

### Phase 3: Payments + GST (Month 13–18)

#### Payments (Razorpay)
- `skill://api-connector-builder` — Razorpay webhook integration
- `skill://security-and-hardening` — Payment webhook security

#### Frontend
- `skill://frontend-ui-engineering` — Invoice UI, billing dashboard
- `skill://design-system` — Consistent billing UI components

---

## Recommended Skill Load Order Per Session Type

### "I'm building a new API endpoint"
```
1. skill://api-design
2. skill://backend-patterns
3. skill://security-review
4. skill://test-driven-development
```

### "I'm working on the React Native app"
```
1. skill://react-patterns
2. skill://frontend-patterns
3. skill://frontend-a11y
4. skill://performance-optimization
```

### "I'm working on AI tagging / search"
```
1. skill://cost-aware-llm-pipeline
2. skill://mle-workflow
3. skill://postgres-patterns (for pgvector)
4. skill://observability-and-instrumentation
```

### "I'm doing a database migration"
```
1. skill://database-migrations
2. skill://prisma-patterns
3. skill://postgres-patterns
```

### "I'm reviewing code before PR merge"
```
1. skill://code-review-and-quality
2. skill://typescript-reviewer
3. skill://security-review
```

### "I'm debugging a production issue"
```
1. skill://debugging-and-error-recovery
2. skill://observability-and-instrumentation
3. skill://agent-introspection-debugging (if AI pipeline issue)
```

### "I'm setting up deployment / CI-CD"
```
1. skill://deployment-patterns
2. skill://ci-cd-and-automation
3. skill://docker-patterns
```

---

## Skills NOT Recommended for This Project

| Skill | Why Skip |
|-------|---------|
| `skill://django-patterns` | We use Node.js, not Python Django |
| `skill://springboot-patterns` | Java framework, not used |
| `skill://laravel-patterns` | PHP framework, not used |
| `skill://flutter-dart-patterns` | We use React Native, not Flutter |
| `skill://swiftui-patterns` | Not building native iOS (using React Native) |
| `skill://caveman` | Active by default in this project |

---

## Dev Tools & Commands Reference

### Daily Workflow
```bash
# Start dev environment
rtk pnpm dev

# Run tests
rtk vitest run

# Type check
rtk tsc --noEmit

# Lint
rtk lint

# DB migration
rtk prisma migrate dev --name "add_product_embedding"

# DB studio (view data)
rtk prisma studio

# Deploy (after commit)
rtk git push origin main  # triggers Railway CI
```

### AI API Testing
```bash
# Test Claude tagging locally
rtk pnpm run tag-test --image=sample.jpg

# Test embedding search
rtk pnpm run search-test --query="pink cotton wedding suit"

# Check AI costs
rtk curl https://api.kanchuki.app/admin/metrics | rtk json
```

### Railway Deployment
```bash
# Check deployment status
rtk gh run list

# View production logs
rtk railway logs --follow

# Check DB connections
rtk railway run -- prisma db pull
```

---

## Architecture Decision Records (ADRs)

All major tech decisions are recorded using `skill://architecture-decision-records`.

Existing ADRs (create these in `docs/adrs/`):
- `ADR-001-react-native-over-flutter.md` — Why React Native
- `ADR-002-fastify-over-express.md` — Why Fastify
- `ADR-003-pgvector-over-pinecone.md` — Why PostgreSQL + pgvector over dedicated vector DB
- `ADR-004-cloudflare-r2-over-s3.md` — Why R2 (no egress fees)
- `ADR-005-claude-for-indian-fashion-tagging.md` — Why Claude over GPT-4V
- `ADR-006-defer-3d-parametric-vto.md` — Why CatVTON (2D) stays, SMPL/STAR 3D pipeline deferred

---

## Skill Update Policy

- Review this file at start of each phase
- Add new skills as new technology domains are introduced
- Remove skills when technology is replaced
- Update skill versions when newer versions are available in ECC
