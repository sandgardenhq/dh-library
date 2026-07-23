---
title: About This Site
url: "n8n/about-this-site"
description: "What this field guide is, who it is for, and how Doc Holiday generated it."
---

This site is a concept-level field guide to the n8n codebase. It explains runtime behavior, the purpose of the main subsystems, and the relationships between the pieces that cooperate during execution. The goal is a shared mental model, not a product walkthrough or an API reference.

The intended audience includes engineers who run, debug, extend, or embed n8n. It also speaks to node authors and self-hosters who need to reason about execution order, partial execution, expressions, webhooks, or workflows that keep running across process boundaries. Each page focuses on the ideas that matter when reading, discussing, or changing the system.

Doc Holiday wrote this guide by exploring the n8n source repository directly. Every page stays grounded in actual code, with real file paths and symbol names, as of commit `26caaa876f` (2026-07-17) of [n8n-io/n8n](https://github.com/n8n-io/n8n) — the state of the code every page was written against and fact-checked with. The guide presents one dated snapshot of an actively developed codebase, so it treats migration-state details as observations from that date rather than permanent structure.

The pages start with the whole platform and then narrow to the places where execution, data flow, and user code meet. That path matters because n8n behaves differently when a workflow runs normally, resumes after a pause, or crosses a process boundary. The guide names those relationships so a reader can follow the system from concept to code without losing the larger picture.

## Scope

This guide complements the official n8n documentation and does not replace it. The authoritative product documentation remains at https://docs.n8n.io.

n8n is fair-code licensed under the Sustainable Use License, with enterprise-licensed components in `.ee` areas of the repository. This guide is an independent companion to n8n and to any commercial offering tied to it.

The codebase changes quickly, so this guide reflects a snapshot rather than a permanent description. Corrections and updates are welcome at [github.com/sandgardenhq/dh-library](https://github.com/sandgardenhq/dh-library) via issues and pull requests.

That structure keeps the guide focused. It does not try to cover every file in the repository, and it does not duplicate the public product docs. Instead, it points to the pieces that explain behavior: what starts work, what decides the next step, what preserves data between runs, and where the execution model diverges from the canvas.

Readers can use the map to move from broad concepts to the specific code paths that carry them. That keeps the site practical for debugging and extension work while still framing each topic as part of one system, instead of a list of isolated features.

When a behavior changes, the guide points to the subsystem boundary that moved and the runtime consequence that follows. That lets the page explain why a change matters without turning into a file list, a product tour, or a substitute for the official docs for readers who need the mental model quickly.

It also makes room for the disagreements that matter most: when the editor model, the run data, and the live execution engine do not line up, the guide names the gap instead of smoothing it over.

## Table of contents

- [/00-the-big-picture.md](./00-the-big-picture.md) — A map of the whole platform and its major moving parts.
- [/01-anatomy-of-an-execution.md](./01-anatomy-of-an-execution.md) — An end-to-end trace of one workflow execution.
- [/02-how-the-engine-decides-what-runs-next.md](./02-how-the-engine-decides-what-runs-next.md) — The scheduling algorithm, including the node stack, v0 and v1 ordering, joins, and dead branches.
- [/03-the-canvas-is-not-the-execution.md](./03-the-canvas-is-not-the-execution.md) — Where the visual model and the engine model disagree.
- [/04-partial-executions-and-dirty-nodes.md](./04-partial-executions-and-dirty-nodes.md) — What execute step really does through the DirectedGraph machinery.
- [/05-items-runs-and-paireditem.md](./05-items-runs-and-paireditem.md) — The data model of a run: items, runs, and item lineage.
- [/06-expressions-and-user-code.md](./06-expressions-and-user-code.md) — How `{{ }}` expressions and Code nodes evaluate in practice.
- [/07-triggers-webhooks-and-activation.md](./07-triggers-webhooks-and-activation.md) — How workflows start, from editor tests to production activation.
- [/08-one-execution-many-processes.md](./08-one-execution-many-processes.md) — Queue mode, wait and resume behavior, and executions that outlive a process.