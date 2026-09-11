# Play Store Release Log

> Play Console's "highest versionCode ever uploaded" is state that lives on Google's
> servers, not in this repo — nothing in git can be diffed against it. This file is
> the substitute source of truth. **Rule: before triggering any AAB build, read this
> file and use `last row's versionCode + 1`.** Add a row after every successful
> upload (Play Console accepts it, not just "build succeeded").

| versionCode | version | date | track | notes |
|---|---|---|---|---|
| 2 | 1.0.0 | 2026-09-09 | Closed testing | media-permissions hardening, AD_ID strip, OTP keyboard fix |
| 3 | 1.0.0 | 2026-09-11 | Open testing | OTP double-send (RC-015), FB reconnect loop (RC-016), AI Studio tab bug (RC-017), CI lint fully green |
