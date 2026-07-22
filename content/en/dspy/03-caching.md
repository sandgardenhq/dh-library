---
title: Caching
url: "dspy/caching"
description: "DSPy's cache: what forms the key, why outputs repeat, and when stability is a feature or a trap."
---

Caching sits between request construction and provider execution. It makes repeated calls return the same answer without contacting the model again, which helps reproducibility and resumable runs. It also creates the main footgun in DSPy: repeated prompts can replay the same answer, so evaluation runs can look cheaper, faster, and more stable than they really are when many calls land on the same cache entry.

For the broader call path, see [Anatomy of a Call](01-anatomy-of-a-call.md), [The LM Layer](02-the-lm-layer.md), [Production](08-production.md), and [About this site](09-about-this-site.md). For setup recipes, see the [cache tutorial](docs/tutorials/cache/index.md).

## A shared mental model

DSPy treats caching as a request-level decision, not a model-level mystery. `LM.forward` and `LM.aforward` build a request, hand it to the LiteLLM completion functions, and `LM._get_cached_completion_fn` wraps those completion functions in `request_cache`. That means the cache check happens before the provider call. If the request matches a stored entry, DSPy returns the cached response and never spends another token.

The cache itself lives in `dspy/clients/cache.py` as a two-tier store:

- `LRUCache` keeps hot entries in memory for the current process.
- `FanoutCache` keeps entries on disk so future processes can reuse them.

The in-memory tier disappears when the process exits. The disk tier survives restarts and supports reuse across runs. `dspy.clients.__init__._get_dspy_cache` points the cache at `DSPY_CACHEDIR` or `~/.dspy_cache` by default, and it falls back to a memory-only cache when disk initialization fails. When both tiers are disabled, DSPy skips caching entirely and calls the provider every time.

## What makes two requests the same

DSPy does not cache by prompt text alone. It transforms the request dictionary, serializes it with sorted JSON keys, and hashes the result with SHA-256. The request shape therefore matters: model choice, messages, and generation kwargs all contribute to the cache key. The request cache wrapper in `dspy/clients/lm.py` deliberately ignores credentials such as `api_key`, `api_base`, and `base_url`, because those values change transport details rather than model behavior.

```python
params = {k: _transform_value(v) for k, v in request.items() if k not in ignored_args_for_cache_key}
return sha256(orjson.dumps(params, option=orjson.OPT_SORT_KEYS)).hexdigest()
```

This design explains a common surprise. A change only matters when it reaches the hashed request. If two calls differ only in a value that DSPy strips before hashing, the cache treats them as the same call. If two calls differ in model, prompt, messages, or generation settings, the cache stores them separately.

`rollout_id` works in the opposite direction. DSPy keeps it in the request that feeds the cache key, but `LM.forward`, `LM.aforward`, and the LiteLLM completion wrappers strip it before the provider call. That makes `rollout_id` a deliberate cache-busting knob. It lets one run create a separate cache lane from another run, even when the underlying prompt stays the same. That behavior matters most when temperature is above zero and repeated calls can still diverge.

## Hits and misses

A cache hit returns a deep copied response from the cache and marks it with `cache_hit = True`. `Cache._prepare_cached_response` also clears `usage`, because the provider never ran. That detail drives the user-facing symptom: cached answers can look free.

A cache miss follows the normal path. DSPy calls the provider, receives a fresh response, and then stores that response for later reuse. In the legacy bridge, `BaseLM._legacy_forward_as_lm_response` and `BaseLM._process_lm_response` show the difference clearly. The bridge checks `response.cache_hit` before it records usage, so cache hits skip usage accounting. Misses keep their usage data and flow through the usual history recording path.

That split matters during evaluation. Stable outputs help with reproducibility and resumable runs, but they can also hide real variation. A benchmark can appear suspiciously consistent when every trial lands on the same cache entry. That consistency may reflect caching, not model quality. The safest mental model treats cache hits as replayed responses, not new experiments.

## Using the cache intentionally

DSPy gives three broad ways to shape caching behavior without treating it like a low-level storage concern.

First, `dspy.configure_cache` swaps the shared cache object. That changes the default cache policy for the whole process, including whether DSPy uses disk storage, memory storage, both, or neither. Second, each `LM` instance carries its own default `cache` flag. Third, a single call can override cache behavior or rollout identity through the request configuration, and `BaseLM._legacy_forward_kwargs` carries those choices into the legacy provider call path.

Call `Cache.reset_memory_cache()` to clear the in-memory tier. Because the disk tier stores entries in a directory, start over on disk by pointing `dspy.configure_cache` at a fresh `disk_cache_dir` or by replacing the configured cache directory. Disable both tiers in `configure_cache` for the strongest opt-out. Set `cache=False` on a single request to bypass caching for that call.

Those controls solve different problems. Global configuration sets the house rule. The instance default lets one model behave differently from another. A per-call override lets one experiment or one replay opt out without changing the surrounding program. In practice, that makes caching useful for both reproducible runs and controlled variation. It also makes caching dangerous when a benchmark changes only in places that never enter the hashed request.

## Concurrency and async use

DSPy protects the in-memory tier with a `threading.RLock`, so concurrent access does not corrupt the local `LRUCache`. It uses a sharded `FanoutCache` backend on disk, which spreads disk work across multiple shards instead of forcing all traffic through one file. The async decorator path in `request_cache` uses the same `dspy.cache` object as the sync path, so sync and async calls share the same cache state.

That shared state is useful, but it also strengthens the footgun warning. A single cached entry can affect many different execution paths: sync calls, async calls, repeated notebooks, and resumed jobs all see the same stored response if they build the same request.

## Where to look in the code

- `dspy/clients/cache.py` — cache tiers, key hashing, hit handling, `cache_hit`, and memory and disk persistence.
- `dspy/clients/lm.py` — request construction, `request_cache` wrapping, `rollout_id` stripping, and per-call cache behavior.
- `dspy/clients/base_lm.py` — typed and legacy response bridging, usage tracking, and history recording on hits and misses.
- `dspy/clients/__init__.py` — global cache setup, default cache location, and memory-only fallback.
- `tests/clients/test_cache.py` — examples of two-tier behavior, request hashing, async behavior, and cache disabling edge cases.