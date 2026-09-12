# Play Store Release Log

> Play Console's "highest versionCode ever uploaded" is state that lives on Google's
> servers, not in this repo — nothing in git can be diffed against it. This file is
> the substitute source of truth. **Rule: before triggering any AAB build, read this
> file and use `last row's versionCode + 1`.** Add a row after every successful
> upload (Play Console accepts it, not just "build succeeded").

## Uploads

| versionCode | version | uploaded | track | CI run | commit | notes |
|---|---|---|---|---|---|---|
| 2 | 1.0.0 | 2026-09-09 | Closed testing | `34348392715` | `6fc542ae` | media-permissions hardening, AD_ID strip, OTP keyboard fix |
| 3 | 1.0.0 | 2026-09-11 | Open testing | `34617176198` *or* `34619372677` | `c14cc6f3` *or* `0305d589` | OTP double-send (RC-015), FB reconnect loop (RC-016), AI Studio tab bug (RC-017), AI Studio pick-reset + FB login loop fixed (RC-017/RC-018), CI lint fully green — **see the ambiguity note below** |

### 🚧 In flight — versionCode 4 is reserved, not yet uploaded

`apps/mobile/app.json` was bumped to **`versionCode: 4`** on 2026-09-12. The last
uploaded row above is 3, which is exactly why: a rebuild at versionCode 3 would be
rejected, the same way `34612919927` built versionCode 2 after 2 was already used.

When the build is uploaded, **add a new row above with the run ID and SHA recorded at
trigger time.** Do not bump to 5 until versionCode 4 has actually been uploaded — and
if the upload is abandoned, revert `app.json` rather than skipping a number, so this
log and the code stay in step.

### ⚠️ The versionCode 3 row is ambiguous — do not trust the commit cell

Four `android-release.yml` runs on 2026-09-11, and nobody recorded which artifact was
actually downloaded and uploaded:

| Run | Triggered (UTC) | Commit | versionCode at that HEAD | Outcome |
|---|---|---|---|---|
| `34612164008` | — | — | — | **cancelled** |
| `34612919927` | 14:54 | `ae6e32dd` | 2 | built, but versionCode 2 was already used → upload rejected |
| `34617176198` | 15:36 | `c14cc6f3` | 3 | built |
| `34619372677` | 15:59 | `0305d589` | 3 | built |

Both surviving v3 runs contain the same code (only a docs diff between them), so the
app behaves identically either way — but the provenance is unproven. **A screenshot
cannot tell you which one is installed; the build-info footer can** (see below).

## How to trace an installed build back to its CI run

The footer at the bottom of mobile Settings reads `BUILD <7-char-sha>` with
`<channel> · <YYYY-MM-DD HH:MM UTC>` beneath it; tapping it copies
`build <7-char-sha> · ci · <UTC>`. Then:

```
gh run list --workflow=android-release.yml --limit 10 \
  --json databaseId,headSha,createdAt,conclusion
```

Match the footer's SHA against `headSha`. That is the whole point of the footer —
before it existed, "I rebuilt and it still doesn't work" was unverifiable because
nothing tied an installed binary to a commit.

## Rule added 2026-09-12

**Record the run ID and commit SHA in the upload row at the moment you trigger the
build, not afterwards.** Reconstructing it after the fact is what produced the
ambiguous v3 row above. If you trigger a build and then trigger another before
uploading, the second one overwrites your only signal of which is which.

If the artifact is ever in doubt, the signing certificate identifies it without any
Play Console access — see `docs/META-FACEBOOK-LOGIN-SETUP.md` §3, "Verifying which
key signed a shipped `.aab`".

## Verified provenance (2026-09-12)

The `app-release-aab` artifact from run `34619372677` was downloaded and its
signature block inspected. It is signed by the upload key with SHA-1
`16:3B:21:32:B6:DB:00:C4:0D:AF:04:2F:ED:10:3D:8D:87:CC:AF:45`
(Meta key hash `FjshMrbbAMQNrwQv7RA9jYfMr0U=`), alias `f8de0ed2…`, signature file
`META-INF/F8DE0ED2.RSA`.

Two things this establishes:

1. The CI secret `ANDROID_KEYSTORE_BASE64` holds the **same** keystore as the local
   EAS copy `apps/mobile/@s.numbhraal__kanchuki.jks` — a fact GitHub secrets cannot
   otherwise reveal, since they are write-only.
2. `apps/mobile/@s.numbhraal__kanchuki_OLD_1.jks` is **not** a rotated key: it holds
   the identical certificate and 2026-09-02 → 2054 validity. Nothing needs
   re-registering because of it.

Note this is the **upload** key. Testers installing from Play get an app re-signed by
Google's **Play App Signing** key, whose hash is a different value that only the Play
Console shows — both must be registered with Meta. See
`docs/META-FACEBOOK-LOGIN-SETUP.md` §3.
