import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ExcelJS from "exceljs";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Tesseract from "tesseract.js";
import { Images, FolderTree, Presentation, LayoutDashboard, Upload, Download, CheckCircle2, AlertCircle, Menu, X, Sparkles, FileSpreadsheet, Settings, FileText, Trash2, AlertTriangle, LoaderCircle, Files, LockKeyhole, FolderSync, HelpCircle, BookOpen, Building2 } from "lucide-react";
const saveAs = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); };
import "./style.css";
import "./pdf-excel.css";
import "./image-converter.css";
import ImageConverterTool from "./ImageConverterTool";
import ExcelToPptTool from "./ExcelToPptTool";
import PptExcelTool from "./PptExcelTool";
import FileCollectorTool from "./FileCollectorTool";
import BusinessSystemTool from "./BusinessSystemTool";
import UserGuideModal from "./components/UserGuideModal";
import { convertImagesLocally, organizeImagesLocally } from "./services/imageTools";
import { isDesktop, storageAdapter, syncService, updateService, UpdateStatus } from "./services/platform";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerUrl;

const CUSTOMER_NAME = "Noble Art And Craft House";
const IMPORT_HEADERS = ["Customer Name","SO/NO (Sales Orders)","SO Quantities (Multi Qty e.g. 600, 400)","Item Code","Dimension Unit","Length","Width","Height","Ply / Board","Flute Type","Joint (inch)","Deckle Margin (inch)","Flap Type","Overlap Length (inch)","Total Quantity","Wastage %","Setup Cost","Tooling Cost","Printing Required (Yes/No)","Printing / Box","Punching / Box","Lamination / Box","Pasting / Box","Transport / Box","Other / Box","Factory Overhead %","Paper Combo Name"];
const DEFAULTS: Record<string,string|number> = {"Dimension Unit":"inch","Flute Type":"B/C","Joint (inch)":2,"Deckle Margin (inch)":2,"Overlap Length (inch)":1,"Wastage %":6,"Setup Cost":0,"Tooling Cost":0,"Printing Required (Yes/No)":"yes","Printing / Box":0,"Punching / Box":0,"Lamination / Box":0,"Pasting / Box":0,"Transport / Box":0,"Other / Box":0,"Factory Overhead %":5,"Paper Combo Name":"18/140+18/100+18/140+18/100+18/140+18/100+18/140"};
type RowData = {
  SO: string;
  QTY: string;
  ITEM: string;
  boxCode?: string;
  L: string;
  W: string;
  H: string;
  INCH: string;
  PLY: string;
  TYPE: string;
  source: string;
  page?: number;
  description?: string;
  cbm?: string;
  price?: string;
  amount?: string;
  leadingRef?: string;
  format?: string;
  confidence: "high" | "review";
  reviewReasons?: string[];
  [key: string]: any;
};
const blank = (source: string, page = 1): RowData => ({
  SO: "", QTY: "", ITEM: "", boxCode: "", L: "", W: "", H: "", INCH: "inch", PLY: "", TYPE: "",
  source, page, description: "", cbm: "", price: "", amount: "", leadingRef: "",
  format: "Format A (Classic RFQ)", confidence: "review", reviewReasons: ["Empty row"]
});
const getTemplateValues = (r: RowData): Record<string, string | number> => {
  const values: Record<string, string | number> = {
    "Customer Name": CUSTOMER_NAME,
    "SO/NO (Sales Orders)": r["SO/NO (Sales Orders)"] ?? (r.SO ? r.SO.replace(/^SO\//i, "") : ""),
    "SO Quantities (Multi Qty e.g. 600, 400)": r["SO Quantities (Multi Qty e.g. 600, 400)"] ?? r.QTY,
    "Item Code": r["Item Code"] ?? r.ITEM,
    "Dimension Unit": r["Dimension Unit"] ?? r.INCH ?? "inch",
    "Length": r.Length ?? r.L,
    "Width": r.Width ?? r.W,
    "Height": r.Height ?? r.H,
    "Ply / Board": r["Ply / Board"] ?? r.PLY,
    "Flap Type": r["Flap Type"] ?? (/^(DF|SF)$/i.test(r.TYPE) ? r.TYPE.toUpperCase() : ""),
    "Total Quantity": r["Total Quantity"] ?? r.QTY
  };
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (values[key] === undefined || values[key] === null || values[key] === "") values[key] = value;
  }
  for (const h of IMPORT_HEADERS) {
    if (r[h] !== undefined) values[h] = r[h];
  }
  return values;
};
function cleanDesc(raw: string): string {
  const s = raw.trim();
  const words = s.split(/\s+/);
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    if (words.slice(0, half).join(" ") === words.slice(half).join(" ")) {
      return words.slice(0, half).join(" ");
    }
  }
  const mid = Math.floor(s.length / 2);
  if (s.slice(0, mid).trim() === s.slice(mid).trim()) {
    return s.slice(0, mid).trim();
  }
  return s;
}
type PdfPageData = { pageNo: number; text: string };
function parseRfqPages(pagesData: PdfPageData[], filename: string): { rows: RowData[]; format: string } {
  const fullText = pagesData.map(p => p.text).join(" ");
  const normalizedFull = fullText.replace(/\u00a0/g, " ").replace(/[“”]/g, '"').replace(/[×✕]/g, "x").replace(/\s+/g, " ").trim();

  const isFormatB = Boolean(
    normalizedFull.match(/\bProposed\s*Vendor\b/i) ||
    normalizedFull.match(/\bPurchase\s*Type\b/i) ||
    normalizedFull.match(/\bStock\s*Avl\b/i)
  );
  const hasFinalP = Boolean(normalizedFull.match(/\bFinal\s*P\b/i));

  let mSo = normalizedFull.match(/\bSale\s*Order\s*(?:[:=-]\s*)?(SO\s*\/\s*[A-Z0-9-]+)\b/i);
  if (!mSo) mSo = normalizedFull.match(/\b(SO\s*\/\s*\d{6,})\b/i);
  if (!mSo) mSo = normalizedFull.match(/\b(PO\s*\/\s*\d{6,})\b/i);
  if (!mSo) mSo = normalizedFull.match(/\bRequest\s*For\s*Qua?tation\s*#\s*([A-Z0-9\/-]+)\b/i);

  const docSo = mSo ? mSo[1].replace(/\s+/g, "") : "";
  const formatLabel = isFormatB ? "Format B (Alternate RFQ)" : "Format A (Classic RFQ)";

  const rows: RowData[] = [];

  for (const pInfo of pagesData) {
    const pNo = pInfo.pageNo;
    const pText = pInfo.text;
    const normP = pText.replace(/\u00a0/g, " ").replace(/[“”]/g, '"').replace(/[×✕]/g, "x").replace(/\s+/g, " ").trim();

    const matches = [...normP.matchAll(/\[?\s*(Box\s*-\s*\d+[A-Z]?)\s*\]?/gi)];
    if (!matches.length) continue;

    for (let i = 0; i < matches.length; i++) {
      const boxCode = matches[i][1].replace(/\s+/g, "");
      const frm = matches[i].index ?? 0;
      const to = (i + 1 < matches.length) ? (matches[i + 1].index ?? normP.length) : normP.length;
      const chunk = normP.slice(frm, to);

      const preceding = normP.slice(Math.max(0, frm - 60), frm).trim();
      const leadRefM = preceding.match(/([A-Za-z0-9_-]+)\s*$/i);
      const ignoreTokens = /^(?:Description|Remarks|Amount|Price|Date|Qty|IGST|SGST|CGST|Rate|Dimension|Head|Desc|Finish|UoM|Dis|Order|Image)$/i;
      const leadingRef = (leadRefM && !ignoreTokens.test(leadRefM[1])) ? leadRefM[1].trim() : "";

      if (/^(?:Terms\s*&|Special\s*Comment|NOT\s*FOR\s*VENDOR|Noble\s*Art)/i.test(chunk)) {
        continue;
      }

      // 1. Qty
      const qtyM = chunk.match(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:PCS|PC|PIECES)\b/i);
      const qty = qtyM ? qtyM[1].replace(/,/g, "").replace(/\.000$/, "") : "";

      // 2. Item Code
      // Priority 1: Explicit "ITEM: <code>" inside description / chunk
      // Priority 2: Leading Product Code from "Final P." column (e.g. 68478, 68223, 68494B)
      // Priority 3: Fallback to Box Code (e.g. Box-6101)
      let itemCode = "";
      const itemPatternMatch = chunk.match(/\bITEM\s*:\s*([A-Za-z0-9_-]+)/i);
      if (itemPatternMatch && itemPatternMatch[1] && !/^(?:Size|Ref|Price|\d+LBS|PRINTED|V2H2|DF|SF)$/i.test(itemPatternMatch[1])) {
        itemCode = itemPatternMatch[1].trim();
      }
      if (!itemCode && leadingRef) {
        itemCode = leadingRef;
      }
      if (!itemCode) {
        itemCode = boxCode;
      }

      // 3. Ply
      const plyM = chunk.match(/\b([357])\s*[- ]?\s*PLY\b/i);
      const ply = plyM ? plyM[1] : "";

      // 4. Box Type (SF / DF)
      let typeStr = "";
      const suffixType = chunk.match(/\[\s*\d+(?:\.\d+)?\s*\]\s*["']?\s*(DF|SF)\b/i) || chunk.match(/["']\s*(DF|SF)\s*["']/i);
      if (suffixType) {
        typeStr = suffixType[1].toUpperCase();
      } else if (/Triangle\s*Box\s*\(\s*B\s*\)/i.test(chunk)) {
        typeStr = "Triangle Box (B)";
      } else if (/Triangle\s*Box\s*\(\s*C\s*\)/i.test(chunk)) {
        typeStr = "Triangle Box (C)";
      } else if (/Triangle\s*Box/i.test(chunk)) {
        typeStr = "Triangle Box";
      } else if (/\bSF\b/i.test(chunk)) {
        typeStr = "SF";
      } else if (/\bDF\b/i.test(chunk)) {
        typeStr = "DF";
      }

      // 5. Dimensions L, W, H
      let l = "", w = "", h = "";
      const sizeM = chunk.match(/\bSize\s*:\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*["']|\b)/i);
      if (sizeM) {
        l = sizeM[1]; w = sizeM[2]; h = sizeM[3];
      } else {
        const dimM = chunk.match(/\[?\s*Box\s*-\s*\d+[A-Z]?\s*\]?\s*(?:M\s*-\s*)?(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*(?:TOP|MASTER|INNER|DF|SF|["']|\b|$))/i);
        if (dimM) {
          l = dimM[1]; w = dimM[2]; h = dimM[3];
        } else {
          const genM = chunk.match(/(?:^|[^\d.+=-])(?:M\s*-\s*)?(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/i);
          if (genM) {
            l = genM[1]; w = genM[2]; h = genM[3];
          }
        }
      }

      // 6. Description
      const descM = chunk.match(/\[?\s*Box\s*-\s*\d+[A-Z]?\s*\]?\s*([A-Za-z0-9.*() -]+?)(?:\s+(?:[357]-?PLY|\d+PLY|ITEM:|Size:|Ref:|Price|\d+LBS|PRINTED|V2H2))/i);
      const desc = descM ? cleanDesc(descM[1]) : "";

      // 7. CBM
      const cbmM = chunk.match(/\bCBM\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
      const cbm = cbmM ? cbmM[1] : "";

      // 8. Price & Amount
      const priceM = chunk.match(/\b(\d+\.\d{2,3})\s+(?:\d{1,3}(?:,\d{3})*\.\d{2})\s*₹/);
      const amtM = chunk.match(/(\d{1,3}(?:,\d{3})*\.\d{2})\s*₹/);
      const price = priceM ? priceM[1] : "";
      const amt = amtM ? amtM[1] : "";

      // Confidence & review reasons
      const reviewReasons: string[] = [];
      if (!docSo) reviewReasons.push("Missing SO/PO");
      if (!qty) reviewReasons.push("Missing Quantity");
      if (!l || !w || !h) reviewReasons.push("Incomplete Dimensions");
      if (!ply) reviewReasons.push("Missing Ply");
      if (!typeStr) reviewReasons.push("Missing Box Type (SF/DF)");

      const confidence = reviewReasons.length ? "review" : "high";

      rows.push({
        SO: docSo,
        QTY: qty,
        ITEM: itemCode,
        boxCode: boxCode,
        L: l,
        W: w,
        H: h,
        INCH: "inch",
        PLY: ply,
        TYPE: typeStr,
        source: filename,
        page: pNo,
        description: desc,
        cbm,
        price,
        amount: amt,
        leadingRef,
        format: formatLabel,
        confidence,
        reviewReasons
      });
    }
  }

  // Fallback if no Box codes matched
  if (!rows.length) {
    const fallbackChunks = fullText.split(/(?=\b\d+(?:,\d{3})*(?:\.\d+)?\s*PCS\b)/i).filter(Boolean);
    for (const chunk of fallbackChunks) {
      const qtyMatch = chunk.match(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:PCS|PC|PIECES)\b/i);
      const itemMatch = chunk.match(/\bITEM\s*:\s*([A-Z0-9-]+)/i);
      const plyMatch = chunk.match(/\b([357])\s*[- ]?\s*PLY\b/i);
      const sizeMatch = chunk.match(/\bSize\s*:\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
      const allDims = [...chunk.matchAll(/(\d+(?:\.\d+)?)\s*(?:x|\*)\s*(\d+(?:\.\d+)?)\s*(?:x|\*)\s*(\d+(?:\.\d+)?)/ig)];
      let type = "";
      const suffixType = chunk.match(/\[\s*\d+(?:\.\d+)?\s*\]\s*["']?\s*(DF|SF)\b/i) || chunk.match(/["']\s*(DF|SF)\s*["']/i);
      if (suffixType) type = suffixType[1].toUpperCase();
      else if (/Triangle\s*Box\s*\(\s*B\s*\)/i.test(chunk)) type = "Triangle Box (B)";
      else if (/Triangle\s*Box\s*\(\s*C\s*\)/i.test(chunk)) type = "Triangle Box (C)";
      else if (/Triangle\s*Box/i.test(chunk)) type = "Triangle Box";
      else if (/\bSF\b/i.test(chunk)) type = "SF";
      else if (/\bDF\b/i.test(chunk)) type = "DF";

      const dims = sizeMatch || allDims[0];
      const r = blank(filename, 1);
      r.SO = docSo;
      r.QTY = qtyMatch ? qtyMatch[1].replace(/,/g, "").replace(/\.000$/, "") : "";
      r.ITEM = itemMatch ? itemMatch[1].toUpperCase() : "";
      r.L = dims?.[1] || "";
      r.W = dims?.[2] || "";
      r.H = dims?.[3] || "";
      r.INCH = "inch";
      r.PLY = plyMatch ? plyMatch[1] : "";
      r.TYPE = type;
      r.confidence = (r.SO && r.QTY && r.ITEM && r.L && r.W && r.H && r.PLY && r.TYPE) ? "high" : "review";
      if (r.QTY || r.ITEM || r.PLY || r.L) rows.push(r);
    }
  }

  const unique = new Map<string, RowData>();
  rows.forEach(r => unique.set([r.source, r.page || 1, r.SO, r.ITEM, r.boxCode || "", r.QTY, r.L, r.W, r.H, r.PLY, r.TYPE].join("|"), r));
  return { rows: [...unique.values()], format: formatLabel };
}
async function pdfText(file: File, setStatus: (s: string) => void): Promise<{ pages: PdfPageData[]; fullText: string }> {
  const doc = await (pdfjsLib as any).getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: PdfPageData[] = [];
  let all = "";
  for (let p = 1; p <= doc.numPages; p++) {
    setStatus(`${file.name}: reading page ${p} of ${doc.numPages}`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items.map((x: any) => x.str || "").join("\n");
    if (pageText.replace(/\s/g, "").length > 30) {
      pages.push({ pageNo: p, text: pageText });
      all += "\n" + pageText;
    } else {
      setStatus(`${file.name}: OCR page ${p} of ${doc.numPages}`);
      const viewport = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Could not create PDF page canvas.");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const result = await Tesseract.recognize(canvas, "eng");
      pages.push({ pageNo: p, text: result.data.text });
      all += "\n" + result.data.text;
    }
  }
  return { pages, fullText: all };
}
function PdfExcelTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<RowData[]>([]);
  const [detectedFormats, setDetectedFormats] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const reviewCount = useMemo(() => rows.filter(r => r.confidence === "review").length, [rows]);
  const readyCount = useMemo(() => rows.filter(r => r.confidence === "high").length, [rows]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))]);
    setDone(false);
  };

  const convert = async () => {
    if (!files.length) return;
    setBusy(true);
    setRows([]);
    setDone(false);
    try {
      const all: RowData[] = [];
      const formats: Record<string, string> = {};
      for (const file of files) {
        const { pages } = await pdfText(file, setStatus);
        const { rows: parsed, format } = parseRfqPages(pages, file.name);
        formats[file.name] = format;
        if (!parsed.length) {
          all.push({ ...blank(file.name, 1), confidence: "review" });
        } else {
          all.push(...parsed);
        }
      }
      setDetectedFormats(formats);
      setRows(all);
      setDone(true);
      setStatus(`Finished: ${all.length} item rows extracted across ${files.length} document(s).`);

      for (const r of all) {
        storageAdapter.savePoRecord({
          sourceFile: r.source,
          soNumber: r.SO,
          itemCode: r.ITEM,
          qty: r.QTY,
          length: r.L,
          width: r.W,
          height: r.H,
          ply: r.PLY,
          boxType: r.TYPE,
          confidence: r.confidence,
          rawPayload: r
        });
      }
    } catch (e: any) {
      setStatus("Conversion failed: " + (e?.message || "Unknown error"));
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (idx: number, key: string, value: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [key]: value };
      if (key === "Length") updated.L = value;
      if (key === "Width") updated.W = value;
      if (key === "Height") updated.H = value;
      if (key === "Item Code") updated.ITEM = value;
      if (key === "Total Quantity" || key === "SO Quantities (Multi Qty e.g. 600, 400)") updated.QTY = value;
      if (key === "Ply / Board") updated.PLY = value;
      if (key === "Flap Type") updated.TYPE = value;
      if (key === "SO/NO (Sales Orders)") updated.SO = value;

      const reasons: string[] = [];
      if (!updated.SO) reasons.push("Missing SO/PO");
      if (!updated.QTY) reasons.push("Missing Quantity");
      if (!updated.L || !updated.W || !updated.H) reasons.push("Incomplete Dimensions");
      if (!updated.PLY) reasons.push("Missing Ply");
      if (!updated.TYPE) reasons.push("Missing Box Type (SF/DF)");
      updated.reviewReasons = reasons;
      updated.confidence = reasons.length ? "review" : "high";
      return updated;
    }));
  };

  const makeWorkbook = async (data: RowData[], title: string) => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "PDF to Excel Converter";
    const ws = wb.addWorksheet("Bulk Calculation Template");
    ws.addRow([...IMPORT_HEADERS]);
    data.forEach(r => {
      const values = getTemplateValues(r);
      ws.addRow(IMPORT_HEADERS.map(h => values[h] ?? ""));
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "AA" + (data.length + 1) };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2678B8" } };
    ws.getRow(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getRow(1).height = 42;
    [28, 22, 32, 16, 15, 12, 12, 12, 15, 14, 14, 20, 14, 20, 16, 12, 12, 12, 26, 16, 16, 18, 16, 18, 14, 20, 48].forEach((w, i) => ws.getColumn(i + 1).width = w);
    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf]), title);
  };

  const exportSeparate = async () => {
    for (let i = 0; i < files.length; i++) {
      const data = rows.filter(r => r.source === files[i].name);
      if (data.length) await makeWorkbook(data, files[i].name.replace(/\.pdf$/i, "") + ".xlsx");
    }
  };

  return (
    <main className="pdf-shell">
      <section className="pdf-hero">
        <div>
          <p className="pdf-eyebrow">PURCHASE ORDER WORKFLOW</p>
          <h2>Turn PDF purchase orders into the 27-column Excel template.</h2>
          <p>
            Upload multiple quotations (Classic RFQ or Alternate RFQ format), extract SO numbers, quantities, item codes, dimensions, ply and DF/SF type. Review rows before exporting the Box App bulk calculation workbook.
          </p>
        </div>
        <div className="pdf-hero-icon">
          <FileText size={48} />
          <span>PDF → XLSX</span>
        </div>
      </section>

      <section className="pdf-panel">
        <div className="pdf-section-title">
          <div>
            <h3>1. Select PDF files</h3>
            <p>Supports RFQ-6 (Classic) and RFQ-13 (Alternate) layouts, text PDFs and scanned pages (OCR).</p>
          </div>
          <span className="pdf-count">{files.length} selected</span>
        </div>

        <label
          className="pdf-drop"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={e => addFiles(e.target.files)}
          />
          <span className="pdf-upload-icon"><Upload size={25} /></span>
          <strong>Drop PDF files here or browse</strong>
          <small>Multiple PDFs supported · Processed inside this browser</small>
        </label>

        {files.length > 0 && (
          <div className="pdf-files">
            {files.map((f, i) => (
              <div className="pdf-file" key={i}>
                <FileText size={17} />
                <span>{f.name}</span>
                <small>{(f.size / 1024).toFixed(0)} KB</small>
                <button
                  type="button"
                  className="pdf-icon-btn"
                  onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                  aria-label="Remove file"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="pdf-primary"
          disabled={!files.length || busy}
          onClick={convert}
        >
          {busy ? (
            <><LoaderCircle className="pdf-spin" size={17} /> Converting…</>
          ) : (
            <><FileSpreadsheet size={17} /> Convert to Excel</>
          )}
        </button>
        {status && <p className="pdf-status" role="status">{status}</p>}
      </section>

      {rows.length > 0 && (
        <section className="pdf-panel">
          <div className="pdf-section-title">
            <div>
              <h3>2. Review extracted items</h3>
              <p>Verify detected fields, inspect warnings, and edit any of the 27 template columns before exporting.</p>
            </div>
            <span className={"pdf-count " + (reviewCount ? "review" : "complete")}>
              {reviewCount ? `${reviewCount} need review` : "All rows ready to export"}
            </span>
          </div>

          <div className="pdf-summary-bar">
            <div className="pdf-summary-stat">
              <span className="pdf-stat-label">Total Products</span>
              <span className="pdf-stat-val">{rows.length}</span>
            </div>
            <div className="pdf-summary-stat">
              <span className="pdf-stat-label">Ready to Export</span>
              <span className="pdf-stat-val success">{readyCount}</span>
            </div>
            <div className="pdf-summary-stat">
              <span className="pdf-stat-label">Needs Review</span>
              <span className={"pdf-stat-val " + (reviewCount > 0 ? "warning" : "success")}>{reviewCount}</span>
            </div>
            <div className="pdf-summary-stat">
              <span className="pdf-stat-label">Layout Detected</span>
              <span className="pdf-stat-val format-info" title={Object.entries(detectedFormats).map(([f, fmt]) => `${f}: ${fmt}`).join("\n")}>
                {Object.entries(detectedFormats).map(([f, fmt]) => `${f.length > 18 ? f.slice(0, 15) + '...' : f}: ${fmt.replace(/ \([^)]+\)/, '')}`).join(" | ") || "Auto-detected"}
              </span>
            </div>
          </div>

          <div className="pdf-notice">
            <AlertTriangle size={17} />
            <span>
              Review each product row below. Source descriptions and detected page references are displayed alongside the 27 calculation template columns.
            </span>
          </div>

          <div className="pdf-table-wrap">
            <table className="pdf-table">
              <thead>
                <tr>
                  <th style={{ minWidth: "120px" }}>Source &amp; Page</th>
                  <th style={{ minWidth: "180px" }}>Source Description</th>
                  {IMPORT_HEADERS.map(h => (
                    <th key={h}>{h}</th>
                  ))}
                  <th>CHECK</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const vals = getTemplateValues(r);
                  return (
                    <tr key={i} className={r.confidence === "review" ? "pdf-needs-review" : ""}>
                      <td className="pdf-meta-cell" title={r.source}>
                        {r.source.length > 20 ? r.source.slice(0, 18) + "…" : r.source} (p.{r.page || 1})
                      </td>
                      <td className="pdf-desc-cell" title={r.description}>
                        {r.boxCode && r.boxCode !== r.ITEM ? (
                          <span style={{ marginRight: 6, fontWeight: 700, color: "#38bdf8", background: "rgba(56, 189, 248, 0.15)", padding: "2px 6px", borderRadius: 4, display: "inline-block", fontSize: 11 }}>
                            {r.boxCode}
                          </span>
                        ) : null}
                        {r.description || "-"}
                      </td>
                      {IMPORT_HEADERS.map(h => (
                        <td key={h}>
                          <input
                            value={String(vals[h] ?? "")}
                            onChange={e => updateRow(i, h, e.target.value)}
                            aria-label={`${h} row ${i + 1}`}
                          />
                        </td>
                      ))}
                      <td>
                        {r.confidence === "review" ? (
                          <span
                            className="pdf-review-tag"
                            title={r.reviewReasons?.join(", ") || "Review needed"}
                          >
                            Review
                          </span>
                        ) : (
                          <span className="pdf-good-tag">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pdf-export-row">
            <button
              type="button"
              className="pdf-secondary"
              onClick={() => makeWorkbook(rows, "Combined_Quotation_Items.xlsx")}
            >
              <Download size={16} /> Export combined template
            </button>
            <button
              type="button"
              className="pdf-primary"
              onClick={exportSeparate}
            >
              <Files size={16} /> Export separate Excel files
            </button>
          </div>
        </section>
      )}

      <footer className="pdf-footer">
        Exports the exact 27-column Box App Bulk Calculation Template. <span>Always verify extracted values before use.</span>
      </footer>
    </main>
  );
}

const tools = [{id:"dashboard",name:"Overview",icon:LayoutDashboard},{id:"business-system",name:"Business System (ERP)",icon:Building2},{id:"collector",name:"File Collector",icon:FolderSync},{id:"convert",name:"Image Converter",icon:Images},{id:"organize",name:"Image Organizer",icon:FolderTree},{id:"ppt",name:"PowerPoint Exporter",icon:Presentation},{id:"pdf-excel",name:"PO PDF to Excel",icon:FileSpreadsheet},{id:"excel-ppt",name:"Excel to Catalogue PPT",icon:Presentation},{id:"ppt-excel",name:"PPT to Excel with Images",icon:Presentation}];
function App(){
 const [page,setPage]=useState("dashboard"),[mobile,setMobile]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(null);
 const [isOnline,setIsOnline]=useState(typeof navigator!=="undefined"?navigator.onLine:true);
 const [showSettingsModal,setShowSettingsModal]=useState(false);
 const [showGuideModal,setShowGuideModal]=useState(false);
 const [dbStats,setDbStats]=useState<any>(null);
 const [updateState,setUpdateState]=useState<UpdateStatus|null>(null);
 const [isCheckingUpdate,setIsCheckingUpdate]=useState(false);

 React.useEffect(()=>{
   const onOn=()=>setIsOnline(true), onOff=()=>setIsOnline(false);
   window.addEventListener("online",onOn);
   window.addEventListener("offline",onOff);
   updateService.getStatus().then(setUpdateState);
   const unsub=updateService.onStatusChange(s=>setUpdateState(s));
   return ()=>{
     window.removeEventListener("online",onOn);
     window.removeEventListener("offline",onOff);
     unsub();
   };
 },[]);
 const openSettings=async()=>{
   const stats=await storageAdapter.getStats();
   setDbStats(stats);
   const u=await updateService.getStatus();
   setUpdateState(u);
   setShowSettingsModal(true);
 };
 const handleCheckForUpdates=async()=>{
   setIsCheckingUpdate(true);
   const res=await updateService.checkForUpdates();
   setIsCheckingUpdate(false);
   const updated=await updateService.getStatus();
   setUpdateState(updated);
   if(updated.status==="available"){
     setNotice({type:"success",text:`Update v${updated.latestVersion} is available! Click Download Update in Settings.`});
   }else if(updated.status==="not-available"){
     setNotice({type:"success",text:"Loveneet Suite is completely up to date!"});
   }else if(updated.status==="error"){
     setNotice({type:"error",text:`Update check error: ${updated.error||"Could not connect to release server"}`});
   }
 };
 const handleDownloadUpdate=async()=>{
   const res=await updateService.downloadUpdate();
   if(!res.success&&res.error){
     setNotice({type:"error",text:`Download failed: ${res.error}`});
   }
 };
 const handleInstallAndRestart=()=>{
   if(window.confirm("Loveneet Suite will restart to finish installing this update. Are you ready to proceed?")){
     updateService.quitAndInstall();
   }
 };
 const handleBackup=async()=>{
   const res=await storageAdapter.backupDatabase();
   if(res.success){ setNotice({type:"success",text:"Database backup saved successfully!"}); }
 };
 const handleRestore=async()=>{
   const res=await storageAdapter.restoreDatabase();
   if(res.success){
     const stats=await storageAdapter.getStats();
     setDbStats(stats);
     setNotice({type:"success",text:"Database restored successfully!"});
   }
 };
 const [images,setImages]=useState([]),[format,setFormat]=useState("jpg"),[quality,setQuality]=useState(90),[width,setWidth]=useState(""),[height,setHeight]=useState("");
 const [excel,setExcel]=useState([]),[archive,setArchive]=useState([]),[mode,setMode]=useState("2");
 const [ppts,setPpts]=useState([]),[jpg,setJpg]=useState(true),[png,setPng]=useState(false),[webp,setWebp]=useState(true),[pq,setPq]=useState(95);
 const active=tools.find(t=>t.id===page)||tools[0];
 function picker(label,accept,multiple,files,onChange,hint){return <label className="dropzone"><input type="file" accept={accept} multiple={multiple} onChange={e=>onChange(Array.from(e.target.files||[]))}/><span className="upload-icon"><Upload size={20}/></span><strong>{label}</strong><span className="muted">{files.length?files.map(f=>f.name).join(" · "):"Click to browse your device"}</span><small>{hint}</small></label>}
 function field(label,child){return <label className="field"><span>{label}</span>{child}</label>}
 async function run(path,data,filename){setBusy(true);setNotice(null);try{const res=await fetch(path,{method:"POST",body:data});if(!res.ok){let msg="Request failed ("+res.status+")";try{msg=(await res.json()).detail||msg}catch{}throw Error(msg)}const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice({type:"success",text:"Finished. Your ZIP download has started."})}catch(e){setNotice({type:"error",text:e.message||"Request failed"})}finally{setBusy(false)}}
 async function convert(e: any){
    e.preventDefault();
    if(!images.length) return setNotice({type:"error",text:"Choose at least one image."});
    if(Boolean(width)!==Boolean(height)) return setNotice({type:"error",text:"Enter both resize dimensions or leave both empty."});
    setBusy(true);
    setNotice(null);
    try {
      const zipBlob = await convertImagesLocally(
        images,
        format,
        quality,
        width ? parseInt(width, 10) : undefined,
        height ? parseInt(height, 10) : undefined
      );
      saveAs(zipBlob, "converted_images.zip");
      setNotice({type:"success", text:`Finished! Converted ${images.length} image(s) to ${format.toUpperCase()}. ZIP download started.`});
    } catch(err: any) {
      setNotice({type:"error", text: err.message || "Failed to convert images."});
    } finally {
      setBusy(false);
    }
  }
 async function organize(e: any){
    e.preventDefault();
    if(!excel[0]||!archive[0]) return setNotice({type:"error",text:"Choose an Excel workbook and an images ZIP archive."});
    setBusy(true);
    setNotice(null);
    try {
      const zipBlob = await organizeImagesLocally(excel[0], archive[0], mode);
      saveAs(zipBlob, "organized_images.zip");
      setNotice({type:"success", text:"Finished! Your organized images ZIP has been generated and download started."});
    } catch(err: any) {
      setNotice({type:"error", text: err.message || "Failed to organize images."});
    } finally {
      setBusy(false);
    }
  }
 function exportPpt(e){e.preventDefault();if(!ppts.length)return setNotice({type:"error",text:"Choose at least one PowerPoint file."});const d=new FormData();ppts.forEach(f=>d.append("files",f));d.append("export_jpg",String(jpg));d.append("export_png",String(png));d.append("export_webp",String(webp));d.append("quality",String(pq));run("/api/ppt-export",d,"powerpoint_exports.zip")}
 function nav(id){setPage(id);setMobile(false);setNotice(null)}
 return <div className="app-shell">{mobile&&<button className="scrim" onClick={()=>setMobile(false)}/>}<aside className={"sidebar "+(mobile?"open":"")}><div className="brand"><div className="brand-mark">L<span>.</span></div><div><strong>LOVENEET</strong><small>BUSINESS SUITE</small></div><button className="mobile-close" onClick={()=>setMobile(false)}><X size={18}/></button></div><div className="nav-label">WORKSPACE</div><nav>{tools.map(t=><button key={t.id} className={"nav-item "+(page===t.id?"active":"")} onClick={()=>nav(t.id)}><t.icon size={18}/><span>{t.name}</span></button>)}</nav><div className="sidebar-bottom"><div className="secure-note"><Sparkles size={16}/><div><strong>Made for your workflow</strong><small>Web edition · local server</small></div></div><button className="nav-item" onClick={()=>setShowGuideModal(true)}><BookOpen size={18}/><span>How to Use (Guide)</span></button>
<button className="nav-item" onClick={openSettings}><Settings size={18}/><span>Settings & Database</span></button><div className="version">WEB EDITION · 1.1</div></div></aside>
 <main className="main-area"><header className="topbar"><button className="mobile-menu" onClick={()=>setMobile(true)}><Menu size={20}/></button><div className="breadcrumb">Loveneet Suite <span>/</span> <strong>{active.name}</strong></div>{isDesktop() ? (
  <div className={"top-status " + (isOnline ? "online" : "offline")}>
    <span className={"status-dot " + (isOnline ? "online" : "offline")}/>
    {isOnline ? "Desktop · Online" : "Desktop · Offline (Local Mode)"}
  </div>
) : (
  <div className={"top-status " + (isOnline ? "" : "offline")}>
    <span className={"status-dot " + (isOnline ? "" : "offline")}/>
    {isOnline ? "Web workspace" : "Web (Offline)"}
  </div>
)}</header><div className="page-wrap"><div className="page-heading"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>{page==="dashboard"?"Good work starts here.":active.name}</h1><p>{page==="dashboard"?"Your product, purchasing and presentation tools, together in one place.":"Upload files, choose settings, and download your results."}</p></div><div style={{display:"flex",alignItems:"center",gap:10}}><button type="button" className="help-guide-btn" onClick={()=>setShowGuideModal(true)} title="How to Use & Documentation"><HelpCircle size={16}/><span>How to Use</span></button><div className="heading-mark"><Sparkles size={22}/></div></div></div>
 {notice&&<div className={"notice "+notice.type}><span>{notice.type==="success"?<CheckCircle2 size={19}/>:<AlertCircle size={19}/>}</span><p>{notice.text}</p><button onClick={()=>setNotice(null)}><X size={16}/></button></div>}
 {isDesktop() && (updateState?.status === "available" || updateState?.status === "downloaded") && (
   <div className="notice info" style={{background:"#1e1b4b",border:"1px solid #4338ca",display:"flex",alignItems:"center",gap:10}}>
     <Sparkles size={18} color="#818cf8"/>
     <p style={{margin:0,flex:1}}>
       {updateState.status === "available"
         ? `A new desktop version (v${updateState.latestVersion}) is available!`
         : `Update v${updateState.latestVersion} has been downloaded and is ready to install.`}
     </p>
     {updateState.status === "available" ? (
       <button type="button" className="collector-btn-primary" style={{padding:"4px 10px",fontSize:12}} onClick={openSettings}>View in Settings</button>
     ) : (
       <button type="button" className="collector-btn-primary" style={{padding:"4px 10px",fontSize:12,background:"#16a34a"}} onClick={handleInstallAndRestart}>Restart & Update</button>
     )}
   </div>
 )}
 {page==="pdf-excel"&&<PdfExcelTool/>}{page==="excel-ppt"&&<ExcelToPptTool/>}{page==="ppt-excel"&&<PptExcelTool/>}{page==="collector"&&<FileCollectorTool/>}{page==="business-system"&&<BusinessSystemTool/>}
 {page==="dashboard"&&<><section className="welcome-card"><div><div className="welcome-pill"><span className="status-dot"/> WORKSPACE READY</div><h2>From product files<br/>to <em>presentation-ready.</em></h2><p>Choose a tool to start. Files upload only when you run a task.</p><button className="primary-btn" onClick={()=>nav("convert")}>Convert images <Images size={17}/></button></div><div className="art-orbit"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-core"><Images size={42}/></div><div className="float-chip chip-one"><FileSpreadsheet size={17}/></div><div className="float-chip chip-two"><Presentation size={17}/></div><div className="float-chip chip-three"><FolderTree size={17}/></div></div></section><div className="section-head"><div><h2>Tools</h2><p>Choose a workflow to get started</p></div><span className="tool-count">08 TOOLS</span></div><section className="tool-grid">{tools.filter(t=>t.id!=="dashboard").map((t,i)=><button className="tool-card" key={t.id} onClick={()=>nav(t.id)}><div className={"tool-icon tone-"+(i%3)}><t.icon size={22}/></div><span className="card-arrow">↗</span><h3>{t.name}</h3><p>{({"business-system":"Multi-company ERP, dynamic matrix dashboard, dispatches & automated backups","convert":"Batch convert and resize product images","organize":"Organize images using Excel product data","ppt":"Export presentation slides as images","pdf-excel":"Extract purchase-order and quotation rows into a 27-column Excel template","excel-ppt":"Generate product catalogue slides from Excel data and embedded images","ppt-excel":"Extract presentation text, tables and images into a custom Excel workbook","collector":"Flatten nested folders and collect files with subfolder prefix naming"} as Record<string,string>)[t.id]}</p><span className="open-tool">Open tool →</span></button>)}</section><div className="privacy-foot"><span><CheckCircle2 size={16}/> PDF extraction runs locally in your browser</span><span>LOVENEET SUITE</span></div></>}
 {page==="convert"&&<ImageConverterTool/>}
 {page==="organize"&&<form className="workspace-grid" onSubmit={organize}><section className="panel"><div className="panel-title"><span className="step">01</span><div><h2>Product spreadsheet</h2><p>Upload your Excel product data and image paths.</p></div></div>{picker("Choose Excel workbook",".xlsx,.xlsm",false,excel,setExcel,"XLSX or XLSM")}</section><section className="panel"><div className="panel-title"><span className="step">02</span><div><h2>Source images archive</h2><p>Zip your source image folder before uploading.</p></div></div>{picker("Choose images ZIP",".zip,application/zip",false,archive,setArchive,"Image filenames must match paths in Excel")}</section><section className="panel full-panel"><div className="panel-title"><span className="step">03</span><div><h2>Folder structure</h2><p>Select the sorting strategy.</p></div></div><div className="mode-options">{[["1","Nested folders","Use Excel columns G to Q."],["2","KEEP / DELETE + collection","Sort into KEEP or DELETE, then collection."],["3","KEEP / DELETE + custom levels","Sort into KEEP or DELETE, then column H."]].map(m=><label key={m[0]} className={"mode-option "+(mode===m[0]?"selected":"")}><input type="radio" value={m[0]} checked={mode===m[0]} onChange={e=>setMode(e.target.value)}/><span className="radio-dot"/><span><strong>{m[1]}</strong><small>{m[2]}</small></span></label>)}</div><div className="hint-box">This first migration uses the desktop app’s default Excel column mapping. Images are copied into folders and packaged for download; originals are not deleted.</div></section><div className="action-bar"><span>Output is a downloadable ZIP</span><button className="primary-btn" disabled={busy}>{busy?"Organizing…":"Organize & download ZIP"} <Download size={17}/></button></div></form>}
 {page==="ppt"&&<form className="workspace-grid" onSubmit={exportPpt}><section className="panel"><div className="panel-title"><span className="step">01</span><div><h2>Choose presentations</h2><p>Upload PowerPoint files.</p></div></div>{picker("Choose PowerPoint files",".ppt,.pptx",true,ppts,setPpts,"PPT / PPTX · LibreOffice required on server")}</section><section className="panel"><div className="panel-title"><span className="step">02</span><div><h2>Export formats</h2><p>Select output formats.</p></div></div><div className="check-options"><label><input type="checkbox" checked={jpg} onChange={e=>setJpg(e.target.checked)}/> High-quality JPG</label><label><input type="checkbox" checked={png} onChange={e=>setPng(e.target.checked)}/> PNG</label><label><input type="checkbox" checked={webp} onChange={e=>setWebp(e.target.checked)}/> WEBP</label></div>{field("WEBP quality",<div className="range-line"><input type="range" min="10" max="100" value={pq} onChange={e=>setPq(+e.target.value)}/><strong>{pq}%</strong></div>)}<div className="hint-box">Slide rendering runs on the server using LibreOffice and PyMuPDF. Text before a “|” may be used as a filename.</div></section><div className="action-bar"><span>{ppts.length} presentation(s) selected</span><button className="primary-btn" disabled={busy}>{busy?"Exporting…":"Export slides & download ZIP"} <Download size={17}/></button></div></form>}
 <footer className="footer">
  <span>Loveneet Suite · {isDesktop() ? "Windows Desktop Edition" : "Web Edition"}</span>
  <span>Built for product workflows · Offline-first</span>
</footer>
{showSettingsModal && (
  <div className="collector-modal-backdrop" onClick={()=>setShowSettingsModal(false)}>
    <div className="collector-modal" style={{maxWidth:540}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h3><Settings size={20} color="#38bdf8"/> Application Settings & Local Database</h3>
        <button type="button" onClick={()=>setShowSettingsModal(false)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer"}}><X size={18}/></button>
      </div>
      <div style={{fontSize:13,color:"#cbd5e1",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:"#141e33",border:"1px solid #1e293b",borderRadius:8,padding:12}}>
          <strong>Platform Runtime:</strong> {isDesktop() ? "Windows Desktop Application (Electron + SQLite)" : "Web Browser (Vercel)"}
          <br/>
          <strong>Connectivity Status:</strong> {isOnline ? "Online — Connected" : "Offline — Local Mode"}
        </div>
        {dbStats && (
          <div style={{background:"#141e33",border:"1px solid #1e293b",borderRadius:8,padding:12}}>
            <strong>Local SQLite Database:</strong>
            <div style={{fontSize:11.5,color:"#94a3b8",fontFamily:"monospace",marginTop:4,wordBreak:"break-all"}}>
              {dbStats.path || dbStats.storageType}
            </div>
            {dbStats.tables && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:8,fontSize:12}}>
                {Object.entries(dbStats.tables).map(([t,c])=>(
                  <div key={t} style={{color:"#94a3b8"}}>• {t}: <strong style={{color:"#f8fafc"}}>{String(c)}</strong></div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{background:"#141e33",border:"1px solid #1e293b",borderRadius:8,padding:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <strong><Sparkles size={16} color="#38bdf8"/> Desktop Software Updates</strong>
            <span style={{fontSize:11,color:"#94a3b8"}}>
              {isDesktop() ? `Desktop v${updateState?.currentVersion || "1.1.0"}` : "Web v1.1.0"}
            </span>
          </div>

          {!isOnline && (
            <div style={{background:"#2e1065",color:"#e9d5ff",padding:"6px 10px",borderRadius:6,fontSize:12,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <AlertCircle size={14}/> Offline — Connect to internet to check for software updates.
            </div>
          )}

          <div style={{fontSize:12,color:"#cbd5e1",display:"flex",flexDirection:"column",gap:3,marginBottom:10}}>
            <div>Current Version: <strong>{updateState?.currentVersion || "1.1.0"}</strong></div>
            <div>Latest Release: <strong style={{color:updateState?.status==="available"?"#38bdf8":"#f8fafc"}}>{updateState?.latestVersion ? `v${updateState.latestVersion}` : "Up to date"}</strong></div>
            {updateState?.lastChecked && (
              <div style={{fontSize:11,color:"#94a3b8"}}>
                Last checked: {new Date(updateState.lastChecked).toLocaleTimeString()}
              </div>
            )}
          </div>

          {updateState?.status === "downloading" && updateState.progress && (
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#94a3b8",marginBottom:4}}>
                <span>Downloading update: {updateState.progress.percent}%</span>
                <span>{Math.round((updateState.progress.transferred || 0)/(1024*1024))}MB / {Math.round((updateState.progress.total || 0)/(1024*1024))}MB</span>
              </div>
              <div style={{width:"100%",height:6,background:"#0f172a",borderRadius:3,overflow:"hidden"}}>
                <div style={{width:`${updateState.progress.percent}%`,height:"100%",background:"#38bdf8",transition:"width 0.3s"}}/>
              </div>
            </div>
          )}

          {updateState?.status === "error" && (
            <div style={{background:"#450a0a",color:"#fca5a5",padding:"6px 10px",borderRadius:6,fontSize:12,marginBottom:8}}>
              Update status: {updateState.error}
            </div>
          )}

          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:4}}>
            {isDesktop() ? (
              <>
                {updateState?.status === "available" && (
                  <button type="button" className="collector-btn-primary" onClick={handleDownloadUpdate}>
                    <Download size={14}/> Download Update v{updateState.latestVersion}
                  </button>
                )}
                {updateState?.status === "downloaded" && (
                  <button type="button" className="collector-btn-primary" style={{background:"#16a34a"}} onClick={handleInstallAndRestart}>
                    <RefreshCw size={14}/> Install & Restart App
                  </button>
                )}
                {(updateState?.status === "idle" || updateState?.status === "not-available" || updateState?.status === "error") && (
                  <button type="button" className="collector-btn-secondary" disabled={isCheckingUpdate || !isOnline} onClick={handleCheckForUpdates}>
                    <RefreshCw size={14} className={isCheckingUpdate ? "spin" : ""}/> {isCheckingUpdate ? "Checking..." : "Check for Updates"}
                  </button>
                )}
                {updateState?.status === "error" && (
                  <button type="button" className="collector-btn-secondary" onClick={handleCheckForUpdates}>
                    Retry
                  </button>
                )}
              </>
            ) : (
              <div style={{fontSize:12,color:"#94a3b8"}}>
                Web version is automatically continuously updated on Vercel.
              </div>
            )}
            <a
              href="https://github.com/loveneeta/LoveneetSuite/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              style={{fontSize:11.5,color:"#38bdf8",textDecoration:"none",marginLeft:"auto"}}
            >
              Manual Download ↗
            </a>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:6}}>
          {isDesktop() && (
            <>
              <button type="button" className="collector-btn-secondary" onClick={handleBackup}><Download size={15}/> Backup Database</button>
              <button type="button" className="collector-btn-secondary" onClick={handleRestore}><Upload size={15}/> Restore Database</button>
            </>
          )}
          <button type="button" className="collector-btn-primary" style={{marginLeft:"auto"}} onClick={()=>setShowSettingsModal(false)}>Close</button>
        </div>
      </div>
    </div>
  </div>
)}
<UserGuideModal isOpen={showGuideModal} onClose={()=>setShowGuideModal(false)} initialToolId={page}/>
</div></main></div>
}
createRoot(document.getElementById("root")).render(<App/>);
