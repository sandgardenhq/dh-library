---
title: The Document Engine Abstraction
url: "ragflow/the-document-engine-abstraction"
description: "One search API over Elasticsearch, OpenSearch, Infinity, and OceanBase."
---

RAGFlow defines a document engine because retrieval needs a narrow mix of capabilities: hybrid full text and vector scoring over the same chunks, bulk writes, and per tenant isolation. This page complements [Anatomy of a Query](./01-anatomy-of-a-query.md) and keeps the Python runtime as the canonical production implementation as of mid 2026, while Infinity can stand in as a practical alternative to Elasticsearch.

## Series map

- [./00-the-big-picture.md](./00-the-big-picture.md)
- [./01-anatomy-of-a-query.md](./01-anatomy-of-a-query.md)
- [./02-anatomy-of-ingestion.md](./02-anatomy-of-ingestion.md)
- [./03-the-chunking-template-zoo.md](./03-the-chunking-template-zoo.md)
- [./04-the-embedding-layer.md](./04-the-embedding-layer.md)
- [./05-graphrag.md](./05-graphrag.md)
- [./06-the-canvas-orchestrator.md](./06-the-canvas-orchestrator.md)
- [./07-the-doc-engine-abstraction.md](./07-the-doc-engine-abstraction.md)
- [./08-deepdoc.md](./08-deepdoc.md)
- [./09-about-this-site.md](./09-about-this-site.md)

## Why this layer exists

The abstraction serves a workload, not a general search platform. The retrieval layer needs to express lexical intent, dense similarity, sparse and tensor style matches, and sort order without hard coding engine syntax, because the same chunk records must support search, bulk mutation, and tenant scoped reads. The operational switch lives in [Switch document engine](https://ragflow.io/docs/dev/switch_doc_engine), but this page describes the design that makes that switch possible.

## The portable contract

`common/doc_store/doc_store_base.py` keeps the surface small. `DocStoreConnection` covers index lifecycle, CRUD, result helpers, and SQL, while the query objects carry the real portability: `MatchTextExpr`, `MatchDenseExpr`, `MatchSparseExpr`, `MatchTensorExpr`, `FusionExpr`, and `OrderByExpr` describe intent without binding callers to one engine's query language.

`Dealer` in `rag/nlp/search.py` composes those objects. It builds lexical and dense legs, adds fusion when the request needs both, and hands the portable expressions to the active connection instead of writing engine native queries itself. That choice keeps the retrieval logic readable and lets each adapter translate the same request shape in its own way.

## How the runtime chooses a backend

`common/settings.py` reads `DOC_ENGINE`, selects the concrete singleton, stores it in `settings.docStoreConn`, and wires the retriever objects from the same choice. `elasticsearch` loads `rag.utils.es_conn.ESConnection`, `infinity` loads `rag.utils.infinity_conn.InfinityConnection`, `oceanbase` and `seekdb` load `rag.utils.ob_conn.OBConnection`, and `opensearch` loads `rag.utils.opensearch_conn.OSConnection`.

The shared base classes in `common/doc_store/` hold the common contract, while the concrete adapters in `rag/utils/` supply the backend specific translation. `ESConnection`, `InfinityConnection`, `OBConnection`, and `OSConnection` honor the same abstract shape, but each one maps the portable expressions into different storage and scoring rules.

## The schema contract

The mapping files describe one conceptual chunk record, not four unrelated schemas. `conf/mapping.json` gives Elasticsearch the suffix driven field model: tokenized text fields, keyword fields, rank feature fields, and dense vectors such as `q_512_vec`, `q_768_vec`, `q_1024_vec`, and `q_1536_vec`. `conf/os_mapping.json` gives OpenSearch the same idea through its own dynamic templates and suffix conventions. `conf/infinity_mapping.json` expresses the same idea through Infinity's column model with fields such as `docnm`, `important_keywords`, `questions`, `content`, `authors`, `pagerank_fea`, `tag_feas`, and positional fields.

The adapters reshape that model before storage. Infinity turns the chunk into its own column layout, ES and OpenSearch lean on dynamic mappings that follow the suffix conventions, and OceanBase stores the record as SQL columns, arrays, and JSON values. The metadata tables follow the same pattern: `conf/doc_meta_es_mapping.json` and `conf/doc_meta_infinity_mapping.json` define the per tenant `ragflow_doc_meta_{tenant_id}` contract.

Tenant and dataset scope stay explicit in naming. ES and OpenSearch keep a tenant level chunk index and filter by `kb_id`, Infinity builds chunk tables from the tenant index name plus the knowledge base id, and OceanBase follows the same per tenant isolation idea through its own naming helpers.

## Where the abstraction leaks

The score path leaks first, and that leak stays intentional. `rag/nlp/search.py` treats Infinity's fused score as authoritative because Infinity already normalizes the text and vector legs before fusion. OceanBase still reranks locally against chunk vectors, and ES and OpenSearch recover the vector score through the KNN path before they mix it with lexical similarity and any rank features.

OpenSearch adds one more boundary. `rag/utils/opensearch_conn.py` only enables true hybrid search when it can create the normalization search pipeline on a supported version; otherwise the adapter falls back to vector only search. That behavior reflects the backend's capability, not a flaw in the abstraction.

## How to add another engine

Adding a backend means implementing the `DocStoreConnection` contract, translating the portable match and fusion expressions into the backend's query model, and supplying a schema that preserves hybrid search semantics. The real test is simple: after translation, the system still needs to retrieve the same chunk records, apply the same tenant boundaries, and produce the same hybrid behavior that the Python runtime expects.

## Go side note

As of July 2026, the Go rewrite under `internal/engine/` mirrors this design with its own `DocEngine` interface and engine specific packages. The Python implementation above remains the canonical production path, and the Go tree tracks the same abstraction in parallel.

## Where to look in the code

- `common/doc_store/doc_store_base.py` — core abstract interface and portable query objects.
- `common/settings.py` — `DOC_ENGINE` selection and `settings.docStoreConn` wiring.
- `rag/nlp/search.py` — `Dealer`, query composition, and rerank branching.
- `conf/mapping.json`, `conf/os_mapping.json`, `conf/infinity_mapping.json`, `conf/doc_meta_es_mapping.json`, `conf/doc_meta_infinity_mapping.json` — chunk and metadata schema contracts.
- `rag/utils/es_conn.py`, `rag/utils/infinity_conn.py`, `rag/utils/ob_conn.py`, `rag/utils/opensearch_conn.py` — concrete adapters and backend specific search behavior.