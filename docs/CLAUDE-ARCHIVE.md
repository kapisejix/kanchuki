# CLAUDE.md archive

Moved out of CLAUDE.md 2026-11-16 to stay under the 150k-char instruction limit. Verbatim.

### ✅ RESOLVED 2026-08-13: MSG91 OTP live-config session — wire-format fix + DLT finding

**What happened (2026-08-13):** the OTP feature from 2026-08-12 is deployed and _code-verified_ end to end, but **real SMS delivery is blocked by MSG91 account setup, not code.** Two things shipped this session:

1. **MSG91 v5 SendOTP wire-format fix (commit `cbc55b8`, deployed + live):** the original send put `authkey` in an HTTP header and `template_id`/`mobile`/`otp` in the JSON body, but the v5 contract puts everything in the **query string** (`POST control.msg91.com/api/v5/otp?authkey=&template_id=&mobile=&otp=`), and failures come back as **HTTP 200 + `{"type":"error"}` in the body** — the old code only checked `res.ok`, so it reported "OTP sent" while no SMS was ever dispatched. Fixed in `apps/api/src/lib/msg91-otp.ts` (query-string + parse body, require `type:"success"`) and the same latent bug in the undeployed `supabase/functions/send-sms-hook/index.ts`. Also rode along: the onnxruntime CUDA-skip build fix in both Dockerfiles.

2. **DLT root cause (NOT a code bug — do not re-diagnose):** with the wire format fixed, MSG91 returns `type:"success"` but no SMS arrives and no delivery webhook event fires. **The sender ID is not DLT-registered** (user confirmed: "dlt not registered"). India requires TRAI DLT registration for every transactional sender ID; the carrier silently drops the SMS post-acceptance. The widget flow (mobile) works because MSG91's own provisioned route bypasses the per-customer DLT sender — yesterday's widget OTP arrived. **Fix is account-side only:** register the sender ID under MSG91 → Sender ID → DLT registration (2–7 working days). No code change needed.

**Verified this session:** new API build live (routes respond; `cbc55b8` confirmed in deployment metadata); `MSG91_AUTHKEY` + `MSG91_TEMPLATE_ID` set (probe flipped 500→401); `MSG91_WEBHOOK_SECRET` set and **matching the dashboard** (webhook probe → `{"received":true}`, wrong secret → 401); tests: msg91-otp 23/23, auth-msg91 11/11, webhooks/msg91 12/12, auth-team 9/9, web widget 13/13, API tsc clean. (The "transient Upstash cold-start / 2s connectTimeout" note once written here was a **misdiagnosis** — the real cause was the lazyConnect handshake race, **resolved later the same day**, see the "Redis handshake race" entry below. Do not re-blame timeouts.)

**Resolved 2026-09-04 (account/device side):**

1. ✅ **DLT registration** of the sender ID — done. API-path SMS delivery no longer blocked.
2. ✅ Mobile **EAS build** — built, tested send/verify on a real phone, working.
3. ✅ Web widget deployed with the `NEXT_PUBLIC_MSG91_*` build args.

**Still pending:** 4. Lock the verifyAccessToken response shape: `npx tsx scripts/verify-msg91-token.ts "<widget_jwt>"` with a real widget JWT.

**Railway debugging notes (don't re-investigate):** GraphQL `deployments(first:N)` = newest-first (the `last:` arg returned stale July entries — misleading); `deployment(id){diagnosis}` is null for build failures; `deploymentLogs(deploymentId, limit)` returns `[]` for failed builds (logs only visible in the dashboard build tab); `railway logs --deployment <full-id>` empty for failed builds and `--build`/`--deployment` flags can't combine. Old-image catch-all 401s unmatched paths — confirm the build is live before treating a 401 as a code bug.

### ✅ RESOLVED 2026-08-13: Redis handshake race — first-request-of-the-day OTP/social failure

**Symptom:** the FIRST Redis-touching request of the day (OTP send, social connect) failed with `Could not start a secure OTP session` / `Stream isn't writeable` — retries succeeded. The earlier entry above blamed the 2s `connectTimeout` vs Upstash idle-sleep cold start; **bumping to 10s did NOT fix it** (verified live — same failure with the longer timeout).

**Real root cause (commit `9f6b16a`, deployed `48784c77`):** all three short-fail ioredis clients (msg91-otp, public-cache, social OAuth state) were created with `lazyConnect: true` + `enableOfflineQueue: false`. With the offline queue disabled, a command sent BEFORE the `'ready'` handshake event rejects instantly with `Stream isn't writeable` — the connectTimeout never gets a chance, because the command dies on the still-connecting socket rather than on the timeout. The first command of every process/sleep cycle always hit this race.

**Fix:** removed `lazyConnect` from all three clients (eager connect at construction) and added an `awaitRedisReady()` helper — waits for the `'ready'` event (bounded by connectTimeout + retry), rejecting on `'error'` — to the two hard-fail paths (`sendOtpViaMsg91`/`verifyStoredOtp` in `apps/api/src/lib/msg91-otp.ts`, `createOAuthState`/`consumeOAuthState` in `retailers-social.ts`). public-cache stays fail-open (try/catch → direct compute) so its first-hit race degrades silently. FakeRedis test stand-ins gained `status: 'ready'` + `once`/`off`. **Verified live:** `POST /v1/auth/otp/send` → 200 `OTP sent` on the first attempt; API tsc clean, 443/443 tests.

**Do NOT re-diagnose OTP cold-start failures as timeout issues** — the lazyConnect race is fixed. Any future "Could not start a secure OTP session" is either Redis actually down/unreachable from Railway, or the MSG91 DLT sender-ID registration (see the entry above).


---

## DeepSeek Thinking Mode — API Gotcha

> Merged from the former `docs/references/guides/deepseek-thinking-mode.md`.

**Source:** <https://api-docs.deepseek.com/guides/thinking_mode/>
**Applies to:** any DeepSeek model with thinking mode enabled — which, per the docs, is the **default** (`effort: high`).
**Error this prevents:** `400 The reasoning_content in the thinking mode must be passed back to the API.`

---

#### The rule in one line

> On a request that carries the `tools` parameter, the `reasoning_content` of **every previous assistant turn** must be passed back to the API. If it is missing, the request fails with a 400. If the request carries **no** `tools`, the field is ignored and passing it back is optional.

That distinction is the whole gotcha. It is not "multi-turn conversations need it" — it is **`tools` presence**, and the client is the one that must store and replay the chain-of-thought, because the API is stateless.

#### The contract

| Behaviour | Detail |
| --- | --- |
| Thinking toggle | on by default. `thinking: { type: "enabled" \| "disabled" }` (pass via `extra_body` with the OpenAI SDK) or `reasoning_effort: "none" \| "low" \| "high" \| "max"` where `none` disables it |
| CoT field | `reasoning_content`, returned **at the same level as `content`** on the assistant message |
| With `tools` | all previous turns' `reasoning_content` must be echoed back verbatim — **including turns where the model made no tool call** — else **400** |
| Without `tools` | the CoT is not concatenated into context; sending it is ignored |
| Streaming | `delta.reasoning_content` arrives **separately** from `delta.content` — accumulate both if you intend to replay the message |
| Silently ignored params | `temperature`, `presence_penalty`, `frequency_penalty` — accepted, **no error, no effect** |
| `top_p` | thinking mode raises any value below `0.95` up to `0.95`; non-thinking mode pins it at `1.0` and ignores yours |

The docs' own equivalence, worth memorising:

```py
messages.append(response.choices[0].message)   # ← preserves everything
# is the same as:
messages.append({
  'role': 'assistant',
  'content': response.choices[0].message.content,
  'reasoning_content': response.choices[0].message.reasoning_content,
  'tool_calls': response.choices[0].message.tool_calls,
})
```

#### Why it fails at the first tool result, not the first request

Turn 1 is fine — there is no prior assistant message to replay. The break happens on iteration 2, when the assistant message from iteration 1 goes back into the history. So the symptom is "the agent works, then dies the moment a tool runs", which reads like a tool/permissions bug and sends you looking in the wrong place.

#### Why code review never catches it

The change that breaks this looks like hygiene:

```diff
- messages.push(response.choices[0].message)
+ messages.push({
+   role: response.choices[0].message.role,
+   content: response.choices[0].message.content,
+   tool_calls: response.choices[0].message.tool_calls,
+ })
```

Every OpenAI-shaped SDK and gateway teaches this shape, because `reasoning_content` isn't in the OpenAI schema. The field is dropped by:

- rebuilding the assistant message instead of forwarding it,
- typed SDK response classes that only surface known fields,
- proxies/middleware that validate messages against an OpenAI schema and strip unknown keys,
- streaming accumulators that collect `content` and forget the `reasoning_content` deltas,
- switching providers mid-conversation (a turn produced by a non-thinking model has no field to replay).

#### Fixes

1. **Forward the provider's raw assistant message object.** Cast it if the SDK's type is narrower (`as ChatCompletionMessageParam`) rather than mapping it into a "clean" shape.
2. **Whitelist `reasoning_content`** in any sanitizer, serializer, or gateway between you and the API.
3. **Accumulate both delta fields** when streaming.
4. **Normalise per provider** if a router can serve the same conversation from thinking and non-thinking models — don't let one provider's shape reach the other.
5. **Or turn thinking off** for the task (`reasoning_effort: "none"`), and the requirement disappears.

---

#### What this means for this repo

**Nothing today** — and that is worth stating with evidence, so nobody re-investigates it:

- The DeepSeek 400 requires a request that carries `tools`. Kanchuki's OpenAI-compatible adapter (`packages/ai/src/providers.ts`) sends **no `tools`** — it asks for JSON via `response_format: { type: 'json_object' }`.
- The one `tools:` in the AI package (`providers.ts:399`) is the **Anthropic** adapter's forced tool-use trick for structured extraction (`tool_choice: { type: 'tool', ... }`), which is a single-turn call to Claude — not DeepSeek's contract, and not a tool loop.
- Every adapter is single-turn: `system` + `user`, never an assistant turn. `apps/api/src/routes/public/public-stylist.ts` (AI Stylist) is the same — it builds one `user` message.

So this error cannot originate from Kanchuki's tagging, ask, stylist, or campaign-assistant calls.

##### Two traps if a DeepSeek thinking model is added to the provider chain

1. **`temperature: 0` becomes a lie.** Every adapter in `providers.ts` sets `temperature: 0` for reproducible tagging output. In DeepSeek thinking mode that parameter is accepted and **ignored** (same for the two penalty params), so the determinism the code claims is not what the API delivers. Same shape for any "set temperature for consistency" call site — the setting silently no-ops.
2. **Thinking is on by default.** A model added via Admin → AI Providers (`OPENAI_COMPAT`, `base_url: https://api.deepseek.com`) will pay reasoning latency and tokens on every tagging call, because nothing in the adapter disables it. The Node SDK forwards unknown body keys, so `thinking: { type: 'disabled' }` can ride along with the standard params — verify against the installed SDK version before relying on it.

##### The rule to follow when a tool-calling path is added

If AI Stylist v2 / campaign assistant ever becomes a real tool loop, and a DeepSeek thinking model is routable there: **append the raw assistant message and replay the whole chain**. Do not reconstruct `{ role, content, tool_calls }`, and do not add a sanitizer between the provider and the history without whitelisting `reasoning_content`. Add the test at the same time — a two-iteration loop with `tools` present is enough to reproduce the 400.
