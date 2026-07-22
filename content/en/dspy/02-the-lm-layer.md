---
title: The LM Layer
url: "dspy/the-lm-layer"
description: "The clients/ package: how a model string becomes a provider request, and what the LM client records along the way."
---

DSPy’s LM layer sits between a model string and the provider request that actually runs. It turns the abstract idea of “call this model” into a normalized request, sends that request through a provider transport, and records the result in a form that the rest of DSPy can reuse.

The layer matters because it joins three different concerns. Settings selects the active LM, adapters shape the call that reaches the LM, and the LM layer handles execution, caching, history, and provider specific behavior. For the broader call path, see [01 anatomy of a call](./01-anatomy-of-a-call.md) and [03 caching](./03-caching.md); for upstream configuration and shaping, see the [settings and context](https://dspy.ai/learn/programming/settings-and-context/) and [adapters](https://dspy.ai/learn/programming/adapters/) pages on dspy.ai.

## Mental model

Think of the LM layer as the execution boundary. Everything above it describes intent: the program wants an answer, the adapter wants a prompt shape, and settings choose a particular LM instance. Everything below it belongs to a provider: HTTP requests, provider response objects, retry behavior, and provider specific feature limits.

That boundary has two faces. `BaseLM` owns the compatibility contract, request normalization, serialization, history bookkeeping, and response finalization. `LM` owns the concrete transport that uses LiteLLM, provider inference, cache wrapping, finetuning and reinforcement helpers, error translation, and model family handling, including OpenAI reasoning normalization. The split lets custom backends subclass `BaseLM` directly while the built in `dspy.LM` inherits the shared behavior and delegates transport to LiteLLM and provider code.

## From a model string to an HTTP request

`dspy.clients._litellm` acts as the bridge to LiteLLM. It loads LiteLLM lazily, applies DSPy defaults the first time the module loads, and keeps LiteLLM telemetry and LiteLLM cache out of the critical path so DSPy can own those concerns.

`dspy.LM` then adds the DSPy layer around that bridge. It normalizes direct call inputs, wraps cache behavior, tags provider headers, maps provider exceptions into the DSPy LM error hierarchy, and reshapes provider output into the format that DSPy expects. The request path selects one of three transport families, `chat`, `text`, or `responses`, and chooses the matching LiteLLM call path internally. Callers never need to care which transport family the model uses.

`dspy.clients.openai_format` does the shape translation at the edge. It turns `LMRequest` into OpenAI chat, responses, or text request objects, then turns provider output back into `LMResponse`. That file explains the simplest version of the transport story: one normalized request shape enters, one normalized response shape leaves.

## What a call carries and records

The typed layer in `dspy.core.types` gives the LM boundary a stable vocabulary. `LMRequest` carries the model name, messages, tools, and `LMConfig`. `LMMessage` and `LMPart` split the conversation into typed roles and content blocks. `LMResponse` and `LMOutput` store richer results than the old list of strings shape, including text, reasoning, tool calls, citations, multimodal parts, usage, cost, and cache status. `LMUsage` keeps token accounting consistent. `LMHistoryEntry` stores the canonical typed record and still offers the legacy convenience accessors that existing history tools expect.

`LMRequest.from_call()` normalizes direct call inputs into that request shape. It accepts the same kinds of inputs that the direct `lm(...)` path accepts in experimental mode: plain text, typed messages, previous `LMResponse` objects, and content parts. On the way out, `BaseLM._finalize_lm_response()` and `BaseLM.update_history()` record the call when history is enabled, while `settings.usage_tracker` collects usage when the response is not a cache hit. The cache sits at the transport boundary, and `dspy.clients.cache.request_cache` gives hosted embedding calls and other transport wrappers a consistent memoization layer. The deeper cache mechanics belong on [03 caching](./03-caching.md).

## Providers are lifecycle objects

`Provider` means more than “inference adapter.” It acts as a lifecycle and capability object with `launch`, `kill`, `finetune`, `TrainingJob`, and sometimes `ReinforceJob`. That design lets DSPy treat model hosting and model training as part of the same client layer instead of scattering those responsibilities across unrelated code.

The concrete providers show the pattern from different angles. `dspy.clients.openai.OpenAIProvider` uploads training data, starts remote fine tuning, polls job status, and returns the trained model identifier. `dspy.clients.databricks.DatabricksProvider` can fine tune a model and then deploy the resulting endpoint. `dspy.clients.lm_local.LocalProvider` launches a local SGLang server, shuts it down again, and can fine tune locally with chat format data. Shared finetuning formats and validation helpers live in `dspy.clients.utils_finetune`, which keeps the provider implementations aligned on the same training data shapes.

The point of the abstraction is practical. A workflow can submit training data, receive a `TrainingJob`, and later recover either a model identifier or a live `LM` handle without knowing whether the backend ran on OpenAI, Databricks, or a local process.

## Embeddings sit beside LMs

`dspy.clients.embedding.Embedder` mirrors the LM layer for embeddings. It accepts either a hosted model string or a custom callable, batches inputs, applies caching for hosted models, and returns NumPy arrays. That places embeddings in the same client package and the same mental model: a user facing model handle on top, transport and caching beneath, and provider or callable execution at the edge.

## The migration state today

As of 2026-07-10, DSPy supports both legacy and typed LM paths at the same time. `BaseLM.__call__()` decides which path to use based on an explicit `LMRequest`, `dspy.context(experimental=True)`, or `forward_contract`. The legacy path still preserves the public list based output shape for ordinary calls, while the typed path moves the internal contract toward `LMRequest`, `LMResponse`, and normalized messages and parts.

That arrangement defines the current target shape without breaking existing programs. New custom backends can opt into `forward_contract = "typed_lm"` and implement `forward(request: dspy.LMRequest) -> dspy.LMResponse`. Existing backends can remain on `forward_contract = "legacy"` and continue to work with `forward(prompt=None, messages=None, **kwargs)`. The migration note in the community docs confirms that this is the intended direction, but the important fact for this page is simpler: both forms remain live in the codebase now.

## Relationships to neighboring subsystems

Settings selects the active LM instance. Adapters shape the request that reaches this layer. The LM layer then converts that shaped intent into a provider request, translates the provider response back into DSPy’s typed response model, and records the call for history and usage.

The parallel embedding path follows the same boundary pattern, and model family specific handling stays here rather than leaking into adapters or higher level orchestration. That separation keeps the rest of DSPy focused on program structure while the LM layer handles provider reality.

## Where to look in the code

- `dspy/clients/base_lm.py` — compatibility boundary, call routing, history bookkeeping, and typed versus legacy response handling.
- `dspy/clients/lm.py` and `dspy/clients/_litellm.py` — LiteLLM transport, provider inference, error mapping, cache wrapping, and reasoning model handling.
- `dspy/core/types.py` and `dspy/clients/openai_format.py` — normalized request and response types plus the shape translation to and from OpenAI style payloads.
- `dspy/clients/cache.py` — request cache behavior and cache hit metadata.
- `dspy/clients/provider.py`, `dspy/clients/openai.py`, `dspy/clients/databricks.py`, `dspy/clients/lm_local.py` — provider lifecycle hooks, training jobs, and fine tuning flows.
- `dspy/clients/embedding.py` and `dspy/clients/utils_finetune.py` — the parallel embedding abstraction and the shared fine tuning data formats.