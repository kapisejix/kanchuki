# Meta App Review — Facebook + Instagram publishing (owner runbook)

> Owner-only. Drafted 2026-11-17 for `docs/tasks/pending/ai-promo-video.md` task **T0**. Nothing here is automated and the agent never touches the Meta dashboard.
> Source of truth for what the app requests: `apps/mobile/src/lib/facebook-auth.ts:27-35`. Older setup notes: `docs/DEPLOY.md` §6–§8 and `docs/tasks/pending/post-scheduler.md` §9 (the F-043 checklist — **one submission can cover both**).
> **Do not put passwords or tokens in this file or in the repo.** Keep test-account credentials in a password manager and paste them into Meta's reviewer-instructions box only.

## 0. Where things stand (owner report, 2026-11-17)

| Item | State |
|---|---|
| App mode | **Development** |
| `instagram_basic` | **Rejected** — resubmit |
| `instagram_content_publish` | **Rejected** — resubmit |
| `pages_manage_posts` | **Rejected** — resubmit (this also blocks real retailers posting to Facebook Pages) |
| Facebook app permissions | "FB app approved" — **record exactly which** ones in §1 (`pages_show_list`, `pages_read_engagement`, `business_management`?) |
| Business verification | Done |
| Instagram image posts | Work, but only for accounts with a role on the app |

Why it matters: in Development mode only people with a role on the app (admin/developer/tester) can complete the login. Real retailers need **Advanced Access** on the publish permissions **and** the app switched to **Live**.

## 1. Step 1 — Get the exact rejection reason (do this first)

Resubmitting without fixing Meta's stated reason usually repeats the rejection.

1. developers.facebook.com → your app → **App Review → Requests**.
2. Open each rejected permission and copy Meta's reviewer message **verbatim**.
3. Paste it into the table below (or send it to the agent so the screencast script can be rewritten against it).

| Permission | Status today | Meta's rejection text (verbatim) |
|---|---|---|
| `pages_show_list` | ? | |
| `pages_read_engagement` | ? | |
| `business_management` | ? | |
| `pages_manage_posts` | Rejected | |
| `instagram_basic` | Rejected | |
| `instagram_content_publish` | Rejected | |

Typical reasons (general experience, **not confirmed for your case**): the screencast stops at the permission dialog and never shows the post on the real Page or Instagram profile; the reviewer could not reproduce the flow (mobile-only app, no usable test login); the written use case does not match what the video shows; the app was in a state where the permission could not be exercised; compliance fields (privacy / data deletion) were incomplete.

## 2. Step 2 — Pre-flight checklist

- [ ] **Compliance fields** (`DEPLOY.md` §6): Privacy Policy `https://kanchuki.app/privacy`, Terms `https://kanchuki.app/terms`, User Data Deletion instructions URL `https://kanchuki.app/account-deletion` (a URL explaining how a user asks us to delete data, **not** a callback), category, 1024×1024 icon, Data Use Checkup done and not lapsed.
- [ ] **Valid OAuth redirect** registered: `https://kanchuki.app/social/connect/callback`.
- [ ] **Business verification** shows Verified (owner reported done).
- [ ] **Test accounts for the reviewer** (create dedicated ones, never a real retailer's):
  - A Facebook account added to the app as **Tester** (invitation **accepted** — an unaccepted invitation behaves like no role and login fails with `No Facebook Pages found on this account…`).
  - A **Facebook Page** that account administers.
  - An **Instagram Business or Creator account linked to that Page** (a personal Instagram account cannot publish through the API).
  - A **retailer account** in the Kanchuki app logged in on a phone, with a product that has a good photo.
- [ ] **A build the reviewer can run.** The flow is mobile-only. Say how to get it (Play internal-testing link or an APK link) in the reviewer notes, and make sure the build has the Facebook SDK configured (key hashes added, per memory `kanchuki-fb-key-hash-fix-2026-10-14`).
- [ ] Make **at least one successful** real API call per permission before submitting (Meta states this for some permissions; owner reports image posts already work — keep a post visible).
- [ ] Record the screencasts (§4) **after** the checks above.

## 3. Step 3 — What each permission is for (use this wording)

Write the use case in plain language and make it match the video exactly.

| Permission | Use-case text |
|---|---|
| `pages_show_list` | "After a clothing-store owner logs in with Facebook, we list the Pages they manage so they can choose which Page to connect to Kanchuki." |
| `pages_read_engagement` | "Required companion to publishing. We read basic Page information (name, id) so the owner can confirm which Page is connected, and show post status." |
| `business_management` | "Graph requires it to read the owner's Pages through the Business asset API when a Page is owned by a Business." |
| `pages_manage_posts` | "The owner picks a product from their catalog in our app and publishes a post (photo, carousel, or video) with a caption to **their own** Facebook Page. We never post without the owner tapping Publish." |
| `instagram_basic` | "We resolve the Instagram Business/Creator account linked to the owner's Page, so the owner can see which Instagram profile is connected." |
| `instagram_content_publish` | "The owner picks a product and publishes a photo or carousel to **their own** Instagram professional account from our app. (Reels are added only after the Reel feature ships — see §6.)" |

Keep the phrase "their own Page / their own Instagram account" in every one — it is the use Meta approves for.

## 4. Step 4 — Screencast scripts

Use the **real Kanchuki app** on a real phone (Android screen recording with touches shown), 1080p, voiceover or on-screen captions in English. One video can cover several permissions if each is clearly demonstrated, but a separate short clip per permission is safer. Do not skip the result.

**Video A — Facebook (`pages_show_list`, `pages_read_engagement`, `business_management`, `pages_manage_posts`)**

1. Open Kanchuki, signed in as the test retailer. Settings → Social Media → **Connect Facebook**.
2. The Facebook login dialog appears: **show the list of permissions being requested** (pause 3 s on it). Approve.
3. App shows "Connected! Linked <Page name>" — show the Page name.
4. Create post → choose a product → write or accept a caption → **Publish** to Facebook.
5. Switch to the Facebook app / browser on the **real Page** and show the post live, with the same photo and caption. Show the Page name and URL.

**Video B — Instagram (`instagram_basic`, `instagram_content_publish`)**

1. Same Connect flow, now **with Instagram selected**; show the permission list including the Instagram permissions. Approve.
2. App shows the connected Instagram handle.
3. Create post → choose a product → select **Instagram** as the target → **Publish**.
4. Switch to the **Instagram app** on the same phone and show the post on the profile (open it, show the handle, the image, the caption).

Tips that avoid the usual rejection: do not cut between publishing and the result; do not show only a success toast; show names and handles that match the written use case; if anything needs a delay (container processing), say so and wait on screen.

## 5. Step 5 — Reviewer notes (paste into Permissions and Features → reviewer instructions)

```
Kanchuki is a mobile app (Android) for clothing store owners in India. The owner connects
their own Facebook Page and Instagram professional account and publishes product posts
from a catalog they have built in the app.

How to test:
1. Install the build from: <INTERNAL TESTING LINK OR APK LINK>
2. Log in with phone number <TEST PHONE> and OTP <TEST OTP>   (review login — do not share publicly)
3. Settings → Social Media → Connect Facebook / Instagram. Use the Facebook test user:
   <TEST FB EMAIL> / <PASSWORD — enter in the Meta box only>
   The test Page is "<PAGE NAME>" and the linked Instagram account is @<HANDLE>.
4. Create post → pick any product → choose Facebook and/or Instagram → Publish.
5. The post appears on the Page and on the Instagram profile above.

We publish only to the owner's own Page/account, and only when the owner taps Publish.
Data deletion: https://kanchuki.app/account-deletion
```

Replace every `<…>`. Check the phone/OTP review login actually works on the build you reference (`REVIEW_PHONE` / `REVIEW_OTP` are env-controlled — CLAUDE.md index #85; keep them unset outside review windows).

## 6. Reels and the AI label — do NOT claim what the app cannot do yet

- Today an Instagram target with a video posts the **photo** instead (spec §1). Do **not** describe Reels or video in the Instagram use case until `publishInstagramReel()` (spec T1/T2) is merged **and** on the build the reviewer installs. Meta reviews against what you describe.
- Instagram Reels are expected to use the same `instagram_content_publish` permission. **Not confirmed** — check the permission's own page in the dashboard before relying on it.
- **Recommendation:** submit now for photos, carousels and Facebook posts (what exists), and build T1/T2 in parallel. If T1/T2 land before you submit, add a third short clip: connect → choose a video → publish as a Reel → show the Reel on the profile with the "AI info" label if it is an AI clip.
- AI clips are published with `is_ai_generated=true` (Meta changelog 2026-06-22). Mention this in the notes **only when** that feature is in the build.

## 7. Step 6 — Submit and follow up

1. App Review → Permissions and Features → request Advanced Access for each permission with its text (§3), the video(s) (§4), and the notes (§5). Submit each rejected permission again; confirm the previously approved ones are not re-opened by accident.
2. Calendar time is days, sometimes longer (`DEPLOY.md` §8 says ~1–3 days). Reply to reviewer comments in the thread; a vague reply starts a new cycle.
3. **After approval:**
   - [ ] Confirm each permission shows **Advanced Access — approved**.
   - [ ] Flip **App Mode → Live** (`DEPLOY.md` §7). In Development only role accounts work.
   - [ ] Re-run the Video A / Video B flows with a **non-role** account (a real friendly retailer with a Page + IG Business account) to prove Live works.
   - [ ] Tell the agent: update `docs/DEPLOY.md` §8 status, `docs/tasks/pending/ai-promo-video.md` T0 → ✅, `docs/tasks/pending/post-scheduler.md` §9, `docs/tasks/README.md`, and add a BUILD-LOG line. (Do not trust this runbook's checklist for status — update by what the dashboard shows.)
4. If rejected again: copy the new text into §1 and the agent will revise §3/§4/§5 against it. Do not resubmit the same video.

## 8. Risks and unknowns (so nobody over-promises)

- Business verification may have been the real blocker for the Facebook permissions; owner reports it is done, but the Instagram rejections have not been explained to me.
- Whether `pages_manage_posts` was rejected for a missing demo or a policy reason is unknown until §1 is filled.
- Reach effects of the AI label, and exact Meta policy wording for AI video, come from third-party sources — verify in Meta's own policy pages before promising retailers anything.
- Data-retention terms of the video-generation provider (Fal) are **not verified** — confirm before launch (spec §9).
- Meta may also ask for a **Data Use Checkup** or **Business Use** questionnaire annually; if it lapses, login can silently fail (`DEPLOY.md` §6).
