# F-022 Auto-Post New Arrivals to Google Business Profile — ON HOLD
> Extracted 2026-09-23 from `docs/PRO-REQUIREMENTS.md` (lines 1169–1188). Pending — not built.


**Status:** 🔴 Planned, not started. Reviewed 2026-07-30. **Do not start development until explicitly told to proceed** — reference this entry + `CLAUDE.md` when the go-ahead is given.

**Problem:** Retailer adds new-arrival products in Kanchuki but has no easy way to also surface them on their Google Business Profile, where local searchers actually find the shop.

**Design:**
- Distinct from F-021's Google review link — this uses the **Business Profile API's `localPosts` resource**, which Google *does* allow creating via API (unlike reviews, which have no create-via-API path).
- Retailer OAuth-connects their Google Business Profile once (reuses the F-012 encrypted-secret/per-retailer-credential pattern already used for Razorpay in F-302).
- Kanchuki posts latest 3–4 new-arrival products (photo + short text + CTA button linking back to the retailer's collection link) via `localPosts.create`.
- Image must meet Google's Post image spec (min resolution etc.) — reuse existing product photo pipeline, no new image processing needed.

**External blocker (not in Kanchuki's control):** Google gates access to the Business Profile API — requires a formal API access request/approval from Google before any production calls work. Approval time is unknown and outside this codebase's control; must be requested/secured before implementation can be verified end-to-end.

**Complexity estimate:** 3–5 dev days for OAuth connect + API wiring + retailer UI toggle ("auto-post new arrivals to Google"), once Google API access is granted. Google approval wait time is separate and unpredictable.

**Why not built yet:** not in MVP scope; also blocked on external Google API access approval, which should be requested well before development starts.

---

