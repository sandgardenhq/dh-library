---
title: Telemetry Logging and Usage
url: "strix/telemetry-logging-and-usage"
description: "What Strix records about a run: analytics, per-scan logs, and the LLM usage/cost ledger."
---

Strix does not emit distributed tracing spans in this snapshot because `strix/config/models.py` calls `set_tracing_disabled(True)` and `ReportState` in `strix/report/state.py` does not consume SDK tracing processors. Instead, observability stays tied to three Strix-owned mechanisms: anonymous product analytics, per-scan structured logging, and the durable LLM usage ledger.

## Product analytics (anonymous).

Strix sends anonymous product analytics to PostHog and Scarf. Each process gets its own `SESSION_ID`, and the payloads also carry coarse system properties: `os`, `arch`, `python`, and `strix_version`. The analytics layer records product-usage events such as `scan_started`, `finding_reported`, `skill_loaded`, `scan_ended`, and `error`, so the data reflects feature use rather than scan internals.

Telemetry stays transparent and optional. `strix/telemetry/README.md` documents the policy, and `STRIX_TELEMETRY=0` disables the analytics path completely. Strix does not collect identifying information, targets, vulnerability details, or raw LLM prompts and responses.

- Identifying information never enters the analytics payloads.
- Targets never leave the scan record.
- Vulnerability details never flow into telemetry events.
- Raw LLM prompts and responses never leave the run artifacts.

## Per-scan structured logging (the real run trace).

The run trace lives in `strix.log` inside the scan directory. `strix/telemetry/logging.py` attaches a context filter that stamps each record with `scan_id` and `agent_id`, and it wires that handler to the `strix` and `openai.agents` logger trees. The result reconstructs a run turn by turn, without pretending to be a distributed tracer.

`STRIX_DEBUG` only raises stderr verbosity. It makes the stream handler noisier, but it does not change the file log, which always receives the full structured record stream.

Run data lives under `strix_runs/<run_name>/`. The run record sits in `run.json`, `strix.log` captures the run transcript, and `.state/` holds the coordinator snapshot in `agents.json` plus the per-agent SDK session database in `agents.db`. `--resume` reads that state back and continues the same agent tree; `./02-the-graph-of-agents.md` covers that tree and resume model in more detail.

## The LLM usage and cost ledger.

`LLMUsageLedger` turns raw SDK usage objects into a durable scan ledger. `strix/core/hooks.py` records usage after each model response, rolls token counts up per agent, and keeps a best-effort cost total alongside those counts. It also accepts observed provider cost when the SDK or provider reports it directly, which lets the persisted total track real spend as closely as the provider data allows.

Budget enforcement uses the same ledger. When the accumulated cost reaches the configured cap, `ReportUsageHooks` raises `BudgetExceededError` and the scan stops cleanly. Because `ReportState` hydrates the ledger from persisted run data, a resumed run starts from the totals already on disk. Reported cost and estimated cost can differ by provider, so the ledger treats cost as an accountable total rather than a perfect invoice.

The saved run state and the final report both surface those totals. That keeps cost accounting visible after the process exits and lets the final artifacts reflect what the run actually consumed.

As of this snapshot, the configuration docs still describe `TRACELOOP_BASE_URL`, `TRACELOOP_API_KEY`, `TRACELOOP_HEADERS`, and a local-plus-remote `events.jsonl` export path on the [configuration page](https://docs.strix.ai/advanced/configuration). The current source tree does not implement remote span export.

## Where to look in the code

- `strix/config/models.py` disables SDK tracing with `set_tracing_disabled(True)`.
- `strix/report/state.py` keeps the durable run record, the usage ledger, and the final report state.
- `strix/telemetry/README.md`, `strix/telemetry/_common.py`, `strix/telemetry/posthog.py`, and `strix/telemetry/scarf.py` define the anonymous analytics policy and payloads.
- `strix/telemetry/logging.py` owns `strix.log`, the `scan_id` and `agent_id` stamps, and `STRIX_DEBUG`.
- `strix/report/usage.py` and `strix/core/hooks.py` maintain the usage ledger and enforce the budget cap.
- `strix/core/paths.py`, `strix/core/agents.py`, `strix/core/sessions.py`, `strix/core/runner.py`, and `strix/report/writer.py` own the run directory, resume state, and final artifacts.