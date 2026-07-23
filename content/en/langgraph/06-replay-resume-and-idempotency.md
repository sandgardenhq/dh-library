---
title: Replay, Resume, and Idempotency
url: "langgraph/replay-resume-and-idempotency"
description: "What durable execution guarantees, what re-runs on resume, and the side-effect contract."
---

This chapter defines the durable execution contract for the LangGraph field guide. It explains how replay, resume, and idempotency fit together when the Graph API runs with checkpoints, interrupts, retries, and time travel. For the checkpoint shape and scheduling model, see [why checkpoints look like that](./05-why-checkpoints-look-like-that.md) and [what runs next](./02-what-runs-next.md). The contract lives in `libs/langgraph/langgraph/types.py`, `libs/langgraph/langgraph/pregel/_loop.py`, `libs/langgraph/langgraph/pregel/_algo.py`, `libs/langgraph/langgraph/pregel/_checkpoint.py`, `libs/langgraph/langgraph/pregel/_retry.py`, `libs/langgraph/langgraph/pregel/_runner.py`, `libs/langgraph/langgraph/_internal/_replay.py`, and `libs/langgraph/langgraph/func/__init__.py`. For usage-oriented examples, see the official docs on [interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts), [functional API](https://docs.langchain.com/oss/python/langgraph/functional-api), [checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers), [fault tolerance](https://docs.langchain.com/oss/python/langgraph/fault-tolerance), and [time travel](https://docs.langchain.com/oss/python/langgraph/use-time-travel).

## 1. Mental model: resume is replay, not continuation.

Durable execution starts from the last committed checkpoint and runs forward again. The engine does not save a frozen coroutine or a program counter; `PregelLoop.__enter__` loads the latest checkpoint, `create_checkpoint` records the channel snapshot at the end of each committed superstep, and `channels_from_checkpoint` and `achannels_from_checkpoint` rebuild channel state before work resumes.

`PregelLoop._first()` decides whether the run resumes or starts fresh, and `apply_writes()` updates `channel_versions` and `versions_seen` so later scheduling can compare what each node has already consumed against the current channel state. A resumed run therefore restores committed channel values and persisted task writes, then schedules fresh work from that point. `ReplayState` applies the same rule to nested graphs: the first visit to a subgraph during parent replay loads the checkpoint before the replay point, and later visits load the current head normally.

## 2. Granularity ladder.

Superstep checkpoints form the committed resume boundary. `apply_writes` advances channel versions and `create_checkpoint` captures the state at the end of the superstep, so replay starts from a stable boundary rather than from a half finished step. That boundary is the point where the graph decides which work belongs to the next run and which work already reached a durable state.

Pending writes narrow that boundary inside the superstep. `PregelLoop.put_writes()` saves task writes before the next checkpoint, and `_reapply_writes_to_succeeded_nodes()` restores finished siblings from those writes so already completed work does not run again after resume. This layer lets the engine keep the results of nodes that already finished while it re-evaluates the nodes that still need work.

Atomic node bodies sit at the innermost boundary. `run_with_retry` and `arun_with_retry` restart the node body from the top after a retryable failure, and `arun_with_retry` also does so after a timeout, so any side effect before the boundary can run again on the next attempt. Interrupt resume is different: the loop re-schedules the task on resume, and `interrupt()` re-executes from the start of the node. The safest mental model treats a node body as one attempt, not a lasting execution state.

## 3. Interrupt case, concretely.

`interrupt()` raises `GraphInterrupt` the first time a node reaches it and returns the supplied value to the caller through `Interrupt`. A resuming caller sends `Command(resume=...)`, and the scratchpad in `langgraph/pregel/_algo.py` feeds resume values back in call order through the same node body.

`PregelRunner.commit()` records the interrupt write, and `PregelLoop._suppress_interrupt()` commits the checkpoint and suppresses the exception for the outer graph. The loop then resumes from the last committed checkpoint, not from the line after `interrupt()`, so keep side effects before the call out of that node, move them after the interrupt or into an upstream node whose superstep is already committed, and make unavoidable side effects idempotent.

Multiple `interrupt()` calls in one node follow the same order. The first resume value satisfies the first suspended call, the second resume value satisfies the second call, and so on; the contract lives in `langgraph/types.py` alongside `Command`, `Interrupt`, and `PregelTask`. That ordering also covers `PregelExecutableTask`, which gives the runner one task object to resume, retry, or replay.

## 4. Same contract beyond interrupts.

Retries use the same at least once rule. `run_with_retry` and `arun_with_retry` can call the same node body more than once after a failure or timeout, and `PregelRunner.commit()` writes the failure path back into the checkpoint so the next attempt sees consistent state. In practice, a retry can revisit any node code that ran before the exception, which makes duplicate protection part of the node design, not a wrapper concern.

`durability="async"` widens the gap between execution and persistence. The loop can start the next step before the checkpoint write lands, so a crash can replay the last committed superstep and run the node body again. The safe assumption stays simple: LangGraph makes forward progress exactly once at committed supersteps, while node bodies run at least once and sometimes more.

That contract pushes idempotency to the edge of the system. External writes need keys, existence checks, or deduplication so a retried node, a resumed interrupt, or a replay after a crash cannot duplicate side effects. The code path in `_runner.py` commits task writes, and the code path in `_loop.py` decides when those writes reach a durable checkpoint.

## 5. Functional API version.

The Functional API uses the same durable execution machinery, but it shifts the replay boundary down to tasks. For the lowering story, see [one engine, two APIs](./07-one-engine-two-apis.md). In `langgraph/func/__init__.py`, `@task` wraps work as `_TaskFunction`, and completed task results persist in the checkpointer so replay can return the recorded result instead of recomputing that task. The runner restores those task writes through the same commit path that Graph API nodes use, so the mechanism stays shared even when the programming model changes.

The entrypoint body still re-executes from the top on replay. That means orchestration code runs again, but finished tasks behave like memoized steps because the runner restores their saved values before it schedules fresh work. `entrypoint.final` only separates the returned value from the saved value; it does not change the replay model. It gives the Functional API a clean split between the value returned now and the value stored for the next invocation.

## 6. Time travel as the same machinery.

Time travel and fork use the same replay path with a different replay point. A `checkpoint_id` chooses the boundary, then `channel_versions` and `versions_seen` decide what the engine replays and what it treats as fresh work. Replay-vs-fresh scheduling comes from the same trigger comparison used in normal planning (`_triggers()` inside `prepare_next_tasks`) together with `PregelLoop._first()` and `is_time_traveling`; `should_interrupt()` only compares `channel_versions` against the `versions_seen` entry for the `INTERRUPT` sentinel when the engine pauses at an `interrupt_before` or `interrupt_after` boundary. For sparse delta channels, `channels_from_checkpoint()` and `achannels_from_checkpoint()` call `_needs_replay()` so the engine can rebuild channel state from history instead of relying on a stored value.

A time travel run restores everything before the chosen checkpoint and re-executes everything after it. A fork does the same thing, but it writes a new branch point into history so the replayed run can continue without overwriting the original line of execution. `exit_delta_task_id()` supports the same story for exit mode by preserving chronological order when the saver stores delta writes.

For usage details, the official [fault tolerance](https://docs.langchain.com/oss/python/langgraph/fault-tolerance), [checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers), and [time travel](https://docs.langchain.com/oss/python/langgraph/use-time-travel) docs show the user-facing flow.

## 7. Where to look in the code.

- `libs/langgraph/langgraph/types.py`: `interrupt`, `Command`, `Durability`, `Interrupt`, `PregelTask`, and `PregelExecutableTask`.
- `libs/langgraph/langgraph/pregel/_loop.py`: checkpoint restore, pending writes, durability handling, and `_suppress_interrupt`.
- `libs/langgraph/langgraph/pregel/_algo.py`: `apply_writes`, `prepare_next_tasks`, and `should_interrupt`.
- `libs/langgraph/langgraph/pregel/_checkpoint.py`: `create_checkpoint`, `channels_from_checkpoint`, `achannels_from_checkpoint`, `_needs_replay`, and `exit_delta_task_id`.
- `libs/langgraph/langgraph/pregel/_retry.py` and `libs/langgraph/langgraph/pregel/_runner.py`: retry loops, task commit, and interrupt or error write handling, and the related tests in `libs/langgraph/tests/test_interruption.py`, `libs/langgraph/tests/test_time_travel.py`, and `libs/langgraph/tests/test_retry.py`.
- `libs/langgraph/langgraph/_internal/_replay.py` and `libs/langgraph/langgraph/func/__init__.py`: `ReplayState`, `_TaskFunction`, `task`, `entrypoint`, and `entrypoint.final`.