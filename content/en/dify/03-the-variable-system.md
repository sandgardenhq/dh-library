---
title: The Variable System
url: "dify/the-variable-system"
description: "The VariablePool: typed segments, selectors, and how data moves between nodes."
---

Dify's variable system is the shared data plane that lets a workflow move information between isolated nodes. A node never calls another node directly; it writes typed values into a `VariablePool`, and later nodes read those values back by selector. For user-level terminology, Dify's public docs still point people to [key concepts](https://docs.dify.ai/en/learn/key-concepts), but that page does not explain the machinery behind the pool itself.

This is the part of the runtime that turns a concurrent graph into something composable. The graph engine can schedule nodes in parallel, replay state, and resume execution later because values are not passed ad hoc through call stacks; they are stored in a structured pool that survives between producers and consumers.

## The mental model

Think of `VariablePool` as a selector-keyed map. The first two selector parts identify the owner and the variable name, so the basic shape is `node_id + variable_name`; `graphon/variables/consts.py` makes that two-part rule explicit with `SELECTORS_LENGTH = 2`. The pool stores a normalized `Variable` object for each selector, and downstream code asks for a selector instead of asking a producer node for a return value.

That matters because the workflow engine is concurrent. The pool gives the engine a shared, structured space where one node can produce a value once and any number of later nodes can consume it without coupling those nodes to each other. The design is easier to reason about than a mesh of direct calls, and it is also the reason the engine can treat iteration bodies, pauses, and resumes as stateful graph execution rather than as nested function calls. The broader execution model lives in [02-inside-the-graph-engine.md](./02-inside-the-graph-engine.md).

## Why typed segments exist

Graphon does not store raw JSON blobs in the pool. It stores typed `Segment` values, and the `SegmentType` taxonomy in `graphon/variables/types.py` defines the runtime shape: scalars such as `STRING`, `INTEGER`, `FLOAT`, `BOOLEAN`, `NONE`, `SECRET`, structured values such as `OBJECT`, arrays such as `ARRAY_STRING`, `ARRAY_NUMBER`, `ARRAY_OBJECT`, `ARRAY_FILE`, `ARRAY_BOOLEAN`, and the composite `GROUP` form used when templates are rendered from multiple pieces. The `factory.py` helpers convert plain Python values into the matching segment classes and then back into `Variable` wrappers for storage.

That typed layer exists for three reasons. First, it lets the runtime validate values instead of trusting arbitrary JSON. Second, it lets the UI and the renderer choose the right representation for a value; for example, `Segment.text`, `Segment.log`, and `Segment.markdown` do not all mean the same thing. Third, it keeps templating safe enough to be predictable: a file value, an object, and a string can all flow through the same machinery, but they preserve their type boundaries instead of collapsing into undifferentiated text.

`SegmentGroup` is the bridge between those typed values and template strings. It concatenates child segments, which is why template rendering can preserve typed pieces without losing their original meaning.

## Where variables come from

Dify seeds the pool at workflow start. `api/core/workflow/system_variables.py` builds the system namespace and the other bootstrap namespaces, and `api/core/workflow/variable_pool_initializer.py` inserts runtime inputs into the pool under the correct selectors. The important namespaces are `sys`, `env`, `conversation`, and `rag`; those are Dify-owned conventions, not graphon concerns.

The startup populations are straightforward but important: user inputs, system variables, environment variables, conversation variables in chat-style flows, and RAG pipeline inputs. `build_bootstrap_variables()` normalizes the fixed namespaces into selector-shaped variables, while `add_node_inputs_to_pool()` stores node inputs under the node id that owns them. Dify, not graphon, decides which values are present at the beginning of a run and how they are named.

`system_variables.py` also shows how the runtime reaches back into the pool later. Helpers such as `get_system_text()` and `get_all_system_variables()` read from the same selector structure that was seeded at startup, so the system namespace stays consistent from the moment the run begins until later layers need to inspect it.

## How nodes read and write

When a node finishes, its outputs land back in the pool under that node's selector. Downstream nodes reference those values with the `{{#node.variable#}}` syntax the product exposes, and graphon resolves those references by parsing template strings into selectors. `graphon/variables/template_resolution.py` turns template text into a `SegmentGroup` by looking up selectors in the pool, while the older `graphon/nodes/base/variable_template_parser.py` shows the historical `{{#...#}}` form and how selector extraction works.

`graphon/template_rendering.py` is intentionally thin: it defines the renderer contract, not the variable system itself. The typed-segment resolution happens a step earlier, in `template_resolution.py`, which looks up each selector and joins the resulting segments — so templating can render text, logs, markdown, or file links without guessing what a value means before the renderer contract receives the final strings.

`GraphRuntimeState` is the wrapper that carries the pool through the rest of execution. In `graphon/runtime/graph_runtime_state.py`, the state object owns the `VariablePool`, execution timing, LLM usage, outputs, pause/resume bookkeeping, and snapshot serialization. It is the object that makes the pool part of a larger execution state instead of a standalone dictionary.

That wrapper is also what makes child runs possible. Iteration and loop bodies get their own derived runtime state, which is why the loop story belongs in [04-parallel-iteration-and-loops.md](./04-parallel-iteration-and-loops.md) instead of here: the variable pool is shared in concept, but each child engine still gets a fresh state boundary for its own run.

## Persistence at the edges

Most variable writes are runtime-local, but conversation-scoped values are different. `api/core/app/layers/conversation_variable_persist_layer.py` listens for `NodeRunVariableUpdatedEvent`, checks that the selector belongs to the `conversation` namespace, reads the conversation id from the system-variable pool, and then writes the updated variable back through `ConversationVariableUpdater`. In other words, the persistence layer does not mirror every pool write; it only persists the conversation-scoped values that should survive beyond the current run.

That edge is separate from full run-state survival. `GraphRuntimeState` can serialize the whole execution picture so a paused workflow can resume later, but the conversation-variable layer is narrower: it persists only the values that are meant to outlive a single execution while the run itself may still end or fail. The pause/resume boundary is covered in [05-pause-resume-and-run-state.md](./05-pause-resume-and-run-state.md).

## Files as variables

Files are first-class values in the same pool. `graphon/file/models.py` defines the graph-owned `File` model, and `graphon/variables/segments.py` wraps it in `FileSegment`. That matters because multimodal workflows need files to participate in the same selector system as strings, numbers, objects, and arrays. The file model keeps enough metadata to render a human-readable link or markdown image, so a file can flow through templating and logging without being shunted onto a side channel.

## Where to look in the code

- **graphon/src/graphon/runtime/variable_pool.py** — selector-keyed storage, nested lookup, flattening, and bootstrap ingestion.
- **graphon/src/graphon/variables/types.py** and **graphon/src/graphon/variables/segments.py** — the `SegmentType` taxonomy, typed values, and segment rendering behavior.
- **graphon/src/graphon/variables/factory.py** and **graphon/src/graphon/variables/template_resolution.py** — conversion between Python values, typed segments, and resolved template content.
- **graphon/src/graphon/runtime/graph_runtime_state.py** — the runtime wrapper that carries the pool, execution context, and snapshot state.
- **dify/api/core/workflow/system_variables.py** and **dify/api/core/workflow/variable_pool_initializer.py** — Dify's startup namespaces and pool seeding path.
- **dify/api/core/app/layers/conversation_variable_persist_layer.py** and **graphon/src/graphon/file/models.py** — the conversation-variable write-back boundary and file metadata as a renderable runtime value.