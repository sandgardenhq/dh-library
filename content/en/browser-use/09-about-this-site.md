---
title: About This Site
url: "browser-use/about-this-site"
description: "What this field guide is, who it is for, and how Doc Holiday generated it."
---

This field guide is a concept-level introduction to the `browser-use` codebase. It explains why the main subsystems exist, how they fit together, and how work moves through the agent, browser, DOM, tools, and model layers. It is not a quickstart. Each page stays at the concept level and points back to real package paths and symbol names so the reader can move from explanation to code without a search. It does not replace the official documentation or act as an API reference.

The guide serves engineers who adopt, embed, extend, or contribute to `browser-use` and need the mental model behind the API surface. The authoritative source for quickstarts, setup, configuration how-to pages, parameter tables, and examples remains `https://docs.browser-use.com`.

Each chapter follows one chain of responsibility. The early pages cover the agent loop, browser state, event dispatch, DOM capture, and action execution. The later pages cover model calls, the MCP boundary, and the memory stores that keep context across steps. The site uses real package paths and symbol names so each explanation stays anchored to the source tree. It does not try to cover every file.

The guide treats those transitions as the main subject. It follows how browser state becomes DOM context, how DOM context becomes tool actions, and how actions return to history and memory. That framing keeps the site focused on system relationships instead of a feature catalog.

Doc Holiday generated this site by exploring the `browser-use` repository directly. The snapshot: commit dbc4d46e0 (2026-07-14) of https://github.com/browser-use/browser-use — the state of the code every page was written against and fact-checked with. The guide reflects a fast-moving codebase, so details can change after that snapshot. Corrections are welcome via issues and pull requests at https://github.com/sandgardenhq/dh-library.

## Contents

- [00 The Big Picture](./00-the-big-picture.md) — the map of the whole library
- [01 Anatomy of a Step](./01-anatomy-of-a-step.md) — end-to-end trace of one agent step: browser state → prompt → LLM → actions → CDP → history
- [02 The Event Bus and Watchdogs](./02-the-event-bus-and-watchdogs.md) — the bubus event bus and the watchdog services that operate the browser
- [03 How the Agent Sees the Page](./03-how-the-agent-sees-the-page.md) — the DOM pipeline: CDP snapshots to the indexed element list the LLM reads
- [04 The CDP Execution Layer](./04-the-cdp-execution-layer.md) — raw CDP: targets, sessions, the SessionManager, and how actions become input events
- [05 The Tools and Action Registry](./05-the-tools-and-action-registry.md) — how actions are defined, shown to the LLM, and executed as events
- [06 The LLM Layer](./06-the-llm-layer.md) — one protocol over every provider: messages, structured output, vision, token cost
- [07 MCP Both Ways](./07-mcp-both-ways.md) — browser-use as an MCP server and as an MCP client
- [08 Agent Memory and State](./08-agent-memory-and-state.md) — what the agent remembers: the message manager, history, and the scratchpad filesystem

As of 2026-07-16, the experimental Rust backed agent under `browser_use/beta/` and the CLI and MCP rework remain active areas of change, so those pages note dates and scope carefully. Those notes keep the guide honest about in-flight work without freezing a moving design.

## Where to look in the code

- `browser_use/agent/service.py` — the agent loop, planning, memory, and step execution.
- `browser_use/browser/session_manager.py` — target and session ownership across CDP events.
- `browser_use/browser/events.py` and `browser_use/browser/watchdog_base.py` — browser action events, event timeouts, and watchdog handlers.
- `browser_use/dom/service.py` — DOM capture, accessibility data, visibility, and serialization.
- `browser_use/tools/service.py` and `browser_use/llm/base.py` — action execution and the shared chat model protocol.
- `browser_use/mcp/server.py` and `browser_use/cli.py` — the MCP server and CLI entry points.
- `browser_use/beta/service.py` — the experimental Rust backed agent path, which remains in flight as of 2026-07-16.