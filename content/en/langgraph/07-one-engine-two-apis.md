---
title: One Engine, Two APIs
url: "langgraph/one-engine-two-apis"
description: "What @entrypoint and @task compile to: the same Pregel engine."
---

LangGraph offers two front ends into one runtime: `StateGraph` and the Functional API built from `@entrypoint` and `@task`. Both lower to `Pregel`, so they share the same superstep loop, the same channel model, the same checkpointer, and the same replay rules. Nothing new needs learning at the engine layer; the Functional API mainly hides graph shape that `StateGraph` makes explicit.

## The mental model

In `langgraph/graph/state.py`, `StateGraph.compile()` builds a `CompiledStateGraph`, and that class subclasses `Pregel`. In `langgraph/func/__init__.py`, `entrypoint.__call__` skips the builder layer and constructs a `Pregel` directly. The important point is not the syntax difference but the lowering step: both paths land on the same engine, and `langgraph/pregel/_loop.py` drives both with the same plan, execute, update cycle, checkpoint creation, and resume handling. That `checkpointer`, `channel_versions`, and `versions_seen` bookkeeping decides what runs next in both APIs, so nothing at the runtime layer needs relearning.

## What `@entrypoint` constructs

`entrypoint.__call__` builds a graph with one `PregelNode`: the decorated function. It triggers that node from `START`, and it gives the node two writers. One writer sends the function return value to `END`; the other saves the carried forward value into `PREVIOUS`. The channel set contains only `START`, `END`, and `PREVIOUS`, with `START` as `EphemeralValue` and the other two as `LastValue`. That makes the functional workflow a one node graph.

The same loop still performs plan, execute, and update, and it still persists checkpoints and advances versions. That is the same machinery the [Anatomy of an invoke](./01-anatomy-of-an-invoke.md) page describes: writes land in channels, channel versions advance, `versions_seen` records what each node consumed, and the checkpointer stores the result for the next run.

## What `@task` adds

The task layer adds a second kind of scheduled work. The `task()` decorator returns `_TaskFunction`, and `_TaskFunction.__call__` returns a `SyncAsyncFuture` through `_call_with_options`. The decorated callable does not run in a separate worker pool just because it sits under the Functional API.

`get_runnable_for_task()` in `langgraph/pregel/_call.py` wraps the task in a `RunnableSeq` that ends with `ChannelWrite([ChannelWriteEntry(RETURN)])`, so the runner records the task result as a normal write. `prepare_push_task_functional()` in `langgraph/pregel/_algo.py` turns each task call into a dynamic `PUSH` task with its own scratchpad, runtime, and checkpoint namespace. That matches the same machinery that `Send` packets use, so a task call inside an entrypoint behaves like a dynamic task created in the current superstep: the call returns a future, the Pregel runner schedules the work, and sibling tasks can run in parallel. See [Control flow is channels too](./04-control-flow-is-channels-too.md).

## Persistence and replay

Because `@entrypoint` builds one node, the checkpoint boundary falls around that node rather than around each line of the function body. The engine persists task writes, then restores them on replay. On resume, the entrypoint body starts again from the top, but completed tasks return their recorded results from the checkpoint instead of recomputing. That preserves the same replay and idempotency contract that graph nodes follow: the loop may repeat a superstep, and the code inside the entrypoint must tolerate that. The checkpoint and version bookkeeping in `langgraph/pregel/_loop.py` makes that possible, because the loop reuses the saved writes, updates `channel_versions`, and carries forward `versions_seen` before it continues. See [Replay, resume, and idempotency](./06-replay-resume-and-idempotency.md).

## `PREVIOUS` and `entrypoint.final`

`PREVIOUS` is not a special memory system. `langgraph/_internal/_constants.py` defines it as an ordinary reserved channel key, and `entrypoint.__call__` binds it to `LastValue(save_type, PREVIOUS)`. That means short term memory across invocations on the same `thread_id` uses the same checkpointed channel state as the rest of the graph. `entrypoint.final` gives the workflow a clean way to return one value while saving another, so the caller can see one result while the next run reads a different carried forward value. For usage examples, see the official [Functional API](https://docs.langchain.com/oss/python/langgraph/functional-api) page.

## Choosing between the APIs

Choose between the APIs for ergonomics and observability, not capability. `StateGraph` exposes explicit topology, node by node visibility, and easy interrupt placement. `@entrypoint` and `@task` keep the control flow in plain Python while still giving task level parallelism. Both paths reach the identical Pregel engine, so the difference lies in how much structure the code shows, not in what the runtime can do. For a usage level comparison, see the official [Choosing APIs](https://docs.langchain.com/oss/python/langgraph/choosing-apis) page.

## Where to look in the code

- `libs/langgraph/langgraph/func/__init__.py` — `entrypoint.__call__`, `_TaskFunction`, `task()`, and `entrypoint.final`.
- `libs/langgraph/langgraph/pregel/_call.py` — task wrapping, `SyncAsyncFuture`, and the `RETURN` write.
- `libs/langgraph/langgraph/pregel/_algo.py` — dynamic functional `PUSH` task creation, scratchpad setup, and checkpoint aware runtime plumbing.
- `libs/langgraph/langgraph/pregel/_loop.py` — the shared plan, execute, update loop, replay, and checkpoint handling.
- `libs/langgraph/langgraph/graph/state.py` — `StateGraph.compile()` lowering to `Pregel`.
- `libs/langgraph/langgraph/constants.py` — `START` and `END`; `libs/langgraph/langgraph/_internal/_constants.py` — `PREVIOUS`, `RETURN`, `TASKS`, and `PUSH`.