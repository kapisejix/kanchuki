# Retailer-Facing Photo Retention & AI-Training Notice

**Purpose:** the copy a retailer is actually shown about how their photos are used, kept, and
deleted — plus the placement decision and the assertions a reviewer must verify.
**Built:** 2026-09-24 (launch-readiness §7A.6). **Legal review:** pending (board §7B.1).

---

## 1. What this is (and what it deliberately is not)

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

## 2. Placement

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

## 3. The copy (verbatim from the page)

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

## 4. Facts the copy asserts, and where each comes from

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

## 5. What legal must review (§7B.1)

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

## 6. Change procedure

1. Edit `apps/web/src/app/privacy/page.tsx`.
2. Re-quote the section verbatim in §3 and bump “Last updated”.
3. Run `npx vitest run src/app/privacy/__tests__/page.test.tsx` (it fails if the no-training
   claim, the 15-day figure, the removal date, or the deletion route is dropped).
4. Re-request legal review (§7B.1) before merge if any §4 fact changed.
