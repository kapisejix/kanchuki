# F-043 Social Post Scheduler — launch checklist (owner)

Spec: `docs/tasks/pending/post-scheduler.md` (§9 Meta, §10a–§10e as built). Nothing here is run by the agent:
merging to `main` auto-deploys; migrations 128/129 are already applied in prod.

## 1. Before merging (order matters — PRs are stacked)

- [ ] Merge #80 (publish tick) → #81 (mobile UI + status) → #82 (templates) → Task 5 PR. Retarget each to `main` after the one below it merges.
- [ ] Railway API build succeeds and the image has fonts: `fc-list | grep -i dejavu` in a Railway shell (Dockerfile now installs `fonts-dejavu-core`).
- [ ] After deploy, logs show both jobs registered: `schedule-publish-tick` (`*/5 * * * *`) and `schedule-token-health` (`45 1 * * *`).
- [ ] Admin → Plan Feature Matrix: `SOCIAL_SCHEDULER` ON for the plans you want; Plan Limits: `SCHEDULED_POST` (month, -1 = unlimited) and `ACTIVE_SCHEDULE_PLAN` (per platform, seeded 1).

## 2. Meta App Review (spec §9)

Permissions (Advanced Access, same set the Composer uses — nothing new for scheduling):
`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`, `instagram_basic`, `instagram_content_publish`.
Do NOT request `instagram_business_content_publish`.

- [ ] App in **Live** mode; Business Verification done
- [ ] Privacy Policy URL, Terms URL, Data Deletion URL, icon 1024×1024, category, contact email
- [ ] OAuth redirect `https://kanchuki.app/social/connect/callback` registered; Android key hashes (App ID `1758308975480748`)
- [ ] One screencast per permission: connect Page → plan form → calendar review/confirm → post live on Page/IG. Show pause/skip/delete (the unattended-publish justification)
- [ ] Test account: a user with a Page + linked IG Business account, plus written test steps

## 3. First live run (smoke, one owner-controlled Page + IG)

- [ ] Create a 1-week plan, 2 slides/day, confirm. Calendar shows rows; first slot is in the future.
- [ ] Wait for the 5-min tick after a slot: post appears on the Page; `scheduled_posts.status = POSTED`, `social_post_id` set.
- [ ] Style one slide (`white_price`): first render is slow (~5 s cold) — expected. Text is readable, not boxes (font check).
- [ ] Pause a plan: no post goes out at the slot. Resume within 2 h: it posts; resume after 2 h: row shows MISSED + Retry.
- [ ] Disconnect the account in the app: within a tick the plan shows paused + "Reconnect"; manager sees "Ask the shop owner to reconnect".

## 4. After the first live week

- [ ] Grep API logs for `[meta-graph] ... failed` and read `fb_code` / `fb_subcode`. The code→reason map (spec §10b) is from docs, not observed. Widen the classifier only for codes you actually saw landing in the generic bucket.
- [ ] Check R2 growth under the rendered-image keys (Admin → Storage Report). Add an ENDED-plan cleanup only if it matters (R2 objects only — DB role has DELETE revoked, RC-049).
- [ ] Check `scheduled_posts` row growth. A retention purge needs the purge role + GRANT + migration — not built.

## 5. Device test script (3 mobile screens, owner + a manager login)

**`social/schedule/index` (status)**
1. Owner: card per connected platform shows token state, posts left, active plans `n/max`, Studio shoots left, next post.
2. Force a failure (disconnect the account) → failure row with plain-language reason; Retry / Skip / Edit work.
3. Manager: same card, no Reconnect, pause/resume works. Salesperson: no entry point, banner hidden.
4. Banner on home + Growth hub appears when paused / failed / token ≤7 days; clears when resolved.

**`social/schedule/new` (plan form)**
1. Pick account, carousel vs single, weekdays, per-day min–max, IST time, source (newest/category), horizon.
2. Min > max is refused; second plan on the same platform is refused when the limit is 1.
3. Cover + rotation pool chips save and show on the calendar.

**`social/schedule/[id]` (calendar)**
1. Days group by IST date; thumbnails load; styled slides show the styled label.
2. Edit caption; AI caption fills; skip a post; remove a slide; swap product; other photo.
3. Style slide / Style post / Style all; rotate pool; original resets.
4. Confirm summary lists post count; End plan frees the platform slot.
5. Manager: caption/skip/retry/pause only; create/confirm/end/slide edits absent.
