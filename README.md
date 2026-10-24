# Loveneet Business Suite — Web Edition

A unified web platform for product data extraction, image processing, and presentation automation.

---

## 🛠️ Included Tools

1. **Excel to Catalogue PPT (`excel-ppt`)**
   - Upload an `.xlsx` product workbook and map SKU, description, price, dimensions, and embedded images.
   - Design interactive slide canvas (2 or 3 products per slide, 16:9, 4:3, A4 layouts).
   - Generates and downloads a clean, styled PowerPoint product catalogue.

2. **PO PDF to Excel (`pdf-excel`)**
   - Process multiple purchase orders or quotation PDFs completely client-side in the browser.
   - Extracts SO numbers, quantities, item codes, dimensions, ply, and DF/SF types.
   - Scanned PDF support with in-browser OCR (Tesseract.js).
   - Exports the 27-column Box App Bulk Calculation Template.

3. **PPT to Excel with Images (`ppt-excel`)**
   - Extract slide text, structured tables, and embedded slide images into a customized Excel spreadsheet.
   - Embedded images are inserted directly into workbook cells using ExcelJS.

4. **Image Converter (`convert`)**
   - Batch convert and resize images across JPG, PNG, WEBP, BMP, and TIFF formats.
   - Quality control and dimension preservation with downloadable ZIP package.

5. **Image Organizer (`organize`)**
   - Match and organize product images based on Excel inventory data.
   - Categorize into nested folders, KEEP/DELETE structures, or custom hierarchy levels.

6. **PowerPoint Exporter (`ppt`)**
   - Convert PowerPoint presentations into slide images (JPG, PNG, WEBP).

---

## 🚀 Running Locally on Windows

### 1. Start the Backend API (FastAPI)
```powershell
cd MASTER/webapp/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Start the Frontend (React + Vite)
```powershell
cd MASTER/webapp/frontend
npm install
npm run dev
```

Open the local Vite URL displayed in the terminal (typically `http://localhost:5173`). The frontend automatically proxies `/api` requests to the FastAPI backend at port 8000.

---

## 📋 System Requirements
- **Python**: 3.10+
- **Node.js**: 20+
- **LibreOffice**: Optional, required only for server-side PowerPoint slide conversion (`/api/ppt-export`).
