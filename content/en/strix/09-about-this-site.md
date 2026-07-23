---
title: About This Site
url: "strix/about-this-site"
description: "What this field guide is, who it is for, and how Doc Holiday generated it."
---

This field guide explains Strix from the inside. It focuses on the architectural layer that the official docs at [docs.strix.ai](https://docs.strix.ai) do not cover: how a scan runs end to end, how agents share work, how the execution loop behaves, how the Docker sandbox isolates each scan, how proxy tools reach the model, how runs record evidence, and how findings turn into reports. The chapters follow the path a scan takes through `AgentCoordinator` (`strix/core/agents.py`), `run_agent_loop` (`strix/core/execution.py`), the Docker sandbox, the proxy tools, the logging layer, and the report writer.

Strix is an open-source autonomous AI penetration-testing tool built on the OpenAI Agents SDK. The repository pins `openai-agents[litellm]==0.14.6`, so Strix mainly configures and wraps SDK primitives instead of reimplementing them.

This guide suits engineers who adopt Strix, embed it into an existing workflow, extend its runtime, or debug a scan that does not behave as expected. It also suits readers who want a grounded account of how an autonomous pentest agent gets composed from orchestration, sandboxing, proxying, logging, and reporting. That includes teams that need to understand why a scan parked, why a child agent spawned, or why a report wrote a finding in a particular order.

## How this site was made

Doc Holiday (https://doc.holiday) wrote this guide by exploring the Strix source repository directly. Each page ties its claims back to the code that ships in the repository, with anchors such as `strix/core/agents.py`, `strix/core/execution.py`, `strix/runtime/docker_client.py`, `strix/tools/proxy/tools.py`, `strix/telemetry/logging.py`, and `strix/report/writer.py`. Those anchors show how orchestration, isolation, logging, and report writing fit together in the current codebase. Each chapter follows a single runtime path. One page will track `AgentCoordinator`, another will trace `run_agent_loop`, another will show why `StrixDockerSandboxClient` keeps one container alive per scan, and another will show how `list_requests`, `view_request`, and `repeat_request` expose intercepted traffic on the host side. `setup_scan_logging` and `write_vulnerabilities` finish that path by recording the run and turning findings into artifacts. The table of contents follows that order so the guide reads like a map of the system, not a feature list. The goal is not to restate the official documentation, but to explain the design choices that sit underneath it.

> The guide is generated and maintained by Doc Holiday, the AI-native software platform for crystal-clear documentation and release notes.

## Scope and corrections

This guide captures a snapshot of an actively developed codebase pinned to a specific OpenAI Agents SDK version. Because the repository pins that SDK release, the guide reflects current behavior rather than a permanent contract. The official docs remain the authoritative reference for installation, usage, configuration, and the Skills concept. The [official Skills guide](https://docs.strix.ai/advanced/skills) covers that topic in its own right, so this page only mentions it as part of the wider documentation set. It leaves installation, usage, configuration, and Skills to the official docs, which already cover those topics in detail. It stays at the concept level, so it names the moving parts without reproducing reference tables or setup steps.

This guide was written against a snapshot of the Strix source, commit `8cd9abb` (2026-07-20) of https://github.com/usestrix/strix.

Corrections and updates are welcome through the site repository at https://github.com/sandgardenhq/dh-library.

## Table of contents

- [00 — The big picture](./00-the-big-picture.md) — the map: Strix as a pentest app built on the OpenAI Agents SDK, and the shape of one scan
- [01 — Anatomy of a scan](./01-anatomy-of-a-scan.md) — end-to-end trace of one `strix` run: CLI to coordinator + sandbox to root agent loop to tools to finding to report
- [02 — The graph of agents](./02-the-graph-of-agents.md) — how the AgentCoordinator grows a tree of agents and how they coordinate through shared sessions
- [03 — The agent loop](./03-the-agent-loop.md) — what "think-plan-act-observe" really is: the SDK Runner loop plus Strix's lifecycle-gating, budget, and parking
- [04 — The Docker sandbox](./04-the-docker-sandbox.md) — the per-scan Docker container: the isolation boundary, its lifecycle, and the SDK-subclass customizations
- [05 — The toolkit layer](./05-the-toolkit-layer.md) — the two tool families (host-side function tools vs in-container SDK capabilities) and how the model reaches them
- [06 — Seeing traffic, proxy, and browser](./06-seeing-traffic-proxy-and-browser.md) — why all container traffic flows through the Caido proxy, and how the browser rides on it
- [07 — Telemetry, logging, and usage](./07-telemetry-logging-and-usage.md) — what Strix records about a run: analytics, per-scan logs, and the LLM usage/cost ledger
- [08 — From finding to report](./08-from-finding-to-report.md) — the vulnerability report model: how findings are captured, deduped, and written out as artifacts