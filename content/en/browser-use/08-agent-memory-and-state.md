---
title: Agent Memory and State
url: "browser-use/agent-memory-and-state"
description: "The three memories: the prompt window, the history record, and the scratchpad filesystem."
---

## Three memories

This page sits with the sibling field guide pages from [00-the-big-picture.md](./00-the-big-picture.md) through [09-about-this-site.md](./09-about-this-site.md), and it narrows the view to one design choice: browser-use keeps three different stores instead of one giant transcript. The prompt window carries only the context the model needs now, the permanent record keeps the run for later inspection, and the scratchpad file system keeps file-backed work that must survive outside the prompt.

That split serves three different pressures at once. The prompt window stays within token budget, the permanent record keeps replay and debugging complete, and the scratchpad gives the agent a file-backed place for long text, extracted content, and other artifacts that do not belong in every model call. The code also uses the same idea for errors: `BrowserError` can carry `short_term_memory` for the next action and `long_term_memory` for the durable record, so immediate context and lasting context do not compete for the same slot.

## The prompt window

`browser_use/agent/message_manager/service.py` and `browser_use/agent/message_manager/views.py` show a narrow message stack, not an ever-growing chat log. `MessageHistory.get_messages()` returns the system message first, the current state message second, and any context messages after that. The system message stays fixed, the message manager rebuilds the state message for the current step, and it stores validation notes or retry guidance in context messages.

Each step starts from a fresh `BrowserStateSummary`. The message manager rebuilds the state message from the latest browser snapshot, as described in [03-how-the-agent-sees-the-page.md](./03-how-the-agent-sees-the-page.md), the current task, the run history description, and the scratchpad view instead of appending a new snapshot forever. `read_state_description` and `read_state_images` act as one-step carry-over fields: the manager clears them at the start of the next step, then fills them from the new action results.

Prompt growth comes from two places. `agent_history_items` grows with each step, and `MessageCompactionSettings` can summarize older items into `compacted_memory` before the prompt gets too large. When `max_history_items` applies, the prompt window keeps the first item, inserts an omission marker, and keeps the newest items at the end. Older entries drop out of the visible window, though the run record can still keep them until compaction trims them.

Sensitive data filtering also lives here. The message manager filters secret values before it stores the state message, and it applies the same filter to the compaction input when it prepares a summary. That keeps the prompt usable without echoing secrets back into the next model call.

## The permanent record

`browser_use/agent/views.py` defines the permanent record as `AgentHistory` and `AgentHistoryList`, and `browser_use/agent/service.py` builds and stores them. Each history item stores the model output, the action results, the browser state history, timing metadata, and the exact state-message text that the model saw for that step. That gives the run an audit trail instead of a loose conversation log.

`AgentHistoryList` turns that record into a durable artifact. It saves and loads JSON, exposes the final result, parses structured output when the agent finishes with a schema, renders step summaries, and surfaces URLs and screenshots from the run. It also gives downstream code the material it needs for judge checks, telemetry, and GIF generation, because those consumers read the same serialized trace instead of starting over.

Replay support comes from `Agent.rerun_history` and `Agent.load_and_rerun`, which re-execute a saved `AgentHistoryList` against a live browser with retry logic and element re-matching.

## The scratchpad filesystem

`browser_use/filesystem/file_system.py` turns the scratchpad into a sandboxed file area rooted in the agent data directory. It starts with `todo.md`, sanitizes filenames, stores serializable file system state, and writes extracted content into numbered markdown files such as `extracted_content_0.md`. The file system can also restore itself from saved state at the same location, so the scratchpad survives beyond a single step or process.

That store exists because some content belongs on disk rather than in the prompt. Long extracted text can outgrow the budget for a model call, so the extractor writes it to a file and leaves a short pointer in memory instead. The tool layer reads and writes those files through actions described in [05-the-tools-and-action-registry.md](./05-the-tools-and-action-registry.md), so the agent can refer back to content by filename without paying the token cost again.

The same pattern applies to ordinary managed files. The tool service works with the sandboxed files through the file system layer, and the views layer gives those actions explicit models for extraction, upload, screenshot, and other browser work. The result feels like a working directory for the agent: stable, addressable, and separate from the prompt window.

## Screenshots as a special-cased store

The agent captures a screenshot on every step, writes it to disk through `browser_use/screenshots/service.py`, and keeps the current screenshot in the browser-state summary on every step. Vision only controls whether that image is attached to the model message. `BrowserStateSummary` carries the in-memory base64 image for the current step, while `BrowserStateHistory` keeps the saved screenshot path so later code can reload it. That split lets the step use the image immediately and still leaves a durable file for history, visual replay, and GIF generation.

## Step-vs-run state split

`browser_use/agent/views.py`, `browser_use/agent/service.py`, `browser_use/browser/views.py`, and `browser_use/agent/message_manager/views.py` make a clear division between step state and run state. `AgentState` carries the durable run-level state across steps: counters, plan progress, pause and stop flags, file system state, loop detection, and the message-manager state that survives between iterations. The agent rebuilds `BrowserStateSummary` from the current browser snapshot on each step and folds it into the message manager, the history record, and the screenshot store.

That split matches the step model in [01-anatomy-of-a-step.md](./01-anatomy-of-a-step.md): each step starts with a fresh view of the browser, but the run keeps its memory. The result lets the agent react to the present page while still carrying forward the durable facts that define the session.

As of July 2026, `browser_use/sync/` can mirror agent events to Browser Use Cloud when cloud sync is enabled.

## Where to look in the code

- `browser_use/agent/message_manager/service.py` — builds the prompt window, filters sensitive data, and rebuilds the state message each step.
- `browser_use/agent/message_manager/views.py` — defines the ordered message history and the prompt-window state container.
- `browser_use/agent/views.py` — holds the durable agent state, message compaction settings, and serialized history types.
- `browser_use/agent/service.py` — runs the step loop, captures browser state, stores history, and wires the run together.
- `browser_use/filesystem/file_system.py` — implements the sandboxed scratchpad file system and extracted-content files.
- `browser_use/screenshots/service.py`, `browser_use/agent/gif.py`, and `browser_use/browser/views.py` — store screenshots, build GIFs, and define the step snapshot and history view.