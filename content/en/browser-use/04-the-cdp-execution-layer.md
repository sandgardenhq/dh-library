---
title: The CDP Execution Layer
url: "browser-use/the-cdp-execution-layer"
description: "Raw Chrome DevTools Protocol: targets, sessions, focus recovery, and synthesized input."
---

## Overview

browser-use drives Chrome through raw Chrome DevTools Protocol by way of the first-party typed client `cdp-use`. The current runtime is CDP only: it does not run on Playwright or Selenium underneath, and `bubus` carries the browser events that keep the rest of the system in sync.

## Mental model

Think in terms of one WebSocket to Chrome and many CDP sessions inside it. The root client on `BrowserSession` speaks for the browser as a whole, and each target keeps its own `target_id`, `session_id`, and `cdp_client` record. `SessionManager` owns that registry, so the rest of the code never has to guess which handle still points at a live page, iframe, or worker.

That split matters because browser-use needs two levels of control at once. Browser level commands create targets, reconnect sockets, and recover focus. Target level commands drive DOM queries, keyboard input, mouse input, and navigation inside the active browsing context.

## Session ownership and target lifecycle

`SessionManager` in `browser_use/browser/session_manager.py` acts as the single source of truth for targets and sessions. It listens for `Target.attachedToTarget`, `Target.detachedFromTarget`, `Target.targetInfoChanged`, and `Page.lifecycleEvent`, enables target discovery and auto attach, and stores a lifecycle buffer per target so navigation can wait on the right page instead of a stale session handle. That central ownership keeps detached handles from leaking into action code, DOM code, or tab management.

The same layer also handles recovery when the active target disappears. When the focused tab detaches, `SessionManager` clears the stale focus immediately, then looks for another live page target. If a page already exists, it restores focus there; if none exists, it creates a blank tab and routes the agent there instead. That keeps the system operating even when a tab crashes or a navigation closes the current page.

`BrowserSession.get_or_create_cdp_session()` uses that owned state instead of inventing a new handle. It can wait briefly for Chrome to deliver the attach event, and it only promotes page targets into agent focus. Iframe and worker sessions remain available for work, but they never become the main tab.

## Resilience during WebSocket drops

`browser_use/browser/session.py` rebuilds the CDP connection when the socket drops. `reconnect()` stops the old client, clears `SessionManager`, creates a new `TimeoutWrappedCDPClient`, starts a fresh session manager, enables auto attach again, and rediscovers the current targets. It then restores focus from the old target when that target still exists, falls back to another live page when needed, or opens a new blank tab if the browser has no pages left. The method finishes by reattaching the WebSocket drop callback so the next failure can trigger the same recovery path.

`_auto_reconnect()` wraps that repair flow in browser events. `BrowserReconnectingEvent` and `BrowserReconnectedEvent` keep the event bus and watchdogs aligned while the connection comes back, so downloads, navigation, and DOM work resume against the new socket without special-case code.

## Turning an action into input

`DefaultActionWatchdog` in `browser_use/browser/watchdogs/default_action_watchdog.py` turns click, coordinate click, type, and scroll events into CDP input. The watchdog resolves the DOM node through `browser_session.cdp_client_for_node(node)`, which can choose the exact session by `session_id`, route through `cdp_client_for_frame()` by `frame_id`, fall back to `cdp_client_for_target()` by `target_id`, or use the current focus as a last resort. That resolution keeps the action attached to the correct browsing context even when the DOM spans nested frames.

Click handling follows a safety first path. The watchdog rejects file inputs and `select` elements, scrolls the element into view, computes geometry from the live node, chooses the visible quad, checks whether another element blocks the click point, and then dispatches synthesized mouse events through `Input.dispatchMouseEvent`. If the element still cannot accept a CDP click, the watchdog falls back to a direct click through the same CDP session. Typing follows the same pattern with `Input.dispatchKeyEvent`, and element-targeted scrolling first uses CDP mouse wheel input on the element's container before it falls back to a synthesized scroll gesture, while page-level scrolling goes directly to the synthesized gesture.

## Navigation and tabs

`NavigateToUrlEvent`, `SwitchTabEvent`, `CloseTabEvent`, `TabCreatedEvent`, and `TabClosedEvent` all flow through `BrowserSession` and its event bus. Navigation can reuse a blank tab, open a new one, or drive the current target, but every path ends with browser events that update focus and keep the rest of the system aligned. When focus changes, `BrowserSession` clears the DOM cache and browser state cache so the next snapshot reflects the new page rather than stale selector data.

That event flow matters because navigation changes both the browsing context and the action surface. A tab switch changes which target owns future CDP calls, and a close event can force the session manager to select another live page. The code keeps those transitions in one place instead of spreading tab logic across the action layer.

## Local browser launch and remote CDP

`LocalBrowserWatchdog` starts a local Chrome or Chromium process, adds a remote debugging port, waits for Chrome to expose its CDP endpoint, and returns the URL that `BrowserSession` needs for attachment. For usage anchors, see the official docs for [remote browser via `cdp_url`](https://docs.browser-use.com/open-source/customize/browser/remote), [real local Chrome](https://docs.browser-use.com/open-source/customize/browser/real-browser), and the [browser parameter reference](https://docs.browser-use.com/open-source/customize/browser/all-parameters). It also cleans up browser resources and temporary profile directories when the session stops. That makes local runs feel like a managed browser process rather than a one-off shell command.

The remote path uses the same CDP layer, but it starts from an existing browser. `BrowserSession.connect()` accepts a `cdp_url`, and when that URL points at HTTP it reads `/json/version` to recover the browser WebSocket endpoint before it creates the root `TimeoutWrappedCDPClient`. The rest of the execution layer does not care whether Chrome started locally or already existed; it only cares that the root client can speak CDP.

## The actor layer

`browser_use/actor/` keeps the imperative `Page`, `Element`, and `Mouse` surface on the same CDP machinery. `Page` attaches a session lazily per target, `Element` handles geometry, click, focus, and typing logic, and `Mouse` sends coordinate clicks and scroll gestures. The actor README still places that surface beneath `BrowserSession`, so the event-driven session remains the primary entry point and the actor API stays available for direct control.

## Execution map

```mermaid
flowchart LR
  WS[Root CDP client\nWebSocket to Chrome]
  Chrome[(Chrome)]
  SM[SessionManager\nsingle source of truth]
  PageT[Page target\n{target_id, session_id, client}]
  IframeT[OOPIF iframe target\n{target_id, session_id, client}]
  WorkerT[Worker target\n{target_id, session_id, client}]
  Action[Action event]
  Node[DOM node]
  Resolve[Session resolution\nnode → session]
  Input[Input.dispatchMouseEvent]

  WS --> Chrome
  WS --> SM
  SM --> PageT
  SM --> IframeT
  SM --> WorkerT
  Action --> Node --> Resolve --> PageT
  Resolve --> IframeT
  Resolve --> WorkerT
  Resolve --> Input
  PageT --> Input
  IframeT --> Input
  WorkerT --> Input
```

## Where to look in the code

- `browser_use/browser/session.py` — `BrowserSession`, `Target`, `CDPSession`, reconnect flow, and target session resolution.
- `browser_use/browser/session_manager.py` — target ownership, auto attach, lifecycle buffers, and focus recovery.
- `browser_use/browser/_cdp_timeout.py` — per request timeouts on the root CDP client.
- `browser_use/browser/watchdogs/default_action_watchdog.py` — click, type, scroll, occlusion checks, and input synthesis.
- `browser_use/browser/watchdogs/local_browser_watchdog.py` — local Chrome launch, CDP URL discovery, and browser cleanup.
- `browser_use/actor/page.py`, `browser_use/actor/element.py`, `browser_use/actor/mouse.py` — the imperative CDP-backed actor surface.