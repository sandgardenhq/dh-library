---
title: About This Site
url: "dify/about-this-site"
description: "What this field guide is, who it is for, and how Doc Holiday generated it."
---

This field guide explains how the Dify codebase fits together. It exists to give engineers a working mental model of the product surface, especially the parts that are easier to understand from source than from user facing documentation. The site does not teach usage. It maps the internal structure behind the product surface so a reader can follow request flow, execution flow, and ownership boundaries. It is a map, not a tutorial.

The guide does not replace the official documentation. It complements [docs.dify.ai](https://docs.dify.ai) by focusing on platform internals, execution paths, and the relationships between the main code areas. The official docs remain the first stop for quickstarts, usage guides, plugin development, API reference, and self hosting operations.

## Who this is for

This guide is for engineers who adopt, operate, extend, or contribute to Dify and need to understand how requests move through the platform, how workflow execution reaches the graph runtime, and where runtime state lives. It is aimed at readers who can read code but want the map before tracing symbols and call paths. That includes platform engineers, integrators, and contributors who need a shared picture before diving into the source. The pages give those readers enough context to understand why a path exists before they read how it works.

## How this site was made

Doc Holiday (https://doc.holiday) wrote this site by exploring `langgenius/dify` and `langgenius/graphon` directly. The pages use real paths and symbol names in `api/` and `src/graphon/`, so the reader can move from prose back into code without translation. The guide centers on Dify’s integration layer in `api/` and Graphon’s workflow engine and runtime internals in `src/graphon/`. The intent is not to catalog every symbol. It shows the execution shape, the boundary between Dify and Graphon, and the places where a reader should look first when a behavior needs explanation.

## Scope and current state

This guide reflects a snapshot of a very active codebase. It does not try to freeze the moving parts into a permanent map. As of July 2026, the agent stack and CLI still change quickly, so the guide treats them as brief observations when they appear, not as stable reference material. The main path runs through Dify’s `api/` layer and Graphon’s `src/graphon/` runtime, and the pages stay at that system level rather than drilling into every function. It leaves function level detail to the source and keeps the page set focused on the mental model.

## Table of contents

| Page | Topic |
| --- | --- |
| [00-the-big-picture.md](./00-the-big-picture.md) | the map of the whole platform |
| [01-anatomy-of-a-workflow-run.md](./01-anatomy-of-a-workflow-run.md) | end-to-end trace of one run: HTTP → Celery → graph engine → SSE stream |
| [02-inside-the-graph-engine.md](./02-inside-the-graph-engine.md) | graphon's queue-and-worker execution model: ready queue, worker pool, edge processing, layers |
| [03-the-variable-system.md](./03-the-variable-system.md) | the VariablePool: typed segments, selectors, and how data moves between nodes |
| [04-parallel-iteration-and-loops.md](./04-parallel-iteration-and-loops.md) | iteration and loop nodes as child engines: concurrency, ordering, error modes |
| [05-pause-resume-and-run-state.md](./05-pause-resume-and-run-state.md) | what a run persists: run records, human-input pause/resume, error semantics |
| [06-the-model-runtime.md](./06-the-model-runtime.md) | one facade over every model provider: ModelInstance, credentials, quotas |
| [07-the-rag-pipeline.md](./07-the-rag-pipeline.md) | from uploaded document to retrieved context: indexing, vector backends, retrieval |
| [08-the-plugin-system.md](./08-the-plugin-system.md) | the plugin daemon and its runtimes — the architecture Dify's blog calls "Beehive" |

## Where to look in the code

- `langgenius/dify/api/` for the platform integration layer and workflow entry points.
- `langgenius/graphon/src/graphon/` for runtime state, node execution, iteration, and suspension handling.
- The same split applies throughout the guide: Dify owns the product surface, while Graphon owns the execution engine.

## Source note

- Generated from: dify commit 96e34e7b24, graphon commit e86beec (2026-07-16)
- Repository or contact: the site repository at https://github.com/sandgardenhq/dh-library