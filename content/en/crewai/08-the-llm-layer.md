---
title: The LLM Layer
url: "crewai/the-llm-layer"
description: "The LLM factory: native provider SDKs vs the LiteLLM fallback, and the migration in progress."
---

## Overview

This page describes the LLM layer as runtime machinery. As of this snapshot, `LLM(model=...)` does not mean a simple provider catalog lookup; it means a routing decision at the factory boundary. The same constructor can return different concrete classes based on `custom_openai`, an explicit provider, a model prefix, the native provider lists in `lib/crewai/src/crewai/llms/constants.py`, and the LiteLLM fallback path.

For configuration details, use the LLM catalog page in the official docs: [LLMs](https://docs.crewai.com/en/concepts/llms). This page stays focused on execution semantics: how the runtime chooses a class, which behaviors every implementation shares, and how the layer fits into the agent loop.

## Factory routing and concrete class selection

`LLM.__new__` in `lib/crewai/src/crewai/llm.py` acts as the boundary between a model string and a live runtime object. It resolves in a fixed order. A custom OpenAI-compatible endpoint takes priority when `custom_openai=True` and a base URL exists. In that case, the factory forces the native OpenAI path and keeps the model string attached to that endpoint. After that, an explicit `provider=` value wins. Only then does the factory inspect `provider/model` strings and map the prefix to a canonical provider.

That prefix path matters because it distinguishes native support from the fallback path. The snapshot currently supports native OpenAI, Anthropic and Claude, Azure and Azure OpenAI, Google and Gemini, AWS Bedrock, Snowflake, and the OpenAI-compatible wrapper family. The factory only chooses a native class when the model matches the provider lists or provider patterns in `constants.py`. When a prefix does not match a native family, the constructor keeps the LiteLLM-backed path alive instead of guessing.

Bare model names follow a final inference step. The factory checks the known model lists, falls back to provider inference, and defaults to OpenAI when nothing else matches. That keeps the constructor forgiving for common model names while still preferring native implementations when the snapshot knows how to route them.

## Shared contract across implementations

`BaseLLM` in `lib/crewai/src/crewai/llms/base_llm.py` defines the runtime contract that every concrete implementation follows. It owns the common state and the shared behaviors that make the rest of the system work without provider-specific knowledge: synchronous and asynchronous calls, streaming event flow, token usage accounting, structured output validation, context window sizing, and the hooks that fire before and after a call. The base class does not act as a provider itself. It gives provider classes a common shape and a common place to emit telemetry.

That contract also exposes capability predicates such as `supports_function_calling()` and `supports_multimodal()`. The [agent loop](./02-the-agent-executor-loop.md) uses those predicates to decide whether it can take the native tool-calling path, so the LLM layer and the executor loop stay loosely coupled. When the layer reports a context window, it also sets the boundary for overflow handling; see the [guardrails and retries page](./03-context-guardrails-and-retries.md). The design keeps provider-specific knowledge inside the provider class and keeps orchestration logic outside it.

## Migration story in this snapshot

As of this repository snapshot, the codebase sits between two routing styles. `lib/crewai/src/crewai/llm.py` still keeps LiteLLM fallback behavior for broad compatibility, while `lib/crewai/src/crewai/llms/providers/` carries direct SDK implementations for the major native families. The gateway still centralizes broad coverage, but the native SDKs now expose the provider-specific control this snapshot uses for streaming, structured outputs, and error handling. The coexistence of both paths shows a transition, not a finished removal. For the broader migration context, see the [LiteLLM removal guide](https://docs.crewai.com/en/learn/litellm-removal-guide).

## Where the LLM layer fits in runtime

The [executor loop](./02-the-agent-executor-loop.md) calls the LLM on each turn of the agent cycle. `supports_function_calling()` decides whether the agent can use the native tool-calling path, and usage data from the LLM flows into the event bus and the token usage summaries on the [state page](./07-where-state-lives.md). That keeps orchestration, telemetry, and provider execution on separate layers while still letting them share a single runtime object.

## Streaming and structured outputs

The layer supports streaming at two levels: `BaseLLM` provides the shared event wrapper, and the provider classes implement the provider-specific streaming behavior. Structured output handling lives in the same layer, so the caller can request structured data without knowing which provider class emitted it. The result stays consistent at the runtime boundary even when the underlying provider changes.

## Where to look in the code

- `lib/crewai/src/crewai/llm.py` — factory routing, provider selection, and LiteLLM fallback.
- `lib/crewai/src/crewai/llms/base_llm.py` — shared runtime contract, events, usage tracking, hooks, and structured output.
- `lib/crewai/src/crewai/llms/constants.py` — native provider families and model lists used for routing.
- `lib/crewai/src/crewai/llms/providers/openai/completion.py` — native OpenAI path, including the custom OpenAI-compatible endpoint branch.
- `lib/crewai/src/crewai/llms/providers/anthropic/completion.py`, `azure/completion.py`, `gemini/completion.py`, `bedrock/completion.py`, `snowflake/completion.py` — native provider implementations.
- `lib/crewai/src/crewai/llms/providers/openai_compatible/completion.py` — OpenAI-compatible wrapper family.