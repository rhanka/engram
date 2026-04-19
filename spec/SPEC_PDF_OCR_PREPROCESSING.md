# SPEC_PDF_OCR_PREPROCESSING

## Status

- Product: Graphify TypeScript port
- Scope: PDF readability preflight and optional Mistral OCR normalization before semantic extraction
- Runtime state root: `.graphify/`
- Provider: `mistral-ocr` optional dependency
- Default mode: `GRAPHIFY_PDF_OCR=auto`

## Goal

Graphify should not ask an assistant to reason directly over opaque binary PDFs when a better text representation can be prepared locally. Every PDF in the semantic path is preflighted first. If a text layer is usable, Graphify creates a Markdown sidecar locally through `pdf-parse`, falling back to the system `pdftotext` CLI when available. If the PDF is scanned or has too little extractable text, Graphify may call `mistral-ocr` to produce Markdown plus extracted image assets.

## Non-Goals

- Do not implement a full OCRmyPDF clone in Graphify.
- Do not introduce a resident backend or remote Graphify service.
- Do not call Mistral OCR for every PDF blindly.
- Do not make OCR output committed state by default; sidecars remain local `.graphify/` runtime artifacts.
- Do not bypass upstream OCR package licenses by copying non-permissive code.

## Modes

`GRAPHIFY_PDF_OCR` controls PDF OCR behavior:

- `auto`: default. Run local preflight; call `mistral-ocr` only when text density is below threshold after `pdf-parse` plus optional `pdftotext` fallback, or when all local extraction fails.
- `off`: do not preprocess OCR; keep the original PDF in the paper semantic input.
- `always`: force Mistral OCR for every PDF. Missing API key or provider failures are hard errors.
- `dry-run`: run local preflight and write artifacts, but never call Mistral OCR.

`GRAPHIFY_PDF_OCR_MODEL` overrides the Mistral model. The default is `mistral-ocr-latest` through the `mistral-ocr` package.

## Preflight Heuristic

For each PDF, Graphify computes:

- SHA-256 hash, used for stable sidecar naming
- page count from `pdf-parse`, falling back to `pdfinfo` when `pdftotext` is used
- text word count and character count
- low-level `/Image` and `/XObject` marker count as a cheap scan/image signal

A PDF is considered OCR-worthy when:

- both `pdf-parse` and optional `pdftotext` fail to produce usable text, or
- word count is lower than `max(40, page_count * 25)`

This is deliberately conservative. Text-layer PDFs avoid paid OCR. Scanned/low-text PDFs get normalized only when the configured mode allows it.

## Sidecar Contract

Generated PDF artifacts live under `.graphify/converted/pdf/`:

- `<stem>_<sha>.md`: Markdown semantic input
- `<stem>_<sha>.ocr.json`: provider/preflight metadata
- `<stem>_<sha>_images/`: images extracted by Mistral OCR, when present

The Markdown sidecar includes YAML frontmatter:

- `graphify_source_file`: absolute original PDF path
- `graphify_conversion`: `pdf-parse`, `pdftotext`, or `mistral-ocr`

The semantic detection copy removes successfully converted source PDFs from `files.paper`, adds Markdown sidecars to `files.document`, and adds extracted PDF image artifacts to `files.image`. The original detection remains the reporting/manifest source of truth.

## Failure Behavior

- In `auto`, missing `MISTRAL_API_KEY` or optional dependency failure logs a warning and keeps the source PDF in `files.paper`.
- In `always`, missing `MISTRAL_API_KEY` or provider failure aborts the preparation step.
- Existing sidecars are reused when the source hash matches, so repeated runs do not re-call OCR.

## Assistant Contract

Assistant skills must always run semantic preparation before cache lookup and semantic extraction. This step may produce:

- transcript paths in `.graphify/.graphify_transcripts.json`
- PDF OCR/preflight artifacts in `.graphify/.graphify_pdf_ocr.json`
- an augmented semantic detection JSON with generated Markdown sidecars

Semantic extraction reads generated PDF sidecars like normal docs. It should decode sidecar image artifacts when they carry figures, tables, diagrams, captions, or embedded text. The default path is assistant/platform vision in the semantic pass; a configured delegated OCR/vision provider can be used when available. Every extracted finding must preserve provenance back to the source PDF and sidecar artifact.

## Tests And UAT

Automated tests cover:

- mode parsing
- low-text preflight decision
- local text-layer PDF Markdown sidecar generation, including `pdftotext` fallback
- Mistral OCR invocation with mocked provider and API key
- dry-run no-API behavior
- missing-key fallback in `auto`
- unified semantic preparation with PDF sidecars and extracted image artifacts

Manual UATs:

- text PDF: run `$graphify ./raw --pdf-ocr auto`; verify `.graphify/converted/pdf/*.md` is created through `pdf-parse`/`pdftotext` without a Mistral API call.
- scanned PDF with `MISTRAL_API_KEY`: run `$graphify ./raw --pdf-ocr auto`; verify Markdown and image artifacts are created.
- scanned PDF without `MISTRAL_API_KEY`: run `$graphify ./raw --pdf-ocr auto`; verify a warning and no hard failure.
- forced OCR: run `$graphify ./raw --pdf-ocr always`; verify missing key fails clearly.
