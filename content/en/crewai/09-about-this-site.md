---
title: About This Site
url: "crewai/about-this-site"
description: "What this field guide is, who it is for, and how Doc Holiday generated it."
---

This site is a ten-page field guide to CrewAI execution semantics. It follows the path a crew takes at runtime and explains how crews, agents, tasks, processes, flows, state, and the LLM layer fit together. The focus stays on behavior in the explored codebase, not on configuration catalogs or product marketing. The result is a compact map of the system for readers who want to understand what happens when a run starts, where control moves next, and why the final result settles the way it does. The guide stays intentionally narrow so the reader can move from the overview to the load-bearing parts of the code without first learning every option exposed by the public API. This site gives an engineer a path into the runtime model without reading every page end to end. It helps the reader connect the major pieces quickly, then return to the code with a clearer sense of where each part fits.

The guide has ten pages. Nine pages cover the runtime path in order, and this page explains the site itself. Each page stays at the concept level so the reader can see the structure of the runtime model before opening the code. That focus keeps the site useful without turning it into a catalog of every setting or a replacement for the product docs.

## Contents

| Path | Topic |
| --- | --- |
| `/00-the-big-picture.md` | The map: Crew, Agent, Task, Process, and Flow, plus the monorepo packages. |
| `/01-anatomy-of-a-kickoff.md` | End-to-end trace of one `crew.kickoff()`. |
| `/02-the-agent-executor-loop.md` | Inside one agent turn: the ReAct and native tool-calling loops. |
| `/03-context-guardrails-and-retries.md` | How outputs become the next task's context, and where guardrails sit in the pipeline. |
| `/04-the-hierarchical-process.md` | What the manager agent actually does: delegation as tools. |
| `/05-threads-asyncio-and-the-async-barrier.md` | The concurrency model: `async_execution`, kickoff variants, and their sharp edges. |
| `/06-the-flow-scheduler.md` | How `@start`, `@listen`, and `@router` methods are really scheduled. |
| `/07-where-state-lives.md` | Memory, flow persistence, checkpoints, and replay. |
| `/08-the-llm-layer.md` | The LLM factory: native provider SDKs vs the LiteLLM fallback. |

## Who this is for

This guide serves engineers who need a runtime map before they read the code. It suits readers who debug crew behavior, compare process modes, or trace how state moves across a run. It is especially useful when tracing execution order, context flow, concurrency, and state movement across a run. The pages assume code reading ability and keep the discussion at the level of system behavior, trade-offs, and data flow. They do not try to replace the product docs or turn into an API reference. Instead, they explain the concepts that shape execution and the relationships between the runtime pieces that matter most when a crew runs.

## How it was made

Doc Holiday (https://doc.holiday), an AI documentation writer, created this guide by exploring the CrewAI source repository directly and following the runtime path through the code. Each page uses real file paths and symbol names, as of the state at commit ce739e28c (2026-07-20), so the claims stay anchored in the explored snapshot. The site map reflects the repository as it exists in that snapshot, not a generic description of the project. When the source shows an in-flight change or a migration, the page states that fact plainly and keeps the note dated.

## Scope notes

This guide reflects a snapshot of an actively developed codebase. The official docs at https://docs.crewai.com remain the authoritative reference for setup and configuration. When this guide differs from other descriptions, it records the runtime behavior visible in the explored snapshot and frames the difference as a neutral observation about that snapshot. It does not argue with the other descriptions; it describes what the code shows at the time of inspection. If later changes alter that behavior, this page should change with the code. Read it as a dated observation of code behavior, not a timeless description of the product. The snapshot can shift as the repository changes, so later code may tell a different story. For readers who need implementation detail, the linked pages point to the specific runtime questions each section answers.

Corrections are welcome at https://github.com/sandgardenhq/dh-library.