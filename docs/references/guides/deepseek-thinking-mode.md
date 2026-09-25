# DeepSeek thinking mode — the `reasoning_content` rule

**Source:** <https://api-docs.deepseek.com/guides/thinking_mode/>
**Applies to:** any DeepSeek model with thinking mode enabled — which, per the docs, is the **default** (`effort: high`).
**Error this prevents:** `400 The reasoning_content in the thinking mode must be passed back to the API.`

---

## The rule in one line

> On a request that carries the `tools` parameter, the `reasoning_content` of **every previous assistant turn** must be passed back to the API. If it is missing, the request fails with a 400. If the request carries **no** `tools`, the field is ignored and passing it back is optional.

That distinction is the whole gotcha. It is not "multi-turn conversations need it" — it is **`tools` presence**, and the client is the one that must store and replay the chain-of-thought, because the API is stateless.

## The contract

| Behaviour | Detail |
|---|---|
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

## Why it fails at the first tool result, not the first request

Turn 1 is fine — there is no prior assistant message to replay. The break happens on iteration 2, when the assistant message from iteration 1 goes back into the history. So the symptom is "the agent works, then dies the moment a tool runs", which reads like a tool/permissions bug and sends you looking in the wrong place.

## Why code review never catches it

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

## Fixes

1. **Forward the provider's raw assistant message object.** Cast it if the SDK's type is narrower (`as ChatCompletionMessageParam`) rather than mapping it into a "clean" shape.
2. **Whitelist `reasoning_content`** in any sanitizer, serializer, or gateway between you and the API.
3. **Accumulate both delta fields** when streaming.
4. **Normalise per provider** if a router can serve the same conversation from thinking and non-thinking models — don't let one provider's shape reach the other.
5. **Or turn thinking off** for the task (`reasoning_effort: "none"`), and the requirement disappears.

---

## What this means for this repo

**Nothing today** — and that is worth stating with evidence, so nobody re-investigates it:

- The DeepSeek 400 requires a request that carries `tools`. Kanchuki's OpenAI-compatible adapter (`packages/ai/src/providers.ts`) sends **no `tools`** — it asks for JSON via `response_format: { type: 'json_object' }`.
- The one `tools:` in the AI package (`providers.ts:399`) is the **Anthropic** adapter's forced tool-use trick for structured extraction (`tool_choice: { type: 'tool', ... }`), which is a single-turn call to Claude — not DeepSeek's contract, and not a tool loop.
- Every adapter is single-turn: `system` + `user`, never an assistant turn. `apps/api/src/routes/public/public-stylist.ts` (AI Stylist) is the same — it builds one `user` message.

So this error cannot originate from Kanchuki's tagging, ask, stylist, or campaign-assistant calls.

### Two traps if a DeepSeek thinking model is added to the provider chain

1. **`temperature: 0` becomes a lie.** Every adapter in `providers.ts` sets `temperature: 0` for reproducible tagging output. In DeepSeek thinking mode that parameter is accepted and **ignored** (same for the two penalty params), so the determinism the code claims is not what the API delivers. Same shape for any "set temperature for consistency" call site — the setting silently no-ops.
2. **Thinking is on by default.** A model added via Admin → AI Providers (`OPENAI_COMPAT`, `base_url: https://api.deepseek.com`) will pay reasoning latency and tokens on every tagging call, because nothing in the adapter disables it. The Node SDK forwards unknown body keys, so `thinking: { type: 'disabled' }` can ride along with the standard params — verify against the installed SDK version before relying on it.

### The rule to follow when a tool-calling path is added

If AI Stylist v2 / campaign assistant ever becomes a real tool loop, and a DeepSeek thinking model is routable there: **append the raw assistant message and replay the whole chain**. Do not reconstruct `{ role, content, tool_calls }`, and do not add a sanitizer between the provider and the history without whitelisting `reasoning_content`. Add the test at the same time — a two-iteration loop with `tools` present is enough to reproduce the 400.
