---
title: The Canvas Is Not the Execution
url: "n8n/the-canvas-is-not-the-execution"
description: "Where the visual model and the engine's model disagree, mismatch by mismatch."
---

The canvas projects `IWorkflowBase`. Execution projects `IRunExecutionData`. Those structures share node names and connections, but they answer different questions: one describes the workflow definition, the other records a specific run. The editor draws the definition, while the engine and stored execution records describe what happened. See [Anatomy of an execution](./01-anatomy-of-an-execution.md) for the data shape behind that split.

## Wires imply order, position decides it

The canvas suggests that wire direction alone determines branch order. The engine does not follow that mental model. In `useRunWorkflow.ts`, `sortNodesByYPosition()` sorts the start nodes by canvas Y before the payload leaves the editor, and `WorkflowExecute.addNodeToBeExecuted()` uses the workflow's execution order setting to decide whether it unshifts or pushes the next node onto the stack. That makes branch order sensitive to the payload, not just to the wires on the screen.

The result is easy to miss in `executionOrder: 'v1'`: moving a node vertically can change which branch runs first even when the wires stay the same. See [How the engine decides what runs next](./02-how-the-engine-decides-what-runs-next.md) and the official [execution order](https://docs.n8n.io/build/flow-logic/understand-execution-order) docs for the wider rule set.

## One box, many runs

The canvas shows one node box, but the runtime stores many task records for that node. `runData[nodeName]` is an array, and each entry captures one run at a specific execution index. `getNextExecutionIndex()` derives the next index from the stored run data, and `moveNodeMetadata()` merges per-run metadata back into the matching array slot. The box stays singular; the execution history does not.

The editor can still summarize that history as counts because it reads stored execution data, not the canvas. `useRunWorkflow.ts` seeds local execution state with `createRunExecutionData({ resultData: { runData, pinData } })`, and `workflows.store.ts` later loads saved execution data through `fetchExecutionDataById()`. For the item level view of the same structure, see [Items, runs, and pairedItem](./05-items-runs-and-paireditem.md).

## One run, many items — usually

Most nodes process a set of items in a single run. The engine does not treat each item as a separate run by default. `WorkflowExecute.handleExecuteOnce()` narrows `executeOnce` nodes to the first item, and `prepareConnectionInputData()` chooses the input shape that the node actually receives. The Code node reference documents the related run-once modes, which change how the node groups or reuses items. See the official [Code node reference](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/).

The important point stays simple: the canvas shows a node, but the runtime decides item granularity. A node can consume many items, only one item, or a shaped subset of the input, depending on the node implementation and its execution mode.

## The loop that isn’t

The canvas can suggest a plain loop. `SplitInBatches` does not behave like a language loop. `findStartNodes()` treats `n8n-nodes-base.splitInBatches` specially by checking the last run's `done` output, and `recreateNodeExecutionStack()` rebuilds waiting execution state from stored `IRunData` and pinned data. That makes the next pass depend on saved execution state, not on a loop construct in the canvas.

This is why `SplitInBatches` feels stateful across successive runs. The visual pattern points to repetition, but the engine advances by resuming stored state. See [Items, runs, and pairedItem](./05-items-runs-and-paireditem.md) for the item history that makes that resumption possible.

## Disabled is not deleted

A disabled node still exists in the workflow definition. The engine only changes how it treats that node. In a full run, `WorkflowExecute.handleDisabledNode()` passes through the first main input so downstream data can keep flowing. In a partial run, `filterDisabledNodes()` removes disabled nodes from the graph and reconnects the main connections before `findSubgraph()` and `recreateNodeExecutionStack()` rebuild the execution path.

That split matters because the same disabled node can behave like a passthrough in a full run and like a removed vertex in a partial run. See [Partial executions and dirty nodes](./04-partial-executions-and-dirty-nodes.md) and the official [dirty nodes](https://docs.n8n.io/build/understand-workflows/understand-executions/understand-dirty-nodes) docs.

## Pinned nodes never run

Pins look like saved node output, and the main execution loop in `processRunExecutionData()` substitutes `pinData` for execution data when a pin exists for that node, skipping `runNode()` entirely. In that path the node's code does not run; the editor can still seed local playback with `pinData` through `useRunWorkflow.ts`, and `workflows.store.ts` later reads stored execution data back for display. The official [execution types](https://docs.n8n.io/build/understand-workflows/understand-executions/types-of-executions) docs explain why that replay behavior stays separate from production runs.

## “Execute this node” is not “execute one node”

A targeted run does more than start one box. `consolidateRunDataAndStartNodes()` walks backward from the destination, keeps the reusable run data, and marks the nodes that must run again. On the backend, `runPartialWorkflow2()` then filters disabled nodes, finds the subgraph, cleans the run data, finds start nodes, and recreates the execution stack before execution begins. See [Partial executions and dirty nodes](./04-partial-executions-and-dirty-nodes.md) for the dirty chain model behind that behavior.

The practical rule stays narrow: the editor decides which chain needs replay, and the backend rebuilds that chain from stored data. The target node only looks like the whole story.

## Branches can die silently

The canvas does not show a special state for a branch that receives no items. The engine simply stops enqueueing downstream work when the input stays empty. `incomingConnectionIsEmpty()` checks whether a connection has any data, and `addNodeToBeExecuted()` skips the downstream node when the output array is empty. The branch ends because no data arrives, not because the canvas raises a separate skipped marker.

That silence often looks like a missing wire event from the outside. In reality, the runtime just has nothing to pass forward.

## The canvas does not run anything

The editor does not compute node status, item counts, or errors on its own. `pushConnection.store.ts` receives websocket or event source messages and dispatches them to handlers, and `useRunWorkflow.ts` turns the returned execution data into local editor state. When the editor needs a finished execution, `workflows.store.ts` loads the stored execution record and the UI replays that data back onto the canvas.

What appears on the canvas comes from `resultData` and execution data, not from a second computation path in the editor.

## Summary

| Mismatch | Rule of thumb |
| --- | --- |
| Wires imply order, position decides it | Read branch order from the engine stack and the sorted start-node payload, not from wire layout alone. |
| One box, many runs | Treat `runData[nodeName]` as a run history, one array entry per run. |
| One run, many items — usually | Expect item arrays, but remember `executeOnce` and node run-once modes can narrow them. |
| The loop that isn’t | Treat `SplitInBatches` as stateful handoff across runs, not as a language loop. |
| Disabled is not deleted | Expect full runs to pass data through and partial runs to strip disabled nodes. |
| Pinned nodes never run | Treat pins as editor replay data, not as production input. |
| “Execute this node” is not “execute one node” | Expect the editor and backend to rebuild the dirty chain and reuse stored run data. |
| Branches can die silently | A branch ends when it receives no items; the canvas does not invent a special skipped state. |
| The canvas does not run anything | Treat the editor as a renderer for server execution data, not as the executor. |

## Where to look in the code

- `packages/core/src/execution-engine/workflow-execute.ts` — full and partial execution, disabled node passthrough, item shaping, and run data bookkeeping.
- `packages/core/src/execution-engine/partial-execution-utils/filter-disabled-nodes.ts`, `find-start-nodes.ts`, `recreate-node-execution-stack.ts`, `run-data-utils.ts` — partial-run graph cleanup, start-node discovery, stack rebuilding, and execution index tracking.
- `packages/frontend/editor-ui/src/app/composables/useRunWorkflow.ts` — editor-side payload assembly, start-node sorting, and local execution playback.
- `packages/frontend/editor-ui/src/app/stores/workflows.store.ts` — run requests and stored execution fetches.
- `packages/frontend/editor-ui/src/app/stores/pushConnection.store.ts` — push-message transport for execution updates.
- `packages/core/src/execution-engine/partial-execution-utils/directed-graph.ts` — graph rewiring used by partial execution.