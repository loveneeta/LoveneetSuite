# Loveneet Suite — Web Edition

This is a web migration scaffold for the desktop tools in `MASTER/`. It adds a React/Vite frontend and a FastAPI backend while leaving the desktop application untouched.

## Features in this migration
- **Image Converter:** multi-file upload, JPG/PNG/WEBP/BMP/TIFF output, quality control, optional resizing, ZIP download.
- **Image Organizer:** upload an XLSX/XLSM workbook and a ZIP of source images; choose one of three folder strategies; download organized copies and a report.
- **PowerPoint Exporter:** upload PPT/PPTX files and render slides to JPG/PNG/WEBP, then download a ZIP.
- Responsive interface for desktop, tablet, and mobile.

## Requirements
- Python 3.10+
- Node.js 20+
- LibreOffice installed on the server and `libreoffice` or `soffice` available on PATH for PowerPoint export.

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

Open the Vite URL printed in the terminal, usually http://localhost:5173. The frontend proxies `/api` requests to port 8000.

## Important differences from desktop
- A browser cannot scan arbitrary folders on a user's computer like a desktop app. This version uses explicit uploads and ZIP downloads.
- For Image Organizer, upload a ZIP of source images. Excel paths are matched by filename; the first version uses the desktop default column mapping.
- The desktop exporter uses Microsoft PowerPoint COM automation. The web version uses LibreOffice and PyMuPDF, so fidelity and filename selection can differ. Test representative presentations.
- Catalogue Generator, Images To PPT, and Template Designer remain future work because the desktop entry point currently contains placeholders for these pages.

## Production checklist
- Put the API behind HTTPS and an authenticated reverse proxy before public deployment.
- Add upload-size limits, per-user quotas, rate limits, job timeouts, and temporary-file cleanup monitoring.
- Configure CORS for the production frontend origin (current origins are for local Vite development).
- Avoid exposing this development API directly to the public internet.
- Test unusual workbooks, duplicate image names, large files, transparent images, and complex presentations.