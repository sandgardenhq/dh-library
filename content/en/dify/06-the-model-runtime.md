---
title: The Model Runtime
url: "dify/the-model-runtime"
description: "One facade over every model provider: ModelInstance, credentials, quotas."
---

## Overview

Dify treats model access as a shared runtime rather than as a separate integration for each provider. Graphon owns the runtime surface under `src/graphon/model_runtime/`, and Dify wraps it with tenant resolution, persisted configuration, and quota policy. That split lets the platform resolve a tenant's model choice once, then reuse the same execution path for LLM, embedding, rerank, speech to text, moderation, and text to speech providers.

For the graph engine boundary, see [Inside the graph engine](./02-inside-the-graph-engine.md). For retrieval, see [the RAG pipeline](./07-the-rag-pipeline.md). For plugin discovery, see [the plugin system](./08-the-plugin-system.md).

## Mental model

The runtime separates three concerns. The provider layer describes what exists, the model type layer describes what capability a call needs, and the concrete model wrapper performs the invocation. `ModelType` in `src/graphon/model_runtime/entities/model_entities.py` names the six capability families: `LLM`, `TEXT_EMBEDDING`, `RERANK`, `SPEECH2TEXT`, `MODERATION`, and `TTS`. `AIModelEntity`, `ModelFeature`, `ProviderModel`, and `PriceConfig` describe what a model supports, how the runtime should validate its shape, and how it should price usage.

`PromptMessage` and `AssistantPromptMessage` in `src/graphon/model_runtime/entities/message_entities.py` define the LLM-facing exchange. They normalize text and multimodal content, preserve tool calls, and keep the request and response shapes stable across providers. `LLMResult` and `LLMUsage` in `src/graphon/model_runtime/entities/llm_entities.py` carry the normalized reply, token counts, price data, latency, and structured output that the rest of the platform reads back (polling state lives beside them in `LLMPollingResult`).

`LargeLanguageModel` in `src/graphon/model_runtime/model_providers/base/large_language_model.py` shows the runtime shape most clearly. It accepts a model, credentials, messages, and parameters, then normalizes streaming and non-streaming results into one `LLMResult`. It also merges tool call deltas, converts chunk streams into assistant messages, and computes usage from prompt and completion token counts. The sibling wrappers follow the same pattern for embeddings, reranking, speech to text, moderation, and text to speech.

The schema objects also guard capability boundaries. `AIModelEntity.supports_prompt_content_type()` uses `PromptMessageContentType` and `ModelFeature` to reject content a model cannot handle, and `AIModelEntity.validate_model()` promotes a JSON schema parameter into structured output support when the model advertises that shape. The result is a single runtime contract with capability specific extensions, rather than a single monolithic interface.

## Dify's facade

`ModelManager` in `api/core/model_manager.py` gives the rest of Dify one request-facing entry point. `get_model_instance()` resolves a tenant, provider, model type, and model name into a `ProviderModelBundle`, and `get_default_model_instance()` falls back to the tenant default when the caller does not name a provider. `ModelInstance` then holds the resolved bundle, injects credentials, and dispatches calls to the matching wrapper. The same object serves `invoke_llm()`, `get_llm_num_tokens()`, `invoke_text_embedding()`, `invoke_multimodal_embedding()`, `invoke_rerank()`, `invoke_multimodal_rerank()`, `invoke_moderation()`, `invoke_speech2text()`, `invoke_tts()`, and `get_tts_voices()`.

`LBModelManager` adds the only call-path fallback that the current code shows. When a custom provider config carries load balancing entries, it rotates through `ModelLoadBalancingConfiguration` records, skips entries in cooldown, and cools down entries after rate limit, authorization, or connection errors. That logic keeps the provider model path stable while still letting Dify spread requests across multiple credentials.

`LargeLanguageModel` carries the usage side of the contract. It records latency, computes `LLMUsage`, and returns the prompt messages alongside the final assistant message so downstream code can meter and audit the call without reconstructing the original request.

## Provider resolution and persisted configuration

`ProviderManager` in `api/core/provider_manager.py` turns stored rows into a tenant-specific configuration graph. It gathers `Provider`, `ProviderModel`, `ProviderCredential`, `ProviderModelCredential`, `ProviderModelSetting`, `LoadBalancingModelConfig`, `TenantDefaultModel`, and `TenantPreferredModelProvider` rows, then binds the tenant runtime so schema lookup and invocation stay aligned with the current tenant. `ModelProviderFactory` reads that runtime-facing provider schema and exposes the provider list, provider icons, schema validation, and model lists that the rest of Dify consumes.

`api/models/provider.py` shows the current storage shape. `ProviderType` distinguishes `CUSTOM` and `SYSTEM`, and `Provider.is_enabled` treats system providers as valid once `is_valid` is true, while custom providers also require a credential to exist. `ProviderModelSetting` tracks whether a tenant has enabled a model and whether it can load balance, and `LoadBalancingModelConfig` stores the credential source for each balancing entry. `TenantDefaultModel` keeps the default choice for a model type, and `TenantPreferredModelProvider` records whether a tenant prefers the system or custom side of a provider.

As of July 2026, the provider data model still carries hosted quota rows and custom credential rows side by side. `ProviderManager` normalizes both into one tenant view, then chooses the preferred provider type and the active provider type from what is enabled, what has valid quota, and what the tenant has actually configured. That keeps the migration shape visible without forcing the rest of the platform to care about it.

## Call sites

One facade serves the main model-facing surfaces across the product. Workflow nodes use the quota layer in `api/core/app/workflow/layers/llm_quota.py`, LLM-backed agents and utility generation call through `ModelInstance`, and RAG indexing and query-time paths resolve embeddings and reranking through the tenant-bound manager. Provider selection and credential handling stay consistent regardless of where the request starts. For the graph engine boundary that drives those nodes, see [Inside the graph engine](./02-inside-the-graph-engine.md).

## Plugin backed providers

`api/core/plugin/impl/model_runtime.py` and `api/core/plugin/impl/model_runtime_factory.py` bridge plugin discovery to the runtime interface. `PluginModelRuntime` binds tenant and user scope to `PluginService` and `PluginModelClient`, then fetches provider schemas, validates credentials, resolves model schemas, and forwards LLM, embedding, rerank, speech to text, moderation, and text to speech calls into the plugin client. `PluginModelAssembly` composes that runtime with `ModelProviderFactory`, `ProviderManager`, and `ModelManager` so a single request-scoped assembly can serve every model-facing path.

This bridge keeps provider discovery and invocation separate. `ModelProviderFactory` depends only on `ModelProviderRuntime`, so it can project provider lists and validate credentials without knowing which concrete plugin implementation answers the call. For the broader plugin architecture, see [the plugin system](./08-the-plugin-system.md).

## Quota and metering

`LLMQuotaLayer` in `api/core/app/workflow/layers/llm_quota.py` keeps quota beside the call path instead of inside it. The layer checks the public node model identity before execution, aborts the node when quota is missing or exhausted, and deducts usage only after the node succeeds. That placement matters because the layer sees the workflow node, the tenant, and the final `llm_usage` record together; the model runtime itself only sees a model call.

`LLMUsage` in `src/graphon/model_runtime/entities/llm_entities.py` carries the accounting payload that the layer consumes. It records prompt and completion tokens, unit prices, total price, currency, latency, and optional timing fields such as time to first token. As of July 2026, `LLMQuotaLayer` still replaces a private `_run` hook when it needs to stop a node before execution, which keeps the quota decision in orchestration rather than in the provider call.

## Where to look in the code

- graphon: `src/graphon/model_runtime/entities/model_entities.py`
- graphon: `src/graphon/model_runtime/entities/llm_entities.py`
- graphon: `src/graphon/model_runtime/model_providers/base/large_language_model.py`
- dify: `api/core/model_manager.py`
- dify: `api/core/provider_manager.py`
- dify: `api/core/app/workflow/layers/llm_quota.py`