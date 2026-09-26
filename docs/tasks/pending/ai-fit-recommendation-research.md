# AI Fit/Style Recommendation — Research Notes (not a spec yet)

**Status:** 🔬 Research only, nothing built, nothing decided
**Started:** 2026-09-25
**Owner question:** Can AI reduce customer indecision (browses 3-5 items, buys 0-2) and nudge toward the item(s) already selected/shown? Should we let customers upload a photo and get AI-matched recommendations (height, body shape, skin tone, size)?

---

## Owner's original ask (verbatim intent)

Customers browsing clothing (buying for self or for others) get stuck comparing 3-5 items and often buy fewer than they picked. Owner wants to know:
1. Is an AI agent for this possible? What's the cost/effort range (cheap+simple → expensive+complex)?
2. Can customers upload their photo → AI reads height, build, skin tone, size → recommends best-fit items from what they already picked?
3. What actually convinces a doubtful customer to commit to the item(s) they've shortlisted?

## Context already true in this codebase (don't re-litigate)

- **VTO (Virtual Try-On) was already built, then deliberately REMOVED** in the 2026-08-31 teardown (`chore/remove-unwanted-features`, migration 082). Full photoreal try-on is a **rejected approach** here — cost too high, accuracy poor, low ROI for SMB retailer segment. Re-adding it = reversing a made decision, needs explicit owner sign-off, not a default.
- **Fashion DNA AI matching** (customer preference vector matching) — also removed same teardown.
- **Size recommendation feature** — also removed same teardown. Only **usual-size capture** (`customers.usual_size`, migration 058) survives — raw customer-stated size, no AI inference.
- **AI Stylist v1** — already built and live (Claude-powered chat, `docs/customers/customer-profile.md` §12, row 51 in CLAUDE.md What's-Built index). This is the natural extension point for any "convince the customer" work — reuse, don't rebuild.
- **5-question style quiz** — already built (same row 51).
- Retailer catalog is heavy on **unstitched/semi-stitched suits** — "fit" doesn't fully exist until a tailor makes the garment. This breaks the Western-market assumption behind most fit-AI/VTO products (ASOS, Stitch Fix) — a real, India-specific hurdle, not a generic one.
- Photo-based features carry a **standing legal promise**: "we do not use your photos to train AI models" (privacy notice shipped 2026-09-24, row 87). Any new photo-upload feature must honor this, and DPDP consent flow is mandatory, not optional.
- Claude Vision is already the tagging engine in this stack (cheap, per-image cost known) — reuse pattern exists for any new vision call.

## Three effort tiers discussed

### LOW — buildable now, cheap, days not months
- Reuse existing style quiz + `usual_size` for a lightweight profile
- Show only 3 curated picks instead of 10 (Hick's Law — fewer choices, higher conversion)
- Label picks "Picked for you" via AI Stylist chat, not "browse all"
- Social proof badges: "bestseller", "X people viewed today"
- No new photo/vision feature needed — mostly UX + copy + narrowing existing surfaces

### MID — photo-assisted, no full render
- Customer uploads 1 selfie → Claude Vision reads skin tone + rough body shape (cheap call, ~₹1-2/customer)
- Match against product color/silhouette attributes already captured by tagging → shortlist to 3
- Output is a text/badge ("this color suits your tone"), **not** a rendered garment-on-body image
- Needs: explicit privacy notice reusing the existing "not used to train AI" promise, consent flow, no photo persistence beyond the match call

### HIGH — full virtual try-on (photoreal render)
- This is literally the removed VTO feature. Not recommended by default — real cost (GPU/compute), real accuracy problems, and the unstitched-suit fit problem makes it weaker ROI here than in Western readymade-wear markets it was designed for.
- Only worth reopening if owner explicitly wants VTO back with a real budget — should go through a fresh brainstorm/decision, not silently rebuilt.

## Hurdles (apply across tiers)

1. **Privacy/DPDP compliance** — any photo upload needs consent UI + no-training promise + retention policy, same rigor as existing product-photo rules (`docs/SECURITY.md` §3b/§3c)
2. **Unstitched-suit fit problem** — no fixed size pre-tailoring, so "fit match" concept is weaker for a large slice of the catalog
3. **Trust risk** — AI says "perfect for you," customer buys, doesn't like it → refund + trust damage, worse than no recommendation at all
4. **Per-customer AI cost** — any vision call scales with traffic; needs quota/plan-tier gating (reuse existing `QuotaResourceType` pattern, F-010)
5. **No fit baseline in catalog photos** — most product photos are flat-lay/mannequin, not on-model, so there's nothing to visually compare a customer's photo against

## Recommendation (not yet approved by owner)

Skip full VTO. Build "Style Match Lite": quiz + optional selfie for skin-tone match + narrow to 3 curated picks + AI Stylist chat reinforcing the pick with a stated reason ("suits your tone, good for wedding season"). Fits existing stack (AI Stylist, Claude Vision tagging), low incremental cost, doesn't reopen the VTO decision.

## Open questions for next session

- Does owner want to scope this as a real spec (F-### number, PRO-REQUIREMENTS entry) or keep exploring?
- Is MID tier (selfie skin-tone match) worth the DPDP/consent overhead for this customer base, or is LOW tier (quiz + narrowing + AI Stylist nudge) enough on its own?
- Any appetite to revisit HIGH/VTO specifically, given it was removed for cost/accuracy reasons — or is that permanently off the table?
- What conversion metric would count as success (tie into existing MVP metrics: ≥15% enquiry-to-order conversion)?
