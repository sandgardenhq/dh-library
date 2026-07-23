---
title: Items, Runs, and pairedItem
url: "n8n/items-runs-and-paireditem"
description: "The data model of a run: items, runs, and item lineage — and why pairedItem errors happen."
---

This page explains n8n's execution data model in three layers: the item, the run, and the execution object. It focuses on the mental model that ties the engine to the editor and to item lineage across a workflow.

## Level one: the item

An execution item is `INodeExecutionData`, usually shaped like `{ json, binary?, pairedItem?, metadata?, evaluationData?, ... }`. Nodes receive and return arrays of items on each input and each output, so the item is the unit of data that moves through the graph. For the public item structure and authoring rules, see [Understand n8n's data structure](https://docs.n8n.io/build/work-with-data/understand-n8ns-data-structure) and [Link data items](https://docs.n8n.io/build/work-with-data/reference-data/link-data-items).

Inside a run, the engine stores connection data in `ITaskDataConnections`. It groups item arrays first by connection type, then by input index, and then by the actual item arrays. `NodeConnectionTypes.Main` covers the main path, while the AI connection types cover the agent and tool paths.

## Level two: the run

Each node execution appends one `ITaskData` entry to `resultData.runData[nodeName]`; the array index becomes the `runIndex`. `ITaskData` records the input source, output data, timing, status, metadata, and error state for that run. `source` carries `ISourceData`, which points back to the previous node, output, and run that supplied the input.

```text
IRunExecutionData
  resultData
    runData
      [nodeName]
        [runIndex] -> ITaskData
```

`executionIndex` orders node runs across the whole execution, so it answers a different question from `runIndex`. `runIndex` tells the editor which entry in `runData[nodeName]` it is looking at; `executionIndex` tells the engine when that run happened relative to every other node run. The run picker and item count badges are projections of this array history, not separate state.

A node can accumulate multiple runs for ordinary reasons: a loop can visit it again, a join can wait for a second round of input, or a waiting execution can resume and run the node again. `WorkflowExecute` writes each finished `ITaskData` entry into `resultData.runData[nodeName]` and updates the timing, status, source, and metadata for that run.

## Level three: the execution object

`IRunExecutionData` bundles `startData`, `resultData`, and `executionData`. `startData` captures what the run requested at launch. `resultData` holds `runData`, `pinData`, `lastNodeExecuted`, and `error`. `executionData` carries the live scheduling state: `nodeExecutionStack`, `waitingExecution`, `waitingExecutionSource`, `contextData`, `runtimeData`, and the per-run metadata that the engine still has to merge back into the finished result.

`createRunExecutionData` builds the object, and `run-execution-data.ts` migrates older stored records into the current shape. As of July 2026, the persisted format carries its own `version` field, and that field stays separate from `workflow.settings.executionOrder`. The versioned files in `run-execution-data.v0.ts` and `run-execution-data.v1.ts` show the on-disk schema that the migration layer reads.

The same object carries both the result and the live machine state. That lets n8n hand an execution to a queue worker, pause it while a node waits, and resume it later with the same history intact. For the queue mode and resume model behind that flow, see [One execution, many processes](./08-one-execution-many-processes.md). For the broader execution model, see [Types of executions](https://docs.n8n.io/build/understand-workflows/understand-executions/types-of-executions).

## pairedItem lineage and failure modes

`pairedItem` records lineage, not magic. An output item points back to one input item, to one input plus one input array position, or to a list of those links, and the engine normalizes those links as items move through the workflow. For the item-linking rules and the general expression model, see [Link data items](https://docs.n8n.io/build/work-with-data/reference-data/link-data-items), [How items link through workflows](https://docs.n8n.io/build/work-with-data/reference-data/link-data-items/how-items-link-through-workflows), and [Expressions and user code](./06-expressions-and-user-code.md).

`WorkflowDataProxy` resolves those links and raises the real failure behind each broken lookup:

- **Missing lineage from upstream.** The user sees a paired-item lookup failure that says the data is unavailable. Mechanically, the upstream item never carried `pairedItem`, which often happens in custom Code output.
- **No route back to the referenced node.** The user sees a message about no path back to the node. Mechanically, the ancestry chain does not include a valid route to that node.
- **More than one upstream match exists.** The user sees a multiple-matches error. Mechanically, more than one ancestry branch resolves to different items for the same lookup.
- **Pinned data breaks manual lookup.** The user sees a prompt to unpin the node. Mechanically, pinned items short-circuit the ancestry chain that `WorkflowDataProxy` expects.
- **The upstream item number does not exist.** The user sees an invalid index error. Mechanically, the lookup asks for an item number beyond the upstream output count.
- **A node in the chain has not run yet.** The user sees a data lookup failure that points at missing intermediate execution. Mechanically, the ancestry chain passes through nodes that still lack run data.

## Canvas relationship

The editor canvas reads this execution model rather than storing a second copy. The run picker, item counts, and input and output panels all read from `runData`, so the canvas shows execution history instead of inventing separate state. For that distinction, see [The canvas is not the execution](./03-the-canvas-is-not-the-execution.md).

## Where to look in the code

- `packages/workflow/src/interfaces.ts` — item shape, connection types, run data, waiting state, and the execution vocabulary.
- `packages/workflow/src/run-execution-data/run-execution-data.ts` — persisted execution versioning and migration into the current schema.
- `packages/workflow/src/run-execution-data/run-execution-data.v0.ts` and `run-execution-data.v1.ts` — the stored execution layouts that the migration layer supports.
- `packages/workflow/src/run-execution-data-factory.ts` — the factory that builds complete or minimal execution objects.
- `packages/core/src/execution-engine/workflow-execute.ts` — the engine that creates run data, appends task results, records waiting state, and rewrites paired-item links.
- `packages/workflow/src/workflow-data-proxy.ts` — the lineage resolver that turns paired items into concrete upstream data or a user-facing error.