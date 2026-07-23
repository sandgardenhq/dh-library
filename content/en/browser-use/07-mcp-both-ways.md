---
title: MCP Both Ways
url: "browser-use/mcp-both-ways"
description: "browser-use as an MCP server for other agents and an MCP client for its own."
---

Browser-use sits on both sides of Model Context Protocol. Server mode lets an external agent connect to browser-use and treat it as a browser backend while the external model decides which MCP tool to call. Client mode lets browser-use connect outward to other MCP servers, fold those tools into its own action set, and keep the agent loop inside browser-use.

The same protocol carries opposite control planes. Server mode hands browser control outward. Client mode expands browser-use inward. That split explains why the server code sits next to the browser and session machinery and why the client code sits next to the tools and action registry. For the normal step loop, see [Anatomy of a Step](./01-anatomy-of-a-step.md). For the browser internals that server mode rides on, see [The Event Bus and Watchdogs](./02-the-event-bus-and-watchdogs.md) and [How the Agent Sees the Page](./03-how-the-agent-sees-the-page.md). For the action system that client mode extends, see [The Tools and Action Registry](./05-the-tools-and-action-registry.md).

## Server mode: browser-use as a browser backend

`BrowserUseServer` in `browser_use/mcp/server.py` turns browser-use into a service that other agent ecosystems can call. The server groups its tools into a few simple ideas: navigation, reading and state, direct interaction, and session management. That shape matters more than the individual tool names. It tells the caller that this side owns a live browser and exposes the operations that browser can perform.

`browser_use/mcp/__main__.py` keeps that story simple. It starts the server coroutine through `asyncio.run()`, so the module entrypoint adds no extra behavior. The main logic stays in `browser_use/mcp/server.py`, where `_execute_tool()` routes each request into the browser and session layer.

That routing matters because it keeps MCP server mode aligned with the rest of the browser stack. The server does not invent a separate browser model. It hands direct actions to the same machinery that already drives events, page state, and DOM reads elsewhere in the guide. The result feels like a browser backend, not like a parallel product.

One tool changes the shape of that promise: `retry_with_browser_use_agent`. It lets the server hand control back to a browser-use agent for a separate autonomous run. That tool matters, but it does not define the default path. In ordinary server mode, browser-use executes direct browser actions for the caller and does not run its own decision loop on every request.

For installation and process wiring, see the [official MCP server setup page](https://docs.browser-use.com/open-source/customize/integrations/mcp-server).

## Client mode: browser-use as an MCP consumer

`MCPClient` in `browser_use/mcp/client.py` does the reverse job. It discovers external MCP servers at runtime, reads each tool's JSON Schema, turns that schema into a Pydantic parameter model, and registers the result through `browser_use.tools.registry.service.Registry`. After that registration, the agent loop sees the new capability as part of its normal action vocabulary.

That design keeps the boundary clean. MCP tool parameters cross into browser-use as validated arguments, not as loose text. The client calls `ClientSession.call_tool()`, receives the tool response, and wraps that response as an `ActionResult`. From the model's point of view, the external MCP tool now behaves like any other built-in action. The registry makes that difference invisible, which is the point.

That is why client mode feels native after registration. Browser-use keeps ownership of the LLM, the step choice, and the overall plan. MCP only expands the action set. The model does not need a special side channel for filesystem tools, search tools, or other services that expose themselves through MCP.

## Why both directions exist

Server mode lets browser-use act as the browser backend for other agent stacks. A desktop agent or another orchestration layer can call it for navigation, input, extraction, screenshots, state reads, or session changes without carrying its own browser implementation. The external system decides what to do next; browser-use performs the browser work.

Client mode keeps browser-use extensible without forking the agent loop. A browser-use run can combine browsing with filesystem, search, or other MCP services while it still uses its own planner and step logic. That makes MCP behave like a capability layer instead of a second application architecture.

## Security and permissions

Server mode exposes real browser control to the caller. The tool surface includes direct navigation, typing, extraction, screenshots, scrolling, history navigation, tab management, and session management. That breadth keeps the server useful, but it also makes the trust boundary explicit: a remote caller can steer an actual browser session.

The server keeps one important safeguard in place around domain limits. `allowed_domains` works as an opt-in allowlist override only when the caller supplies a non-empty list. An empty list does not clear the profile defaults on purpose. The security test in `tests/ci/security/test_mcp_allowed_domains.py` records that behavior.

Client mode carries a different boundary. The client returns external tool output to the agent loop only after the registry call succeeds, and `ActionResult` carries the result that the model sees. That keeps the protocol extension inside the same decision loop as the rest of browser-use, instead of letting outside tools bypass the agent.

> Note: As of mid-2026, the MCP and CLI surface remains under active rework. This guide describes the library-level client and server that the repository currently exposes.

## Where to look in the code

- `browser_use/mcp/server.py` — `BrowserUseServer`, tool dispatch, and the direct browser action path.
- `browser_use/mcp/__main__.py` — the module entrypoint that starts the server coroutine.
- `browser_use/mcp/client.py` — runtime discovery, schema projection, and action registration.
- `tests/ci/security/test_mcp_allowed_domains.py` — the allowlist behavior that protects profile defaults.