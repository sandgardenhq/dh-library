---
title: About This Site
url: "dspy/about-this-site"
description: "What this field guide is, who it is for, and how it was generated."
---

## Overview

This field guide explains the DSPy codebase as a set of connected concepts. It focuses on why each subsystem exists, the central idea that organizes it, and how the pieces fit together, so an engineer can build a mental model without reading the repository end to end.

The official DSPy documentation at [dspy.ai](https://dspy.ai) already covers tutorials, API reference, and some deep-dive concept pages. This field guide fills the subsystem-level gaps those pages have not yet explained. It stays close to the source code and treats each page as a map from one idea to the next.

It serves engineers adopting DSPy, debugging a pipeline, or extending the framework. The pages answer questions such as how a `Signature` becomes a `Module` call, where language model requests flow, what caching changes, and how optimization, streaming, and runtime hooks fit together. They also show how neighboring subsystems shape one another, so the reader can see the boundaries between responsibilities instead of a pile of isolated files.

The format stays short on purpose. Each page covers one subsystem or one path through the stack, then stops before it turns into reference material. That keeps the guide useful when the reader needs design intent more than a list of APIs. It also makes the site easier to scan when a quick answer matters and a full tutorial would add noise.

Readers can use this page as a map before they open a subsystem file, then switch to the main documentation when they need procedures or API details. The result is a companion guide to the official docs, not a duplicate manual.

It also leaves room for the sibling pages to cover each subsystem in its own terms, with enough context to explain the trade-offs that shape the code.

## How this site was produced

Doc Holiday ([doc.holiday](https://doc.holiday)) is an AI documentation writer. It explored the DSPy source repository directly while drafting the page set. Every page grounds its explanation in real file paths and symbol names, so readers can move from the narrative to the code without translation.

The result gives a map of the codebase rather than a second manual. It helps readers orient themselves before they trace individual functions or study implementation details. It also keeps the language aligned with the repository, so the same term means the same thing in prose and in code.

This guide was written against a snapshot of the DSPy source, commit `80fce4cc` (2026-07-04) of https://github.com/stanfordnlp/dspy. The codebase changes over time, so the pages capture a snapshot rather than a fixed contract, and the official docs remain authoritative.

Corrections and updates are welcome through the site repository at https://github.com/sandgardenhq/dh-library.

## Site map

- [The big picture](./00-the-big-picture.md) — the `Signature`→`Module`→`Adapter`→`LM` spine
- [Anatomy of a call](./01-anatomy-of-a-call.md) — end-to-end trace of one `Module` call
- [The LM layer](./02-the-lm-layer.md) — the `clients/` package
- [Caching](./03-caching.md) — the cache and its footguns
- [What compile does](./04-what-compile-does.md) — the `Module`/`Parameter` tree and what optimizers actually change
- [Inside MIPROv2](./05-inside-miprov2.md) — the flagship optimizer’s mechanism
- [The proposer](./06-the-proposer.md) — how optimizers write instruction candidates
- [Streaming](./07-streaming.md) — `streamify`, listeners, status messages
- [Production](./08-production.md) — callbacks, usage tracking, parallel execution
- [About this site](./09-about-this-site.md) — this page