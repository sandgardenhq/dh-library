---
title: The LLM Layer
url: "browser-use/the-llm-layer"
description: "One protocol over every model provider: messages, structured output, vision, cost."
---

## Overview

browser-use keeps the LLM layer small on purpose. The agent core talks to `BaseChatModel` instead of importing provider SDKs directly, so provider-specific logic stays behind first-party wrappers and the agent sees one runtime contract.

That contract uses structural typing. Any object that presents the `ainvoke(messages, output_format=None, **kwargs)` surface, exposes a `model` attribute plus `provider` and `name` properties, and returns a `ChatInvokeCompletion` can serve as the model. The agent never needs provider inheritance or direct SDK imports.

The same separation keeps the message layer, schema translation, and usage accounting independent of any single vendor.

This page explains how the layer moves from browser state to typed model output. The adjacent field guides on [how the agent sees the page](./03-how-the-agent-sees-the-page.md) and [the tools and action registry](./05-the-tools-and-action-registry.md) show the inputs that feed this layer and the actions that consume its result.

## The protocol stays small

`browser_use/llm/base.py` defines the boundary as a runtime-checkable `Protocol`. The design asks each implementation to answer one question: given a list of library-owned messages, can it return one completion, plus usage metadata, in a typed envelope?

That design has two practical effects.

1. The agent can accept a provider by construction, not inheritance.
2. The agent never needs to know whether the completion came from a direct SDK, a gateway, or the hosted browser-use client.

The public API surface stays narrow on purpose. The layer does not stream intermediate tokens into the agent loop, and it does not hide provider differences behind a universal failover router. It returns whole completions, then lets higher layers decide how to react when a provider fails.

## The message model gives browser-use one shared shape

`browser_use/llm/messages.py` owns the message model shared across providers. It carries `system`, `user`, and `assistant` messages, text parts, image parts, refusal parts, tool calls, and a `cache` flag.

That shared shape gives every wrapper the same source material. A screenshot enters as an image content part when the page uses vision, and the wrappers translate that same content into the format each provider expects. The assistant side keeps free text and tool-call information together, which lets the agent read model output as one message history instead of as separate side channels.

The shape also makes the browser-side context easier to reason about. The page model from [how the agent sees the page](./03-how-the-agent-sees-the-page.md) becomes text, images, and tool context here, which is the point where browser state turns into model input.

## Structured output is the contract

The agent does not parse free text and guess what it means. It passes a Pydantic model such as `AgentOutput` as `output_format`, and the provider wrapper translates that model into the provider's structured-output dialect. The response comes back as a validated object inside `ChatInvokeCompletion`.

Use the official structured-output how-to to configure `output_format`: [structured-output](https://docs.browser-use.com/open-source/customize/agent/output-format).

`browser_use/llm/schema.py` handles the translation step that makes those models usable across providers. It flattens nested schema references, removes fields some providers reject when needed, and produces a strict JSON schema shape that providers can accept.

The wrappers show two main paths. `browser_use/llm/openai/chat.py` sends a strict JSON schema through the OpenAI structured-output interface, then validates the JSON text it receives. `browser_use/llm/anthropic/chat.py` uses a tool-call dialect instead, then validates the tool input and, on the auto-tool-choice path used when fallback models are configured, falls back to text parsing when the provider returns a text completion.

Tiny excerpt, for orientation only:

```python
async def ainvoke(self, messages, output_format=None, **kwargs) -> ChatInvokeCompletion:
```

The distinction between failure types matters. A provider can reject the request, truncate the response, or return a shape that fails validation. The wrappers map those cases to `ModelProviderError` or `ModelOutputTruncatedError`, and the agent decides whether to stop, retry, or fall back. That logic keeps validation close to the provider boundary instead of leaking malformed output deeper into the run.

## The provider fleet wraps many back ends with one pattern

`browser_use/llm/__init__.py` exports the first-party fleet as a family of wrappers, not as a catalog of every model. The set groups direct SDK wrappers such as `ChatOpenAI` and `ChatAnthropic`, gateway-style wrappers such as `ChatOpenRouter`, and the hosted browser-use client `ChatBrowserUse`; `ChatLiteLLM` is exported from the top-level `browser_use/__init__.py`.

Every implementation owes the same responsibilities to the protocol:

- serialize the library message model into provider-native messages
- translate structured-output schemas into the provider's dialect
- extract usage data from the provider response
- return a `ChatInvokeCompletion` with completion data and usage metadata

`browser_use/llm/openai/serializer.py` and `browser_use/llm/anthropic/serializer.py` show the translation work in concrete form. They do not define the product's mental model; they simply adapt the shared message shape to the provider they wrap. `browser_use/llm/openrouter/serializer.py` and `browser_use/llm/litellm/serializer.py` follow the same pattern, with OpenRouter reusing the OpenAI shape and LiteLLM using an OpenAI style message envelope.

`ChatBrowserUse` follows the same contract, but it sends the request to the browser-use service instead of a third-party SDK. That keeps the hosted path aligned with the same agent-facing response envelope.

The official model list already lives in the product docs: [supported models](https://docs.browser-use.com/open-source/supported-models).

## Token and cost accounting happen at the boundary

`browser_use/llm/views.py` puts usage on the completion envelope through `ChatInvokeCompletion.usage`. That makes token accounting part of the response itself instead of an afterthought.

`browser_use/tokens/service.py` records that usage as soon as the agent invokes a model. It prices tokens from cached pricing tables that it loads from the LiteLLM pricing source, then aggregates usage by model and time window for summaries. Cached prompt tokens, cache creation tokens, and completion tokens all feed the totals, so the summary shows the shape of the work rather than just one total number.

For the operator view, the official docs cover the workflow here: [cost monitoring](https://docs.browser-use.com/open-source/development/monitoring/costs).

## Limitations as of July 2026

The layer returns whole completions. It does not stream intermediate tokens into the agent loop.

The layer also does not provide a universal cross-provider failover dispatcher. `browser_use/agent/service.py` handles fallback explicitly at the agent level, and provider wrappers raise `ModelProviderError`, `ModelRateLimitError`, or `ModelOutputTruncatedError` from `browser_use/llm/exceptions.py` when the model path fails.

## Where to look in the code

- `browser_use/llm/base.py` — protocol boundary and typed invoke surface
- `browser_use/llm/messages.py` — provider-neutral message and content-part model
- `browser_use/llm/schema.py` — schema flattening and strict-output translation
- `browser_use/llm/openai/chat.py` and `browser_use/llm/anthropic/chat.py` — representative provider wrappers
- `browser_use/agent/service.py` — agent call path and explicit fallback handling
- `browser_use/tokens/service.py` — usage capture, pricing, and cost summaries