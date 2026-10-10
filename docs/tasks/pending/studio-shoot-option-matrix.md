# AI Studio Shoot — Option Matrix, Product-Aware Gating & Collage

**Update 2026-10-08 (rounds 1–2):** owner's final prompts applied — **two sections only, Product Only and Model Only** (§14.2–§14.4); retailer-selectable AI models on **Fal.ai** spec'd in **§15**; round-2 decisions in §12. Still docs only — no code.
**Status:** 🟡 Spec — option list finalized by owner 2026-09-30 and trimmed 2026-10-08: no draft/missing prompts (every listed style has an owner-written prompt), **no pose picker (pose lives inside each prompt)**, **no Frame / Angle / Photography Style / Product View / Mannequin-Ghost options**, no garment-back shots, lighting automatic per style. **Retailer layer nothing built; admin bench partly wired** — as of 2026-10-10 `studio-effects.ts` has prompt text for PS-01..04 only (PS-01/02 retired here), PS-05..15 and all MI/MO are empty stubs, PS-16 missing. See `studio-shoot-session-handoff.md` §2.
**Feature:** F-032 Studio Shoot, retailer-facing option layer.
**Companion spec:** `docs/tasks/pending/ai-photo-generation.md` (engines, pipeline, quota, quality gap). This doc does **not** repeat that; it defines *which options a retailer sees for which product* and *what each option means*.
**Bench pending:** run 2 (indoor, with model) — see `docs/ai-studio/AI Cost Comparison.html`, `ai-photo-generation.md` §8.1d. Engine-per-option mapping waits on it.

---

## 0. Goal

The retailer uploads one product photo. Kanchuki **detects what the product is** (AI summary, title, category, sub-category, product_type) and then shows **only the shoot options that make sense for that product**. The retailer picks a style; the system assembles a prompt from fixed blocks (§8) and routes to the best engine.

Examples the owner gave (rules, not suggestions):
- **Kurti** → front view with **half model** (waist-up).
- **Bottoms / pant / lower** → **Product Only**, no model.
- **Unstitched suit** → hanger, folded/flat surface styles, indoor; no model, no body-form styles.
- **Kids** → no model at all (Product Only).

---

## 1. Source material reviewed

| File (owner's Downloads) | What it is |
|---|---|
| `Indian Models/Models-output.md` | MODEL ONLY tree: Model Type, Environment, Background, Model Style, Pose, Photography, Lighting |
| `Indian Models/Final Structure for AI Prompts - outdoor products.md` | Same + PRODUCT ONLY tree + shared 28-scene Background library |
| `Indian Models/Product only style.md` | Product Presentation expanded: 12 groups, ~90 leaf items |
| `ChatGPT Image Sep 30, 2026, 07_31_29 PM.png` | Lehenga, product-only board, 12 styles (mostly visible mannequin) |
| `…07_21_52 PM.png` | Lehenga, model **indoor** looks (8 themed bundles) |
| `…07_14_41 PM.png` | Lehenga, model **outdoor**, 11 scenes (pose + action shown as two fields) |
| `…06_59_48 PM.png` | Lehenga, model indoor, 12 scenes |
| `…06_47_35 PM.png` | Black anarkali (teen girl), model indoor, 13 scenes |
| `Indian Models/Styles/FInal - 01.png` | Pink kurti, product-only board, 14 styles (floating/ghost, no mannequin) |
| `Indian Models/Styles/…04_54_18 PM.png` | Kurti comparison board, the 12-group / ~90-item catalog |
| `shared image (84).jpg` | Reference for the **collage** idea: model mirror-selfie + styled flat lay, one image (§10) |

The boards are ChatGPT-generated targets — the **quality bar** our engines must reach. Fidelity notes in §11 were judged by eye at board resolution, not measured.

---

## 2. Finalized option lists (owner, 2026-09-30)

### 2.1 Product Only — 14 styles (owner's final list 2026-10-08; each style carries its own scene)

| ID | Style | Board note |
|---|---|---|
| PS-03 | Luxury Studio Product | headless torso form on pedestal, warm gold arch |
| PS-04 | Editorial Studio Product | headless torso form, grey wall, window shadows |
| PS-05 | Color Background | flat solid colour backdrop, garment only |
| PS-06 | **Premium Product Shot** | full-length on a warm beige/cream backdrop. **Not a close-up** |
| PS-07 | Flat Lay | top-down, flowers + jewellery props |
| PS-08 | Folded Boutique Fold | single fold on a rattan tray |
| PS-09 | Hanger Boutique | wooden hanger on boutique rail / wall |
| PS-10 | Boutique Fold | exactly two-stack on a wooden table |
| PS-11 | Table Display | laid / draped over a wooden table |
| PS-12 | Pedestal Display | round pedestal under an arch |
| PS-13 | Product Commercial Shot | pure white, hard grounding shadow |
| PS-14 | Creative Display Product Composition | decorative frame + florals + props |
| PS-15 | Social Media Commerce | high-key; **no AI text** (§7) |
| PS-16 | Editorial Product Display | garment + separate accessory props in an editorial interior (moved from Model Only, was MI-07) |

**Retired 2026-10-08 (owner: no missing prompts):** White Background Studio (PS-01) and Grey Background Studio (PS-02) as Product Only styles — no prompt was supplied. Grey Background Studio stays in **Model Only** (MI-10).

**Display form is fixed by each prompt** — the Mannequin / Ghost retailer choice is gone (owner 2026-10-08).

**Lighting (Product Only):** **automatic** per style from Daylight, Natural Light, Softbox, High Key — not a retailer choice (§14.2).

### 2.2 Model Only — Indoor (6 scenes)

Product Composition · Courtyard · Boutique · Shopping Mall · Social Commerce · Grey Background Studio.

> ⚠ *Product Composition* and *Social Commerce* are **bundled looks** (own props + scene). Boutique and Shopping Mall carry a scene variant pool. A variant is chosen by the **server**, one per generation (§14.3).
> **Removed 2026-10-08 (no owner prompt):** Royal Interior, Fashion Gallery, Penthouse, White Background Studio. **Moved to Product Only:** Editorial Product (PS-16). Dropped earlier: Beige/Luxury/Editorial Studio (as model backgrounds), Hotel, Luxury Lounge, Minimal, Lifestyle, Seasonal, Festival looks.

**Lighting (Indoor):** **automatic** per scene from Daylight, Natural Light, Softbox, High Key — not a retailer choice (§14.3).

### 2.3 Model Only — Outdoor (7 scenes)

Modern Street · Cafe · Terrace · Balcony · Beach · Poolside · Tropical Resort.
Dropped: Rose Garden, Riverside, Mountain, Forest (Nature group).

**Lighting (Outdoor):** **automatic**, only **Daylight** or **Natural Light** (owner) — not a retailer choice (§14.4). Softbox / High Key / Golden Hour / Sunset are **not** used outdoors.

### 2.4 Pose — no retailer option (owner 2026-10-08: "pose is inside the prompt")

There is **no pose picker and no separate pose prompts**. Each Model Only scene prompt carries its own pose line (§14.3, §14.4), chosen from that scene's pool by the server, one per generation. The earlier 6-pose list (Standing · Sitting · Walking · Holding Dupatta · Candid · Mirror Selfie) and the PO-01…06 prompts are **retired**; the pools are the owner's original per-scene lists.

- Still true: **no garment-back output** — no Turning / Looking Back poses, walking is **toward the camera**, never away (rule is in MX-0, §14.3).

### 2.5 Axes that stay

- **Model Type:** Adult Women, Teen Girls, Adult Men, Teen Boys — **Kids removed** (§5). Appended to the prompt by code as the person clause (`PERSON_CLAUSE[demographic]`).
- **Age band** (age template) and **Model Style:** Indian Slim, Natural, Festive, Bridal, Modern Fashion, Office/Professional, Casual. *(Groom and Curvy/Plus: **skipped for now**, owner.)*

**Removed 2026-10-08 (owner: "no"):** Frame, Angle, Photography Style, Product View, Mannequin/Ghost. None of the final prompts use them — framing is fixed inside each prompt. Kurti half-model is handled by the existing top-only clause in `buildStudioPromptContext` (frame the shot head-to-hip, never invent bottoms), not by a Frame option.

---

## 3. Flow

1. **Detect** — from AI Summary, Title, Category, Sub-category, `product_type` (Unstitched / Semi / Readymade) derive the **product profile** (§5).
2. **Mode** — show only the modes the profile allows (Model / Product Only).
3. **Options** — show only options valid for the profile (§4, §6). Retailer can always override a *soft* mismatch; *hard* rules cannot be overridden.
4. **Confidence fallback** — if detection is unsure, ask one question ("What is this?"). A "Garment type" picker already exists in the bench UI.
5. **Quick Looks first** — 8–12 preset cards (e.g. Clean Catalog, Boutique Hanger, Royal Wedding, Cafe Casual, Poolside Resort, Marketplace Listing) that pre-fill the combination; "Customize" reveals the full dropdowns. Retailers won't operate 6–7 dropdowns.
6. **Route** — each option/preset maps to its best-scoring engine (waits on bench run 2).

Unfiltered space was ≈1.38M (model) + ≈102K (product). After the owner's cuts (2026-10-08) it is small: Product Only 14 styles; Model Only 6 indoor + 7 outdoor scenes, each with a server-picked variant/pose pool — bench by **style × AI model** (§15.5), not exhaustively.

---

## 4. Gating key — the physical support each product style needs

Every Product Only style needs one of these. **This decides which garment types may use it.**

| Support | Styles | Valid for |
|---|---|---|
| **Body form** (mannequin or ghost) | Luxury Studio, Editorial Studio, Color Background, Premium Background Shot, Pedestal Display, Product Commercial Shot | **Stitched garments only** |
| **Surface** (laid down) | Flat Lay, Folded – Single, Folded – Stack, Table Display | **All**, incl. unstitched & bottoms |
| **Hanging** | Hanger Boutique | **All**, incl. unstitched |
| **Composition** | Creative Display, Social Media Commerce | Follows the support it reuses (surface/hanging for unstitched; any for stitched) |
| **Plain background** | Grey/White Background Studio | All (uses whichever support the retailer picked) |

Unstitched suits and bottoms therefore get **only Surface + Hanging + Plain** (bottoms may also use a hollow-leg form).

---

## 5. Product profile → what is offered

> **2026-10-08:** the **Poses** and **Frames** columns below are historical. Pose is chosen inside each prompt (§2.4) and Frame/Angle are no longer options (§2.5). The Model-mode / Product-only-style gating still applies.

Detected attributes: garment type · single piece vs set · has dupatta · bottom-only · unstitched · wearer group (women / men / teen / kids) · heavy work/bridal · flowy/flared.
*(Note: "Occasion" was removed platform-wide 2026-08-10 — bridal/festive must key off category, embellishment and AI-summary keywords, not an occasion field.)*

| Product type | Model mode | Frames | Product-only styles (by support) | Poses |
|---|---|---|---|---|
| **Saree** (always **saree + blouse** as one product — there is **no standalone blouse product**, owner 2026-09-30) | Yes | Full, ¾ | Body form (draped), Surface, Hanging | Standing, Walking, Candid, Mirror Selfie; "Holding Dupatta" → pallu hold. **Front only — pallu back never shown.** |
| **Lehenga** | Yes | Full, Wide, ¾ | All supports | Standing, Walking, Holding Dupatta, Candid, Mirror Selfie; Sitting allowed (flare hidden) |
| **Anarkali / Gown** | Yes | Full, Wide | Body form, Hanging | Standing, Walking, Candid, Mirror Selfie |
| **Readymade suit set** | Yes | Full, ¾, Mid | All supports | Dupatta pose only if dupatta detected |
| **Kurti (top only)** | Yes — **half model only** (owner 2026-09-30; **no Full Body opt-in**) | **Mid Shot / waist-up only**, Front angle. **Kurti length is locked: never shortened, never lengthened** (§8) | Body form, Surface, Hanging | Standing, Candid, Mirror Selfie (Sitting/Walking only if waist-up crop still holds) |
| **Bottoms (pant, palazzo, salwar)** | **Hidden** | n/a | Surface, Hanging, hollow-leg form | n/a |
| **Unstitched suit** | **Hidden** | n/a | **Surface + Hanging + Plain only** (all of them — owner confirmed); **no body-form styles** | n/a |
| **Dupatta** | Half model | Mid, Close-Up | Surface, Hanging | Holding Dupatta, Candid, Mirror Selfie |
| **Men's kurta / sherwani** | Yes | Full, ¾ | Body form, Surface, Hanging | No dupatta poses (Holding Dupatta hidden); Groom style **skipped for now** |
| **Kids ethnic (age 1–12)** | **Hidden — no model, ever** | n/a | Product Only (any valid support) | n/a |

### Model rules from owner answers

- **Kids (age 1–12): no model.** Kids garments are Product Only. Model Type list has **no Kids Girls / Kids Boys**.
- **Model ages offered: 13 and above** (owner 2026-09-30: "1–12 age restriction, above 12 allowed"). This **supersedes** the earlier "teenagers and 30+ only" answer — 18–29 adults are allowed. The 4-year PNGs are **not used**; the 16 / 18 / 30 / 35 / 60 / 70 PNGs remain the reference set.
- **Teen scene restriction (owner: yes; Penthouse is no longer a scene, so only Poolside is live):** hide **Hotel, Luxury Lounge, Penthouse, Poolside** for teen models. (Hotel and Luxury Lounge are already out of the final list; **Penthouse (indoor) and Poolside (outdoor) are the live restrictions.**) ✅ **Teen = 13–19** (owner 2026-09-30); 20+ is Adult.
- **Model identity:** owner gave no requirement for one consistent face across a store's shots beyond the age rule; fixed-persona-per-store is **not** in scope.

---

## 6. Cross-option gating rules

**Hard (cannot override)**
- **Lighting is automatic** (not a retailer choice): outdoor = Daylight or Natural Light only; indoor and Product Only = one of Daylight, Natural Light, Softbox, High Key, chosen per style (§14).
- Unstitched / bottoms → no Model mode; no body-form styles (§4).
- Kids → no Model mode.
- Teen (13–19) → no Poolside (Penthouse scene removed 2026-10-08).
- "Holding Dupatta" only when a dupatta is detected in the product.
- **No garment-back output anywhere:** no Back angle, no Back View, no Catalog Back, no Turning / Looking Back pose, no back-facing frames (owner 2026-09-30).
- Kurti → Mid Shot / waist-up only; length preserved exactly.
- Bridal style only for bridal/heavy-work products (lehenga, heavy saree, sherwani).
- Office/Professional style only for kurti / suit / formal.

**Soft ("Recommended" badge, not blocked)** — e.g. Bridal on Beach, Office in Royal Interior.

**Scene ↔ pose:** poses are now inside each scene prompt as a per-scene pool (§14.3), so a mismatched pose (e.g. sitting on a beach) cannot be picked by the retailer. Walking is toward the camera only.

**Bundled looks** (Product Composition, Editorial Product, Social Commerce) pin their own scene/props; if chosen, scene dropdown is disabled.

---

## 7. Text & branding — no AI-rendered text (owner: yes)

The boards show AI-drawn text (neon "Good Style Brighter You", "Everyday Ethnic Elegance", "Ethnic Vibes", mall storefront signs). AI text is unreliable and storefront names carry brand risk.

- Prompt guard block: **no text, no logos, no signage** in any image.
- Store name, captions and price tags are added **afterwards by the compositor** from the retailer profile.
- Scenes with signage risk (Shopping Mall, Social Commerce, Cafe) must carry an explicit "blank/unreadable signage" line.

**Owner exception 2026-10-08 — Model Only "Social Commerce" (MI-08) intentionally renders short AI headline text and close-up detail panels** (owner: "I want text as well and detailed panel"). Every other style stays no-text. Risk accepted by the owner: AI-drawn text can misspell or distort; bench-check spelling, and keep the headline to the fixed short phrases listed in MI-08. The compositor can still overlay store name/handle afterwards.

---

## 8. Prompt architecture (fixed modular blocks)

Stable prompts; only the scene (which carries its lighting) and pose lines change, so bench scoring stays one-variable-at-a-time.

1. **Garment-fidelity block (fixed, first):** keep colour, print, embroidery, border, **length (never shorten or lengthen)**, silhouette exactly as in the photo. **Show the garment front only; never invent or show the back.**
2. **Subject block:** model type + age band + model style *(Model mode)*.
3. **Pose block.**
4. **Frame + angle block.**
5. **Scene block:** one base prompt per background/style **including its automatic lighting line** (owner round 4–5: lighting is inside the style prompt, not a separate block).
6. *(no separate light block — folded into 5.)*
7. **Photography-style block.**
8. **Guard block (fixed):** no extra garments, no text/logos/signage, natural hands, product unchanged.

**Category overrides** (swapped in on top):
- Kurti half-model: "waist-up crop, only the kurti visible, no bottom garment shown; keep the kurti's exact length from the photo — do not shorten or extend the hem (hem may sit at the crop edge but must not be redrawn)." *(Owner: "keep the length of kurti, don't shrink or make it long.")* Hem/length is a bench check for every kurti shoot.
- Any model pose: "facing the camera; torso front-facing; walking toward the camera."
- *(Mirror Selfie override retired 2026-10-08 — pose is inside the prompts.)*
- Unstitched suit: "unstitched fabric pieces on a hanger; do not tailor into a garment; show design on top, bottom and dupatta."
- Bottoms: "no person, garment only."
- Saree: "draped saree, pallu visible, pleats intact."
- Multi-piece sets (lehenga = blouse + skirt + dupatta; kurta set): all pieces must be in the reference — see R1 in `ai-photo-generation.md` §5.

**Owner will supply the exact ChatGPT prompts behind each board tile later (Q10).** Until then, prompts are *derived* from board appearance only for planning, never shipped.

---

## 9. Prompts — status 2026-10-08

**Every style listed in §2 now has an owner-written prompt** (PS-03…16, MI-01/02/04/05/08/10, MO-01…07). No drafts, no placeholders. Pose prompts, category-override prompts, Mannequin/Ghost lines and per-axis one-liners were **dropped** (owner). Prompt text is in §14.2–§14.4.

## 10. Collage — one image, several styles (Phase after style lock)

> **2026-10-08:** MI-08 Social Commerce (§14.3) already asks one AI call for a model + detail-panels layout by owner decision. That is the only single-call multi-panel look; the multi-slot collage below stays a separate later phase.

Owner reference: `shared image (84).jpg` — 2-panel collage: model mirror-selfie (indoor, face hidden by phone) + styled flat lay on tan background. Owner: **finish style lock first, then collage** (Q12).

**Chosen approach (recommended, not yet approved for build): separate generations + server-side compose** — not one AI call.

| | Separate + compose ✅ | One AI call ❌ |
|---|---|---|
| Garment fidelity | Best — each slot gets full reference | Drifts across panels |
| Retry | One slot | Everything |
| Layout | Exact | Unreliable |
| Cost | Sum of slots (~₹15–25 for 3) | One call × retries |
| Engine | Best per slot | One engine |

Design notes:
- ≤ 3 slots; 2-up side-by-side default (WhatsApp-friendly). Each slot = a full mini-selection from §2 with §4/§5/§6 gating.
- Same product reference to every slot; inject detected colour name + hex into every slot prompt (cross-slot colour drift mitigation); optionally feed the product-only slot to the model slot as an extra reference.
- Generate each slot 3:4 / 4:5, centre-crop into panel; gutter; store name/handle from profile via compositor (§7); then the ≤80 KB compressor (`ai-photo-generation.md` §8.2).
- Quota: **each slot counts as its own generation** (else a 3-slot collage = free 3×). Retailer can regenerate one slot.
- *(Mirror Selfie pose retired 2026-10-08 — not in the owner's per-scene pose pools.)*

---

## 11. Review findings (garment-fidelity & board issues to verify in bench)

Eyeball observations — **verify with a side-by-side against the source photo before trusting any of them:**
- Kurti board **Table Display** tile appears to lose the sleeves.
- Lehenga **Creative Display** tile: skirt pattern looks rougher than other tiles.
- Model **Mountain / Balcony (Looking Back)** tiles show a **blouse back the AI invented** — the product photo shows the front only. **Owner decision (final, 2026-09-30): no garment-back output at all** — Turning, Looking Back, Back angle and Back View are **removed** (not merely allowed with a notice). No back-photo upload feature is planned.
- Kurti **Luxury Studio** floats the garment (no hanger/mannequin) — this is the *ghost* form, distinct from the lehenga board's visible mannequin. Both are supported (§2.1, "Product form").
- Duplicate-looking names fixed: "Folded Boutique Fold" vs "Boutique Fold" → Folded – Single / Folded – Stack.

---

## 12. Open items

**Resolved 2026-09-30 (owner round 2):** age 13+ model allowed, kids 1–12 no model · Grey/White Studio for both modes · Premium Background Shot (not close-up) · list trimming deferred · Groom/Curvy skipped · unstitched gets Surface + Hanging + Plain · kurti half-model only + length lock · Mirror Selfie added for all styles · **no garment-back output** (Turning, Looking Back, Back angle/view removed).

**Resolved 2026-09-30 (owner round 3):** Turning / Looking Back removal **confirmed final** · **no standalone blouse product** (blouse exists only as part of a Saree set; Blouse row removed from §5) · **Teen = 13–19**.

**Resolved 2026-09-30 (owner rounds 4–5):** Turning/Looking Back removed · name = "Premium Product Shot" · original "Folded Boutique Fold" + "Boutique Fold" names kept · Grey/White Background Studio in both Product Only and Model Indoor · outdoor lighting Daylight/Natural · extra axes included (Model Type, Model Style, Frame, Angle, Photography Style, Product View, Mannequin/Ghost) · **one base prompt per style with lighting inside; pose separate** · **lighting automatic by environment + style (not a retailer choice)** · Mannequin/Ghost on the six styles in §14.2 · Photography Style for both modes · §14 rewritten.

**Resolved 2026-10-08 (owner round 2):** Mannequin/Ghost choice dropped · MI-07 moved to Product Only as PS-16 · MI-08 keeps AI text + detail panels (exception to §7) · no draft/missing prompts (PS-01/02, MI-03/06/09/11 deleted) · no pose prompts, pose inside each prompt · Frame/Angle/Photography Style/Product View removed · **Fal.ai for all 4 models** (more providers later, e.g. Runway ML) · retailer sees raw model names (`Grok - Best`, `ChatGPT - Fast`) · category-override prompts dropped (kurti rule already in code).

**Resolved 2026-10-08 (owner round 3):** labels `Grok - Best` / `ChatGPT - Fast` / `Qwen - Good` / `Nano Banana - Best` · credits = test-page credits **+2**, no prices shown · **Grok is the default** · add-provider-from-admin flow spec'd (§15.6).

**Open (owner) — AI models, §15.7:** plan gating · Kontext for retailers? · Runway model choice · flat +2 vs percentage.

**Still open:**
1. **Confirm the proposed auto-lighting per style** (§14.2–§14.4 column) — owner replaces values when writing prompts.
2. **Side / Profile angles: kept for now.** Owner will test them and report whether to keep or remove.
3. **Age bands** for the age template (§14.6) — proposed Teen 13–19 · Adult 20–39 · Mature 40–59 · Senior 60+, not approved.
4. Prompts per ID (§9) — owner writing; budget cap per generation and bench run-2 timing (owner: "later").
5. Cafe / Terrace / Balcony are indoor-ish; kept under Outdoor as owner listed.

**Blocked on bench run 2:** engine-per-style routing; whether flat-lay/ghost use a cheaper engine than model slots.

**Docs to update when this is approved (not done):** `docs/tasks/README.md` index, `docs/PRO-REQUIREMENTS.md` F-032 row, `ai-photo-generation.md` §0b(D) effects-library status. `CLAUDE.md` needs explicit owner approval per its Operational Control Policy.

---

## 13. Implementation notes (no code written)

- F-032 already has a **DB-backed style catalog** (`studio_styles`) and a **Demographic** field (womens / mens / teen_girl / teen_boy…, CLAUDE.md #54). Gating can be **data on style rows** (allowed garment types, support type, environment, min/max age band) rather than hard-coded lists. Verify against the actual schema before building.
- The bench UI already exposes Garment type, Gender, Age, Scene, Light, Product view, Photography style — new work is **gating + detection + Quick Looks + compose**, not new axes.
- **Kids = Product Only**: the current `Demographic` still has kid values; those must stop routing to a model prompt.

---

## 14. Style Register — every prompt slot (owner writes prompts against these IDs)

**Rewritten 2026-09-30 (owner approved)** to the owner's final three blocks, names verbatim, in the order pasted. No Support / Gate / "Body form" columns here — those were internal labels and live only in §4–§6.

**Register rules (owner, round 4–5):**
1. **One base prompt per style. The base prompt includes the style AND its lighting line.** There is **no separate lighting prompt list** and **lighting is not a retailer choice** — it is added **automatically** from the environment (indoor / outdoor / product) and the style. Outdoor lighting is only **Daylight** or **Natural Light**; Product and Indoor use one of **Daylight, Natural Light, Softbox, High Key**.
2. **Pose prompts are separate** (§14.5), combined with a base prompt at runtime.
3. **Photography Style is offered in both Product Only and Model Only** (§14.6).
4. *(Retired 2026-10-08)* Mannequin / Ghost choice removed — each Product Only prompt fixes its display form.
5. IDs are assigned in this rewrite and are stable from here on (no prompt had been written against the earlier IDs; PS-xx numbering changed to follow the owner's pasted order).

### 14.1 Fixed blocks — retired

FX-1 / FX-2 are no longer separate blocks: the protection text lives inside each final prompt (owner's choice) and the pipeline already prepends `SCENE_GUARD` + garment identity + the colour clause (`buildStudioPromptContext`).

### 14.2 Section 1 — Product Only (14 base prompts, FINAL 2026-10-08)

**Source of truth: owner's `Prompts-list.md` (PS-03…PS-15 verbatim) + PS-16 (owner's MI-07 text, adapted).** Checked: ✅ no `[TAGS]` · ✅ no product-specific words · ✅ no back view / no collage · ✅ one fixed choice per prompt · ✅ lighting inside the prompt. **No edits needed to PS-03…PS-15.** The code adds product facts (garment identity + colour) around these prompts.

| ID | Style | Lighting | Display form (fixed by prompt) |
|---|---|---|---|
| PS-03 | Luxury Studio Product | Softbox | headless torso dress form on pedestal, gold arch |
| PS-04 | Editorial Studio Product | Natural Light | headless torso dress form, grey wall |
| PS-05 | Color Background | Softbox | garment only, solid blue |
| PS-06 | Premium Product Shot | Natural Light | garment only, warm beige/cream, full-length |
| PS-07 | Flat Lay | Daylight | flat, top-down |
| PS-08 | Folded Boutique Fold | Natural Light | single fold, rattan tray |
| PS-09 | Hanger Boutique | Natural Light | wooden hanger on rail/wall |
| PS-10 | Boutique Fold | Natural Light | two-stack, wooden table |
| PS-11 | Table Display | Natural Light | draped over table edge |
| PS-12 | Pedestal Display | Softbox | round pedestal under arch, garment only |
| PS-13 | Product Commercial Shot | High Key | pure white, hard grounding shadow |
| PS-14 | Creative Display Product Composition | Softbox | frame + florals + props |
| PS-15 | Social Media Commerce | High Key | clean high-key, **no text** |
| PS-16 | Editorial Product Display | Natural Light | garment + separate accessory props, editorial interior |

**Gating (§4):** PS-03/04 use a body form → stitched garments only. All others work for any garment type. PS-05/06/12/13 show a garment-only presentation, so the engine must "hold" the garment shape on unstitched/bottoms — bench check.

#### PS-03 — Luxury Studio Product | Softbox | Hollow Mannequin

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Remove the original hanger, person, model, mannequin, or existing display method. Re-present the garment as a premium product display on a true headless torso dress form positioned on an elegant pedestal. The dress form has no head, face, ears, hair, skin, facial features, or human head shape; only the torso, shoulders and short neck/collar area are visible. This is a product display, not clothing worn by a person.

Place the garment inside a sophisticated luxury fashion studio featuring a warm gold architectural arch in the background and an elegant premium pedestal beneath the garment. Use refined warm softbox lighting with controlled highlights, realistic fabric shadows, dimensional depth and premium commercial composition. Show the complete garment in a centered, full-length, front-facing view with realistic fabric drape, accurate proportions, crisp textile detail and photorealistic high-end fashion-commerce quality.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Change only the product presentation, environment, composition, pedestal and lighting.

#### PS-04 — Editorial Studio Product | Natural Light | Hollow Mannequin

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Remove the original hanger, person, model, mannequin, or existing display method. Re-present the garment as a premium product display on a true headless torso dress form. The dress form has no head, face, ears, hair, skin, facial features, or human head shape; only the torso, shoulders and short neck/collar area are visible. This is a product display, not clothing worn by a person.

Place the garment in a sophisticated grey editorial studio with a textured grey wall, clean light floor, minimal architectural styling and elegant white decorative vases on simple pedestals. Use natural side window light creating distinct soft diagonal window shadows across the wall and floor, warm daylight highlights and gentle natural contrast. Show the complete garment in a centered, full-length, front-facing composition with realistic fabric drape, accurate proportions, detailed textile texture, refined editorial styling and premium photorealistic commercial quality.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Change only the product presentation, environment, composition and lighting.

#### PS-05 — Color Background | Softbox

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the complete garment as a premium product display against a clean, seamless flat-color backdrop. Use a sophisticated solid blue studio background with no gradients, patterns, textures, architectural elements, furniture, props, people, models, or mannequins. Center the complete garment in a full-length front-facing composition with generous clean space around it.

Use professional softbox lighting with even illumination, controlled highlights, realistic fabric shadows, accurate color reproduction, crisp textile detail and a polished commercial fashion-catalog appearance.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Change only the presentation, background, composition and lighting.

#### PS-06 — Premium Product Shot | Natural Light

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the complete garment as a premium full-length fashion product display against a warm sophisticated luxury backdrop. Use an elegant warm beige and cream environment with subtle architectural depth, refined decorative styling and soft premium visual character. Keep the entire garment fully visible from top to bottom in a centered front-facing composition. This is a complete product shot, not a close-up or detail photograph.

Use natural daylight with soft directional illumination, gentle highlights, realistic fabric shadows, dimensional depth, accurate textile texture and refined high-end fashion-commerce photography.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Change only the product presentation, environment, composition and lighting.

#### PS-07 — Flat Lay | Daylight

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Arrange the complete garment as a premium flat-lay composition on a clean elegant surface, viewed directly from above. Lay the garment naturally and fully visible, maintaining its original construction, proportions and recognizable arrangement. Surround it with tasteful fresh flowers and carefully arranged fashion jewellery as supporting props, creating a refined boutique flat-lay aesthetic without covering or obscuring the garment.

Use bright natural daylight with soft directional shadows, realistic fabric texture, crisp embroidery and print detail, balanced composition and premium editorial product photography.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add or remove any garment detail. Props must never cover or alter the product.

Change only the product arrangement, surface, props, composition and lighting.

#### PS-08 — Folded Boutique Fold | Natural Light

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the garment as a single elegant boutique fold placed neatly on a natural rattan tray. Use one clearly defined folded presentation only, with the garment arranged carefully so its important fabric, print, embroidery and border details remain visible. Create a refined boutique merchandising composition with a warm neutral surface and subtle natural styling.

Use soft natural daylight with gentle directional shadows, realistic textile texture, accurate colors, crisp embroidery detail and premium boutique product photography.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions and construction. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Use exactly one folded garment presentation on the rattan tray. Do not create multiple folds or stacks. Change only the presentation, surface, composition and lighting.

#### PS-09 — Hanger Boutique | Natural Light

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Display the complete garment naturally on a premium wooden hanger within an elegant boutique setting. Use a refined boutique rail or sophisticated wall-mounted clothing rail as the presentation structure, with the garment centered and fully visible from top to bottom. Keep the environment warm, clean and professionally styled without people or models.

Use soft natural daylight entering the boutique space, creating gentle directional shadows, realistic fabric drape, accurate garment proportions, crisp textile detail and premium fashion-retail photography.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Change only the hanger presentation, boutique environment, composition and lighting.

#### PS-10 — Boutique Fold | Natural Light

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the garment as a premium boutique two-stack folded display arranged neatly on a sophisticated wooden table. Create exactly two coordinated folded layers/stacks of the same garment presentation, arranged naturally for luxury retail merchandising. Keep important embroidery, print, borders and fabric details visible and unobstructed.

Use soft natural daylight with warm directional illumination, realistic fabric shadows, detailed textile texture and refined boutique-commerce photography. Create an elegant, warm and premium retail atmosphere.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions and construction. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove or invent any garment detail.

Use exactly a two-stack folded presentation on the wooden table. Do not create a single fold, flat lay or additional stacks. Change only the presentation, table, composition and lighting.

#### PS-11 — Table Display | Natural Light

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the garment naturally laid and elegantly draped across a premium wooden table. Allow part of the garment to flow naturally over the table edge while keeping the main product clearly visible and recognizable. Create a refined boutique merchandising scene with subtle luxury decor and an uncluttered composition.

Use soft natural daylight with realistic directional shadows, natural fabric folds, accurate textile texture, crisp embroidery and print detail, balanced composition and premium commercial product photography.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Change only the product arrangement, table environment, composition and lighting.

#### PS-12 — Pedestal Display | Softbox

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the complete garment as a premium product display on an elegant round pedestal inside a sophisticated architectural studio. Place the garment centrally beneath a large refined arch structure in the background, creating a clean luxury fashion presentation. Keep the complete garment fully visible from top to bottom in a centered front-facing composition.

Use professional softbox lighting with controlled highlights, realistic fabric shadows, dimensional depth, crisp textile detail and polished high-end commercial fashion photography. Maintain a refined warm neutral luxury palette.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Change only the product presentation, pedestal, architectural environment, composition and lighting.

#### PS-13 — Product Commercial Shot | High Key

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Create a clean professional commercial product photograph of the complete garment against a seamless pure white background. Present the entire garment fully visible from top to bottom in a centered front-facing composition with clean edges and generous white space. Keep the scene completely free from decorative props, furniture, people, models and distracting elements.

Use high-key commercial lighting with bright even exposure and a controlled distinct hard grounding shadow beneath and behind the product. Maintain crisp garment edges, accurate color reproduction, sharp textile detail and clean marketplace-ready product photography.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Change only the product presentation, white background, composition and lighting.

#### PS-14 — Creative Display — Product Composition | Softbox

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Create a premium creative product composition featuring the complete garment as the central subject. Display the garment within an elegant decorative frame structure surrounded by tasteful fresh florals and carefully selected luxury props. Arrange the elements as a sophisticated fashion campaign composition while keeping the garment clearly visible, dominant and unobstructed.

Use professional softbox lighting with refined controlled highlights, realistic shadows, dimensional depth and crisp textile detail. Create a polished editorial-commercial aesthetic with balanced composition and premium visual hierarchy.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Props and decorative elements must support the composition without covering, modifying or replacing any part of the garment. Change only the presentation, props, environment, composition and lighting.

#### PS-15 — Social Media Commerce | High Key

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Create a premium social-commerce product photograph with the complete garment as the central subject. Use a bright, clean high-key studio environment with a polished modern commercial background and a visually engaging but uncluttered composition optimized for social-media product presentation. Keep the entire garment fully visible from top to bottom, centered and immediately recognizable.

Use bright high-key lighting with clean exposure, crisp garment edges, realistic textile texture, subtle controlled shadows and strong product clarity. Create a polished, modern, scroll-stopping commercial image without adding any written content.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Do not generate text, words, letters, logos, captions, slogans, prices, promotional messages, watermarks or typography anywhere in the image. Change only the product presentation, environment, composition and lighting.

#### PS-16 — Editorial Product Display | Natural Light  *(owner's MI-07 text; random picks moved to the server)*

Server appends, one of each per generation: **Environment** — Luxury Bedroom · Premium Living Room · Elegant Dressing Room · Boutique Corner · Heritage Interior · Modern Apartment · Designer Studio · Refined Courtyard · Minimal Editorial Interior *(Luxury Hotel Suite dropped — Hotel is out of the list)*; **Presentation** — Styled Flat Lay · Elegant Hanger Display · Premium Garment Rack · Draped Product Display · Neatly Folded Product · Editorial Chair Display · Boutique Table Display; **Styling bundle** — Handbag + Shoes · Handbag + Jewellery · Shoes + Sunglasses · Jewellery + Perfume Bottle · Handbag + Jewellery + Shoes · Traditional Accessories + Handbag · Minimal Fashion Accessories.

Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Create ONE premium editorial product photograph featuring the uploaded garment as the hero product, in the selected environment, using the selected presentation. This is a product-focused image, not a model portrait: no person, no model and no mannequin. Arrange the garment and the selected accessories into a sophisticated, commercially usable bundled fashion presentation. Accessories complement the garment without covering, altering or competing with it.

Use beautiful natural light from a large window or open architectural source, with soft directional illumination, gentle realistic shadows, subtle highlights, accurate colors and authentic fabric texture. Create a refined editorial atmosphere with natural depth and premium photographic composition.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

BUNDLED LOOK RULE: accessories are separate styling props only. They must never become part of the garment, change its design, hide embroidery or details, or read as additional clothing. One garment, one presentation, one styling arrangement. No text, labels, logos or watermark. Change only the presentation, environment, styling props, composition and lighting.

### 14.3 Section 2 — Model Only (Indoor 6 + Outdoor 7 base scenes)

**Rewritten 2026-10-08 from the owner's pasted model prompts.** Changes vs the owner's text: the person is not hardcoded ("girl", "age 13" removed — the code appends the person clause from Model Type + age), **the random pick moves from the prompt to the server** (one variant per generation → reproducible, bench-able), no back view. **The pose stays inside each prompt** (owner 2026-10-08) as a per-scene pool; the server picks one.

**How a Model Only prompt is assembled (server side):** `SCENE_GUARD + garment identity` (existing) → person clause (Model Type + age band) → **MX-0 wrapper** → **scene block** (this section, including its pose line) → colour clause (existing).

#### MX-0 — shared Model Only wrapper (fixed)

Create ONE premium commercial fashion photograph featuring one model wearing the uploaded garment. The uploaded garment is the single source of truth and must remain the primary visual focus. Keep the garment completely visible and unobstructed. Realistic anatomy, natural posture, realistic skin and hair, minimal elegant styling. Walking poses are toward the camera, never away.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly — original color, fabric, texture, print, embroidery, motifs, neckline, sleeves, borders, trims, buttons, stitching, embellishments, proportions, length, silhouette, construction, dupatta/scarf, bottom piece and every visible detail. No redesign, recoloring, simplification, stretching, shortening, distortion, replacement, removal, duplication or invented details. Fit the exact garment naturally to the model without changing its construction. Show the garment from the front only; never show or invent the back.

FINAL: One model • One complete outfit • One environment • One natural fashion pose • No collage • No duplicate model • No additional featured clothing • No labels • No logos • No watermark • No readable text (except MI-08's headline).

PRIORITY: Exact Garment → Natural Fit → Garment Visibility → Lighting → Model Presentation → Environment.

#### Indoor scenes

| ID | Scene | Lighting | Notes |
|---|---|---|---|
| MI-01 | Product Composition | Softbox | bundled look; scene variant pool |
| MI-02 | Courtyard | Daylight | |
| MI-04 | Boutique | Softbox | scene variant pool |
| MI-05 | Shopping Mall | High Key | blank signage; scene variant pool |
| MI-08 | Social Commerce | High Key | bundled look; **AI headline text + detail panels (owner exception, §7)** |
| MI-10 | Grey Background Studio | Softbox | plain |

*(IDs MI-03, 06, 07, 09, 11 are retired — gaps are intentional so existing references stay stable.)*

##### MI-01 — Product Composition | Softbox  (bundled look)

Scene (server picks ONE): Premium Luxury Studio · Editorial Fashion Studio · Modern Boutique Interior · Designer Dressing Room · Heritage Interior · Luxury Fashion Gallery · Minimalist Studio.
Pose (server picks ONE): Natural Standing · Relaxed Standing · Slightly Angled Standing · Gentle Walking · Looking Slightly Away · Simple Boutique Pose.

Place the model in the selected sophisticated indoor fashion environment with tasteful coordinated props such as a small handbag, appropriate footwear, flowers, a mirror, a premium chair, a side table or subtle boutique décor. Props complement the outfit and never cover important garment details.

Use professional softbox lighting: bright clean exposure, gentle fill, soft natural shadows, accurate colors and crisp embroidery/print detail.

##### MI-02 — Courtyard | Daylight

Pose (server picks ONE): Natural Standing · Relaxed Standing · Slightly Angled Standing · Gentle Walking · Looking Slightly Away · Standing Near an Architectural Feature.

Courtyard only. Place the model naturally in a refined courtyard during daytime, with elegant architectural details such as arches, carved stone, columns, warm neutral walls, greenery, flowers, subtle traditional décor or premium outdoor furniture. Keep the courtyard attractive but secondary to the garment.

Use natural daylight with soft directional sunlight, gentle ambient fill, realistic soft shadows and clean exposure. Preserve accurate garment colors and crisp fabric, embroidery and print detail, with realistic depth and a natural outdoor atmosphere.

##### MI-04 — Boutique | Softbox

Scene (server picks ONE): Luxury Indian Boutique · Modern Designer Boutique · Premium Ethnic Wear Boutique · Elegant Fashion Showroom · Minimalist Designer Store · High-End Bridal Boutique · Contemporary Indian Fashion Store.
Pose (server picks ONE): Natural Standing · Relaxed Standing · Slightly Angled Standing · Gentle Walking · Looking Slightly Away · Browsing a Garment Rack · Standing Near Display Shelves · Elegant Boutique Pose.

Place the model naturally inside the selected boutique with tasteful boutique elements such as curated clothing racks, elegant shelving, display tables, mirrors, subtle Indian décor, premium hangers, folded garments, handbags or minimal accessories. Props stay secondary and never hide or compete with the garment.

Use professional softbox lighting: large diffused key light, gentle fill, controlled highlights, accurate exposure, realistic soft grounding shadows and crisp textile detail. Maintain natural skin tones and accurate garment colors.

##### MI-05 — Shopping Mall | High Key  (blank signage)

Scene (server picks ONE): Luxury Fashion Mall · Premium Shopping Atrium · Modern Indian Shopping Mall · Designer Retail Floor · Elegant Mall Corridor · High-End Fashion Wing · Contemporary Shopping Gallery.
Pose (server picks ONE): Natural Standing · Relaxed Standing · Slightly Angled Standing · Gentle Walking · Looking Slightly Away · Walking Through Mall · Standing Near Storefront · Browsing a Display.

Place the model naturally inside the selected shopping-mall environment, using elegant storefronts, glass displays, polished flooring, escalators, architectural details and tasteful retail displays as background elements. Keep the environment sophisticated but secondary to the garment.

Use high-key commercial lighting with bright, clean, evenly diffused illumination, soft controlled shadows, accurate exposure, crisp textile detail and realistic depth. The garment must remain clearly visible from the chosen camera angle.

BLANK SIGNAGE ONLY: any visible storefront signs, banners, digital screens, posters or promotional panels must be completely blank, clean surfaces. No readable text, letters, numbers, brand names, logos, symbols or advertisements anywhere in the scene.

##### MI-08 — Social Commerce | High Key  (bundled look — owner's original restored, text + panels kept)

Theme (server picks ONE; it also picks the headline phrase): New Arrival · New Collection · Trending Design · Festive Edit · Designer Pick · New Season.

Create ONE premium social-media fashion launch post introducing the uploaded garment as a NEW PRODUCT / NEW DESIGN. It must look completely different from a traditional editorial product photo or e-commerce image.

FIXED COMPOSITION:
- LEFT 55–65%: one fashion model wearing the exact uploaded garment, full or three-quarter length, confident natural pose, complete outfit clearly visible.
- RIGHT 35–45%: 2–3 close-up detail panels from the SAME garment: (1) neckline / upper embroidery, (2) main embroidery / fabric texture, (3) bottom hem / border / sleeve finishing.

Detail panels must show real garment areas exactly as they appear in the reference — no invented details.

SOCIAL DESIGN: add tasteful premium fashion-brand typography and minimal graphic elements. Use only short messaging from this list: NEW ARRIVAL, NEW DESIGN, PREMIUM EMBROIDERY, NEW SEASON, DESIGNER PICK. Spell every word exactly; no other text, no prices, no brand names. Clean modern typography, elegant spacing, subtle lines/shapes, strong visual hierarchy. Never cover the model's face or important garment details.

STYLING: a sophisticated high-key fashion background with tasteful jewellery, earrings, bangles, handbag, perfume, shoes, flowers or other premium accessories. Props remain secondary to the garment.

LIGHTING: bright high-key commercial lighting, soft diffused illumination, clean highlights, realistic shadows, accurate colors and crisp textile/macro detail.

STRICT GARMENT PROTECTION: the uploaded garment is the ABSOLUTE SINGLE SOURCE OF TRUTH. Preserve exact color, fabric, texture, print, embroidery, motifs, neckline, sleeves, borders, trims, stitching, embellishments, proportions, length, silhouette, construction, dupatta/scarf, bottom piece and every visible detail. No redesign, recoloring, added embroidery, altered print, changed neckline/sleeves, invented details, removal, stretching, shortening or distortion.

IMPORTANT: this must look like a premium Instagram/Facebook fashion launch announcement, combining model + close-up product storytelling + graphic information + lifestyle styling. Not a simple catalogue photo, flat lay, mannequin shot or standard editorial image.

FINAL: Model left • 2–3 detail panels right • New-product launch aesthetic • High-key • Premium typography • Jewellery/lifestyle props • Exact garment preservation • No duplicate garments • No watermark.

##### MI-10 — Grey Background Studio | Softbox

Pose (server picks ONE): Natural Standing · Relaxed Standing · Slightly Angled Standing · Elegant Standing · Gentle Walking · Looking Slightly Away · Subtle Editorial Pose.

Plain seamless medium-light grey studio backdrop, clean and distraction-free, with a subtle tonal gradient and a smooth floor transition. No furniture, décor, artwork, shelves or unnecessary props. Show the complete outfit from head to toe whenever possible; no mannequin.

Use professional softbox lighting: large diffused key light, subtle fill, soft natural grounding shadow, controlled highlights, accurate exposure, realistic skin tones and crisp fabric/detail visibility.

### 14.4 Model Only — Outdoor (7 scenes; shared outdoor block + one scene line each)

Outdoor lighting is only **Daylight** or **Natural Light**. The owner's single `MO-MASTER` prompt (random pick of one of seven backgrounds) is **split into 7 scene entries** because the retailer picks the scene (§2.3). The shared block + scene line replace the master.

#### MO-0 — shared outdoor block (fixed)

POSE: one natural, elegant fashion pose appropriate for the selected environment (server picks ONE standing, relaxed or gentle-walking pose; walking is toward the camera).

SCENE ACCURACY: the selected environment must be immediately recognizable as its category. Never substitute a generic outdoor scene, garden, indoor room, studio, showroom or unrelated location.

LIGHTING: use only the lighting specified for the scene — Daylight or Natural Light. Realistic outdoor illumination, accurate colors, soft natural shadows and detailed fabric rendering. No studio softbox, flash, sunset, golden hour, evening or night lighting.

COMPOSITION: one full-body or three-quarter fashion photograph. The complete garment stays clearly visible and unobstructed. Show enough of the environment to establish the location while keeping the garment the visual hero.

#### Scene lines (verbatim from the owner's master)

| ID | Scene | Lighting | Scene line |
|---|---|---|---|
| MO-01 | Modern Street | Daylight | stylish real urban street with sidewalks, buildings and street architecture |
| MO-02 | Cafe | Natural Light | clearly recognizable outdoor café with tables, chairs and café surroundings. Signage must be blank |
| MO-03 | Terrace | Daylight | open terrace with visible railing, outdoor flooring and surrounding architecture |
| MO-04 | Balcony | Natural Light | clearly recognizable open balcony with visible railing and exterior surroundings. Never make it look like an indoor room |
| MO-05 | Beach | Daylight | visible sand, shoreline, ocean/water and open sky |
| MO-06 | Poolside | Daylight | clearly visible swimming pool, water and pool deck (hidden for teen models) |
| MO-07 | Tropical Resort | Natural Light | recognizable resort architecture, tropical plants, palms and landscaped surroundings |

### 14.5 Pose prompts — retired

Owner 2026-10-08: pose is inside each prompt (§14.3, §14.4). No PO-xx prompts, no pose picker.

### 14.6 Other axes — kept (Model Only)

| ID | Axis | Values |
|---|---|---|
| MT-01…04 | Model Type | Adult Women · Teen Girls · Adult Men · Teen Boys (**no kids**) — code appends the person clause |
| MA | Age (template with an `{age}` placeholder) | proposed bands: Teen 13–19 · Adult 20–39 · Mature 40–59 · Senior 60+ (⚠ not approved) |
| MS-01…07 | Model Style | Indian Slim · Natural · Festive · Bridal · Modern Fashion · Office/Professional · Casual |

Removed 2026-10-08: Frame (FR), Angle (AN), Photography Style (PH), Product View (PV), Mannequin/Ghost (PF).

### 14.7 Category overrides — retired

Owner 2026-10-08: no missing prompts. The kurti top-only rule already exists in code (`isTopOnlyGarment` clause). Unstitched / bottoms / saree / multi-piece stay as **gating rules** (§4–§6) and rely on the garment-identity clause; no separate CO prompts.

### 14.8 Counts (2026-10-08)

| Group | Count | Status |
|---|---|---|
| Product Only prompts (PS-03…16) | 14 | all owner-written |
| Model Only indoor (MI-01, 02, 04, 05, 08, 10) | 6 | all owner-written (rewritten per §14.3; MI-08 original restored) |
| Model Only outdoor (MO-01…07) | 7 | owner text, split from the master |
| Shared wrappers (MX-0, MO-0) | 2 | derived from owner text |
| **Total prompts** | **29** | nothing missing |

Next: bench each prompt on the four Fal models (§15.5).

### 14.9 Change log vs the previous register

- Reordered and renamed to the owner's pasted list (Premium Product Shot, Folded Boutique Fold, Boutique Fold, Luxury Studio Product, Editorial Studio Product, Creative Display Product Composition).
- Removed Support / Gate columns; removed the separate Lighting list (lighting inside each base prompt).
- Poses: Turning and Looking Back removed 2026-09-30.

**2026-10-08 round 1:** Product Only replaced by the owner's `Prompts-list.md`; Model Only rewritten (person and random-pick out of the prompt); MO-MASTER split into 7 scenes.
**2026-10-08 round 2 (owner):** PS-01/02 and MI-03/06/09/11 deleted (no drafts); MI-07 → PS-16; MI-08 original text + detail panels restored; pose moved back inside the prompts, PO prompts and pose picker deleted; Frame/Angle/Photography/Product View/Mannequin-Ghost and category overrides removed; §15 rewritten for Fal.ai.
**2026-10-08 round 3 (owner):** labels fixed (Qwen - Good, Nano Banana - Best); credits shown = base + 2, no $/₹; Grok default; admin add-provider flow added (§15.6).

---

## 15. Retailer-selectable AI models (admin-managed, Fal.ai) — updated 2026-10-08, spec only

**Owner decisions (2026-10-08):** the retailer can choose which AI model generates the image · **all four run on Fal.ai** · more providers later (owner named **Runway ML**, app.runwayml.com) · models are added/removed from the **admin dashboard** · the retailer sees **raw model names with a tag**, e.g. `Grok - Best`, `ChatGPT - Fast`.

### 15.1 The four models (Fal endpoints already in code)

All four already exist in the admin bench table `FAL_EDIT_ENGINES` in `apps/api/src/lib/fal-client.ts` (endpoint + fixed extra params; bodies read from each endpoint's OpenAPI on 2026-09-19). Credit figures are the owner's, taken from the admin test page (2026-10-08). **Retailer sees credits only — no $ / ₹ price.**

**Credit rule (owner):** shown credits = admin-test-page credits **+ 2** (platform margin). Nano Banana is 8 on the test page → **10** to the retailer.

| # | Retailer label | Fal endpoint | Extra params | Test-page credits | **Retailer credits (+2)** |
|---|---|---|---|---|---|
| 1 | **Grok - Best** · **default** | `xai/grok-imagine-image/v2.0/edit` | `resolution: 1k` | 8 | **10** |
| 2 | **ChatGPT - Fast** | `openai/gpt-image-2/edit` | `quality: low` | 3 | **5** |
| 3 | **Qwen - Good** | `fal-ai/qwen-image-edit-2511` | — | 4 | **6** |
| 4 | **Nano Banana - Best** | `fal-ai/nano-banana/edit` | — | 8 | **10** |

Not offered to retailers: FLUX.1 Kontext Pro (`fal-ai/flux-pro/kontext`, 8 → would show 10) — it stays the current code default / admin-bench engine, and can be added from admin as a fifth model any time. Note: Grok and Nano Banana both carry the "Best" tag (owner's labels) — admin can change a label without code.

All take `prompt` + `image_urls: [product photo]` and return `images[0].url`, so `generateFalEdit` already runs any of them. Single key: `FAL_API_KEY` (Admin → Integrations).

### 15.2 What exists today

- **Hard-coded:** the `FAL_EDIT_ENGINES` table and the `STUDIO_ENGINES` key list in `@kanchuki/shared` (a test keeps them in sync). Adding a model today = a code change + deploy. Retailers cannot choose; the engine comes from `studio_styles.engine`, a **free-text** column.
- **Admin-editable patterns to copy:** `studio_styles` (status DRAFT/PUBLISHED/HIDDEN, `plans[]`, `sort_order`) and `AiProviderConfig` (F-023: `is_active`, `credits_per_call`, `api_key_name`).

### 15.3 Proposed design — move the table into the DB

New admin-managed catalog, working name **`studio_engines`** (verify the schema before building):

| Field | Purpose |
|---|---|
| slug | stable key (replaces the code key, e.g. `gpt_image_2_low`) |
| label | what the retailer sees — `<Model name> - <tag>` (free text, admin-editable) |
| provider | `fal` now; `runway` etc. later — selects the code adapter |
| model_id | the provider's endpoint string (Fal: e.g. `openai/gpt-image-2/edit`) |
| extra_params | JSON merged into the request (`{"quality":"low","output_format":"jpeg","num_images":1}`) |
| credits_per_generation | **base** credits (the admin-test-page figure, e.g. 8) |
| credits_markup | platform margin added on top, default **+2** → retailer is charged and shown `base + markup` (Nano Banana 8 + 2 = **10**). One global default, per-model override possible |
| plans[] | subscription tiers that may pick it |
| accepts_reference_image | **must be true to publish** — blocks text-to-image-only models (the RC-027 failure) |
| status, sort_order, is_default | DRAFT / PUBLISHED / HIDDEN, order, pre-selected model |

- **Add a Fal model = admin only, no code**, as long as it uses the same Fal shape (`prompt` + `image_urls` → `images[0].url`). A model with a different shape needs a one-off adapter.
- **Add a new provider (Runway ML) = one code adapter once** (new `provider` value, own key in Integrations, own submit/poll); after that its models are added from admin like Fal's.
- **Delete = HIDDEN (soft).** Past generations keep their engine reference; hard-delete blocked while any generation or style references it.
- `studio_styles.engine` (free text) becomes an optional **default engine** per style (FK).
- Seed the table from `FAL_EDIT_ENGINES` so nothing regresses; keep the code table as the fallback until the DB path is proven.

### 15.4 Retailer UX

After choosing Product Only / Model Only and a style, a **"Generate with"** list shows the published engines allowed on the plan, as `Grok - Best`, `ChatGPT - Fast`… each with its credit cost. The admin-set default is pre-selected. No automatic fallback to another model on failure (surprise cost): show the error and refund the credit.

### 15.5 Bench implication

The same final prompt goes to all four models, so differences are the model's. Run **style × model** on a few garment types (lehenga, kurti, unstitched, kids, saree) and score garment fidelity first, then scene quality. Per-model checks: Qwen's ≈1 MP output vs the ≤80 KB compressor; GPT "low" tier detail loss on embroidery; whether each honours "headless torso form" (PS-03/04), "blank signage" (MI-05), **the exact MI-08 headline spelling**, and the 2–3 detail panels. Use the existing admin bench (`photo-cleanup-test`).

### 15.6 Adding another provider later (owner #4: "when I get the API, add it in admin, then mention the models")

Wanted flow, no deploy per model:
1. **Admin → Integrations:** paste the provider API key (same place as `FAL_API_KEY`; stored as a secret, never in the model row).
2. **Admin → Studio Engines → Add:** pick `provider`, enter `model_id`, `label` (`<Name> - <tag>`), base credits, plans, then publish.
3. Model appears in the retailer's **"Generate with"** list.

Honest limit: step 2 is code-free **only for providers that already have an adapter**. Fal has one, so every Fal model is admin-only. **Runway ML (or any other provider) needs one adapter written once** (its submit/poll/response shape), after which all its models are admin-only too. Until the adapter exists, the provider is not selectable in the admin dropdown. A "Test connection" button on the engine row (one cheap generation) is proposed so a wrong key/model id is caught before publishing.

### 15.7 Still to decide (owner)

Whether to also offer FLUX.1 Kontext Pro to retailers · plan gating (which plans see which model; default = all) · Runway ML: which image-edit model and whether it also covers video (F-034) · confirm "+2" is a flat add for every model (current assumption) rather than a percentage.
