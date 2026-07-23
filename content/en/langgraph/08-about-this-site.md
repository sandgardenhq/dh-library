---
title: About This Site
url: "langgraph/about-this-site"
description: "What this field guide is, who it is for, and how Doc Holiday generated it."
---

This field guide explains the connective internals of the LangGraph Python library. It focuses on the layer that decides when nodes run, what `compile()` produces, why checkpoints have their shape, and how replay, resume, and idempotency stay consistent across runs.

This page frames the rest of the site. The pages below stay at the concept level and use real file paths and symbol names so each concept stays traceable. The guide keeps its attention on the open source Python library in `libs/langgraph` and `libs/checkpoint*`; it does not repeat API reference material, step by step tutorials, the hosted platform, the SDK packages, or the separate JS and TS port in `langgraphjs`.

Engineers adopting, embedding, extending, or debugging LangGraph need one mental model for state schemas, graph topology, compiled artifacts, checkpoint records, and execution state.

The official LangGraph docs cover usage, tutorials, and reference material. This site owns the connective internals layer they do not spell out: how those pieces work together across the runtime.

The guide runs from the big picture through invoke flow, scheduling, state compilation, topology, checkpoints, and replay, so each sibling page handles one runtime layer and hands off to the next.

## Contents

- [The big picture](./00-the-big-picture.md) — the map of the LangGraph monorepo: builder, engine, persistence, and the platform boundary
- [Anatomy of an invoke](./01-anatomy-of-an-invoke.md) — one graph.invoke() traced end to end through the superstep loop
- [What runs next](./02-what-runs-next.md) — the version-trigger mechanism: how channel_versions and versions_seen decide which node fires
- [Your state compiles to channels](./03-your-state-compiles-to-channels.md) — how a state schema becomes channel objects: reducers, the channel zoo, and when each errors
- [Control flow is channels too](./04-control-flow-is-channels-too.md) — edges, branches, Send, and Command: how topology compiles away into channels and tasks
- [Why checkpoints look like that](./05-why-checkpoints-look-like-that.md) — the checkpoint format's design rationale: snapshots plus version bookkeeping
- [Replay, resume, and idempotency](./06-replay-resume-and-idempotency.md) — what durable execution guarantees, what re-runs on resume, and the side-effect contract
- [One engine, two APIs](./07-one-engine-two-apis.md) — what @entrypoint and @task compile to: the same Pregel engine

Doc Holiday (https://doc.holiday) wrote this site by exploring the LangGraph source repository directly. Each page grounds its claims in actual files and symbols, for example `langgraph/pregel/_algo.py`, `StateGraph`, `Pregel`, `JsonPlusSerializer`, `InMemorySaver`, `channel_versions`, and `versions_seen`.

Several terms recur across the site because they carry the runtime story. `channel_versions` tracks version state by channel name. `versions_seen` tracks, by node name, what each node has already consumed. Those two fields sit at the center of scheduling, replay, and idempotency, so the guide returns to them when it explains why a checkpoint looks the way it does.

Every page was written against, and fact-checked with, a single snapshot of the code: commit 49ae27c2a (2026-07-15) of https://github.com/langchain-ai/langgraph.

The guide covers only the open source Python library. A separate JS and TS port lives in `langgraphjs`. The codebase changes quickly, so this site captures a snapshot rather than a fixed contract. The official LangGraph docs remain authoritative. Corrections are welcome via issues and pull requests at https://github.com/sandgardenhq/dh-library.

This snapshot should be read against the repository, not instead of it. When the code shifts, the pages here should shift with it.

Fast moving areas such as the beta `DeltaChannel` and v3 streaming appear only as dated side notes when they affect the surrounding design. The main thread of the guide stays on the stable core: `StateGraph`, `Pregel`, channels, and checkpointers.