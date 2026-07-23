---
title: Expressions and User Code
url: "n8n/expressions-and-user-code"
description: "How template expressions and Code nodes actually evaluate, and where they are isolated."
---

## Overview

This guide describes the runtime path that `{{ }}` expressions and Code node JavaScript follow inside n8n as of July 2026. It focuses on evaluation timing, item-scoped data access, sandboxing, and the task runner boundary rather than syntax or usage.

## When expressions run

When a node asks for a parameter value, n8n resolves the parameter lazily, one node at a time, for the current run and current item, at the moment the engine needs the value. `WorkflowExpression.getParameterValue()` hands the current `(runIndex, itemIndex)` to `resolveSimpleParameterValue()` and only builds expression state when the parameter actually contains an expression. See [Anatomy of an execution](./01-anatomy-of-an-execution.md) for the broader execution flow.

## The template engine layer

n8n uses `@n8n/tournament`, a first-party, output-compatible rewrite of `riot-tmpl`, to turn `{{ }}` templates into executable code. Tournament handles template compilation and execution. n8n layers the workflow data proxy, AST sanitizers, and sandboxing rules on top before a template reaches the runtime.

## WorkflowDataProxy and item-scoped data

`WorkflowDataProxy` sits at the center of expression evaluation. It builds each magic variable for a specific `(runIndex, itemIndex)` coordinate, so an expression reads one item's view of the workflow state instead of the whole execution record. The `getDataProxy()` helper assembles that view from nested helpers for node data, context, parameters, and paired-item traversal. That binding makes the same expression return different data for different items.

The main surfaces expose the current item, the current node, workflow metadata, and pairing helpers:

- Current item: `$json` and `$binary`.
- Node and input state: `$node`, `$items`, `$input`, `$prevNode`, and `$self`.
- Workflow and parameter state: `$workflow`, `$parameter`, `$rawParameter`, and `$tool`.
- Pairing helpers: `$getPairedItem`.

These surfaces behave like proxies and closures, not a raw workflow store. That design keeps every lookup anchored to the current coordinate instead of the whole execution history.

### Lineage aware lookups

`$('Node').item`, `itemMatching`, and `$getPairedItem` follow paired item ancestry. They try to trace how the current item connects back through upstream nodes, and that path can fail for real reasons: no execution data, an unexecuted node, no path back to the referenced node, missing paired item info, pinned data in manual execution, ambiguous multiple matches, an invalid branch reference, or an invalid item index.

The resulting messages usually name the referenced node and explain which part of the lineage search failed. They focus on the missing connection, the ambiguous match, or the bad index instead of dumping the full internal trace.

### Direct node reads

`$('Node').first()`, `.last()`, and `.all()` read the referenced node's run data directly. They answer what the node produced, not how the current item relates back through ancestry. These helpers skip paired item traversal, so they avoid the lineage failures that affect `.item` and related helpers.

## Sandboxing and the isolated expression runtime

Expression evaluation stays inside the AST guards in `expression-sandboxing.ts`, where `ThisSanitizer`, `PrototypeSanitizer`, and `DollarSignValidator` are wired as hooks around the Tournament evaluation in the default in-process path and are reused in the VM path. As of July 2026, `renderExpression()` falls back to `evaluateExpression()` in `expression-evaluator-proxy.ts`; the isolated-vm bridge in `@n8n/expression-runtime` is only activated when `N8N_EXPRESSION_ENGINE` explicitly opts the engine into `vm` through `Expression.initExpressionEngine()`.

## Code node runtime boundary

Code node JavaScript does not run in the main process JavaScript context. n8n splits execution into task runners for isolation and resource control: the broker matches the task to a runner, and the runner executes the script and streams results back. The CLI can start an internal runner process or connect to an external one, and the broker uses WebSocket heartbeats and drain handling to manage the connection lifecycle.

The runner receives only the data it needs together with an execution context that exposes `require`, console access, workflow static data access, RPC helpers, and workflow data proxies. `require-resolver.ts` gates built-in and external module access through allowlists, and secure mode process flags, frozen globals, and Buffer hardening keep the runner isolated from the main process. Per-item and run-once-for-all-items modes change how many items the runner processes, not the runtime boundary itself.

## Related pages

Use this page with [Items, runs, and paired item](./05-items-runs-and-paireditem.md), [Anatomy of an execution](./01-anatomy-of-an-execution.md), and [The canvas is not the execution](./03-the-canvas-is-not-the-execution.md). These guides cover item lineage, execution timing, and the split between the editor canvas and runtime behavior.

### Official docs

Reference material:

- [Task runners configuration](https://docs.n8n.io/deploy/host-n8n/configure-n8n/set-up-task-runners)
- [Code node reference](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code)
- [Item linking](https://docs.n8n.io/build/work-with-data/reference-data/link-data-items)
- [Data structure overview](https://docs.n8n.io/build/work-with-data/understand-n8ns-data-structure)

## Where to look in the code

- `packages/workflow/src/workflow-expression.ts` — parameter resolution for the current run and item.
- `packages/workflow/src/expression.ts` and `packages/workflow/src/expression-sandboxing.ts` — expression engine wiring and AST guards.
- `packages/workflow/src/workflow-data-proxy.ts` — magic variables, paired item lookup, and node scoped helpers.
- `packages/@n8n/tournament/src/index.ts` — the first-party template engine behind `{{ }}` expressions.
- `packages/@n8n/expression-runtime/src/evaluator/expression-evaluator.ts` and `packages/@n8n/expression-runtime/src/bridge/isolated-vm-bridge.ts` — isolated expression execution.
- `packages/cli/src/task-runners/task-broker/task-broker.service.ts`, `packages/cli/src/task-runners/task-broker/task-broker-ws-server.ts`, `packages/cli/src/task-runners/task-runner-module.ts`, `packages/cli/src/task-runners/task-runner-process-js.ts`, and `packages/@n8n/task-runner/src/js-task-runner/js-task-runner.ts` — task runner startup, task routing, and Code node execution.