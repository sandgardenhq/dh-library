---
title: Why Checkpoints Look Like That
url: "langgraph/why-checkpoints-look-like-that"
description: "The checkpoint format's design rationale: snapshots plus version bookkeeping."
---

LangGraph checkpoints store channel values plus version bookkeeping, not an event log. That shape gives the runtime a fast restore path, avoids replaying history to rebuild state, and lets the scheduler compare versions from a single saved point.

This page explains the checkpoint format's design choices without repeating the storage tables or saver details covered in the official [checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers), [persistence](https://docs.langchain.com/oss/python/langgraph/persistence), [time travel](https://docs.langchain.com/oss/python/langgraph/use-time-travel), and [MISSING_CHECKPOINTER](https://docs.langchain.com/oss/python/langgraph/errors/MISSING_CHECKPOINTER) pages. It sits alongside [anatomy of an invoke](./01-anatomy-of-an-invoke.md), [what runs next](./02-what-runs-next.md), [your state compiles to channels](./03-your-state-compiles-to-channels.md), [control flow is channels too](./04-control-flow-is-channels-too.md), [replay, resume, and idempotency](./06-replay-resume-and-idempotency.md), [one engine, two APIs](./07-one-engine-two-apis.md), and [about this site](./08-about-this-site.md).

## Why checkpoints store snapshot plus version maps

A checkpoint stores the current channel values plus two version maps: `channel_versions` for channels and `versions_seen` for nodes. `Checkpoint` and `CheckpointMetadata` capture that saved state, while `prepare_next_tasks` and `should_interrupt` compare the maps to decide which nodes wake up next. The scheduler re-derives the execution frontier by pure comparison, so the state itself becomes the resume point and the engine does not carry a separate program counter.

That matters because the runtime can restore in O(1) relative to the size of the recorded history. It does not need to replay every past write to rebuild state, and it does not need a separate history scan to reconstruct the current values. `channels_from_checkpoint`, `achannels_from_checkpoint`, and `copy_checkpoint` all rely on that direct snapshot model.

## Why checkpoints land only at superstep boundaries

LangGraph takes checkpoints only at superstep boundaries because channels stay immutable during a step. `apply_writes` collects every task result and applies it at the boundary, and `_put_checkpoint` commits the boundary state after the step finishes. That boundary matches the BSP style that the rest of the execution model already uses in [anatomy of an invoke](./01-anatomy-of-an-invoke.md).

This boundary rule also explains time travel. A checkpoint can represent the end of a superstep, so the system can resume, fork, or inspect history from that point with the same rules it uses for normal recovery. It cannot land at a finer grained midpoint, because no midpoint ever becomes a consistent channel state. The official [time travel](https://docs.langchain.com/oss/python/langgraph/use-time-travel) page documents the user facing behavior; the checkpoint shape makes that behavior possible.

## Why two stores handle crash recovery

LangGraph keeps pending task writes separate from committed checkpoints so a crash never has to guess which work finished. `put_writes` records a task's writes as soon as the task produces them, `_checkpointer_put_after_previous` waits for those write futures before it publishes the next checkpoint, and `after_tick` saves the checkpoint only after `apply_writes` finishes the step.

That split gives the runtime a clean crash story. If three parallel nodes run and one fails, the two nodes that already finished keep their writes as pending writes attached to the in-progress checkpoint. If the process stops in the middle of a superstep, the next run can load the last committed checkpoint, read the staged task writes, and continue from a state that still matches the step boundary. The staged writes act like write ahead intent, while the checkpoint acts like committed history. The [replay, resume, and idempotency](./06-replay-resume-and-idempotency.md) guide ties that shape to the rerun contract.

`exit_delta_task_id` matters here too. When the runtime needs to stage delta channel writes for later persistence, it gives them an ordered task id so the saver can keep them in chronological order without adding another sequence column.

## Saver minted versions stay opaque on purpose

`BaseCheckpointSaver.get_next_version` owns version minting for each channel. Readers compare those versions; they do not parse them. That keeps ordering authority in one place and lets different savers choose a version shape they can order reliably.

The runtime uses those versions as bookkeeping rather than as user facing data. `apply_writes` advances the channel versions, `prepare_next_tasks` compares what each node has already seen, and `should_interrupt` uses the same comparison to decide whether the current checkpoint has new work behind it. Because the saver mints the next value, a saver can also store only the channels that changed between checkpoints and still preserve the correct order.

## Ordered checkpoint ids keep history sortable

`create_checkpoint` uses sortable ids from `uuid6(clock_seq=step)`, and `empty_checkpoint` uses a synthetic id for the first empty state. Those ids give the thread a total history order without a separate sequence column.

Ordered ids make history traversal straightforward. `get_state_history` can sort checkpoints directly, and time travel can fork from a known point without inventing another ordering rule. `copy_checkpoint` preserves the same structure when the runtime needs a safe duplicate for persistence.

## The payload stays compact, not human readable

`JsonPlusSerializer` sounds like JSON, but the wire format uses msgpack through `ormsgpack`. The serializer still understands LangChain objects and the other framework types checkpointing needs, but it keeps the payload compact and machine friendly.

That choice matters because checkpoints need to move quickly between memory and storage. The serializer boundary hides the wire format from the rest of the engine, so the checkpoint model can stay focused on state and versions instead of encoding details. The official [checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers) docs cover the serialization and fallback story in user terms.

## The public contract has a runnable test suite

`BaseCheckpointSaver` defines the public contract, and `libs/checkpoint-conformance` turns that contract into an executable specification for third party savers. A saver that passes that suite matches the behavior LangGraph expects for checkpoints, writes, history, and copy operations.

The first party savers include Postgres, SQLite, and `InMemorySaver`. `InMemorySaver` fits development and tests, not production. As of mid-2026, the beta `DeltaChannel` relaxes “channel_values holds every channel’s snapshot” by reconstructing some channels from recorded writes; its format is explicitly unstable and this guide does not cover it.

## Where to look in the code

- `libs/langgraph/langgraph/pregel/_checkpoint.py`
- `libs/langgraph/langgraph/pregel/_loop.py`
- `libs/langgraph/langgraph/pregel/_algo.py`
- `libs/checkpoint/langgraph/checkpoint/base/__init__.py`
- `libs/checkpoint/langgraph/checkpoint/serde/jsonplus.py`
- `libs/checkpoint-conformance/langgraph/checkpoint/conformance/validate.py`