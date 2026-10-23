# Loveneet Suite — Web Edition

Loveneet Suite includes Image Converter, Image Organizer, PowerPoint Exporter, **Excel to Catalogue PPT**, and the integrated **PO PDF to Excel** module.


## Excel to Catalogue PPT
- Upload an XLSX product workbook and map SKU, description, price, dimensions, and embedded image columns.
- Generate a PowerPoint product catalogue with 2 or 3 products per slide.
- Adjust image/text slot coordinates on an 800 × 450 design canvas and set font/background styling.
- Embedded worksheet images are placed into the matching product slot. Rows without a mapped product code are skipped.
- PowerPoint generation runs through the FastAPI backend and returns a downloadable PPTX.
- The module expects product photos to be embedded in the worksheet; linked image URLs are not fetched.

## PO PDF to Excel
- Upload multiple purchase-order or quotation PDFs.
- Extract SO number, quantity, item code, dimensions, ply and DF/SF/type.
- OCR scanned PDF pages in the browser.
- Review/edit extracted values across the exact 27-column Box App Bulk Calculation Template.
- Export one combined workbook or separate workbook(s) for each PDF.
- Extraction runs client-side in the browser. The PO PDF files are not uploaded to the Suite API by this module.

## Requirements
- Python 3.10+
- Node.js 20+
- LibreOffice on the server for PowerPoint export.

## Run locally on Windows

Terminal 1 — API:
```powershell
cd MASTER/webapp/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — frontend:
```powershell
cd MASTER/webapp/frontend
npm install
npm run dev
```

Open the Vite URL shown by the terminal. The frontend proxies /api to port 8000.

## Access control — important
This repository's current web shell does not yet implement login or backend authorization. Adding a sidebar module integrates the tool into the Suite interface, but **does not by itself prevent direct visitors from opening a public deployment**. Before treating the module as Suite-user-only, put the site behind real authentication (for example, Vercel Deployment Protection or an authenticated reverse proxy) and validate authorization server-side for any protected server APIs. Do not rely on a hidden menu item or client-side flag as a security boundary.
