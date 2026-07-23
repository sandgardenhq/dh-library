---
title: DeepDoc
url: "ragflow/deepdoc"
description: "Deep document understanding: OCR, layout recognition, table structure."
---

DeepDoc turns PDFs and other document formats into ordered sections and table artifacts that downstream chunking can consume. In the ingestion path, the worker hands DeepDoc raw files pulled from object storage, so the parser sees the file after upload but before chunk templates slice it into retrieval-sized pieces. The package README in `deepdoc/README.md` carries the command examples and model notes; this page focuses on the mental model that ties the parser, vision, and figure paths together.

If the ingestion path needs a broader context, see [Anatomy of ingestion](./02-anatomy-of-ingestion.md) and [the chunking template zoo](./03-the-chunking-template-zoo.md). Those pages cover the surrounding flow, while this page stays inside the document understanding layer.

## Why PDF handling behaves like a vision problem

PDFs do not behave like plain text files. A PDF can carry a usable text layer, a scanned page image, or a mixture of both, and the reading order can break across columns, captions, headers, and tables. DeepDoc treats that as a visual interpretation problem because the page image often carries more reliable structure than the text layer alone.

The baseline parser renders each page with `pdfplumber`, then lets `OCR` recover text boxes and `LayoutRecognizer` attach page-level structure. The garbled-text rejection and fallback live in `deepdoc/parser/pdf_parser.py` (`RAGFlowPdfParser`); `deepdoc/vision/ocr.py` does detection and recognition only. That keeps the parser honest when the file contains fonts, encodings, or scanned regions that text extraction cannot decode well.

## DeepDoc splits the problem into parser and vision

The `deepdoc/` package separates orchestration from perception. `deepdoc/parser/` holds the format adapters and the PDF assembly logic. `deepdoc/vision/` holds the low-level detectors and recognizers that read page images.

That split matters because the parser must decide how to turn visual findings into a stable document contract, while the vision code must stay focused on detection quality. The parser therefore owns reading order, table assembly, figure extraction, and downstream-friendly output shapes. The vision package owns text detection, text recognition, page layout recognition, and table structure recognition.

The public export in `deepdoc/vision/__init__.py` maps `LayoutRecognizer` to `LayoutRecognizer4YOLOv10`, and `RAGFlowPdfParser` imports that export by default. As a result, the default PDF path uses the YOLOv10-backed layout recognizer unless `LAYOUT_RECOGNIZER_TYPE=ascend` selects `AscendLayoutRecognizer`.

## The default DeepDoc PDF pipeline

The default PDF path lives in `deepdoc/parser/pdf_parser.py` under `RAGFlowPdfParser`. That class wires together `OCR`, `LayoutRecognizer`, `TableStructureRecognizer`, and the small XGBoost model that decides when adjacent boxes belong to the same reading sequence. The pipeline keeps the page image as the source of truth, then projects every later decision back onto page coordinates.

The pipeline moves through a clear chain:

1. Render each page into an image.
2. Detect text regions and recognize their contents with `OCR`.
3. Tag each box with a layout type through `LayoutRecognizer`.
4. Recognize table structure with `TableStructureRecognizer`.
5. Rebuild reading order with the text merge helpers and the `updown_concat_xgb.model` scorer.
6. Emit ordered sections and table artifacts that downstream chunking can consume.

The layout recognizer works with the labels in `deepdoc/vision/layout_recognizer.py`: `_background_`, `Text`, `Title`, `Figure`, `Figure caption`, `Table`, `Table caption`, `Header`, `Footer`, `Reference`, and `Equation`, and the default `LayoutRecognizer4YOLOv10` path overrides that base list with a smaller runtime set. The table structure recognizer works with `table`, `table column`, `table row`, `table column header`, `table projected row header`, and `table spanning cell`. Those labels matter because they determine which boxes stay in prose, which boxes become table content, and which boxes drop out as page furniture.

DeepDoc also treats figures as first-class page regions. `RAGFlowPdfParser._extract_table_figure` crops figure and table regions from the rendered page images, preserves their position tags, and emits them as separate artifacts. That keeps the figure image available to later enrichment without flattening it into unrelated body text.

## Third party parsers and vision LLM enrichment

The baseline parser does not own the whole ecosystem. The `deepdoc/parser/` package also carries adapters for Docling, MinerU, OpenDataLoader, PaddleOCR, SoMark, and Tencent Cloud ADP. Those modules translate external parse engines back into the same section and table contract that the rest of DeepDoc expects, so the downstream chunker sees a familiar shape even when the source engine changes.

As of this snapshot, the adapter roster in `deepdoc/parser/` continues to expand, and the vision-backed figure path now appears both in the baseline parser and in adapter-specific enrichment hooks. `deepdoc/parser/figure_parser.py` uses the tenant `LLMType.VISION` model to describe images and append those descriptions to figure text. `MinerUParser` follows the same idea in `_enhance_images_with_vlm`, which adds semantic image descriptions before the parser hands sections back to ingestion.

That difference matters at a conceptual level. The default DeepDoc path extracts structure locally and deterministically. The third-party adapters trade some of that control for an external model or service, while the vision-LLM path adds semantic depth to figures and images without changing the surrounding section contract.

## How the output reaches chunking

DeepDoc does not stop at recognition. It converts the page into a reading order that downstream chunking can trust. The parser keeps position tags with each box, merges lines when the content and geometry justify it, and leaves tables and figures in separate lanes when they need different handling. The result is structured text plus geometry, not raw OCR output.

That contract also explains why the parser package exports `PdfParser` and `PlainParser` alongside the format-specific adapters in `deepdoc/parser/__init__.py`. The package keeps one path tuned for PDF understanding and another path tuned for lighter text extraction, but both still feed the same ingestion contract.

## Where to look in the code

- `deepdoc/parser/pdf_parser.py` — baseline PDF orchestration, OCR fallback for garbled PDF text, layout tagging, table assembly, reading order, and figure cropping.
- `deepdoc/vision/ocr.py` — page image text detection and recognition.
- `deepdoc/vision/layout_recognizer.py` — layout labels, page-level tagging, and the `LayoutRecognizer4YOLOv10` path.
- `deepdoc/vision/table_structure_recognizer.py` — table labels, span recovery, and the HTML or prose table reconstruction logic.
- `deepdoc/parser/figure_parser.py` — vision LLM enrichment for figures and image blocks.
- `deepdoc/parser/*.py` — Docling, MinerU, OpenDataLoader, PaddleOCR, SoMark, and TCADP adapters that map external parsers back into the DeepDoc contract.