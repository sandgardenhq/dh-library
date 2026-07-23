---
title: About This Site
url: "ragflow/about-this-site"
description: "What this field guide is, who it is for, and how Doc Holiday generated it."
---

This site presents a concept level field guide to the RAGFlow codebase. It explains what the major subsystems do, why those subsystems exist, and how a request moves across them, so an engineer can build a mental model without reading the repository end to end. The guide keeps the focus on concepts and relationships rather than setup steps or API reference.

The intended reader is an engineer adopting, operating, extending, or contributing to RAGFlow. The guide assumes comfort with code and infrastructure, but it keeps the focus on the shape of the system rather than on individual commands or screens. That gives the reader enough context to use the chapter maps in the rest of the series without treating this page as a tutorial.

Doc Holiday (https://doc.holiday) wrote this guide directly from the RAGFlow source repository. Every page grounds its claims in the repository snapshot through real file paths and symbol names, so the reader can move from the guide to the source without translation. The writing follows the source structure, so each chapter names a subsystem, explains the idea that holds it together, and shows how it connects to neighboring parts of the system. Readers can use the overview first and then move toward the chapter that matches the work at hand.

Repository snapshot: commit df5c8e73f (2026-07-16) of https://github.com/infiniflow/ragflow — the state of the code every page was written against and fact-checked with.

The official documentation at https://ragflow.io/docs/dev/ remains the authoritative source for quickstarts, UI guides, component and API reference, and operations. This field guide complements that material by describing the architecture and the path a request follows through the system. It does not repeat procedural material or compete with the product documentation; it explains the mental model that makes that material easier to use. In that role, the site bridges a first pass through the product and a deeper reading of the source tree.

The repository changes actively. When the guide mentions migration work or transitional behavior, those notes describe the state of the code at the time of writing. They do not define the main subject of the guide. Those dated observations keep the guide honest in a live repository, but they stay secondary to the architecture story.

This guide names the load-bearing paths and the decisions that shape them, then leaves detailed operation to the official material. Each chapter starts with the subsystem's purpose and ends with a short map of the code paths that carry that idea. The series map below follows the same progression from the broad system view through query flow, ingestion, chunking, embeddings, graph retrieval, canvas orchestration, document engines, and DeepDoc. That order helps a reader move from context to detail without losing the thread. It also keeps the closing page concise, so the table of contents carries the navigation load.

Corrections are welcome via issues and pull requests at https://github.com/sandgardenhq/dh-library.

## Series map

- [00-the-big-picture](./00-the-big-picture.md) — the map of the whole system
- [01-anatomy-of-a-query](./01-anatomy-of-a-query.md) — end-to-end trace of one chat question
- [02-anatomy-of-ingestion](./02-anatomy-of-ingestion.md) — the task-executor pipeline: upload → parse → chunk → embed → index
- [03-the-chunking-template-zoo](./03-the-chunking-template-zoo.md) — the 14 chunk templates and the machinery they share
- [04-the-embedding-layer](./04-the-embedding-layer.md) — one interface over ~45 embedding providers, and where vectors live
- [05-graphrag](./05-graphrag.md) — knowledge-graph construction and retrieval: extractors, entity resolution, communities
- [06-the-canvas-orchestrator](./06-the-canvas-orchestrator.md) — the agent workflow engine: graph DSL, scheduler, variables, loops
- [07-the-doc-engine-abstraction](./07-the-doc-engine-abstraction.md) — one search API over Elasticsearch, OpenSearch, Infinity, and OceanBase
- [08-deepdoc](./08-deepdoc.md) — deep document understanding: OCR, layout recognition, table structure