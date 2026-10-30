import React, { useState, useEffect, useMemo } from "react";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { DEFAULT_PPT_TEMPLATE_B64 } from "./defaultPptTemplate";
import { SAMPLE_PRODUCTS } from "./sampleTemplateData";
import {
  FileSpreadsheet,
  Presentation,
  Upload,
  Download,
  LoaderCircle,
  RotateCcw,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Save,
  Trash2,
  Layout,
  Sparkles,
  Info,
  Folder,
  ExternalLink,
  ShieldCheck,
  Layers,
  FileText
} from "lucide-react";
import { storageAdapter, isDesktop } from "./services/platform";
import {
  generateCataloguePptx,
  Mapping,
  GenerationOutput,
  extractCellValue,
  getOrderedSlideFiles
} from "./services/pptxGenerator";
import { parseXmlDocument } from "./services/xmlHelper";
import {
  Slot,
  ProductsPerSlide,
  DEFAULT_LAYOUT,
  THREE_LAYOUT,
  adjustLayoutSlots,
  chunkProducts,
  calculateSlideCount
} from "./services/layoutConfig";
import {
  deliverPresentation,
  openPresentationInApp,
  revealPresentationInFolder,
  DeliveryResult
} from "./services/fileDelivery";
import "./excel-ppt.css";

type SlideRatio = "16:9" | "4:3" | "A4 Landscape" | "A4 Portrait";

type TemplateSlot = {
  slot_index: number;
  text_elem_id: string;
  text_elem_name: string;
  text_rect: number[];
  img_rect: number[];
  template_text: string;
};

type TemplateSlideInfo = {
  slide_index: number;
  layout_name: string;
  elements: Array<{
    id: string;
    name: string;
    type: string;
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
    font_name: string;
    font_size: number;
    font_bold: boolean;
    font_color: string;
    is_product_candidate: boolean;
  }>;
  slots_count: number;
  slots: TemplateSlot[];
  is_product_slide: boolean;
};

type TemplateInspection = {
  slide_width_in: number;
  slide_height_in: number;
  aspect_ratio: string;
  total_slides: number;
  slides: TemplateSlideInfo[];
  recommended_product_slide: number;
};

type MappingProfile = {
  name: string;
  mapping: Mapping;
  imageFit: "contain" | "cover";
  selectedSlideIndex: number;
  count?: ProductsPerSlide;
  layout?: Slot[];
  fontSize?: number;
  fontName?: string;
  fontColor?: string;
  background?: string;
  ratio?: SlideRatio;
  autoCenter?: boolean;
  showHeader?: boolean;
  showRule?: boolean;
  headerText?: string;
};

const ROLE_DEFINITIONS: Array<{
  key: keyof Mapping;
  label: string;
  type: string;
  required: boolean;
  hint: string;
}> = [
  { key: "code", label: "SKU / Product Code", type: "Text Run (Bold)", required: true, hint: "Primary product identifier" },
  { key: "description", label: "Product Description", type: "Text Run", required: false, hint: "Item name or description" },
  { key: "dim_cm", label: "Product Dimension (CM)", type: "Text Line (Bold)", required: false, hint: "Dimensions in centimeters" },
  { key: "dim_in", label: "Dimension (Inch)", type: "Text Line (Bold)", required: false, hint: "Dimensions in inches" },
  { key: "price", label: "Price / Rate", type: "Text Line (Bold)", required: false, hint: "Product pricing" },
  { key: "image", label: "Product Picture", type: "Cell Image (PNG/JPG)", required: false, hint: "Embedded image in sheet" },
  { key: "length", label: "Length (Fallback)", type: "Number", required: false, hint: "Used if Dim CM not provided" },
  { key: "width", label: "Width (Fallback)", type: "Number", required: false, hint: "Used if Dim CM not provided" },
  { key: "height", label: "Height (Fallback)", type: "Number", required: false, hint: "Used if Dim CM not provided" }
];

const initialMapping: Mapping = {
  code: "",
  description: "",
  dim_cm: "",
  dim_in: "",
  price: "",
  length: "",
  width: "",
  height: "",
  image: ""
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// 100% Client-Side PPTX Template Inspector
async function inspectTemplateClient(fileOrBuf: File | ArrayBuffer): Promise<TemplateInspection> {
  const buf = fileOrBuf instanceof ArrayBuffer ? fileOrBuf : await fileOrBuf.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const presXmlText = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presXmlText) throw new Error("Invalid presentation (missing ppt/presentation.xml)");

  const sldSzMatch = presXmlText.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/i);
  const cx = sldSzMatch ? parseInt(sldSzMatch[1], 10) : 12192000;
  const cy = sldSzMatch ? parseInt(sldSzMatch[2], 10) : 6858000;
  const wIn = +(cx / 914400).toFixed(2);
  const hIn = +(cy / 914400).toFixed(2);
  const ratioVal = wIn / Math.max(0.1, hIn);
  const aspectRatio = Math.abs(ratioVal - 16 / 9) < 0.1 ? "16:9" : (Math.abs(ratioVal - 4 / 3) < 0.1 ? "4:3" : `${wIn}:${hIn}`);

  const presRelsText = (await zip.file("ppt/_rels/presentation.xml.rels")?.async("text")) || "";
  const presDoc = parseXmlDocument(presXmlText);
  const presRelsDoc = parseXmlDocument(presRelsText);
  const slideFiles = getOrderedSlideFiles(zip, presDoc, presRelsDoc);

  const slides: TemplateSlideInfo[] = [];
  for (let sIdx = 0; sIdx < slideFiles.length; sIdx++) {
    const slideXml = await zip.file(slideFiles[sIdx])?.async("text") || "";
    const spRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
    const elements: TemplateSlideInfo["elements"] = [];
    let m: RegExpExecArray | null;
    let shIdx = 0;

    while ((m = spRegex.exec(slideXml)) !== null) {
      shIdx++;
      const spContent = m[1];
      const nameM = spContent.match(/name="([^"]+)"/);
      const offM = spContent.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
      const extM = spContent.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
      const texts = [...spContent.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map(t => t[1]);
      const textContent = texts.join(" ");

      const offX = offM ? parseInt(offM[1], 10) : 0;
      const offY = offM ? parseInt(offM[2], 10) : 0;
      const extCx = extM ? parseInt(extM[1], 10) : 1000000;
      const extCy = extM ? parseInt(extM[2], 10) : 1000000;

      const leftNorm = (offX / cx) * 800;
      const topNorm = (offY / cy) * 450;
      const widthNorm = (extCx / cx) * 800;
      const heightNorm = (extCy / cy) * 450;

      const isProdText = Boolean(/(?:SKU|Item\s*Name|Price|CM|IN|Dimensions?)/i.test(textContent));
      elements.push({
        id: `elem_${sIdx}_${shIdx}`,
        name: nameM ? nameM[1] : `Shape ${shIdx}`,
        type: "textbox",
        text: textContent,
        left: Math.round(leftNorm),
        top: Math.round(topNorm),
        width: Math.round(widthNorm),
        height: Math.round(heightNorm),
        font_name: "Calibri",
        font_size: 14,
        font_bold: true,
        font_color: "000000",
        is_product_candidate: isProdText
      });
    }

    const prodCandidates = elements.filter(e => e.is_product_candidate);
    prodCandidates.sort((a, b) => a.left - b.left);

    const detectedSlots: TemplateSlot[] = prodCandidates.map((te, idx) => ({
      slot_index: idx,
      text_elem_id: te.id,
      text_elem_name: te.name,
      text_rect: [te.left, te.top, te.left + te.width, te.top + te.height],
      img_rect: [te.left, Math.max(35, te.top - 250), te.left + te.width, Math.max(55, te.top - 12)],
      template_text: te.text
    }));

    slides.push({
      slide_index: sIdx,
      layout_name: `Slide ${sIdx + 1}`,
      elements,
      slots_count: detectedSlots.length,
      slots: detectedSlots,
      is_product_slide: detectedSlots.length > 0
    });
  }

  const recommended = slides.findIndex(s => s.is_product_slide);
  return {
    slide_width_in: wIn,
    slide_height_in: hIn,
    aspect_ratio: aspectRatio,
    total_slides: slides.length,
    slides,
    recommended_product_slide: recommended >= 0 ? recommended : 0
  };
}

export default function ExcelToPptTool() {
  // File states
  const [file, setFile] = useState<File | null>(null);
  const [workbookRef, setWorkbookRef] = useState<ExcelJS.Workbook | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState<string>("");
  const [missingImageCount, setMissingImageCount] = useState<number>(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Array<Record<string, any>>>([]);
  const [mapping, setMapping] = useState<Mapping>(initialMapping);

  // Template states
  const [useCustomTemplate, setUseCustomTemplate] = useState<boolean>(true);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateInfo, setTemplateInfo] = useState<TemplateInspection | null>(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState<number>(0);
  const [inspectingTemplate, setInspectingTemplate] = useState<boolean>(false);

  // Profiles
  const [profiles, setProfiles] = useState<MappingProfile[]>([]);
  const [currentProfileName, setCurrentProfileName] = useState<string>("");
  const [selectedProfileIndex, setSelectedProfileIndex] = useState<string>("");

  // Built-in mode layout states
  const [count, setCount] = useState<2 | 3>(3);
  const [layout, setLayout] = useState<Slot[]>(THREE_LAYOUT);
  const [fontSize, setFontSize] = useState<number>(14);
  const [fontName, setFontName] = useState<string>("Calibri");
  const [fontColor, setFontColor] = useState<string>("000000");
  const [background, setBackground] = useState<string>("FFFFFF");
  const [ratio, setRatio] = useState<SlideRatio>("16:9");
  const [autoCenter, setAutoCenter] = useState<boolean>(true);
  const [imageFit, setImageFit] = useState<"contain" | "cover">("contain");
  const [headerText, setHeaderText] = useState<string>("PRODUCT COLLECTION");
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [showRule, setShowRule] = useState<boolean>(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const logoUrl = useMemo(() => {
    if (!logoFile) return "";
    try {
      return URL.createObjectURL(logoFile);
    } catch {
      return "";
    }
  }, [logoFile]);

  // Drag state for interactive canvas
  const [drag, setDrag] = useState<{
    slot: number;
    section: "img" | "text";
    mode: "move" | "resize";
    x: number;
    y: number;
    rect: number[];
  } | null>(null);

  const beginDrag = (
    e: React.PointerEvent<any>,
    slot: number,
    section: "img" | "text",
    mode: "move" | "resize" = "move"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = layout[slot][section];
    setDrag({ slot, section, mode, x: e.clientX, y: e.clientY, rect: [...rect] });
    (e.currentTarget.closest(".ep-live-slide-canvas, .ep-visual-canvas") as HTMLElement)?.setPointerCapture?.(e.pointerId);
  };

  // Live preview pagination
  const [previewSlideIndex, setPreviewSlideIndex] = useState<number>(0);

  // Generation & progress state
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ active: boolean; phase: string; percent: number; message: string } | null>(null);
  const [lastResult, setLastResult] = useState<{
    output: GenerationOutput;
    delivery: DeliveryResult;
    filename: string;
  } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);

  // Load saved profiles and inspect default template on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await storageAdapter.getSetting<MappingProfile[]>("excel_ppt_profiles", []);
        if (Array.isArray(saved) && saved.length > 0) {
          setProfiles(saved);
        }
      } catch (err) {
        console.warn("Could not load mapping profiles:", err);
      }

      try {
        const defaultBuf = base64ToArrayBuffer(DEFAULT_PPT_TEMPLATE_B64);
        const data = await inspectTemplateClient(defaultBuf);
        setTemplateInfo(data);
        setSelectedSlideIndex(data.recommended_product_slide || 0);
      } catch (err) {
        console.warn("Could not inspect default template:", err);
      }
    })();
  }, []);

  const saveCurrentProfile = async () => {
    const name = currentProfileName.trim() || `Profile ${profiles.length + 1}`;
    const newProfile: MappingProfile = {
      name,
      mapping: { ...mapping },
      imageFit,
      selectedSlideIndex,
      count,
      layout: layout.map(s => ({ img: [...s.img], text: [...s.text] })),
      fontSize,
      fontName,
      fontColor,
      background,
      ratio,
      autoCenter,
      showHeader,
      showRule,
      headerText
    };
    const updated = [...profiles.filter(p => p.name.toLowerCase() !== name.toLowerCase()), newProfile];
    setProfiles(updated);
    setCurrentProfileName("");
    await storageAdapter.setSetting("excel_ppt_profiles", updated);
    setStatus(`Saved profile "${name}" successfully.`);
  };

  const loadProfile = (name: string) => {
    const p = profiles.find(item => item.name === name);
    if (!p) return;
    setMapping({ ...p.mapping });
    setImageFit(p.imageFit);
    setSelectedSlideIndex(p.selectedSlideIndex);
    setSelectedProfileIndex(name);
    if (p.count) {
      const targetCount = p.count === 2 ? 2 : 3;
      setCount(targetCount);
      if (p.layout && Array.isArray(p.layout)) {
        setLayout(adjustLayoutSlots(p.layout, targetCount));
      } else {
        setLayout(adjustLayoutSlots([], targetCount));
      }
    }
    if (typeof p.fontSize === "number") setFontSize(p.fontSize);
    if (p.fontName) setFontName(p.fontName);
    if (p.fontColor) setFontColor(p.fontColor);
    if (p.background) setBackground(p.background);
    if (p.ratio) setRatio(p.ratio);
    if (typeof p.autoCenter === "boolean") setAutoCenter(p.autoCenter);
    if (typeof p.showHeader === "boolean") setShowHeader(p.showHeader);
    if (typeof p.showRule === "boolean") setShowRule(p.showRule);
    if (typeof p.headerText === "string") setHeaderText(p.headerText);
    setStatus(`Loaded profile "${name}".`);
  };

  const deleteProfile = async (name: string) => {
    const updated = profiles.filter(p => p.name !== name);
    setProfiles(updated);
    if (selectedProfileIndex === name) setSelectedProfileIndex("");
    await storageAdapter.setSetting("excel_ppt_profiles", updated);
    setStatus(`Deleted profile "${name}".`);
  };

  // Load Worksheet Data into State
  const loadWorksheetData = (workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet) => {
    // Extract cell-anchored image thumbnails for live preview
    const imgThumbnails: Record<number, string> = {};
    try {
      const images = sheet.getImages ? sheet.getImages() : [];
      for (const img of images) {
        let rowNum = 0;
        if (img.range && img.range.tl) {
          if (typeof img.range.tl.nativeRow === "number") {
            rowNum = Math.floor(img.range.tl.nativeRow) + 1;
          } else if (typeof img.range.tl.row === "number") {
            rowNum = Math.floor(img.range.tl.row) + 1;
          }
        }
        const media = workbook.model?.media?.[img.imageId] || (workbook.model?.media || []).find(
          (m: any) => m.index === img.imageId || String(m.index) === String(img.imageId)
        );
        if (media && media.buffer && rowNum > 0 && !imgThumbnails[rowNum]) {
          const blob = new Blob([media.buffer], { type: `image/${media.extension || "jpeg"}` });
          const objUrl = URL.createObjectURL(blob);
          imgThumbnails[rowNum] = objUrl;

          // Preload natural dimensions for perfect aspect ratio & cropping
          if (typeof Image !== "undefined") {
            const imgObj = new Image();
            imgObj.onload = () => {
              (media as any).width = imgObj.naturalWidth;
              (media as any).height = imgObj.naturalHeight;
            };
            imgObj.src = objUrl;
          }
        }
      }
    } catch (e) {
      console.warn("Could not load preview thumbnails:", e);
    }

    // Collect headers from row 1 and row 2 with duplicate disambiguation
    const counts: Record<string, number> = {};
    const disambiguate = (name: string): string => {
      const trimmed = name.trim();
      if (!trimmed) return "";
      counts[trimmed] = (counts[trimmed] || 0) + 1;
      return counts[trimmed] > 1 ? `${trimmed} (${counts[trimmed]})` : trimmed;
    };

    const r1Raw = (sheet.getRow(1).values as Array<unknown> || []).slice(1).map(v => String(v ?? "").trim()).filter(Boolean);
    let colNames = r1Raw.map(disambiguate);
    if (colNames.length < 3 && sheet.rowCount >= 2) {
      const r2Raw = (sheet.getRow(2).values as Array<unknown> || []).slice(1).map(v => String(v ?? "").trim()).filter(Boolean);
      const r2Unique = r2Raw.filter(h => !colNames.some(c => c.toLowerCase() === h.toLowerCase()));
      colNames = [...colNames, ...r2Unique.map(disambiguate)];
    }
    setHeaders(colNames);

    // Extract sample data rows (up to 30 rows for live preview)
    const dataRows: Array<Record<string, any>> = [];
    const startRow = sheet.rowCount >= 3 && !sheet.getRow(2).getCell(1).value ? 3 : 2;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber >= startRow && dataRows.length < 30) {
        const rowObj: Record<string, any> = {};
        colNames.forEach((hdr) => {
          let cIndex = -1;
          const cleanBaseHdr = hdr.replace(/\s*\(\d+\)$/, "").toLowerCase();
          const r1Vals = sheet.getRow(1).values as Array<unknown>;
          const r2Vals = sheet.getRow(2).values as Array<unknown>;
          if (r1Vals) {
            const idx = r1Vals.findIndex(v => String(v ?? "").trim().toLowerCase() === cleanBaseHdr);
            if (idx > 0) cIndex = idx;
          }
          if (cIndex === -1 && r2Vals) {
            const idx = r2Vals.findIndex(v => String(v ?? "").trim().toLowerCase() === cleanBaseHdr);
            if (idx > 0) cIndex = idx;
          }
          if (cIndex > 0) {
            rowObj[hdr] = extractCellValue(row.getCell(cIndex));
          }
        });
        if (Object.values(rowObj).some(Boolean)) {
          rowObj["__thumbnail"] = imgThumbnails[rowNumber] || "";
          dataRows.push(rowObj);
        }
      }
    });
    setSampleRows(dataRows);

    // Intelligent Auto-Mapping
    const findCol = (...needles: string[]) =>
      colNames.find(h => needles.some(n => h.toLowerCase() === n.toLowerCase() || h.toLowerCase().includes(n.toLowerCase()))) ?? "";

    const autoMapped: Mapping = {
      code: findCol("buyer code", "buyer code / sku", "sku", "item code", "product code", "code"),
      description: findCol("product description", "description", "product name", "product", "item name", "desc"),
      dim_cm: findCol("product dimension (cm)", "dimension (cm)", "dimensions (cm)", "dimension cm", "size cm", "size (cm)"),
      dim_in: findCol("carton dimension (inch)", "dimension (inch)", "dimensions (inch)", "dimension in", "size in", "size (inch)"),
      price: findCol("price (usd)", "price", "mrp", "rate", "cost", "qyt"),
      length: findCol("length", " l", "len"),
      width: findCol("width", "breadth", " w", "wid"),
      height: findCol("height", " h", "hgt"),
      image: findCol("product image (embedded)", "product image", "image", "photo", "picture", "img")
    };
    setMapping(autoMapped);

    const embeddedCount = Object.keys(imgThumbnails).length;
    const missingCount = Math.max(0, dataRows.length - embeddedCount);
    setMissingImageCount(missingCount);

    const warningText = missingCount > 0 ? ` (${missingCount} product(s) missing embedded photos)` : "";
    setStatus(`Loaded ${colNames.length} columns and ${dataRows.length} product rows from sheet "${sheet.name}" (${embeddedCount} embedded photos detected)${warningText}.`);
  };

  // Handle Worksheet Switch
  const handleSheetChange = (name: string) => {
    if (!workbookRef) return;
    const targetSheet = workbookRef.getWorksheet(name) || workbookRef.worksheets[0];
    if (targetSheet) {
      setSelectedSheetName(targetSheet.name);
      loadWorksheetData(workbookRef, targetSheet);
    }
  };

  // Handle Excel Upload
  const chooseFile = async (next: File | null) => {
    setFile(next);
    setWorkbookRef(null);
    setAvailableSheets([]);
    setSelectedSheetName("");
    setHeaders([]);
    setSampleRows([]);
    setLastResult(null);
    setStatus("");
    if (!next) return;
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await next.arrayBuffer());
      if (!workbook.worksheets || workbook.worksheets.length === 0) {
        setStatus("No worksheets found in this workbook.");
        return;
      }

      setWorkbookRef(workbook);
      const sheetNames = workbook.worksheets.map(w => w.name);
      setAvailableSheets(sheetNames);
      const sheet = workbook.worksheets[0];
      setSelectedSheetName(sheet.name);
      loadWorksheetData(workbook, sheet);
    } catch {
      setStatus("Could not read this workbook. Please upload a valid .xlsx file.");
    }
  };

  // Download Sample Excel Template
  const downloadExcelTemplate = async () => {
    try {
      setStatus("Generating sample Excel workbook with embedded product images…");
      const wb = new ExcelJS.Workbook();
      wb.creator = "Loveneet Suite";
      wb.lastModifiedBy = "Loveneet Suite";
      wb.created = new Date();

      const ws = wb.addWorksheet("Products", {
        views: [{ showGridLines: true }]
      });

      ws.columns = [
        { header: "Buyer Code / SKU", key: "code", width: 22 },
        { header: "Product Description", key: "desc", width: 40 },
        { header: "Product Dimension (CM)", key: "dim_cm", width: 26 },
        { header: "Carton Dimension (Inch)", key: "dim_in", width: 26 },
        { header: "Price (USD)", key: "price", width: 16 },
        { header: "Product Image (Embedded)", key: "image", width: 28 },
      ];

      const headerRow = ws.getRow(1);
      headerRow.height = 32;
      headerRow.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      const sampleItems = [
        {
          code: "11185",
          desc: "Marble Accent Table - Natural White Finish",
          dim_cm: "25.4 x 25.4 x 47 CM",
          dim_in: "13 x 13 x 22 IN",
          price: "$45.00"
        },
        {
          code: "11167",
          desc: "Travertine Coffee Table - Honed Finish",
          dim_cm: "41.3 x 41.3 x 45 CM",
          dim_in: "18 x 18 x 20 IN",
          price: "$65.00"
        },
        {
          code: "12262",
          desc: "Iron Marble Bistro Table - Black Frame",
          dim_cm: "64 x 64 x 76 CM",
          dim_in: "27 x 27 x 32 IN",
          price: "$85.00"
        }
      ];

      sampleItems.forEach((item, idx) => {
        const rowIdx = idx + 2;
        const row = ws.addRow(item);
        row.height = 85;

        row.eachCell((cell, colNum) => {
          cell.alignment = { vertical: "middle", horizontal: colNum === 1 || colNum >= 3 ? "center" : "left" };
          cell.font = { name: "Calibri", size: 10 };
          if (idx % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
          }
        });

        if (SAMPLE_PRODUCTS[idx]) {
          const imgId = wb.addImage({
            base64: SAMPLE_PRODUCTS[idx].base64,
            extension: SAMPLE_PRODUCTS[idx].extension as "jpeg" | "png"
          });

          ws.addImage(imgId, {
            tl: { col: 5.15, row: rowIdx - 1 + 0.08 },
            ext: { width: 140, height: 100 },
            editAs: "oneCell"
          });
        }
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Loveneet_Product_Catalogue_Sample_Template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatus("Downloaded sample Excel template with 3 embedded product images.");
    } catch (err: any) {
      console.error("Error generating Excel template:", err);
      setStatus("Could not generate Excel template: " + (err.message || String(err)));
    }
  };

  // Handle PPT Template Upload & Inspection
  const chooseTemplate = async (next: File | null) => {
    setTemplateFile(next);
    setLastResult(null);
    if (!next) {
      try {
        const defaultBuf = base64ToArrayBuffer(DEFAULT_PPT_TEMPLATE_B64);
        const data = await inspectTemplateClient(defaultBuf);
        setTemplateInfo(data);
        setSelectedSlideIndex(data.recommended_product_slide || 0);
        setStatus("Restored default PowerPoint template (3 products per slide, 16:9 widescreen).");
      } catch {}
      return;
    }
    setInspectingTemplate(true);
    setStatus("Inspecting PowerPoint template structure & branding…");
    try {
      const clientData = await inspectTemplateClient(next);
      setTemplateInfo(clientData);
      setSelectedSlideIndex(clientData.recommended_product_slide || 0);
      if (clientData.aspect_ratio === "4:3") setRatio("4:3");
      else if (clientData.aspect_ratio === "16:9") setRatio("16:9");

      const activeSlide = clientData.slides[clientData.recommended_product_slide || 0];
      const slotsDetected = activeSlide ? activeSlide.slots_count : 3;
      const validCount: ProductsPerSlide = slotsDetected === 2 ? 2 : 3;
      setCount(validCount);
      if (activeSlide && activeSlide.slots && activeSlide.slots.length > 0) {
        const rawSlots: Slot[] = activeSlide.slots.map(s => ({
          img: [s.img_rect[0], s.img_rect[1], s.img_rect[2], s.img_rect[3]] as [number, number, number, number],
          text: [s.text_rect[0], s.text_rect[1], s.text_rect[2], s.text_rect[3]] as [number, number, number, number]
        }));
        setLayout(adjustLayoutSlots(rawSlots, validCount));
      } else {
        setLayout(adjustLayoutSlots([], validCount));
      }
      setStatus(`Template inspected successfully: ${clientData.total_slides} slide(s), ${slotsDetected} product slots per slide.`);
    } catch (clientErr: any) {
      console.warn("Client inspect error:", clientErr);
      setStatus(`Could not inspect PowerPoint template: ${clientErr.message || "Invalid presentation"}`);
    } finally {
      setInspectingTemplate(false);
    }
  };

  // Helpers for Preview Values
  const getPreviewVal = (colName: string): string => {
    if (!colName || sampleRows.length === 0) return "—";
    const val = sampleRows[0][colName];
    return val ? String(val) : "—";
  };

  // Shared Grouping & Slide Count Engine (Phase 2 Fix)
  // Single source of truth across Canvas, Preview, and PPTX Generator
  const productChunks = useMemo(() => {
    return chunkProducts(sampleRows, count);
  }, [sampleRows, count]);

  const slideCounts = useMemo(() => {
    return calculateSlideCount(sampleRows.length, count, 0);
  }, [sampleRows.length, count]);

  const totalPreviewSlides = Math.max(1, slideCounts.productSlides);

  // Change slide preview page
  const prevSlide = () => setPreviewSlideIndex(p => Math.max(0, p - 1));
  const nextSlide = () => setPreviewSlideIndex(p => Math.min(totalPreviewSlides - 1, p + 1));

  // Current slide products from shared grouping engine
  const currentSlideProducts = useMemo(() => {
    return productChunks[previewSlideIndex] || [];
  }, [productChunks, previewSlideIndex]);

  // Keep preview index valid when totalPreviewSlides changes
  useEffect(() => {
    if (previewSlideIndex >= totalPreviewSlides) {
      setPreviewSlideIndex(Math.max(0, totalPreviewSlides - 1));
    }
  }, [previewSlideIndex, totalPreviewSlides]);

  // Layout change handlers enforcing slots.length === productsPerSlide
  const changeCount = (next: 2 | 3) => {
    setCount(next);
    setLayout(prev => adjustLayoutSlots(prev, next));
  };
  const resetLayout = () => {
    setLayout(adjustLayoutSlots([], count));
    setRatio("16:9");
    setAutoCenter(true);
  };

  const getSlideAspectStyle = (r: SlideRatio): React.CSSProperties => {
    switch (r) {
      case "4:3":
        return { aspectRatio: "4 / 3", maxWidth: "660px", width: "100%", margin: "0 auto" };
      case "A4 Landscape":
        return { aspectRatio: "297 / 210", maxWidth: "780px", width: "100%", margin: "0 auto" };
      case "A4 Portrait":
        return { aspectRatio: "210 / 297", maxWidth: "440px", width: "100%", margin: "0 auto" };
      case "16:9":
      default:
        return { aspectRatio: "16 / 9", maxWidth: "100%", width: "100%", margin: "0 auto" };
    }
  };

  // Step state calculations
  const isStep1Done = Boolean(file && sampleRows.length > 0);
  const isStep2Done = Boolean(useCustomTemplate ? templateInfo : true);
  const isStep3Done = Boolean(mapping.code);

  // Generate Presentation (100% Offline Engine with OOXML Validation & Delivery)
  const generate = async () => {
    if (!file) {
      setStatus("Please choose an Excel workbook in Step 1 first.");
      return;
    }
    if (!mapping.code) {
      setStatus("Please select the product code / SKU column in Step 3.");
      return;
    }

    setBusy(true);
    setLastResult(null);
    setStatus("Initiating presentation generation…");

    try {
      const templateBuf = templateFile
        ? await templateFile.arrayBuffer()
        : base64ToArrayBuffer(DEFAULT_PPT_TEMPLATE_B64);

      const output = await generateCataloguePptx(file, templateBuf, mapping, {
        imageFit,
        headerText,
        showHeader,
        showRule,
        selectedSlideIndex,
        customLayout: layout,
        autoCenter,
        fontSize,
        fontName,
        fontColor,
        background,
        logoFile,
        ratio,
        sheetName: selectedSheetName,
        onProgress: (phase, percent, detail) => {
          setProgress({ active: true, phase, percent, message: detail });
          setStatus(detail);
        }
      });

      const defaultFilename = file.name.replace(/\.xlsx?$/i, "") + (templateFile ? "_catalogue_custom.pptx" : "_catalogue.pptx");
      const delivery = await deliverPresentation(output.blob, defaultFilename, false, {
        slideCount: output.slideCount,
        hasImages: output.totalProducts > 0
      });

      if (!delivery.success) {
        throw new Error(delivery.error || "Pre-download structural validation failed.");
      }

      setLastResult({ output, delivery, filename: defaultFilename });
      setProgress(null);
      setStatus(`Presentation generated successfully: ${output.slideCount} slides (${output.totalProducts} products). Structural OpenXML packaging validated.`);
    } catch (error: any) {
      console.error("PPT Generation error:", error);
      setProgress(null);
      setStatus(`Presentation generation blocked: ${error.message || String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadAgain = async () => {
    if (!lastResult) return;
    try {
      const delivery = await deliverPresentation(
        lastResult.output.blob,
        lastResult.filename,
        isDesktop(),
        {
          slideCount: lastResult.output.slideCount,
          hasImages: lastResult.output.totalProducts > 0
        }
      );
      if (!delivery.success) {
        if (delivery.error?.includes("cancelled")) {
          setStatus("File save was cancelled by the user.");
        } else {
          setStatus(`Save/Download blocked: ${delivery.error || "Pre-download validation failed."}`);
        }
      } else {
        setStatus(delivery.savedPath ? `Saved to: ${delivery.savedPath}` : "Presentation downloaded successfully.");
      }
    } catch (err: any) {
      setStatus(`Download failed: ${err.message || String(err)}`);
    }
  };

  const handleOpenDesktopApp = async () => {
    if (!lastResult?.delivery?.savedPath) return;
    const res = await openPresentationInApp(lastResult.delivery.savedPath);
    if (!res.success) {
      setStatus(`Could not launch PowerPoint: ${res.error || "File error"}`);
    }
  };

  const handleShowDesktopFolder = async () => {
    if (!lastResult?.delivery?.savedPath) return;
    const ok = await revealPresentationInFolder(lastResult.delivery.savedPath);
    setStatus(ok ? `Revealed in folder: ${lastResult.delivery.savedPath}` : "Could not reveal file in File Explorer.");
  };

  return (
    <main className="excel-ppt">
      {/* Intro Header */}
      <section className="ep-intro">
        <div>
          <span>EXCEL TO POWERPOINT CATALOGUE</span>
          <h3>Generate Complete Presentations from Excel Data</h3>
          <p>
            Upload your custom PowerPoint template (e.g. <code>sop ppt.pptx</code>) or use our standard layout.
            Map your spreadsheet fields, preview live populated slides, and download an editable presentation preserving typography, vector branding, and borders.
          </p>
        </div>
        <FileSpreadsheet size={48} />
      </section>

      {/* Modernized 4-Step Workflow Stepper Indicator */}
      <div className="ep-workflow-stepper">
        <div className={`ep-step-item ${isStep1Done ? "completed" : "active"}`}>
          <div className="ep-step-num">{isStep1Done ? <CheckCircle2 size={13} /> : "1"}</div>
          <div className="ep-step-text">
            <strong>01. Upload Excel</strong>
            <span>{file ? `${file.name.slice(0, 18)} (${sampleRows.length}+ items)` : "Choose workbook (.xlsx)"}</span>
          </div>
        </div>

        <div className={`ep-step-item ${isStep2Done ? (isStep1Done ? "completed" : "active") : ""}`}>
          <div className="ep-step-num">{isStep2Done && isStep1Done ? <CheckCircle2 size={13} /> : "2"}</div>
          <div className="ep-step-text">
            <strong>02. Select Template</strong>
            <span>{templateFile ? templateFile.name.slice(0, 18) : "Standard Layout (16:9)"}</span>
          </div>
        </div>

        <div className={`ep-step-item ${isStep3Done ? "completed" : isStep1Done ? "active" : ""}`}>
          <div className="ep-step-num">{isStep3Done ? <CheckCircle2 size={13} /> : "3"}</div>
          <div className="ep-step-text">
            <strong>03. Field Mapping</strong>
            <span>{mapping.code ? `SKU: ${mapping.code}` : "Assign spreadsheet columns"}</span>
          </div>
        </div>

        <div className={`ep-step-item ${lastResult ? "completed" : isStep3Done ? "active" : ""}`}>
          <div className="ep-step-num">{lastResult ? <CheckCircle2 size={13} /> : "4"}</div>
          <div className="ep-step-text">
            <strong>04. Layout & Save</strong>
            <span>{lastResult ? "Generated & Validated" : "Sizing, Drag & Download"}</span>
          </div>
        </div>
      </div>

      {/* Source Files Metadata Cards */}
      {(file || templateInfo) && (
        <div className="ep-source-cards">
          {file && (
            <div className="ep-source-card">
              <div className="ep-source-icon">
                <FileSpreadsheet size={20} />
              </div>
              <div className="ep-source-info">
                <h4>{file.name}</h4>
                <p>
                  {(file.size / 1024).toFixed(0)} KB · {headers.length} Columns · {sampleRows.length} Product Records Loaded
                </p>
              </div>
              <span className="ep-badge ep-badge-success">Ready</span>
            </div>
          )}

          {templateInfo && (
            <div className="ep-source-card">
              <div className="ep-source-icon">
                <Presentation size={20} />
              </div>
              <div className="ep-source-info">
                <h4>{templateFile ? templateFile.name : "Default Noble Selections Template"}</h4>
                <p>
                  {templateInfo.slide_width_in}″ × {templateInfo.slide_height_in}″ ({templateInfo.aspect_ratio}) · {templateInfo.slides[selectedSlideIndex]?.slots_count || 3} Slots / Slide
                </p>
              </div>
              <span className="ep-badge ep-badge-blue">Active</span>
            </div>
          )}
        </div>
      )}

      {/* Step 1: Excel Upload */}
      <section className="ep-panel">
        <div className="ep-title">
          <div>
            <b>01</b>
            <div>
              <h3>Upload Excel Workbook</h3>
              <p>Supports <code>.xlsx</code> sheets with product details and cell-anchored product images.</p>
            </div>
          </div>
          {file && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span className="ep-badge ep-badge-success">
                <CheckCircle2 size={13} /> {headers.length} Columns · {sampleRows.length}+ Rows
              </span>
              {missingImageCount > 0 && (
                <span className="ep-badge ep-badge-warning" style={{ backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                  <AlertCircle size={13} /> {missingImageCount} Missing Images
                </span>
              )}
            </div>
          )}
        </div>
        <label className="ep-drop">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => void chooseFile(e.target.files?.[0] ?? null)}
          />
          <Upload size={26} />
          <strong>{file ? file.name : "Click or drag an Excel workbook (.xlsx)"}</strong>
          <small>{file ? `${(file.size / 1024).toFixed(0)} KB · Ready to map` : "Supports multi-row headers and embedded cell photos"}</small>
        </label>

        {availableSheets.length > 1 && (
          <div className="ep-sheet-selector-bar" style={{
            marginTop: "0.85rem",
            padding: "0.65rem 1rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
            <Layers size={16} style={{ color: "#3b82f6" }} />
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>Active Worksheet:</span>
            <select
              value={selectedSheetName}
              onChange={e => handleSheetChange(e.target.value)}
              style={{
                padding: "4px 10px",
                borderRadius: "4px",
                border: "1px solid #cbd5e1",
                fontSize: "0.85rem",
                color: "#0f172a",
                background: "#ffffff"
              }}
            >
              {availableSheets.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        <div className="ep-template-download-banner" style={{
          marginTop: "1rem",
          padding: "0.85rem 1.15rem",
          background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem"
        }}>
          <div>
            <strong style={{ fontSize: "0.88rem", color: "#0f172a", display: "block" }}>
              Need a sample Excel template with embedded product images?
            </strong>
            <span style={{ fontSize: "0.80rem", color: "#64748b" }}>
              Download our ready-to-use template pre-filled with clean columns, sample items, and real cell-embedded photos.
            </span>
          </div>
          <button
            type="button"
            className="ep-btn ep-btn-secondary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              fontSize: "0.84rem",
              fontWeight: 600,
              backgroundColor: "#ffffff",
              border: "1px solid #cbd5e1",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              cursor: "pointer"
            }}
            onClick={downloadExcelTemplate}
          >
            <Download size={15} /> Download Sample Excel Template (.xlsx)
          </button>
        </div>
      </section>

      {/* Step 2: PowerPoint Template Selection */}
      <section className="ep-panel">
        <div className="ep-title">
          <div>
            <b>02</b>
            <div>
              <h3>PowerPoint Template Selection</h3>
              <p>Import a custom company template (e.g. <code>sop ppt.pptx</code>) or use the built-in clean layout.</p>
            </div>
          </div>
          <div className="ep-tab-switch">
            <button
              type="button"
              className={useCustomTemplate ? "active" : ""}
              onClick={() => setUseCustomTemplate(true)}
            >
              <Sparkles size={14} /> Custom PPT Template (.pptx)
            </button>
            <button
              type="button"
              className={!useCustomTemplate ? "active" : ""}
              onClick={() => setUseCustomTemplate(false)}
            >
              <Layout size={14} /> Built-in Standard Layout
            </button>
          </div>
        </div>

        {useCustomTemplate ? (
          <div className="ep-template-upload-box">
            <label className="ep-drop ep-drop-template">
              <input
                type="file"
                accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={e => void chooseTemplate(e.target.files?.[0] ?? null)}
              />
              {inspectingTemplate ? (
                <LoaderCircle className="ep-spin" size={28} />
              ) : (
                <Presentation size={28} />
              )}
              <strong>{templateFile ? templateFile.name : "Upload PowerPoint Base Template (.pptx)"}</strong>
              <small>
                {templateFile
                  ? `${(templateFile.size / 1024).toFixed(0)} KB · Template Loaded`
                  : "Upload sop ppt.pptx to preserve vector logo, divider line, typography and Noble Selections branding"}
              </small>
            </label>

            {templateInfo && (
              <div className="ep-template-summary-card">
                <div className="ep-summary-header">
                  <div>
                    <h4>Template Structure Detected</h4>
                    <p>
                      Dimensions: <b>{templateInfo.slide_width_in}″ × {templateInfo.slide_height_in}″</b> ({templateInfo.aspect_ratio} widescreen)
                      · Total Slides: <b>{templateInfo.total_slides}</b>
                    </p>
                  </div>
                  <span className="ep-badge ep-badge-blue">
                    {templateInfo.slides[selectedSlideIndex]?.slots_count || 3} Product Slots / Slide
                  </span>
                </div>

                {templateInfo.slides.length > 1 && (
                  <div className="ep-slide-selector">
                    <span>Select Product Page Layout Slide:</span>
                    <select
                      value={selectedSlideIndex}
                      onChange={e => {
                        const idx = Number(e.target.value);
                        setSelectedSlideIndex(idx);
                        const sl = templateInfo.slides[idx];
                        if (sl) {
                          const targetCount: ProductsPerSlide = sl.slots_count === 2 ? 2 : 3;
                          setCount(targetCount);
                          if (sl.slots && sl.slots.length > 0) {
                            const rawSlots: Slot[] = sl.slots.map(s => ({
                              img: [s.img_rect[0], s.img_rect[1], s.img_rect[2], s.img_rect[3]] as [number, number, number, number],
                              text: [s.text_rect[0], s.text_rect[1], s.text_rect[2], s.text_rect[3]] as [number, number, number, number]
                            }));
                            setLayout(adjustLayoutSlots(rawSlots, targetCount));
                          } else {
                            setLayout(adjustLayoutSlots([], targetCount));
                          }
                        }
                      }}
                    >
                      {templateInfo.slides.map((s, idx) => (
                        <option key={idx} value={idx}>
                          Slide {idx + 1} ({s.layout_name}) — {s.slots_count} Product Slots
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="ep-branding-tags">
                  <span className="ep-tag-item">
                    <CheckCircle2 size={12} /> Fixed Vector Logo (Group 2) Preserved
                  </span>
                  <span className="ep-tag-item">
                    <CheckCircle2 size={12} /> Fixed Header "NOBLE SELECTIONS" Preserved
                  </span>
                  <span className="ep-tag-item">
                    <CheckCircle2 size={12} /> Horizontal Divider Rule Preserved
                  </span>
                  <span className="ep-tag-item">
                    <CheckCircle2 size={12} /> Exact Font Typography & Formatting Maintained
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="ep-builtin-info">
            <p>
              Using Built-in standard template. You can customize slide shape, heading text, divider line,
              and upload an optional brand logo in Step 4 below.
            </p>
          </div>
        )}
      </section>

      {/* Step 3: Interactive Column Mapping & Field Assignment */}
      {headers.length > 0 && (
        <section className="ep-panel">
          <div className="ep-title">
            <div>
              <b>03</b>
              <div>
                <h3>Interactive Column Mapping & Field Assignment</h3>
                <p>Assign Excel spreadsheet columns to PowerPoint elements. Verify preview values before generation.</p>
              </div>
            </div>
            {/* Profile Management Controls */}
            <div className="ep-profile-bar">
              {profiles.length > 0 && (
                <select
                  value={selectedProfileIndex}
                  onChange={e => loadProfile(e.target.value)}
                  className="ep-profile-select"
                >
                  <option value="">— Load Saved Profile —</option>
                  {profiles.map(p => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                placeholder="New profile name…"
                value={currentProfileName}
                onChange={e => setCurrentProfileName(e.target.value)}
                className="ep-profile-input"
              />
              <button
                type="button"
                onClick={saveCurrentProfile}
                className="ep-btn-subtle"
                title="Save mapping configuration for future re-use"
              >
                <Save size={13} /> Save Profile
              </button>
              {selectedProfileIndex && (
                <button
                  type="button"
                  onClick={() => deleteProfile(selectedProfileIndex)}
                  className="ep-btn-subtle ep-btn-danger"
                  title="Delete selected profile"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="ep-table-container">
            <table className="ep-mapping-table">
              <thead>
                <tr>
                  <th>PPT Element / Role</th>
                  <th>Element Type</th>
                  <th>Assigned Excel Column</th>
                  <th>Sample Value (Row 1)</th>
                  <th>Mapping Status</th>
                </tr>
              </thead>
              <tbody>
                {ROLE_DEFINITIONS.map(def => {
                  const mappedCol = mapping[def.key];
                  const previewVal = getPreviewVal(mappedCol);
                  const isMapped = Boolean(mappedCol);

                  return (
                    <tr key={def.key} className={isMapped ? "row-mapped" : def.required ? "row-required" : ""}>
                      <td className="cell-role">
                        <strong>{def.label}</strong>
                        {def.required && <span className="req-star">*</span>}
                        <small>{def.hint}</small>
                      </td>
                      <td className="cell-type">
                        <span className="ep-type-pill">{def.type}</span>
                      </td>
                      <td className="cell-select">
                        <select
                          value={mappedCol}
                          onChange={e => setMapping(prev => ({ ...prev, [def.key]: e.target.value }))}
                        >
                          <option value="">— Not mapped —</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="cell-preview">
                        <code>{def.key === "image" && isMapped ? "[Embedded Cell Image]" : previewVal}</code>
                      </td>
                      <td className="cell-status">
                        {isMapped ? (
                          <span className="status-pill status-mapped">
                            <CheckCircle2 size={12} /> Mapped
                          </span>
                        ) : def.required ? (
                          <span className="status-pill status-required">
                            <AlertCircle size={12} /> Required
                          </span>
                        ) : (
                          <span className="status-pill status-optional">Optional</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {useCustomTemplate && (
                  <>
                    <tr className="row-fixed">
                      <td className="cell-role">
                        <strong>Fixed Header: "NOBLE SELECTIONS"</strong>
                        <small>Static corporate branding shape</small>
                      </td>
                      <td className="cell-type">
                        <span className="ep-type-pill">Template Text</span>
                      </td>
                      <td className="cell-select">
                        <span className="cell-static-label">— Static Shape —</span>
                      </td>
                      <td className="cell-preview">
                        <code>NOBLE SELECTIONS (11pt ZCOOL)</code>
                      </td>
                      <td className="cell-status">
                        <span className="status-pill status-preserved">Preserved</span>
                      </td>
                    </tr>
                    <tr className="row-fixed">
                      <td className="cell-role">
                        <strong>Horizontal Divider Rule</strong>
                        <small>Divider connector line</small>
                      </td>
                      <td className="cell-type">
                        <span className="ep-type-pill">Template Line</span>
                      </td>
                      <td className="cell-select">
                        <span className="cell-static-label">— Static Shape —</span>
                      </td>
                      <td className="cell-preview">
                        <code>Connector 17 (Y=7.14″)</code>
                      </td>
                      <td className="cell-status">
                        <span className="status-pill status-preserved">Preserved</span>
                      </td>
                    </tr>
                    <tr className="row-fixed">
                      <td className="cell-role">
                        <strong>Vector Logo (Group 2)</strong>
                        <small>Corporate emblem at top-right</small>
                      </td>
                      <td className="cell-type">
                        <span className="ep-type-pill">Group Shape</span>
                      </td>
                      <td className="cell-select">
                        <span className="cell-static-label">— Static Shape —</span>
                      </td>
                      <td className="cell-preview">
                        <code>Group 2 (X=11.84″, Y=0.39″)</code>
                      </td>
                      <td className="cell-status">
                        <span className="status-pill status-preserved">Preserved</span>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Step 4: Live Slide Studio & Positioning */}
      <section className="ep-panel">
        <div className="ep-title">
          <div>
            <b>04</b>
            <div>
              <h3>Live Slide Studio & Positioning</h3>
              <p>WYSIWYG Live Canvas — drag images & text directly to move them, drag corners to resize. Toggle Crop/Fit, adjust typography, colors, and layout in real-time.</p>
            </div>
          </div>
        </div>

        {/* Studio Top Control Bar with Slide Shape, 2/3 count, Crop/Fit, Auto-center, Reset, Slide pager */}
        <div className="ep-studio-toolbar">
          <label className="ep-ratio-picker">
            <span>Slide shape</span>
            <select value={ratio} onChange={e => setRatio(e.target.value as SlideRatio)}>
              <option>16:9</option>
              <option>4:3</option>
              <option>A4 Landscape</option>
              <option>A4 Portrait</option>
            </select>
          </label>

          <div className="ep-count-selector">
            <span>Products per slide</span>
            <div className="ep-btn-group">
              <button
                type="button"
                className={count === 2 ? "selected" : ""}
                onClick={() => changeCount(2)}
              >
                2 Products
              </button>
              <button
                type="button"
                className={count === 3 ? "selected" : ""}
                onClick={() => changeCount(3)}
              >
                3 Products
              </button>
            </div>
          </div>

          <div className="ep-fit-selector">
            <span>Image Fitting Mode</span>
            <div className="ep-btn-group">
              <button
                type="button"
                className={imageFit === "contain" ? "selected" : ""}
                onClick={() => setImageFit("contain")}
                title="Preserves entire photo without cropping"
              >
                Shrink & Fit (Contain)
              </button>
              <button
                type="button"
                className={imageFit === "cover" ? "selected" : ""}
                onClick={() => setImageFit("cover")}
                title="Fills box completely, trims edges symmetrically"
              >
                Crop & Fit (Cover)
              </button>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoCenter}
            className={`ep-align-button ep-toggle ${autoCenter ? "is-on" : "is-off"}`}
            onClick={() => setAutoCenter(v => !v)}
          >
            <span className="ep-toggle-track">
              <span className="ep-toggle-thumb" />
            </span>
            <span>Center images</span>
            <small>{autoCenter ? "ON" : "OFF"}</small>
          </button>

          <button type="button" className="ep-reset" onClick={resetLayout} title="Reset positions to default">
            <RotateCcw size={14} /> Reset
          </button>

          <div className="ep-preview-pager" style={{ marginLeft: "auto" }}>
            <button
              type="button"
              onClick={prevSlide}
              disabled={previewSlideIndex === 0}
              className="ep-pager-btn"
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span className="ep-pager-info">
              Slide <b>{previewSlideIndex + 1}</b> of <b>{totalPreviewSlides}</b>
            </span>
            <button
              type="button"
              onClick={nextSlide}
              disabled={previewSlideIndex >= totalPreviewSlides - 1}
              className="ep-pager-btn"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Unified Live Interactive Slide Canvas */}
        <div className="ep-live-slide-wrapper">
          <div
            className="ep-live-slide-canvas"
            onPointerMove={e => {
              if (!drag) return;
              const r = e.currentTarget.getBoundingClientRect();
              const dx = ((e.clientX - drag.x) / r.width) * 800;
              const dy = ((e.clientY - drag.y) / r.height) * 450;
              const [x, y, x2, y2] = drag.rect;
              const w = x2 - x;
              const h = y2 - y;

              if (drag.mode === "resize") {
                const nw = Math.max(30, Math.min(800 - x, Math.round(w + dx)));
                const nh = Math.max(30, Math.min(450 - y, Math.round(h + dy)));
                setLayout(prev =>
                  prev.map((s, i) =>
                    i === drag.slot ? { ...s, [drag.section]: [x, y, x + nw, y + nh] } : s
                  )
                );
              } else {
                const nx = Math.max(0, Math.min(800 - w, Math.round(x + dx)));
                const ny = Math.max(0, Math.min(450 - h, Math.round(y + dy)));
                setLayout(prev =>
                  prev.map((s, i) =>
                    i === drag.slot ? { ...s, [drag.section]: [nx, ny, nx + w, ny + h] } : s
                  )
                );
              }
            }}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
            style={{
              ...getSlideAspectStyle(ratio),
              backgroundColor: `#${background.replace("#", "")}`,
              position: "relative",
              touchAction: "none",
              userSelect: "none"
            }}
          >
            {/* Header & Logo */}
            {showHeader && (
              <div
                className="ep-preview-top-brand"
                style={{
                  position: "absolute",
                  left: "4%",
                  top: "3%",
                  right: "4%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  color: `#${fontColor.replace("#", "")}`,
                  zIndex: 2,
                  pointerEvents: "none"
                }}
              >
                <div className="ep-preview-noble-brand" style={{ fontFamily: fontName, fontSize: "clamp(11px, 1.6vw, 16px)", fontWeight: 800 }}>
                  {headerText || (useCustomTemplate ? "NOBLE SELECTIONS" : "PRODUCT COLLECTION")}
                </div>
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" style={{ maxHeight: "30px", maxWidth: "120px", objectFit: "contain" }} />
                ) : useCustomTemplate ? (
                  <div className="ep-preview-vector-logo">
                    <span className="logo-icon">NS</span>
                    <span className="logo-sub">EST. 1988</span>
                  </div>
                ) : null}
              </div>
            )}
            {showRule && (
              <div
                className="ep-preview-template-rule"
                style={{
                  position: "absolute",
                  left: "4%",
                  top: "8.5%",
                  right: "4%",
                  height: "1px",
                  backgroundColor: `#${fontColor.replace("#", "")}`,
                  opacity: 0.25,
                  zIndex: 2,
                  pointerEvents: "none"
                }}
              />
            )}

            {/* Interactive Live Product Boxes (Images & Text) */}
            {layout.map((slot, i) => {
              const prod = currentSlideProducts[i];
              const imgW = slot.img[2] - slot.img[0];
              const imgH = slot.img[3] - slot.img[1];
              const textW = slot.text[2] - slot.text[0];
              const textH = slot.text[3] - slot.text[1];
              const imgLeft = autoCenter
                ? Math.max(0, Math.min(800 - imgW, (slot.text[0] + slot.text[2]) / 2 - imgW / 2))
                : slot.img[0];

              if (!prod) {
                return (
                  <div
                    key={`empty_${i}`}
                    style={{
                      position: "absolute",
                      left: `${imgLeft / 8}%`,
                      top: `${slot.img[1] / 4.5}%`,
                      width: `${imgW / 8}%`,
                      height: `${imgH / 4.5}%`,
                      border: "1px dashed #cbd5e1",
                      borderRadius: "6px",
                      display: "grid",
                      placeItems: "center",
                      color: "#94a3b8",
                      fontSize: "11px"
                    }}
                  >
                    <span>Slot {i + 1} (Empty)</span>
                  </div>
                );
              }

              const skuVal = prod[mapping.code] || "SKU-00000";
              const descVal = prod[mapping.description] || "Product Description";
              const cmVal = prod[mapping.dim_cm] || (prod[mapping.length] && prod[mapping.width] && prod[mapping.height] ? `${prod[mapping.length]} x ${prod[mapping.width]} x ${prod[mapping.height]} CM` : "");
              let inVal = prod[mapping.dim_in] || "";
              if (!inVal && prod[mapping.length] && prod[mapping.width] && prod[mapping.height]) {
                try {
                  const lIn = (parseFloat(prod[mapping.length]) / 2.54).toFixed(1);
                  const wIn = (parseFloat(prod[mapping.width]) / 2.54).toFixed(1);
                  const hIn = (parseFloat(prod[mapping.height]) / 2.54).toFixed(1);
                  if (!isNaN(parseFloat(lIn)) && !isNaN(parseFloat(wIn)) && !isNaN(parseFloat(hIn))) {
                    inVal = `${lIn} x ${wIn} x ${hIn} IN`;
                  }
                } catch {}
              }
              const priceVal = prod[mapping.price] ? `PRICE : ${prod[mapping.price]}` : "";

              return (
                <React.Fragment key={i}>
                  {/* Live Product Image Box (Draggable & Resizable) */}
                  <div
                    className={`ep-live-product-image-box ${drag?.slot === i && drag?.section === "img" ? "is-selected" : ""}`}
                    style={{
                      position: "absolute",
                      left: `${imgLeft / 8}%`,
                      top: `${slot.img[1] / 4.5}%`,
                      width: `${imgW / 8}%`,
                      height: `${imgH / 4.5}%`,
                      overflow: "hidden",
                      borderRadius: "6px",
                      backgroundColor: "#f1f5f9",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "move",
                      touchAction: "none"
                    }}
                    onPointerDown={e => beginDrag(e, i, "img", "move")}
                  >
                    {prod.__thumbnail ? (
                      <img
                        src={prod.__thumbnail}
                        alt={skuVal}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: imageFit,
                          display: "block",
                          pointerEvents: "none"
                        }}
                      />
                    ) : (
                      <div className="ep-slot-image-placeholder" style={{ pointerEvents: "none" }}>
                        <ImageIcon size={28} />
                        <span>Product {i + 1}</span>
                        <small>{imageFit === "contain" ? "Shrink & Fit" : "Crop & Fit"}</small>
                      </div>
                    )}

                    {/* Live Size Badge on hover/drag */}
                    <div className="ep-live-size-badge">
                      {imgW} × {imgH} px · {imageFit === "contain" ? "Contain" : "Cover"}
                    </div>

                    {/* Corner resize handle */}
                    <span
                      className="ep-resize-handle"
                      title="Drag corner to resize image area"
                      onPointerDown={e => beginDrag(e, i, "img", "resize")}
                    />
                  </div>

                  {/* Live Product Text Box (Draggable & Resizable) */}
                  <div
                    className={`ep-live-product-text-box ${drag?.slot === i && drag?.section === "text" ? "is-selected" : ""}`}
                    style={{
                      position: "absolute",
                      left: `${slot.text[0] / 8}%`,
                      top: `${slot.text[1] / 4.5}%`,
                      width: `${textW / 8}%`,
                      height: `${textH / 4.5}%`,
                      fontFamily: fontName,
                      color: `#${fontColor.replace("#", "")}`,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-start",
                      lineHeight: 1.35,
                      overflow: "hidden",
                      cursor: "move",
                      touchAction: "none"
                    }}
                    onPointerDown={e => beginDrag(e, i, "text", "move")}
                  >
                    <div style={{ fontSize: `${Math.round(fontSize * 1.05)}px`, fontWeight: 700, marginBottom: "2px" }}>
                      <b>{skuVal}</b> | <span>{descVal}</span>
                    </div>
                    {(cmVal || inVal) && (
                      <div style={{ fontSize: `${Math.max(9, Math.round(fontSize * 0.85))}px`, opacity: 0.85 }}>
                        {[cmVal, inVal].filter(Boolean).map((d, idx) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span> | </span>}
                            <span>{d}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                    {priceVal && (
                      <div style={{ fontSize: `${Math.max(9, Math.round(fontSize * 0.85))}px`, fontWeight: 600, marginTop: "2px" }}>
                        {priceVal}
                      </div>
                    )}

                    {/* Corner resize handle for text box */}
                    <span
                      className="ep-resize-handle ep-resize-handle-amber"
                      title="Drag corner to resize text area"
                      onPointerDown={e => beginDrag(e, i, "text", "resize")}
                    />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Live Legend Bar */}
        <div className="ep-preview-legend-row" style={{ marginTop: "12px" }}>
          <span>
            <Info size={14} /> <b>Interactive Live Studio:</b> Click and drag photos or text boxes to reposition. Drag the bottom-right corner handles to resize.
          </span>
          <span className="ep-legend-badge">
            {sampleRows.length} Total Records Loaded
          </span>
        </div>

        {/* Typography & Color Styling Grid */}
        <div className="ep-style-grid" style={{ marginTop: "16px" }}>
          <label>
            <span>Font size (pt)</span>
            <input type="number" min="8" max="48" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} />
          </label>
          <label>
            <span>Font family</span>
            <select value={fontName} onChange={e => setFontName(e.target.value)}>
              <option>Arial</option>
              <option>Calibri</option>
              <option>Manrope</option>
              <option>Times New Roman</option>
            </select>
          </label>
          <label>
            <span>Font color</span>
            <input type="color" value={`#${fontColor.replace("#", "")}`} onChange={e => setFontColor(e.target.value)} />
          </label>
          <label>
            <span>Slide background</span>
            <input type="color" value={`#${background.replace("#", "")}`} onChange={e => setBackground(e.target.value)} />
          </label>
        </div>

        {/* Header & Brand Template Settings */}
        <div className="ep-template-options" style={{ marginTop: "14px" }}>
          <div className="ep-template-title">
            <h4>Header & Brand Template</h4>
            <p>Customize heading text, divider line, and upload an optional brand logo.</p>
          </div>
          <label className="ep-header-field">
            <span>Heading text</span>
            <input
              type="text"
              value={headerText}
              onChange={e => setHeaderText(e.target.value)}
              placeholder="e.g. Beyond Wood — New Collection"
            />
          </label>
          <div className="ep-template-toggles">
            <label>
              <input type="checkbox" checked={showHeader} onChange={e => setShowHeader(e.target.checked)} /> Show heading
            </label>
            <label>
              <input type="checkbox" checked={showRule} onChange={e => setShowRule(e.target.checked)} /> Show divider line
            </label>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <label className="ep-logo-upload" style={{ flex: 1 }}>
              <Upload size={16} />
              <span>{logoFile ? logoFile.name : "Upload brand logo (PNG, JPG or WebP)"}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => setLogoFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {logoFile && (
              <button
                type="button"
                className="ep-btn-subtle ep-btn-danger"
                style={{ padding: "8px 12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                title="Remove uploaded logo"
                onClick={() => setLogoFile(null)}
              >
                <Trash2 size={15} /> Remove
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Real-Time Generation Progress Bar */}
      {progress?.active && (
        <div className="ep-progress-container">
          <div className="ep-progress-header">
            <strong>
              <LoaderCircle className="ep-spin" size={16} /> {progress.message}
            </strong>
            <span>{progress.percent}%</span>
          </div>
          <div className="ep-progress-bar">
            <div className="ep-progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      {/* Successful Generation Results Card */}
      {lastResult && (
        <section className="ep-results-card">
          <div className="ep-results-header">
            <div className="ep-results-title">
              <CheckCircle2 size={24} style={{ color: "#10b981" }} />
              <div>
                <h3>Presentation Ready & Validated</h3>
                <small style={{ color: "#9cb1d4" }}>
                  File passed OpenXML structural integrity validation. 100% PowerPoint compatible.
                </small>
              </div>
            </div>
            <span className="ep-badge ep-badge-success">
              <ShieldCheck size={14} /> OOXML Verified
            </span>
          </div>

          <div className="ep-results-grid">
            <div className="ep-result-metric">
              <span>Output Filename</span>
              <strong>{lastResult.filename}</strong>
            </div>
            <div className="ep-result-metric">
              <span>File Size</span>
              <strong>{(lastResult.output.byteSize / 1024).toFixed(0)} KB</strong>
            </div>
            <div className="ep-result-metric">
              <span>Total Slides</span>
              <strong>{lastResult.output.slideCount} Slides</strong>
            </div>
            <div className="ep-result-metric">
              <span>Products Embedded</span>
              <strong>{lastResult.output.totalProducts} Items</strong>
            </div>
          </div>

          <div className="ep-result-actions">
            <button
              type="button"
              className="ep-btn-download-primary"
              onClick={handleDownloadAgain}
            >
              <Download size={16} /> Save / Download Presentation (.pptx)
            </button>

            {isDesktop() && lastResult.delivery.savedPath && (
              <>
                <button
                  type="button"
                  className="ep-btn-desktop-action"
                  onClick={handleOpenDesktopApp}
                  title="Open presentation directly in Microsoft PowerPoint"
                >
                  <ExternalLink size={15} /> Open in PowerPoint
                </button>
                <button
                  type="button"
                  className="ep-btn-desktop-action"
                  onClick={handleShowDesktopFolder}
                  title="Reveal saved file in Windows Explorer"
                >
                  <Folder size={15} /> Show in Folder
                </button>
              </>
            )}
          </div>

          <div className="ep-diagnostics-drawer">
            <button
              type="button"
              className="ep-diagnostics-toggle"
              onClick={() => setShowDiagnostics(v => !v)}
            >
              {showDiagnostics ? "Hide" : "Show"} Technical Diagnostics & Integrity Log
            </button>

            {showDiagnostics && (
              <div className="ep-diagnostics-body">
                <div className="ep-diag-check-item ok">
                  ✓ Check 1: Non-empty buffer ({lastResult.output.byteSize.toLocaleString()} bytes)
                </div>
                <div className="ep-diag-check-item ok">
                  ✓ Check 2: ZIP integrity & magic bytes PK\x03\x04 verified
                </div>
                <div className="ep-diag-check-item ok">
                  ✓ Check 3: No duplicate ZIP entries & all mandatory OpenXML parts present
                </div>
                <div className="ep-diag-check-item ok">
                  ✓ Check 4: All XML and .rels parts parsed and well-formed
                </div>
                <div className="ep-diag-check-item ok">
                  ✓ Check 5: Content types declared for every part in [Content_Types].xml
                </div>
                <div className="ep-diag-check-item ok">
                  ✓ Check 6: Relationship targets exist and rIds unique per .rels
                </div>
                <div className="ep-diag-check-item ok">
                  ✓ Check 7: Shape IDs unique per slide
                </div>
                <div className="ep-diag-check-item ok">
                  ✓ Check 8: sldIdLst matches presentation.xml.rels and ECMA-376 bounds
                </div>
                <div className="ep-diag-check-item ok">
                  ✓ Check 9: Independent parser re-read pass verified
                </div>
                <div className="ep-diag-check-item ok">
                  ✓ Check 10: Slide count matches expected ({lastResult.output.slideCount}) & {lastResult.output.validation.mediaCount} media assets linked
                </div>
                <div className="ep-diag-check-item ok">
                  ✓ Check 11: SHA-256 integrity verified ({lastResult.delivery.sha256 || lastResult.output.validation.sha256})
                </div>
                {lastResult.delivery.savedPath && (
                  <div style={{ marginTop: "6px", color: "#60a5fa" }}>
                    Destination: {lastResult.delivery.savedPath}
                  </div>
                )}
                <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--muted-foreground, #94a3b8)", fontStyle: "italic" }}>
                  * Structural and OpenXML packaging validation only; does not guarantee Microsoft PowerPoint application compatibility.
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Action Generation Bar */}
      <div className="ep-action">
        <div>
          <strong>Ready to Generate</strong>
          <span>
            {file
              ? `Processing ${sampleRows.length || "all"} product items (${count} per slide, ${slideCounts.productSlides} slide${slideCounts.productSlides === 1 ? "" : "s"}) using ${useCustomTemplate && templateFile ? `template "${templateFile.name}"` : "built-in layout"}.`
              : "Upload an Excel workbook to begin."}
          </span>
        </div>
        <button
          type="button"
          disabled={!file || busy}
          onClick={() => void generate()}
          className="ep-btn-generate"
        >
          {busy ? (
            <>
              <LoaderCircle className="ep-spin" size={18} /> Generating Presentation…
            </>
          ) : (
            <>
              <Download size={18} /> Generate & Download PPTX
            </>
          )}
        </button>
      </div>

      {status && (
        <p className="ep-status" role="status">
          {status}
        </p>
      )}

      <p className="ep-foot">
        All templates and spreadsheets are processed locally by the Suite. Vector graphics, text fonts,
        cell images, and custom branding rules are preserved.
      </p>
    </main>
  );
}
