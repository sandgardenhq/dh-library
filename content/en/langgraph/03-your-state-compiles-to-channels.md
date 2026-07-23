---
title: Your State Compiles to Channels
url: "langgraph/your-state-compiles-to-channels"
description: "How a state schema becomes channel objects: reducers, the channel zoo, and when each errors."
---

`StateGraph` does not keep state as a single mutable map. It lowers each schema key into a channel object with its own update rule, persistence shape, and trigger behavior. That bridge matters more than the surface syntax on the page, because the channel decides what happens when multiple nodes write, how values survive checkpoints, and when downstream nodes wake up. For the official references on reducer semantics, channel types, and update errors, see [graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api), [pregel](https://docs.langchain.com/oss/python/langgraph/pregel), [INVALID_CONCURRENT_GRAPH_UPDATE](https://docs.langchain.com/oss/python/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE), and [INVALID_GRAPH_NODE_RETURN_VALUE](https://docs.langchain.com/oss/python/langgraph/errors/INVALID_GRAPH_NODE_RETURN_VALUE).

The useful mental model is operational: a node returns a batch of writes, the engine routes each write to a channel, and the channel decides how to absorb that batch. A plain key becomes `LastValue`, a reducer key becomes `BinaryOperatorAggregate`, and an explicit channel instance stays the channel that the graph uses. `ManagedValue` comes from the runtime scratchpad, so the schema can name a runtime-supplied value without storing it in checkpointed state.

```python
class State(TypedDict):
    messages: Annotated[list, add_messages]
```

That line compiles the `messages` key to `BinaryOperatorAggregate`. `add_messages` is an ordinary two-argument reducer in `libs/langgraph/langgraph/graph/message.py`.

## How compilation resolves a field

`StateGraph` reads the schema with `get_type_hints(..., include_extras=True)` in `libs/langgraph/langgraph/graph/state.py` and walks each field through `_get_channels`. `_get_channel` resolves a field in a fixed order: managed value first, explicit channel instance or channel class in `Annotated` metadata next, then a callable reducer when the last `Annotated` item accepts two positional arguments, and `LastValue` as the fallback. A callable with the wrong arity raises `Invalid reducer signature. Expected (a, b) -> c`. When a node returns something that is not a valid update shape, the runtime points to `errors/INVALID_GRAPH_NODE_RETURN_VALUE`. The order matters because the same annotation can mean a runtime channel, a reducer key, or a plain value depending on the metadata.

Compilation also materializes the input side as `START: EphemeralValue(self.input_schema)`, then uses ephemeral and barrier channels to wire control-flow for branches and joins. The schema line only describes intent; compilation turns that intent into channel objects with concrete runtime behavior.

## Channel behavior is the point

### `LastValue`

Plain annotations use `LastValue` by default. It stores one value and rejects a second write in the same step. When parallel branches write the same plain key, the graph raises `INVALID_CONCURRENT_GRAPH_UPDATE`, which is the signal that the schema asked for single-writer behavior.

### `BinaryOperatorAggregate`

`BinaryOperatorAggregate` folds each step’s writes with the reducer. `apply_writes` sorts tasks by `task_path_str(t.path[:3])` before grouping writes, so the fold order stays deterministic even when tasks arrive from different paths. That determinism does not remove order sensitivity, so fan-in reducers should stay associative and commutative when graph behavior should not depend on write order.

### `Topic`

`Topic` behaves like a pub-sub list channel. Multiple writers can append to it, and the `accumulate` flag decides whether it keeps prior values across steps or resets the list each step. That makes it useful when the graph needs a stream of events rather than a single latest value.

### `EphemeralValue`

`EphemeralValue` carries a one-step signal and clears after use. The engine also uses ephemeral channels for control-flow signals, including the `START` input channel and branch triggers. See `./04-control-flow-is-channels-too.md` for how that wiring shapes branch execution.

### `NamedBarrierValue`

`NamedBarrierValue` acts as the fan-in primitive for joins. It stays unreadable until all named writers report in, which lets a join wait for a specific set of upstream branches before it releases the next node. See `./04-control-flow-is-channels-too.md` for the join edges built on this channel.

### `DeltaChannel`

As of mid 2026, `DeltaChannel` remains beta, uses a batch-shaped reducer signature, and its on-disk format is not stable yet.

## Channels and persistence

Each channel snapshots itself with `checkpoint()` and rebuilds itself with `from_checkpoint()`. Persisted graph state therefore consists of channel snapshots plus the version bookkeeping that tracks which channel writes each node has already consumed. The next page, `./05-why-checkpoints-look-like-that.md`, covers the checkpoint format. This page only needs one rule: channel state survives because the channel object can round trip through `checkpoint()` and `from_checkpoint()`, not because LangGraph serializes a raw state dict.

## Channels and triggering

Channel versions drive scheduling. When `apply_writes` updates a channel, it bumps that channel’s version. Version comparison then wakes subscribed nodes, so channel choice changes run order as well as stored value. See `./02-what-runs-next.md` for the scheduling side of that mechanism.

## Decision table

| Schema pattern | Channel | Semantics | Typical use |
| --- | --- | --- | --- |
| Bare annotation | `LastValue` | Stores one value and rejects concurrent writes in the same step | Single-writer state |
| `Annotated[T, reducer]` | `BinaryOperatorAggregate` | Folds all writes with the reducer | Accumulation, fan-in |
| Explicit channel instance | The instance itself | Uses the channel object exactly as declared | Custom runtime behavior |
| `Annotated[T, ChannelClass]` | `ChannelClass(T)` | Uses the declared channel class with the field type | Direct channel selection |
| Managed value marker | `ManagedValue` | Reads runtime data from the scratchpad, not the checkpoint | Ephemeral runtime context |

## Where to look in the code

- `libs/langgraph/langgraph/graph/state.py` — schema parsing, channel lowering, and compile-time channel wiring.
- `libs/langgraph/langgraph/pregel/_algo.py` — write grouping, channel version updates, and downstream triggering.
- `libs/langgraph/langgraph/channels/base.py` — the checkpoint and restore contract shared by every channel.
- `libs/langgraph/langgraph/channels/last_value.py` — plain key behavior and the concurrent update error.
- `libs/langgraph/langgraph/channels/binop.py` — reducer backed aggregation for `Annotated[...]` fields.
- `libs/langgraph/langgraph/graph/message.py` — the `add_messages` reducer example used by message state.
