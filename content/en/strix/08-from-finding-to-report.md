---
title: From Finding to Report
url: "strix/from-finding-to-report"
description: "The vulnerability report model: how findings are captured, deduped, and written out as artifacts."
---

This page explains how Strix turns a discovered vulnerability into a validated finding and then into the report artifacts that leave a scan run. The reporting layer sits on top of the OpenAI Agents SDK: the SDK runs the agent loop, while Strix owns the reporting glue around tools, shared state, deduplication, and writers.

## Related pages

- [The big picture](./00-the-big-picture.md)
- [Anatomy of a scan](./01-anatomy-of-a-scan.md)
- [The graph of agents](./02-the-graph-of-agents.md)
- [The agent loop](./03-the-agent-loop.md)
- [The Docker sandbox](./04-the-docker-sandbox.md)
- [The toolkit layer](./05-the-toolkit-layer.md)
- [Seeing traffic: proxy and browser](./06-seeing-traffic-proxy-and-browser.md)
- [Telemetry, logging, and usage](./07-telemetry-logging-and-usage.md)
- [About this site](./09-about-this-site.md)

## `ReportState` as the live hub

`ReportState` in `strix/report/state.py` keeps the scan's vulnerability reports, final scan result, usage ledger, and `vulnerability_found_callback` in memory. `set_global_report_state` and `get_global_report_state` make that object process-global, so any agent can write into the same run state and the interface layer can surface the report immediately through that callback.

That design trades strict isolation for shared visibility. One scan behaves like one shared ledger rather than several per-agent records, which lets the CLI and TUI show a finding as soon as `add_vulnerability_report` records it. The same state object also tracks usage through `LLMUsageLedger`, so the report records both what Strix found and what the scan cost to produce.

## Capture

`strix/tools/reporting/tool.py` exposes host-side function tools that accept structured output from the agent instead of parsing free-form logs. `create_vulnerability_report` records concrete findings that include a working proof of concept, evidence, and code locations. `create_dependency_report` records known-CVE dependency findings from a verified advisory and the affected installed version.

This split keeps the reporting model honest. Dynamic findings belong in `create_vulnerability_report` when the agent can reproduce the issue against the live target. Dependency findings belong in `create_dependency_report` when the code only needs a verified advisory and package version to establish the risk.

## Validation

Strix favors findings that the agent exercised against the live target. `strix/runtime/docker_client.py` keeps each scan isolated inside the sandbox, but it still lets the agent run real commands. `strix/runtime/caido_bootstrap.py` attaches Caido to that container so the requests flow through the proxy path that the scan observes.

That flow gives the reporting layer a concrete target path instead of a static pattern match. The code supports reproduction, not certainty: a finding gains credibility because the agent exercised it, but the system still depends on model judgment, target behavior, and the quality of the proof.

## Deduplication

`strix/report/dedupe.py` keeps the same issue from counting twice. For dependency findings, it short-circuits on package identity first: the same CVE, package, and ecosystem resolve as the same finding. For other findings, `check_duplicate` compares the candidate against the existing report set with an LLM judge, and as of this snapshot that call disables SDK tracing with `ModelTracing.DISABLED`.

The trade-off is deliberate. Deterministic package identity gives dependency CVEs a fast and stable answer, while the LLM path catches broader overlap for dynamic findings where the root cause and exploit shape matter more than a single field match. The code still avoids a false sense of precision: it reduces duplicate reports, but it does not promise perfect judgment.

## Finalization

When the scan finishes, `ReportState._save_artifacts` writes the executive report, vulnerability markdown files, `vulnerabilities.csv`, `vulnerabilities.json`, the SARIF document, and `run.json` under `strix_runs/<run>/`. `strix/report/writer.py` owns the markdown and JSON artifacts, and `strix/report/sarif.py` turns the same findings into SARIF 2.1.0 with repository provenance when Strix can derive it.

`ReportState` wraps SARIF emission in its own `try` and `except`, so a SARIF problem does not stop the rest of the output pipeline. That separation keeps the run record, markdown reports, and CSV index intact even if the SARIF writer fails. Each finding also feeds `posthog.finding` and `scarf.finding`, carrying severity and CWE metadata into the anonymous analytics hooks in `strix/telemetry/posthog.py` and `strix/telemetry/scarf.py`.

## How it fits the rest of Strix

This page closes the loop from agent work to consumable output. The agent tree in `strix/core/execution.py` discovers the issue, the reporting tools record the structured finding, the sandbox and proxy exercise it against the target, `ReportState` keeps `vulnerability_found_callback` open and tracks usage, and the writers finalize the artifacts that a user or CI system consumes.

The live presentation layer sits on top of that state. `strix/interface/cli.py` hydrates `ReportState` and prints live summaries, while `strix/interface/tui/app.py` and `strix/interface/tui/renderers/reporting_renderer.py` render new findings as they arrive.

## Consumption references

For output consumption and delivery context, see the official CLI docs and CI/CD integration docs:

- [CLI usage](https://docs.strix.ai/usage/cli)
- [CI/CD integrations](https://docs.strix.ai/integrations/ci-cd)

## Where to look in the code

- `strix/report/state.py` — `ReportState`, `set_global_report_state`, `get_global_report_state`, `add_vulnerability_report`, `_save_artifacts`
- `strix/tools/reporting/tool.py` — `create_vulnerability_report`, `create_dependency_report`, `_do_create`, `_do_create_dependency`
- `strix/report/dedupe.py` — `check_duplicate`, `_check_dependency_duplicate`, `_dependency_identity`, the `ModelTracing.DISABLED` call
- `strix/report/writer.py` — `write_executive_report`, `write_vulnerabilities`, `render_vulnerability_md`
- `strix/report/sarif.py` — `write_sarif_report`, `build_sarif_report`, `write_sarif`, `build_sarif_document`
- `strix/interface/cli.py`, `strix/interface/tui/app.py`, `strix/interface/tui/renderers/reporting_renderer.py` — state hydration, live callbacks, and report display