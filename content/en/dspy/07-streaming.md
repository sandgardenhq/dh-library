---
title: Streaming
url: "dspy/streaming"
description: "How token streaming coexists with DSPy's typed, parse-complete-responses model."
---

DSPy streaming lets callers see progress without giving up the normal typed output path. The adapter still parses a complete final answer into a `Prediction`, but the wrapper exposes the call's intermediate state as it runs: status events from callbacks, partial field text from listeners, and any custom chunk objects that the program sends directly to the stream.

This design solves a real tension. DSPy needs full structured outputs to preserve typed fields, yet agentic and long-running programs benefit from incremental visibility. `streamify` adds that visibility as a sidecar on top of the ordinary module → adapter → LM pipeline. It does not replace parsing, and it does not move the source of truth away from the final `Prediction`.

For the surrounding mental model, see [The Big Picture](00-the-big-picture.md), [Anatomy of a Call](01-anatomy-of-a-call.md), [Caching](03-caching.md), and [Production](08-production.md). The official [streaming tutorial](https://dspy.ai/docs/tutorials/streaming/) covers usage, while the official [adapters page](https://dspy.ai/docs/diving-deeper/adapters/) explains the marker formats that the listener watches.

## `streamify` wraps a normal call

`dspy.streamify(program, ...)` keeps the original program shape but changes what the call returns. By default, the wrapper returns an async generator. With `async_streaming=False`, it returns a sync generator that reads from the async stream in a background thread.

The wrapper chooses the execution path before it opens the stream. A synchronous program runs through `dspy.utils.asyncify.asyncify`, which lifts the call into an async task. An async program runs through `acall` directly. After that, `dspy.streaming.apply_sync_streaming` can turn the async output iterator back into a sync generator when the caller wants blocking consumption. The inverse helper, `dspy.utils.syncify`, does the opposite job for async modules that need a sync `forward`.

The stream carries a mixed sequence. Callers can see `StatusMessage` events, `StreamResponse` chunks, pass through custom chunk types, and the final `Prediction`. The queue preserves arrival order, so those values can interleave as the wrapped program executes. When no listeners are configured, `streamify` leaves raw LM response chunks alone for backward compatibility. When cache hits or missing field boundaries prevent listener output, the wrapper can still yield only the final `Prediction`.

## `StreamListener` watches one field boundary

`StreamListener` gives the wrapper its field-level view. Each listener tracks one output field, and `find_predictor_for_stream_listeners()` resolves the predictor automatically when only the field name appears and that field name stays unique across the program. If the field name appears in more than one predictor, or if no predictor exposes it, the helper refuses to guess.

The listener reads the active adapter from `settings.adapter` and only understands `ChatAdapter`, `JSONAdapter`, and `XMLAdapter`. That limitation matters because the listener does not parse tokens generically. It looks for adapter-specific start and end markers, buffers tokens until it can prove a field has started, and keeps a small tail of the stream so it can avoid emitting adapter boilerplate before the next boundary appears.

JSON follows a different path. Instead of relying on marker pairs alone, the listener uses partial JSON parsing and brace balance checks to decide when a field ends. That makes JSON streaming work even when the boundary between one key and the next appears only after enough buffered text accumulates. Chat and XML use their own marker logic, but all three adapters share the same core idea: the listener waits until it can separate field content from formatting noise.

The edge cases explain most debugging work. An unsupported adapter raises immediately. A wrong field name never resolves to a predictor. Duplicate field names across predictors force the caller to identify the predictor explicitly. A field that never appears before completion produces no field chunks, but the final `Prediction` still arrives. Missing completion markers do not lose text; `finalize()` flushes the buffer at the end. Repeated use in loops, such as `ReAct`, needs `allow_reuse=True` so the listener can reset and participate again instead of going silent after the first pass.

Custom streamable output types fit into the same mechanism. When an output field uses a `dspy.adapters.types.Type` subclass that declares itself streamable, the listener asks the type to parse each stream chunk and yields reconstructed custom chunks. The final `Prediction` then contains the rebuilt typed value, not just the raw text that produced it.

## Status messages ride a separate side channel

`StatusMessageProvider` and `StatusStreamingCallback` handle lifecycle updates rather than field content. The callback layer listens for `tool_*`, `module_*`, and `lm_*` events through `dspy.utils.callback`, then turns chosen events into `StatusMessage` objects. The default provider only supplies text for tool start and tool end; the module and LM hooks stay opt in so a program can stay quiet unless it needs explicit status updates.

`streamify` activates that path by installing a send stream in `settings.send_stream` and by adding the status callback to the active callback list. That means status messages only appear while the wrapper runs. Outside the wrapper, the callback still exists, but it has no stream to write to. The code also keeps provider instances isolated per stream, so concurrent runs can emit different status text without leaking into one another.

This separation matters for agent-style interfaces. Status events explain what the program is doing, while `StreamResponse` shows the content that one output field is producing. The two channels serve different jobs and arrive in the same merged output stream.

## Async and sync use the same model

Streaming does not introduce a new execution model. It reuses DSPy’s existing async and sync helpers. `asyncify` wraps a synchronous program so the wrapper can run it inside async streaming code, and `apply_sync_streaming` converts the async output iterator back into a sync generator when the caller prefers blocking consumption.

`syncify` points in the opposite direction. It makes an async module callable from sync code by exposing a sync `forward` that runs `aforward`. That helper lives outside the streaming wrapper, but it fits the same runtime story: DSPy keeps one mental model for async work and then adds thin conversion layers where needed. The official [async tutorial](https://dspy.ai/docs/tutorials/async/) and the sibling [Production](08-production.md) page cover the broader runtime context; this page only needs the boundary where streaming crosses between them.

## Failure modes and first checks

Streaming usually fails for one of a few reasons:

- The active adapter does not support listener streaming.
- The field name does not match any output field, or more than one predictor exposes the same name.
- The model never emits the field boundary, so the listener never starts.
- A cache hit returns only the final `Prediction` and skips the intermediate chunks.
- JSON streaming waits for enough buffered text to prove the boundary through partial parsing or brace balance.
- `allow_reuse=False` lets a listener finish after the first pass, which matters in repeated loops.

These checks describe the behavior at the stream boundary, not the transport layer. When the final `Prediction` still arrives, the parse path succeeded even if the incremental path stayed quiet.

## Where to look in the code

- `dspy/streaming/streamify.py` — wraps programs, connects the send stream, merges status events and field chunks, and bridges between async and sync output.
- `dspy/streaming/streaming_listener.py` — watches adapter specific boundaries, resolves predictors, buffers tokens, and finalizes partial field output.
- `dspy/streaming/messages.py` — defines `StreamResponse` and `StatusMessage`, plus the callback that turns lifecycle events into status output.
- `dspy/utils/callback.py` — dispatches lifecycle hooks for modules, tools, LMs, adapters, and evaluation.
- `dspy/utils/asyncify.py` and `dspy/utils/syncify.py` — convert programs between sync and async call styles.
- `dspy/dsp/utils/settings.py` — stores the active adapter, callback list, stream channel, and context overrides that make streaming state local to one run.