# Kanchuki — AI Fashion Commerce Platform
## Project Memory for AI Agents

**Project Name:** Kanchuki  
**Domain:** AI-powered fashion retail SaaS for Indian SMB clothing stores  
**Status:** Pre-development (June 2026)  
**Research Source:** `docs/final-research.md`, `docs/AI Fashion Sales Assistant - Phase 1.md`

---

## What This Project Is

Kanchuki digitizes India's 1 million+ offline clothing stores with:
1. **AI Catalog Builder** — photo → auto-tagged product in seconds
2. **Fashion DNA CRM** — customer preference engine (color, style, budget, occasion)
3. **WhatsApp Commerce** — share product collections via link, no app needed
4. **Virtual Try-On (VTO)** — customer uploads photo, tries outfits remotely
5. **B2B Supply Network** — Manufacturer → Wholesaler → Retailer catalog chain

**Unique moat:** Only platform combining AI Try-On + Fashion DNA CRM + WhatsApp Commerce + works without a website.

---

## User Roles

| Role | Primary Need | App Surface |
|------|-------------|-------------|
| Retailer | Upload products, search for customers, share via WhatsApp | Mobile app (React Native) |
| Customer | View collection, try-on, favorite, enquire | Mobile web (Next.js PWA) |
| Wholesaler | Share catalogs, manage retailer orders | Web dashboard |
| Manufacturer | Upload master catalogs, track design popularity | Web dashboard |
| Admin | Platform ops, billing, support | Next.js admin panel |

---

## Current Phase: MVP (Phase 0 — 3-4 months)

**Build only:**
- Photo upload + AI auto-tagging (category, color, fabric, occasion)
- Product catalog with rack/shelf location
- Customer list with preference capture
- WhatsApp collection link generator
- Customer mobile web page (view, favorite, enquire)
- Basic in-store AI search ("cotton pink suits under ₹2000")
- Guided bulk onboarding for large stores (500–3000+ SKUs, F-001d, planned): rack/shelf batch-photo capture reusing F-001c multi-item detection + supplier PDF/catalog reuse reusing F-001b import — see `docs/PRO-REQUIREMENTS.md`

**NOT in MVP:** VTO, WhatsApp API automation, Fashion DNA AI matching, Manufacturer/Wholesaler layer, UPI payment tracking

---

## Tech Stack (Locked)

| Layer | Choice | Why |
|-------|--------|-----|
| Retailer App | React Native (Expo) | Cross-platform, fast build |
| Customer Web | Next.js 14 (App Router) | PWA, SEO, SSR |
| Backend API | Node.js + Fastify | Fast, TypeScript native |
| AI Tagging | Claude Vision API (claude-3-5-sonnet) | Best for Indian fashion understanding |
| VTO Engine | **CatVTON (self-hosted)** | ~$0.005/try-on, runs on 8GB+ VRAM |
| Database | PostgreSQL 16 + pgvector | Vector search for Fashion DNA |
| Cache | Redis | Session, rate limit, job queue |
| Storage | Cloudflare R2 | Cost-effective image storage |
| Auth | Supabase Auth | Phone OTP for retailers |
| Payments | Razorpay | UPI + INR subscriptions |
| WhatsApp | Meta Cloud API (official) | Phase 2 |
| Deployment | Railway (API+Web) + RunPod (CatVTON GPU) | Cloud GPU for try-on |
| CDN | Cloudflare | Free tier, fast India PoPs |

---

## Pricing Model

| Plan | Monthly | Annual |
|------|---------|--------|
| Starter | ₹999 | ₹9,999 |
| Growth | ₹2,499 | ₹24,999 |
| Pro | ₹4,999 | ₹49,999 |

Payment: Razorpay (UPI first). Annual discount 20%.

---

## Key Constraints

- **GST invoicing REQUIRED** — legal compliance for all Indian retail software
- **INR pricing only** — no USD, no forex friction
- **Offline-first design** — retailer app must work with poor connectivity
- **Photo-first UX** — no manual form filling for product entry
- **AI try-on cost budget** — ₹5-15/image, must be covered by plan pricing
- **WhatsApp API pass-through** — Meta's ₹0.38/conversation must be in pricing math
- **Regional language UI** — Hindi minimum by Year 1

---

## MVP Success Metrics (90 days)

- 50 retailers onboarded
- ≥50 products uploaded per retailer
- ≥10 collection links sent per retailer/month
- ≥40% collection link open rate
- ≥15% enquiry-to-order conversion
- ≥60% retailer retention at 60 days

---

## Key Risks

1. **VTO quality for ethnic wear** — saree draping, unstitched suit layering hard for existing APIs
2. **Retailer upload behavior** — many will try once and drop off
3. **WhatsApp API dependency** — Meta can change pricing/access
4. **AI cost per try-on** — margin tight at ₹999/month plan

---

## Project File Index

| File | Purpose |
|------|---------|
| `docs/PRO-REQUIREMENTS.md` | Full product requirements, user stories, acceptance criteria |
| `docs/PLAN.md` | Phase-by-phase roadmap with timelines |
| `docs/TECH-STACK.md` | Tech decisions with rationale |
| `docs/DESIGN.md` | UI/UX design system, screens, flows |
| `docs/DATABASE.md` | PostgreSQL schema, indexes, relationships |
| `docs/API.md` | REST API contracts, endpoints, auth |
| `docs/SECURITY.md` | Security model, OWASP, data privacy |
| `docs/MEMORY.md` | AI agent context and prompting strategy |
| `docs/SKILLS-AND-MCP.md` | Claude Code skills and MCP tools in use |
| `docs/final-research.md` | Market research foundation |

---

## AI Agent Instructions

When working in this repo:
1. **Always check `docs/PRO-REQUIREMENTS.md`** before adding any feature
2. **Always check `docs/DATABASE.md`** before writing schema migrations
3. **Always check `docs/SECURITY.md`** before handling user data or photos
4. **Use RTK prefix** for all bash commands (`rtk cargo build`, `rtk git status`)
5. **Photo data is sensitive** — follow consent/deletion rules in SECURITY.md
6. **GST compliance is non-negotiable** — every sale needs GST invoice support
7. **Target INR pricing** — never hardcode USD anywhere
