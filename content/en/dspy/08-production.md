---
title: Production
url: "dspy/production"
description: "Callbacks, usage tracking, and the parallel execution model — the machinery a production deployment touches."
---

Production turns DSPy from a notebook program into a service runtime where calls must be observed, counted, parallelized, and bridged across sync and async entry points. DSPy already gives that runtime one shared seam. `dspy/utils/callback.py`, `dspy/utils/usage_tracker.py`, `dspy/utils/parallelizer.py`, `dspy/utils/asyncify.py`, `dspy/utils/syncify.py`, and the LM and module layers keep orchestration in the framework instead of pushing it into ad hoc wrappers.

The central idea is the settings layer in `dspy/dsp/utils/settings.py`. `settings` holds process defaults, and `settings.context(...)` opens a temporary override scope that worker threads and async bridges can inherit. That single configuration surface keeps production behavior aligned across module calls, LM calls, batches, and background work.

## Callbacks define the instrumentation seam

`BaseCallback` in `dspy/utils/callback.py` turns observability into a lifecycle, not a patchwork of local hooks. The class covers module start and end, LM start and end, adapter format and parse start and end, tool start and end, and evaluation start and end. `with_callbacks` attaches those hooks once around the target method, then resolves the active callbacks from both `dspy.settings.callbacks` and each instance's `callbacks` attribute.

`ACTIVE_CALL_ID` and the `call_id` argument give nested events a shared correlation key. That matters when a module calls an LM, the LM calls an adapter, and a tool fires inside the same span of work. The callback system keeps those events connected without asking each subsystem to invent its own tracing protocol. In practice, that makes logging, metrics, and distributed tracing integrations much easier to layer on top of DSPy. For the user-facing observability guide, see the [observability tutorial](https://dspy.ai/learn/programming/observability/).

## Usage and spend follow the LM response path

Usage accounting in DSPy follows the response, not the prompt. `UsageTracker` in `dspy/utils/usage_tracker.py` collects usage entries by model name and rolls them up into totals later. `track_usage()` opens a `settings.context(usage_tracker=tracker)` scope, so every LM call inside that block reports into the same collector.

The response path in `dspy/clients/base_lm.py` feeds that collector. `BaseLM._process_lm_response()` and `BaseLM._finalize_lm_response()` add usage when a response is not a cache hit, then record history when history remains enabled. The cache layer in `dspy/clients/cache.py` deep copies cached responses, marks them with `cache_hit = True`, and clears `usage`, so the accounting reflects real provider work instead of replayed responses. For the cache details, see [03 Caching](./03-caching.md).

This design gives production systems a clean cost signal. A batch of repeated prompts can look faster and cheaper because the cache short-circuits the provider, and DSPy keeps that effect visible instead of blending it into normal spend.

## Controlled concurrency keeps fan-out predictable

`Module.batch()` in `dspy/primitives/module.py` treats batch execution as an orchestration problem. It builds execution pairs, then hands them to `Parallel` and `ParallelExecutor` in `dspy/utils/parallelizer.py`. The executor runs sequentially when `num_threads == 1` and uses a thread pool otherwise, so the same call path can serve debugging, evaluation, and deployment traffic.

The executor also manages failure and progress. It counts worker exceptions, cancels the run when the error count reaches `max_errors`, and resubmits stragglers when a timeout expires and only a few tasks remain. That keeps a slow or broken item from defining the whole batch. It controls fan-out with a stop condition instead of just adding threads.

Settings propagation makes that control useful. Each worker copies the parent's thread local overrides from `dspy.dsp.utils.settings`, restores them on exit, and deep copies a usage tracker so each thread counts locally before totals are merged at the end. That keeps the active LM, adapter, and other scoped settings consistent across the batch. The official [settings and context tutorial](https://dspy.ai/learn/programming/settings-and-context/) covers the inheritance rules in more depth.

## The sync and async bridge keeps integration flexible

DSPy keeps both sync and async entry points because service stacks mix notebook code, synchronous application code, and async web handlers. `asyncify()` in `dspy/utils/asyncify.py` runs a module in AnyIO worker threads behind a `CapacityLimiter`, and it copies the caller's thread local overrides into the worker before restoring them afterward. That bridge makes async integration possible without changing the program's internal call shape.

`syncify()` in `dspy/utils/syncify.py` goes the other direction. `run_async()` uses `asyncio.run()` when no event loop runs, and it falls back to a nested-loop workaround when a loop already exists. `syncify()` then turns `aforward()` into a synchronous `forward()` either in place or through a wrapper module. The bridge solves compatibility and integration problems; it does not remove the cost of crossing between event loop worlds. The [async tutorial](https://dspy.ai/learn/programming/async/) covers the supported usage patterns.

## Inspection stays lightweight

`pretty_print_history()` in `dspy/utils/inspect_history.py` prints recent prompts, responses, and tool calls from LM history. `Module.inspect_history()` and `BaseLM.inspect_history()` expose that view to the rest of the runtime. The result is a fast debugging aid for checking what a deployment just asked, what came back, and which tools ran, without turning the runtime into a full observability stack.

## Production composition

A deployed service gets the best result when these pieces work together. Callbacks surface the lifecycle through the [observability tutorial](https://dspy.ai/learn/programming/observability/), usage tracking and scoped configuration keep spend and defaults aligned through [settings and context](https://dspy.ai/learn/programming/settings-and-context/), batch execution gives evaluation and request fan-out a controlled concurrency model through the [deployment page](https://dspy.ai/learn/programming/deployment/), and the sync and async bridge lets the program fit the host's event loop through the [async tutorial](https://dspy.ai/learn/programming/async/). DSPy stays coherent because every path reads from the same settings layer and reports through the same call surfaces.

## Where to look in the code

- `dspy/utils/callback.py` — `BaseCallback`, `ACTIVE_CALL_ID`, and `with_callbacks` define the instrumentation seam.
- `dspy/utils/usage_tracker.py` and `dspy/clients/base_lm.py` — usage aggregation, response finalization, and cache-aware accounting.
- `dspy/utils/parallelizer.py` and `dspy/primitives/module.py` — `ParallelExecutor` and `Module.batch()` control batch execution.
- `dspy/dsp/utils/settings.py` — `settings`, `context(...)`, and thread local overrides carry configuration across workers.
- `dspy/utils/asyncify.py` and `dspy/utils/syncify.py` — async and sync bridges preserve compatibility with host event loops.
- `dspy/utils/inspect_history.py`, `dspy/clients/cache.py`, and `dspy/clients/lm.py` — history inspection, cache hit handling, and LM transport complete the production path.