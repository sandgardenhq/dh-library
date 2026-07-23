---
title: The Chunking Template Zoo
url: "ragflow/the-chunking-template-zoo"
description: "The chunk templates and the machinery they share."
---

RAGFlow keeps more than one chunking template because retrieval works best when each chunk boundary matches the document genre. A legal code, a slide deck, a resume, and an email thread each lose different meaning when one splitter treats them the same way.

The dispatcher in `rag/svr/task_executor.py` forms the seam. `FACTORY` maps each `parser_id` to a module in `rag/app/`, and `build_chunks()` loads the file, merges parser configuration, and hands the task to `chunk()`. That split matters because the template zoo preserves source specific structure instead of offering interchangeable ways of saying the same thing. The parser selection details live in `./08-deepdoc.md`.

## The shared chunk contract

Every template returns chunk-shaped dictionaries, but each one emphasizes a different layer of the same record. `rag/app/naive.py` shows the plain version: it keeps the raw text in `content_with_weight` and adds tokenized search forms in `content_ltks` and `content_sm_ltks`. `rag/app/paper.py` and `rag/app/presentation.py` add page order, position fields, and page images when the document layout carries meaning.

That common shape gives the rest of the system a stable handoff. The retrieval layer can score the raw text, the search layer can work from normalized tokens, and the display layer can recover position or media context when the source demands it.

## The strategies in the zoo

### General and token budget

`rag/app/naive.py` handles the broad token-budget path. It merges text into token-bounded chunks, keeps sentence flow intact when possible, and lets delimiters steer the merge when boundaries matter more than raw count. It also chooses the PDF backend for ingestion: DeepDoc layout analysis, plain text, or integrated third-party parsers such as MinerU and Docling. The adjacent DeepDoc discussion lives in [08-deepdoc.md](./08-deepdoc.md). This path works well when the source reads like prose with a simple spine, but it can blur local detail if the source mixes long narrative passages with dense reference material.

### Layout and structure driven

`rag/app/paper.py`, `rag/app/book.py`, `rag/app/manual.py`, `rag/app/laws.py`, and `rag/app/presentation.py` treat page order, headings, tables, and thumbnails as first class signals. The paper path protects the abstract, authorship, and section flow; the book and manual paths follow hierarchy and section order; the laws path turns headings and tables into legal sections; and the presentation path keeps each page as a chunk and preserves the page image. This approach keeps citations, page context, and visual order close to the text, even when the chunk size stops looking uniform.

### Record-shaped

`rag/app/qa.py`, `rag/app/table.py`, and `rag/app/resume.py` build records instead of prose blocks. A question pair, a spreadsheet row, or a resume field bundle already has an internal shape, so the chunker should preserve that shape instead of flattening it into a paragraph. The tradeoff is clear: these chunks answer targeted queries well, but they do not read like natural narrative excerpts.

### Whole and special cases

`rag/app/one.py`, `rag/app/picture.py`, `rag/app/audio.py`, `rag/app/email.py`, and `rag/app/tag.py` keep whole-document sources or special payloads intact when a normal split would break the source model. `rag/app/one.py` keeps the original order and emits a single chunk per file or page set when the document boundary matters more than internal splitting. `rag/app/picture.py` and `rag/app/audio.py` turn media into text-bearing chunks through OCR, vision, or transcription, which makes non textual sources searchable without pretending that the text came from a plain document. `rag/app/email.py` chunks the email body and each attachment into token-bounded chunks and returns them together, and `rag/app/tag.py` stays apart from the rest of the zoo because it produces label-bearing records for tag workflows, not a normal retrieval corpus.

## The shared machinery underneath

The merge and tokenization layer in `rag/nlp/__init__.py` and `rag/nlp/rag_tokenizer.py` gives the zoo its common language. `tokenize()` writes the raw text and its normalized token forms, while helpers such as `naive_merge`, `naive_merge_with_images`, `attach_media_context`, and `add_positions` keep source order, page geometry, and media context available when a parser needs them.

This dual form matters. Raw text keeps retrieval, embedding, and display faithful to the source. Tokenized forms give normalization, search, and keyword extraction a shared representation that downstream components can compare, cache, and rank.

## What a chunk becomes

The chunk record continues into the document engine as a retrieval document. `rag/svr/task_executor.py` adds document identity, timestamps, and knowledge base links, then hands the payload to downstream indexing. `content_with_weight` carries the retrieval body, token fields support search, and optional vector, keyword, question, and metadata fields extend the record when the pipeline asks for more than text.

The later ingestion path in `rag/flow/pipeline.py` only orchestrates the handoff: `Pipeline(Graph)` walks the component path and invokes each component with the previous component's output. The flow components themselves normalize upstream output, add document and knowledge base fields, assign positions, and prepare the final payload before indexing. That shape belongs in `./07-the-doc-engine-abstraction.md`; this chapter only needs to show that the chunk record becomes a document engine document, not a temporary parser artifact.

> Note, July 2026: parent child chunking remains a separate layer that sits on top of these templates. See the official documentation: [configure_child_chunking_strategy](https://ragflow.io/docs/dev/configure_child_chunking_strategy).

> Note, July 2026: the newer ingestion path in `rag/flow/pipeline.py` and `rag/flow/chunker/token_chunker.py` turns the same job into composable graph components. Fixed templates still matter, but the pipeline direction generalizes chunking into reusable nodes.

## Where to look in the code

- `rag/svr/task_executor.py`: `FACTORY` and `build_chunks()` select the parser template and start ingestion.
- `rag/app/naive.py`: the general token budget path and PDF backend choice live here.
- `rag/app/paper.py`, `rag/app/book.py`, `rag/app/manual.py`, `rag/app/laws.py`, and `rag/app/presentation.py`: these files show structure preserving and page-aware chunking.
- `rag/app/qa.py`, `rag/app/table.py`, and `rag/app/resume.py`: these files show record-shaped chunk construction.
- `rag/app/one.py`, `rag/app/picture.py`, `rag/app/audio.py`, `rag/app/email.py`, and `rag/app/tag.py`: these files show whole-document and special-case handling.
- `rag/nlp/__init__.py` and `rag/nlp/rag_tokenizer.py`: these files hold the shared tokenization and context helpers.
- `rag/flow/pipeline.py` and `rag/flow/chunker/token_chunker.py`: these files show the composable ingestion direction.