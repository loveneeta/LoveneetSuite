# PDF Studio — Local Processing

PDF Studio provides 33 listed tools across the seven requested groups and is integrated into the existing Loveneet Suite React/FastAPI application. It does not call iLovePDF or any third-party PDF API. Files are posted only to the configured Loveneet Suite API server for processing.

## Local features
- Merge, split, remove, extract and reorder PDF pages
- Repair/optimize, rotate, watermark, crop and text redaction
- Password unlock (only when the user supplies the password) and AES-256 protection
- PDF to JPG, DOCX, PPTX, XLSX text extraction and Markdown
- Image-to-PDF, HTML text-to-PDF and Office-to-PDF via local LibreOffice
- Text-based comparison, text extraction/OCR text export and form-field inspection

## Dependencies
- PyMuPDF (already in backend requirements)
- python-docx (added)
- LibreOffice is optional and required only for DOCX/PPTX/XLSX to PDF.

## Deliberate limitations
- AI Summarizer and Translate are visible but disabled until a local model is installed and configured.
- PDF/A is disabled until a validated Ghostscript conversion is configured.
- Cryptographic/drawn signing is not represented as complete; it requires a separate signing implementation.
- OCR currently extracts embedded selectable text; scanned-image OCR requires a local Tesseract installation and will be added as a separate verified workflow.
- Redaction only finds selectable text; scanned image redaction must not be assumed.
- PDF-to-Excel exports page text, not inferred table structures.
- HTML-to-PDF is a basic text renderer, not a full browser layout engine.
- Comparison is text-based, not a pixel-level visual diff.

Always validate output files, especially redactions, signatures and archival conversions, before relying on them.
