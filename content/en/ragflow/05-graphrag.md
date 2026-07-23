---
title: GraphRAG
url: "ragflow/graphrag"
description: "Knowledge-graph construction and retrieval: extractors, entity resolution, communities."
---

Chunk retrieval works well when the answer lives close to a passage. It falls short when a question spans several hops or asks for a corpus-wide theme. GraphRAG closes that gap by extracting an entity-relationship graph during ingestion and then using that graph alongside ordinary chunk retrieval at query time.

## Series map

- [00 the big picture](./00-the-big-picture.md)
- [01 anatomy of a query](./01-anatomy-of-a-query.md)
- [02 anatomy of ingestion](./02-anatomy-of-ingestion.md)
- [03 the chunking template zoo](./03-the-chunking-template-zoo.md)
- [04 the embedding layer](./04-the-embedding-layer.md)
- [06 the canvas orchestrator](./06-the-canvas-orchestrator.md)
- [07 the doc engine abstraction](./07-the-doc-engine-abstraction.md)
- [08 deepdoc](./08-deepdoc.md)
- [09 about this site](./09-about-this-site.md)

## Why the graph exists

Chunk retrieval favors local evidence. It answers “what does this passage say?” very well, but it does not give the system a good path through relationship questions or theme questions that require aggregation across the corpus. GraphRAG adds that path by turning document content into entities, relations, and communities, so retrieval can follow structure instead of only text similarity.

## Ingestion: an optional expensive pass

`rag/svr/task_executor.py` routes `PipelineTaskType.GRAPH_RAG` into the graph build path, so the subsystem runs only when the pipeline asks for it. `rag/graphrag/general/index.py` then drives the work in stages: it batches chunks, builds per-document subgraphs, merges them into a global graph, optionally resolves duplicate entities, optionally generates community reports, and persists the graph artifacts back into the doc store.

That path stays resumable. `rag/graphrag/phase_markers.py` and the orchestration code in `rag/graphrag/general/index.py` track KB-scoped phase markers and use locks so reruns can skip work that already finished. The result keeps retries from repeating the most expensive phases.

### Extraction strategy: richer GraphRAG prompts or lighter LightRAG prompts

The shared extraction framework in `rag/graphrag/general/extractor.py` feeds two prompt styles. `rag/graphrag/general/graph_extractor.py` and `rag/graphrag/general/graph_prompt.py` ask for richer typed entities, relations, and iterative gleanings, which gives the graph more structure but costs more tokens. `rag/graphrag/light/graph_extractor.py` and `rag/graphrag/light/graph_prompt.py` trim that shape down, which lowers cost and latency while giving up some depth and richness.

### Entity resolution: merge the duplicates

Extraction often creates near-duplicate nodes for the same real-world entity. If the build path leaves them separate, the graph fragments one concept into several nodes and weakens both traversal and scoring. `rag/graphrag/entity_resolution.py` addresses that problem with an LLM-assisted yes-or-no equivalence pass from `rag/graphrag/entity_resolution_prompt.py`: it batches candidate pairs, checkpoints progress, merges nodes and edges by connected components, and recomputes PageRank after the merge.

### Communities and community reports

`rag/graphrag/general/leiden.py` partitions the graph with Leiden clustering. `rag/graphrag/general/community_reports_extractor.py` then writes community reports from that structure, using `rag/graphrag/general/community_report_prompt.py` to produce a fixed JSON shape with a title, summary, impact rating, and findings. Those reports matter because retrieval can surface them later as graph evidence for broad questions instead of rebuilding the whole community view each time.

### Embeddings and persistence

`rag/graphrag/utils.py` embeds graph entities and relations so vector search can find them, and it persists the finished graph back into the doc store as the global graph, per document subgraphs, entity chunks, and relation chunks. `rag/graphrag/general/entity_embedding.py` is just an unused node2vec utility. GraphRAG therefore lives in the same retrieval store as ordinary chunks rather than in a separate side index.

## Query time: graph retrieval joins the normal dealer flow

`rag/graphrag/search.py` defines `KGSearch`, which extends the ordinary `Dealer` flow from `rag/nlp/search.py` instead of replacing it. `rag/graphrag/query_analyze_prompt.py` first rewrites the question into answer-type keywords and entity hints. `KGSearch` then finds candidate entities through keyword and embedding signals, finds relation candidates through text embeddings, expands N-hop paths from stored entity neighborhoods, and pulls in community reports.

PageRank-weighted scoring and similarity scoring rank the graph evidence. The retriever then returns a chunk-shaped bundle, so the downstream chat assembly can treat graph hits the same way it treats ordinary chunk hits.

## Cost and trade offs

Graph construction multiplies ingestion LLM spend because the pipeline may run extraction prompts, entity resolution, community reporting, and embeddings before it writes the graph back to storage. That cost buys broader recall for relationship and corpus-wide questions, so GraphRAG makes sense as an optional path rather than a default one. For the configuration-oriented walkthrough and the retrieval test page, see the official guides for [construct knowledge graph](https://ragflow.io/docs/dev/construct_knowledge_graph) and [run retrieval test](https://ragflow.io/docs/dev/run_retrieval_test).

For broader ingestion context, see [02 anatomy of ingestion](./02-anatomy-of-ingestion.md).

## Adjacent but different

- `PipelineTaskType.MINDMAP` uses `rag/advanced_rag/knowlege_compile/mind_map_extractor.py` and `rag/graphrag/general/mind_map_prompt.py` to build a nested mind map, not an entity relationship graph.
- `rag/advanced_rag/knowlege_compile/raptor.py` and `rag/utils/raptor_utils.py` build a summary tree for hierarchical retrieval, which serves a different purpose from graph traversal.

## Where to look in the code

- `rag/svr/task_executor.py` — task routing for graph build and mind map runs.
- `rag/graphrag/general/index.py` — chunk batching, subgraph merge, optional resolution, community extraction, and community report persistence.
- `rag/graphrag/phase_markers.py` — KB scoped markers that let reruns skip finished graph phases.
- `rag/graphrag/search.py` — query time graph retrieval and chunk-shaped output.
- `rag/graphrag/utils.py` — graph serialization and doc store persistence for subgraphs, entities, and relations.
- `rag/nlp/search.py` — the normal Dealer retrieval contract that GraphRAG plugs into.