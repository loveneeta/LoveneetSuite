/**
 * Loveneet Suite — Professional OpenXML PowerPoint Catalogue Generator
 * Produces 100% compliant, fully editable presentations from Excel spreadsheets and PPT templates.
 * Enforces strict ECMA-376 schema bounds (ST_SlideId), media declarations, and XML integrity.
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";
import { validatePptxPackage, type PptxValidationResult } from "./pptxValidator.ts";
import { type Slot, chunkProducts, calculateSlideCount } from "./layoutConfig.ts";
import { parseXmlDocument, serializeXmlDocument } from "./xmlHelper.ts";

export type { Slot };

export type SlideRatio = "16:9" | "4:3" | "A4 Landscape" | "A4 Portrait";

export interface Mapping {
  code: string;
  description: string;
  dim_cm: string;
  dim_in: string;
  price: string;
  length: string;
  width: string;
  height: string;
  image: string;
}

export interface GenerateOptions {
  imageFit?: "contain" | "cover";
  headerText?: string;
  showHeader?: boolean;
  showRule?: boolean;
  selectedSlideIndex?: number;
  customLayout?: Slot[];
  autoCenter?: boolean;
  fontSize?: number;
  fontName?: string;
  fontColor?: string;
  background?: string;
  logoFile?: File | Blob | null;
  ratio?: SlideRatio;
  sheetName?: string;
  onProgress?: (phase: string, percent: number, detail: string) => void;
}

export interface GenerationOutput {
  blob: Blob;
  validation: PptxValidationResult;
  totalProducts: number;
  slideCount: number;
  byteSize: number;
}

function escapeXml(unsafe: any): string {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Extracts human-readable string values from complex ExcelJS cell structures:
 * - Evaluated formula results (cell.value.result or cell.text)
 * - Rich text arrays (cell.value.richText)
 * - Formatted text preserving leading zeros (cell.text)
 * - Hyperlinks and plain primitives
 * Prevents [object Object] serialization failures.
 */
export function extractCellValue(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) return "";
  
  if (typeof cell.value === "object") {
    // Formula result
    if ("result" in cell.value && cell.value.result !== undefined && cell.value.result !== null) {
      return String(cell.value.result).trim();
    }
    // Rich text
    if ("richText" in cell.value && Array.isArray((cell.value as any).richText)) {
      return (cell.value as any).richText.map((t: any) => t.text || "").join("").trim();
    }
    // Hyperlink
    if ("text" in cell.value && typeof (cell.value as any).text === "string") {
      return (cell.value as any).text.trim();
    }
    if ("hyperlink" in cell.value) {
      return String((cell.value as any).hyperlink || "").trim();
    }
  }

  // Preserve formatted text with leading zeros if available (e.g. "00123" with numFmt)
  if (cell.text !== undefined && cell.text !== null && typeof cell.text === "string" && cell.text.trim()) {
    return cell.text.trim();
  }

  return String(cell.value).trim();
}

/**
 * Extracts width and height from PNG, JPEG, WebP, GIF, and BMP image buffers.
 */
export function parseBinaryImageDimensions(buffer: ArrayBuffer | Uint8Array): { width: number; height: number } | null {
  const buf = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  const byteOffset = (buffer && (buffer as any).byteOffset) || 0;
  const byteLength = (buffer && (buffer as any).byteLength) || buf.byteLength;
  const view = new DataView(buf, byteOffset, byteLength);
  if (view.byteLength < 16) return null;

  // PNG: bytes 16-23 contain width (uint32) and height (uint32)
  if (view.getUint32(0) === 0x89504E47 && view.getUint32(4) === 0x0D0A1A0A) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // GIF: GIF87a or GIF89a
  if (view.getUint8(0) === 0x47 && view.getUint8(1) === 0x49 && view.getUint8(2) === 0x46) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  // BMP: BM signature
  if (view.getUint16(0) === 0x424D && view.byteLength >= 26) {
    return { width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) };
  }

  // WebP: RIFF .... WEBP
  if (view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const chunkType = view.getUint32(12);
    // VP8_ (lossy)
    if (chunkType === 0x56503820 && view.byteLength >= 30) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    // VP8L (lossless)
    if (chunkType === 0x5650384C && view.byteLength >= 25) {
      const b1 = view.getUint8(21);
      const b2 = view.getUint8(22);
      const b3 = view.getUint8(23);
      const b4 = view.getUint8(24);
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { width, height };
    }
    // VP8X (extended)
    if (chunkType === 0x56503858 && view.byteLength >= 30) {
      const width = 1 + (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16));
      const height = 1 + (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16));
      return { width, height };
    }
  }

  // JPEG: start of image FF D8
  if (view.getUint16(0) === 0xFFD8) {
    let offset = 2;
    while (offset < view.byteLength - 8) {
      if (view.getUint8(offset) !== 0xFF) { offset++; continue; }
      while (offset < view.byteLength && view.getUint8(offset) === 0xFF) offset++;
      if (offset >= view.byteLength) break;
      const marker = view.getUint8(offset);
      offset++;
      // Standalone markers
      if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) continue;
      if (marker === 0xDA) break; // Start of Scan (entropy data follows)
      if (offset + 2 > view.byteLength) break;
      const len = view.getUint16(offset);
      // SOF markers: SOF0 to SOF3, SOF5 to SOF7, SOF9 to SOF11, SOF13 to SOF15
      const isSof = (marker >= 0xC0 && marker <= 0xC3) ||
                    (marker >= 0xC5 && marker <= 0xC7) ||
                    (marker >= 0xC9 && marker <= 0xCB) ||
                    (marker >= 0xCD && marker <= 0xCF);
      if (isSof && offset + 7 <= view.byteLength) {
        return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      }
      offset += len;
    }
  }

  return null;
}

export async function getImageDimensions(buffer: ArrayBuffer | Uint8Array): Promise<{ width: number; height: number } | null> {
  const binaryDims = parseBinaryImageDimensions(buffer);
  if (binaryDims && binaryDims.width > 0 && binaryDims.height > 0) {
    return binaryDims;
  }

  // Browser fallback using createImageBitmap
  if (typeof createImageBitmap === "function") {
    try {
      const blob = new Blob([buffer]);
      const bmp = await createImageBitmap(blob);
      const res = { width: bmp.width, height: bmp.height };
      bmp.close();
      return res;
    } catch {}
  }

  return null;
}

/**
 * Reads slide files following presentation.xml sldIdLst order rather than arbitrary filenames.
 */
export function getOrderedSlideFiles(zip: JSZip, presDoc: Document, presRelsDoc: Document): string[] {
  const relsMap = new Map<string, string>();
  const relNodes = presRelsDoc.getElementsByTagName("Relationship");
  for (let i = 0; i < relNodes.length; i++) {
    const id = relNodes[i].getAttribute("Id");
    const target = relNodes[i].getAttribute("Target");
    if (id && target) {
      const cleanTarget = target.startsWith("slides/")
        ? `ppt/${target}`
        : target.startsWith("/")
        ? target.slice(1)
        : `ppt/slides/${target}`;
      relsMap.set(id, cleanTarget);
    }
  }

  const ordered: string[] = [];
  const sldIdNodes = presDoc.getElementsByTagName("p:sldId");
  for (let i = 0; i < sldIdNodes.length; i++) {
    const rId = sldIdNodes[i].getAttribute("r:id") || sldIdNodes[i].getAttribute("id");
    if (rId && relsMap.has(rId)) {
      const targetFile = relsMap.get(rId)!;
      if (zip.file(targetFile)) {
        ordered.push(targetFile);
      }
    }
  }

  if (ordered.length > 0) return ordered;

  // Fallback: alphabetical filename sort
  const slideFiles = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k));
  slideFiles.sort((a, b) => {
    const na = parseInt(a.match(/slide(\d+)/i)?.[1] || "0", 10);
    const nb = parseInt(b.match(/slide(\d+)/i)?.[1] || "0", 10);
    return na - nb;
  });
  return slideFiles;
}

/**
 * Core PowerPoint generation engine.
 */
export async function generateCataloguePptx(
  excelFileOrBuf: File | ArrayBuffer,
  templateBuf: ArrayBuffer,
  mapping: Mapping,
  options: GenerateOptions = {}
): Promise<GenerationOutput> {
  const {
    imageFit = "contain",
    headerText = "",
    showHeader = true,
    showRule = true,
    selectedSlideIndex = 0,
    customLayout,
    autoCenter = true,
    fontSize = 14,
    fontName = "Calibri",
    fontColor = "000000",
    background = "FFFFFF",
    logoFile = null,
    ratio = "16:9",
    sheetName,
    onProgress
  } = options;

  onProgress?.("parsing", 10, "Parsing Excel workbook & extracting product records…");

  // 1. Parse Excel Workbook (Browser File/Blob or Node Buffer/Uint8Array/ArrayBuffer)
  let excelBuf: ArrayBuffer;
  if (excelFileOrBuf instanceof ArrayBuffer) {
    excelBuf = excelFileOrBuf;
  } else if (ArrayBuffer.isView(excelFileOrBuf)) {
    excelBuf = excelFileOrBuf.buffer.slice(
      excelFileOrBuf.byteOffset,
      excelFileOrBuf.byteOffset + excelFileOrBuf.byteLength
    ) as ArrayBuffer;
  } else if (typeof (excelFileOrBuf as any)?.arrayBuffer === "function") {
    excelBuf = await (excelFileOrBuf as any).arrayBuffer();
  } else {
    throw new Error("Invalid Excel input: expected File, Blob, Buffer, or ArrayBuffer.");
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excelBuf);

  // Select worksheet: by requested sheetName or first worksheet
  let ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) {
    ws = wb.worksheets[0];
  }
  if (!ws) throw new Error("No worksheets found in the Excel workbook.");

  // Extract cell-anchored images with row and column awareness
  // Structure: imgMap.get(`${row}_${col}`) and imgByRow.get(row)
  const imgByRow = new Map<number, any>();
  const imgByRowAndCol = new Map<string, any>();

  try {
    const images = ws.getImages ? ws.getImages() : [];
    for (const img of images) {
      let rowNum = 0;
      let colNum = 0;
      if (img.range && img.range.tl) {
        if (typeof img.range.tl.nativeRow === "number") {
          rowNum = Math.floor(img.range.tl.nativeRow) + 1;
        } else if (typeof img.range.tl.row === "number") {
          rowNum = Math.floor(img.range.tl.row) + 1;
        }

        if (typeof img.range.tl.nativeCol === "number") {
          colNum = Math.floor(img.range.tl.nativeCol) + 1;
        } else if (typeof img.range.tl.col === "number") {
          colNum = Math.floor(img.range.tl.col) + 1;
        }
      }

      const media = (wb.model?.media as any)?.[img.imageId] || (wb.model?.media || []).find(
        (m: any) => m.index === img.imageId || String(m.index) === String(img.imageId)
      );

      if (media && media.buffer && rowNum > 0) {
        if (!imgByRow.has(rowNum)) {
          imgByRow.set(rowNum, media);
        }
        if (colNum > 0) {
          imgByRowAndCol.set(`${rowNum}_${colNum}`, media);
        }
      }
    }
  } catch (e) {
    console.warn("Could not read embedded worksheet images:", e);
  }

  // Header detection: dynamically scan rows 1 through 5 to find the best header row
  let bestHeaderRow = 1;
  let maxHeaderScore = -1;
  const recognizedTerms = [
    "code", "sku", "item", "product", "desc", "description", "cm", "inch",
    "dim", "size", "price", "image", "photo", "mrp", "rate", "cost", "buyer",
    "model", "style", "art", "ref", "name", "picture"
  ];

  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const row = ws.getRow(r);
    let populatedCount = 0;
    let matchScore = 0;
    row.eachCell((cell) => {
      const v = extractCellValue(cell).toLowerCase().trim();
      if (v) {
        populatedCount++;
        if (recognizedTerms.some(term => v.includes(term))) {
          matchScore += 4;
        } else {
          matchScore += 1;
        }
      }
    });
    if (matchScore > maxHeaderScore && populatedCount >= 1) {
      maxHeaderScore = matchScore;
      bestHeaderRow = r;
    }
  }

  const headers: Record<string, number> = {};
  const headerColCounts: Record<string, number> = {};

  const registerHeader = (name: string, colNum: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    headerColCounts[lower] = (headerColCounts[lower] || 0) + 1;
    if (headerColCounts[lower] === 1) {
      headers[lower] = colNum;
      headers[`${lower} (1)`] = colNum;
    } else {
      headers[`${lower} (${headerColCounts[lower]})`] = colNum;
    }
  };

  ws.getRow(bestHeaderRow).eachCell((cell, colNumber) => {
    const rawVal = extractCellValue(cell);
    if (rawVal) {
      registerHeader(rawVal, colNumber);
    }
  });

  // Check adjacent rows (e.g. multi-row merged headers on row above or below)
  if (bestHeaderRow > 1) {
    ws.getRow(bestHeaderRow - 1).eachCell((cell, colNumber) => {
      const rawVal = extractCellValue(cell);
      if (rawVal) {
        const lower = rawVal.toLowerCase().trim();
        if (!headers[lower]) registerHeader(rawVal, colNumber);
      }
    });
  }
  if (bestHeaderRow + 1 <= ws.rowCount) {
    ws.getRow(bestHeaderRow + 1).eachCell((cell, colNumber) => {
      const rawVal = extractCellValue(cell);
      if (rawVal) {
        const lower = rawVal.toLowerCase().trim();
        if (!headers[lower]) registerHeader(rawVal, colNumber);
      }
    });
  }

  const findColNumber = (name: string): number | null => {
    if (!name) return null;
    const target = name.trim().toLowerCase();

    // 1. Direct exact match in headers
    if (headers[target] !== undefined) return headers[target];

    // 2. Disambiguated base match e.g. "Buyer Code (2)" -> try exact or base "Buyer Code"
    const baseTarget = target.replace(/\s*\(\d+\)$/, "").trim();
    if (headers[baseTarget] !== undefined) return headers[baseTarget];

    // 3. Normalization (strip non-alphanumeric)
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetNorm = norm(target);
    for (const [k, v] of Object.entries(headers)) {
      if (norm(k) === targetNorm) return v;
    }

    // 4. Exact word / phrase match (NEVER match single letters or short fragments < 3 chars)
    for (const [k, v] of Object.entries(headers)) {
      const cleanK = k.replace(/\s*\(\d+\)$/, "").trim();
      if (cleanK.length >= 3 && target.length >= 3) {
        if (cleanK === target || norm(cleanK) === norm(target)) return v;
        const escapedT = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\b${escapedT}\\b`, "i").test(cleanK)) return v;
        const escapedK = cleanK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\b${escapedK}\\b`, "i").test(target)) return v;
      }
    }
    return null;
  };

  const getCol = (key: keyof Mapping, ...fallbacks: string[]): number | null => {
    const userSelected = (mapping[key] || "").trim();
    if (userSelected) {
      const col = findColNumber(userSelected);
      if (col) return col;
    }
    for (const fb of fallbacks) {
      const col = findColNumber(fb);
      if (col) return col;
    }
    return null;
  };

  const codeCol = getCol("code", "buyer code", "buyer code / sku", "sku", "item code", "item no", "item #", "product code", "product id", "model no", "style no", "art no", "article no", "code", "item");
  const descCol = getCol("description", "product description", "description", "product name", "product", "item name", "item description", "desc");
  const dimCmCol = getCol("dim_cm", "product dimension (cm)", "dimension (cm)", "dimensions (cm)", "dimension cm", "size cm", "size (cm)");
  const dimInCol = getCol("dim_in", "carton dimension (inch)", "dimension (inch)", "dimensions (inch)", "dimension in", "size in", "size (inch)");
  const priceCol = getCol("price", "price (usd)", "price", "mrp", "rate", "cost");
  const lCol = getCol("length", "length", " l");
  const wCol = getCol("width", "width", "breadth", " w");
  const hCol = getCol("height", "height", " h");
  const imageCol = getCol("image", "product image (embedded)", "product image", "image", "photo", "picture", "img");

  // Extract products
  const products: Array<{
    code: string;
    description: string;
    dim_cm: string;
    dim_in: string;
    price: string;
    image?: any;
    imageLink?: string;
  }> = [];

  const startRow = bestHeaderRow + 1;

  ws.eachRow((row, rIdx) => {
    // Skip hidden rows if any
    if ((row as any).hidden) return;

    if (rIdx >= startRow) {
      const codeRaw = codeCol ? extractCellValue(row.getCell(codeCol)) : "";
      const desc = descCol ? extractCellValue(row.getCell(descCol)) : "";
      let d_cm = dimCmCol ? extractCellValue(row.getCell(dimCmCol)) : "";
      let d_in = dimInCol ? extractCellValue(row.getCell(dimInCol)) : "";
      const lVal = lCol ? extractCellValue(row.getCell(lCol)) : "";
      const wVal = wCol ? extractCellValue(row.getCell(wCol)) : "";
      const hVal = hCol ? extractCellValue(row.getCell(hCol)) : "";

      if (!d_cm && (lVal || wVal || hVal)) {
        d_cm = [lVal, wVal, hVal].filter(Boolean).join(" x ") + " CM";
      } else if (d_cm && !d_cm.toUpperCase().endsWith("CM")) {
        d_cm = `${d_cm} CM`;
      }

      if (!d_in && (lVal || wVal || hVal)) {
        try {
          const parts = [lVal, wVal, hVal].filter(Boolean).map(v => {
            const n = parseFloat(v);
            return isNaN(n) ? v : (n / 2.54).toFixed(1);
          });
          d_in = parts.join(" x ") + " IN";
        } catch {}
      } else if (d_in && !d_in.toUpperCase().endsWith("IN")) {
        d_in = `${d_in} IN`;
      }

      const priceVal = priceCol ? extractCellValue(row.getCell(priceCol)) : "";

      // Embedded image lookup: prefer image in mapped image column, fallback to row
      let embeddedImg: any = null;
      if (imageCol && imgByRowAndCol.has(`${rIdx}_${imageCol}`)) {
        embeddedImg = imgByRowAndCol.get(`${rIdx}_${imageCol}`);
      } else if (imgByRow.has(rIdx)) {
        embeddedImg = imgByRow.get(rIdx);
      }

      let linkVal = "";
      if (!embeddedImg && imageCol) {
        const rawImgCell = row.getCell(imageCol).value;
        if (typeof rawImgCell === "string") {
          linkVal = rawImgCell.trim();
        } else if (rawImgCell && typeof rawImgCell === "object") {
          linkVal = String((rawImgCell as any).hyperlink || (rawImgCell as any).text || "").trim();
        }
      }

      // Check if this row has any product data (text, image, dimensions, or price)
      let hasRowContent = Boolean(
        codeRaw ||
        desc ||
        priceVal ||
        embeddedImg ||
        linkVal ||
        d_cm ||
        d_in
      );

      if (!hasRowContent) {
        row.eachCell((cell) => {
          if (extractCellValue(cell)) hasRowContent = true;
        });
      }

      if (hasRowContent) {
        // Fallback for missing SKU: use codeRaw if available, or generate a clean sequential SKU
        const itemNumber = products.length + 1;
        const code = codeRaw || `SKU-${String(itemNumber).padStart(4, "0")}`;

        products.push({
          code,
          description: desc,
          dim_cm: d_cm,
          dim_in: d_in,
          price: priceVal,
          image: embeddedImg,
          imageLink: linkVal
        });
      }
    }
  });

  if (products.length === 0) {
    throw new Error("No product records found in the Excel sheet. Ensure the worksheet contains data rows.");
  }

  onProgress?.("template", 25, `Loaded ${products.length} products. Loading PowerPoint base template…`);

  // 2. Load Presentation Template
  const zip = await JSZip.loadAsync(templateBuf);
  const presXmlStr = await zip.file("ppt/presentation.xml")?.async("text");
  const presRelsStr = await zip.file("ppt/_rels/presentation.xml.rels")?.async("text");
  const contentTypesStr = await zip.file("[Content_Types].xml")?.async("text");

  if (!presXmlStr || !presRelsStr || !contentTypesStr) {
    throw new Error("The PowerPoint template is missing essential files (presentation.xml, rels, or content types).");
  }

  const ctDoc = parseXmlDocument(contentTypesStr);
  const ctRoot = ctDoc.documentElement;

  const presDoc = parseXmlDocument(presXmlStr);
  const presRelsDoc = parseXmlDocument(presRelsStr);
  const presRelsRoot = presRelsDoc.documentElement;

  // Media defaults in [Content_Types].xml
  const mediaDefaults = [
    { ext: "jpeg", type: "image/jpeg" },
    { ext: "jpg", type: "image/jpeg" },
    { ext: "png", type: "image/png" },
    { ext: "webp", type: "image/webp" },
    { ext: "gif", type: "image/gif" }
  ];

  const existingDefaultExts = new Set<string>();
  const defaultNodes = ctDoc.getElementsByTagName("Default");
  for (let i = 0; i < defaultNodes.length; i++) {
    const ext = defaultNodes[i].getAttribute("Extension");
    if (ext) existingDefaultExts.add(ext.toLowerCase());
  }

  for (const { ext, type } of mediaDefaults) {
    if (!existingDefaultExts.has(ext.toLowerCase())) {
      const defElem = ctDoc.createElementNS(
        "http://schemas.openxmlformats.org/package/2006/content-types",
        "Default"
      );
      defElem.setAttribute("Extension", ext);
      defElem.setAttribute("ContentType", type);
      ctRoot.appendChild(defElem);
      existingDefaultExts.add(ext.toLowerCase());
    }
  }

  // Get presentation slide files in actual visual presentation order
  const orderedSlideFiles = getOrderedSlideFiles(zip, presDoc, presRelsDoc);
  if (orderedSlideFiles.length === 0) {
    throw new Error("No slides found in presentation template.");
  }

  // Template Dimensions & Aspect Ratio Configuration
  let cx = 12192000;
  let cy = 6858000;
  const sldSzNodes = presDoc.getElementsByTagName("p:sldSz");
  if (sldSzNodes.length > 0) {
    const sldSzElem = sldSzNodes[0];
    if (ratio === "4:3") {
      cx = 9144000;
      cy = 6858000;
      sldSzElem.setAttribute("cx", String(cx));
      sldSzElem.setAttribute("cy", String(cy));
      sldSzElem.setAttribute("type", "screen4x3");
    } else if (ratio === "A4 Landscape") {
      cx = 10692000;
      cy = 7560000;
      sldSzElem.setAttribute("cx", String(cx));
      sldSzElem.setAttribute("cy", String(cy));
      sldSzElem.setAttribute("type", "A4");
    } else if (ratio === "A4 Portrait") {
      cx = 7560000;
      cy = 10692000;
      sldSzElem.setAttribute("cx", String(cx));
      sldSzElem.setAttribute("cy", String(cy));
      sldSzElem.setAttribute("type", "A4");
    } else {
      // 16:9 Widescreen
      const existingCx = parseInt(sldSzElem.getAttribute("cx") || "12192000", 10);
      const existingCy = parseInt(sldSzElem.getAttribute("cy") || "6858000", 10);
      cx = existingCx;
      cy = existingCy;
    }
  }

  // Identify product template slide vs cover / closing slides
  const targetIdx = selectedSlideIndex >= 0 && selectedSlideIndex < orderedSlideFiles.length ? selectedSlideIndex : 0;
  const productTemplateSlideFile = orderedSlideFiles[targetIdx];
  const productTemplateRelsFile = productTemplateSlideFile.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";

  const productSlideXmlBase = await zip.file(productTemplateSlideFile)?.async("text");
  const productSlideRelsBase = (await zip.file(productTemplateRelsFile)?.async("text")) ||
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';

  if (!productSlideXmlBase) {
    throw new Error(`Template slide ${productTemplateSlideFile} could not be read.`);
  }

  // Multi-slide template preservation:
  // preSlides: slides before product slide (e.g. Cover slide)
  // postSlides: slides after product slide (e.g. Closing / Contact slide)
  const isMultiSlideTemplate = orderedSlideFiles.length > 1;
  const preSlideFiles = isMultiSlideTemplate ? orderedSlideFiles.slice(0, targetIdx) : [];
  const postSlideFiles = isMultiSlideTemplate ? orderedSlideFiles.slice(targetIdx + 1) : [];

  // Snapshot XML and rels of pre and post slides before any zip mutations occur
  const preSlideData = await Promise.all(
    preSlideFiles.map(async f => {
      const xml = (await zip.file(f)?.async("text")) || "";
      const relsFile = f.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
      const rels =
        (await zip.file(relsFile)?.async("text")) ||
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
      return { xml, rels };
    })
  );

  const postSlideData = await Promise.all(
    postSlideFiles.map(async f => {
      const xml = (await zip.file(f)?.async("text")) || "";
      const relsFile = f.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
      const rels =
        (await zip.file(relsFile)?.async("text")) ||
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
      return { xml, rels };
    })
  );

  // Detect product slots in product template slide
  const spRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  const slotShapes: Array<{ rawXml: string; offX: number; offY: number; extCx: number; extCy: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = spRegex.exec(productSlideXmlBase)) !== null) {
    const spXml = m[0];
    const texts = [...spXml.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map(t => t[1]).join(" ");
    const isCandidate = /(?:SKU|Item\s*Name|Price|CM|IN|Dimensions?|00\.00)/i.test(texts) || spXml.includes("Text Placeholder");
    if (isCandidate) {
      const offXMatch = spXml.match(/<a:off\s+x="(\d+)"/);
      const offX = offXMatch ? parseInt(offXMatch[1], 10) : 0;
      const offYMatch = spXml.match(/<a:off\s+x="\d+"\s+y="(\d+)"/);
      const offY = offYMatch ? parseInt(offYMatch[1], 10) : 0;
      const extCxMatch = spXml.match(/<a:ext\s+cx="(\d+)"/);
      const extCx = extCxMatch ? parseInt(extCxMatch[1], 10) : 3400000;
      const extCyMatch = spXml.match(/<a:ext\s+cx="\d+"\s+cy="(\d+)"/);
      const extCy = extCyMatch ? parseInt(extCyMatch[1], 10) : 600000;
      slotShapes.push({ rawXml: spXml, offX, offY, extCx, extCy });
    }
  }
  slotShapes.sort((a, b) => a.offX - b.offX);

  const slotsCount = customLayout && customLayout.length > 0 ? customLayout.length : (slotShapes.length || 3);
  const productChunks = chunkProducts(products, slotsCount);
  const numProductSlides = productChunks.length;
  const totalSlideCount = preSlideFiles.length + numProductSlides + postSlideFiles.length;

  // Process optional Brand Logo
  let brandLogoMediaName = "";
  if (logoFile) {
    let logoBuf: ArrayBuffer;
    if (logoFile instanceof ArrayBuffer) {
      logoBuf = logoFile;
    } else if (ArrayBuffer.isView(logoFile)) {
      logoBuf = (logoFile as Uint8Array).buffer.slice(
        (logoFile as Uint8Array).byteOffset,
        (logoFile as Uint8Array).byteOffset + (logoFile as Uint8Array).byteLength
      );
    } else if (typeof (logoFile as any).arrayBuffer === "function") {
      logoBuf = await (logoFile as any).arrayBuffer();
    } else {
      logoBuf = new ArrayBuffer(0);
    }
    if (logoBuf.byteLength > 0) {
      const ext = (logoFile as any).name ? ((logoFile as any).name.split(".").pop() || "png").toLowerCase() : "png";
      brandLogoMediaName = `brand_logo.${ext}`;
      zip.file(`ppt/media/${brandLogoMediaName}`, logoBuf);
    }
  }

  onProgress?.("media", 40, `Generating ${totalSlideCount} slides and processing product images…`);

  // Clear existing sldIdLst in presentation.xml so we can rebuild the ordered presentation
  const sldIdLst = presDoc.getElementsByTagName("p:sldIdLst")[0] || presDoc.getElementsByTagName("sldIdLst")[0];
  if (sldIdLst) {
    while (sldIdLst.firstChild) {
      sldIdLst.removeChild(sldIdLst.firstChild);
    }
  }

  // Clear existing slide relationships from presentation.xml.rels
  const presRelNodes = presRelsDoc.getElementsByTagName("Relationship");
  const relsToRemove: Node[] = [];
  for (let i = 0; i < presRelNodes.length; i++) {
    const type = presRelNodes[i].getAttribute("Type") || "";
    if (type.endsWith("/slide")) {
      relsToRemove.push(presRelNodes[i]);
    }
  }
  relsToRemove.forEach(r => presRelsRoot.removeChild(r));

  // Remove existing slide overrides from [Content_Types].xml
  const overrideNodes = ctDoc.getElementsByTagName("Override");
  const overridesToRemove: Node[] = [];
  for (let i = 0; i < overrideNodes.length; i++) {
    const part = overrideNodes[i].getAttribute("PartName") || "";
    if (/^\/ppt\/slides\/slide\d+\.xml$/i.test(part)) {
      overridesToRemove.push(overrideNodes[i]);
    }
  }
  overridesToRemove.forEach(o => ctRoot.removeChild(o));

  // Clear existing slide files from zip before writing new deck
  const existingSlideKeys = Object.keys(zip.files).filter(k => /^ppt\/slides\/(?:_rels\/)?slide\d+\.xml(?:\.rels)?$/i.test(k));
  for (const k of existingSlideKeys) {
    zip.remove(k);
  }

  // Determine next safe ID values
  let nextSldId = 256;
  let nextPresRId = 100;

  let currentSlideNumber = 1;

  // 1. Emit Pre-Slides (e.g. Cover slide)
  for (const pre of preSlideData) {
    const outSlideName = `slide${currentSlideNumber}.xml`;
    const outRelsName = `slide${currentSlideNumber}.xml.rels`;

    zip.file(`ppt/slides/${outSlideName}`, pre.xml);
    zip.file(`ppt/slides/_rels/${outRelsName}`, pre.rels);

    // Register in presentation.xml.rels
    const presRelId = `rId${nextPresRId++}`;
    const relElem = presRelsDoc.createElementNS("http://schemas.openxmlformats.org/package/2006/relationships", "Relationship");
    relElem.setAttribute("Id", presRelId);
    relElem.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide");
    relElem.setAttribute("Target", `slides/${outSlideName}`);
    presRelsRoot.appendChild(relElem);

    // Register in presentation.xml
    if (sldIdLst) {
      const sldElem = presDoc.createElementNS("http://schemas.openxmlformats.org/presentationml/2006/main", "p:sldId");
      sldElem.setAttribute("id", String(nextSldId++));
      sldElem.setAttribute("r:id", presRelId);
      sldIdLst.appendChild(sldElem);
    }

    // Register in [Content_Types].xml
    const overElem = ctDoc.createElementNS("http://schemas.openxmlformats.org/package/2006/content-types", "Override");
    overElem.setAttribute("PartName", `/ppt/slides/${outSlideName}`);
    overElem.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.presentationml.slide+xml");
    ctRoot.appendChild(overElem);

    currentSlideNumber++;
  }

  // 2. Emit Product Slides
  for (let pIdx = 0; pIdx < numProductSlides; pIdx++) {
    const outSlideName = `slide${currentSlideNumber}.xml`;
    const outRelsName = `slide${currentSlideNumber}.xml.rels`;
    let slideXml = productSlideXmlBase;
    const sRelsDoc = parseXmlDocument(productSlideRelsBase);
    const sRelsRoot = sRelsDoc.documentElement;
    const slideProducts = productChunks[pIdx] || [];

    // Header customization
    if (headerText) {
      slideXml = slideXml.replace(/<a:t>\s*NOBLE SELECTIONS\s*<\/a:t>/g, `<a:t>${escapeXml(headerText)}</a:t>`);
    }
    if (!showHeader) {
      slideXml = slideXml.replace(/<p:sp>[\s\S]*?NOBLE SELECTIONS[\s\S]*?<\/p:sp>/g, "");
    }
    if (!showRule) {
      slideXml = slideXml.replace(/<p:cxnSp[\s\S]*?Straight Connector 17[\s\S]*?<\/p:cxnSp>/g, "");
    }

    // Custom background
    if (background && background.toUpperCase().replace("#", "") !== "FFFFFF") {
      const bgHex = background.toUpperCase().replace("#", "");
      const bgXml = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgHex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
      if (!slideXml.includes("<p:bg>")) {
        slideXml = slideXml.replace("<p:spTree>", `${bgXml}<p:spTree>`);
      } else {
        slideXml = slideXml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, bgXml);
      }
    }

    // If template has extra slots, clear them
    for (let extraIdx = slotsCount; extraIdx < slotShapes.length; extraIdx++) {
      const extraSlot = slotShapes[extraIdx];
      const emptyTxBody = `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>`;
      slideXml = slideXml.replace(extraSlot.rawXml, () => emptyTxBody);
    }

    // Relationship counter for slide
    const existingSlideRelIds: number[] = [];
    const sRelNodes = sRelsDoc.getElementsByTagName("Relationship");
    for (let i = 0; i < sRelNodes.length; i++) {
      const rId = sRelNodes[i].getAttribute("Id") || "";
      const match = rId.match(/^rId(\d+)$/);
      if (match) existingSlideRelIds.push(parseInt(match[1], 10));
    }
    let nextSlideRId = Math.max(...existingSlideRelIds, 0) + 1;
    let picsXml = "";

    // Brand Logo Embedding
    if (brandLogoMediaName) {
      const logoRelId = `rId${nextSlideRId++}`;
      const relElem = sRelsDoc.createElementNS(
        "http://schemas.openxmlformats.org/package/2006/relationships",
        "Relationship"
      );
      relElem.setAttribute("Id", logoRelId);
      relElem.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image");
      relElem.setAttribute("Target", `../media/${brandLogoMediaName}`);
      sRelsRoot.appendChild(relElem);

      const logoX = Math.round(cx - 1700000);
      const logoY = Math.round(250000);
      const logoW = Math.round(1400000);
      const logoH = Math.round(450000);
      const logoPicId = 9999 + pIdx;
      picsXml += `<p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:nvPicPr><p:cNvPr id="${logoPicId}" name="Brand Logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${logoRelId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${logoX}" y="${logoY}"/><a:ext cx="${logoW}" cy="${logoH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    }

    // Populate each product slot
    for (let slotIdx = 0; slotIdx < slotsCount; slotIdx++) {
      const prodIdx = pIdx * slotsCount + slotIdx;
      const prod = slideProducts[slotIdx];
      const slot = slotShapes[slotIdx];
      const userSlot = customLayout && customLayout[slotIdx];

      if (prod && (slot || userSlot)) {
        const dimStr = [prod.dim_cm, prod.dim_in].filter(Boolean).join(" | ");
        const szMain = Math.round((fontSize || 14) * 100);
        const szSub = Math.max(700, szMain - 200);
        const fontNameClean = escapeXml(fontName || "Calibri");
        const fontColorXml = fontColor ? `<a:srgbClr val="${fontColor.replace("#", "")}"/>` : "";

        const alignH = userSlot?.alignH || "left";
        const alignV = userSlot?.alignV || "top";
        const anchorVal = alignV === "top" ? "t" : alignV === "bottom" ? "b" : "ctr";
        const algnVal = alignH === "center" ? "ctr" : alignH === "right" ? "r" : "l";
        const pPrXml = `<a:pPr algn="${algnVal}"/>`;

        const newTxBody = `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="${anchorVal}"/><a:lstStyle/><a:p>${pPrXml}<a:r><a:rPr lang="en-US" b="1" sz="${szMain}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>${escapeXml(prod.code)} | </a:t></a:r><a:r><a:rPr lang="en-US" b="0" sz="${szMain}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>${escapeXml(prod.description)}</a:t></a:r></a:p>${dimStr ? `<a:p>${pPrXml}<a:r><a:rPr lang="en-US" b="1" sz="${szSub}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>${escapeXml(dimStr)}</a:t></a:r></a:p>` : ""}${prod.price ? `<a:p>${pPrXml}<a:r><a:rPr lang="en-US" b="1" sz="${szSub}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>PRICE : ${escapeXml(prod.price)}</a:t></a:r></a:p>` : ""}</p:txBody>`;

        if (slot) {
          let updatedSlot = slot.rawXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, () => newTxBody);

          if (userSlot) {
            const textOffX = Math.round((userSlot.text[0] / 800) * cx);
            const textOffY = Math.round((userSlot.text[1] / 450) * cy);
            const textExtCx = Math.round(((userSlot.text[2] - userSlot.text[0]) / 800) * cx);
            const textExtCy = Math.round(((userSlot.text[3] - userSlot.text[1]) / 450) * cy);
            updatedSlot = updatedSlot.replace(/<a:off\s+x="\d+"\s+y="\d+"/, `<a:off x="${textOffX}" y="${textOffY}"`);
            updatedSlot = updatedSlot.replace(/<a:ext\s+cx="\d+"\s+cy="\d+"/, `<a:ext cx="${textExtCx}" cy="${textExtCy}"`);
          }

          slideXml = slideXml.replace(slot.rawXml, () => updatedSlot);
        }

        // Image Handling
        let imgBuffer: ArrayBuffer | null = null;
        let imgExt = "png";

        if (prod.image && prod.image.buffer) {
          imgBuffer = prod.image.buffer;
          imgExt = prod.image.extension || "png";
        } else if (prod.imageLink) {
          if (prod.imageLink.startsWith("data:image/")) {
            try {
              const matches = prod.imageLink.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
              if (matches) {
                imgExt = matches[1] === "jpeg" ? "jpg" : matches[1];
                imgBuffer = base64ToArrayBuffer(matches[2]);
              }
            } catch (e) {
              console.warn("Could not decode data URI image:", e);
            }
          } else if (prod.imageLink.startsWith("http://") || prod.imageLink.startsWith("https://")) {
            try {
              const res = await fetch(prod.imageLink);
              if (res.ok) {
                imgBuffer = await res.arrayBuffer();
                if (prod.imageLink.includes(".jpg") || prod.imageLink.includes(".jpeg")) imgExt = "jpg";
                else if (prod.imageLink.includes(".webp")) imgExt = "webp";
              }
            } catch (e) {
              console.warn("Could not fetch remote image link:", e);
            }
          }
        }

        if (imgBuffer) {
          const imgFilename = `prod_img_${pIdx + 1}_${slotIdx}.${imgExt}`;
          zip.file(`ppt/media/${imgFilename}`, imgBuffer);

          const imgRelId = `rId${nextSlideRId++}`;
          const relElem = sRelsDoc.createElementNS(
            "http://schemas.openxmlformats.org/package/2006/relationships",
            "Relationship"
          );
          relElem.setAttribute("Id", imgRelId);
          relElem.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image");
          relElem.setAttribute("Target", `../media/${imgFilename}`);
          sRelsRoot.appendChild(relElem);

          // Calculate bounding box in EMUs
          let boxX = slot ? slot.offX : Math.round((slotIdx * 260 / 800) * cx);
          let boxY = slot ? Math.max(700000, slot.offY - 4400000) : Math.round((80 / 450) * cy);
          let boxW = slot ? slot.extCx : Math.round((220 / 800) * cx);
          let boxH = slot ? Math.max(1000000, slot.offY - boxY - 100000) : Math.round((180 / 450) * cy);

          if (userSlot) {
            let imgLeft = userSlot.img[0];
            const imgW800 = userSlot.img[2] - userSlot.img[0];
            if (autoCenter) {
              const textCenterX = (userSlot.text[0] + userSlot.text[2]) / 2;
              imgLeft = Math.max(0, Math.min(800 - imgW800, Math.round(textCenterX - imgW800 / 2)));
            }
            boxX = Math.round((imgLeft / 800) * cx);
            boxY = Math.round((userSlot.img[1] / 450) * cy);
            boxW = Math.round((imgW800 / 800) * cx);
            boxH = Math.round(((userSlot.img[3] - userSlot.img[1]) / 450) * cy);
          }

          // Compute aspect ratio & placement for contain vs cover
          let picX = boxX;
          let picY = boxY;
          let picW = boxW;
          let picH = boxH;
          let srcRectXml = "";

          let imgDims = await getImageDimensions(imgBuffer);
          if (!imgDims && prod.image && (prod.image as any).width && (prod.image as any).height) {
            imgDims = { width: (prod.image as any).width, height: (prod.image as any).height };
          }
          if (imgDims && imgDims.width > 0 && imgDims.height > 0) {
            const imgAspect = imgDims.width / imgDims.height;
            const boxAspect = boxW / Math.max(1, boxH);

            if (imageFit === "cover") {
              // Cover mode: fill slot box completely and symmetrically crop overflow
              picX = boxX;
              picY = boxY;
              picW = boxW;
              picH = boxH;
              if (imgAspect > boxAspect) {
                // Image is wider than box -> crop left/right
                const cropRatio = (1 - boxAspect / imgAspect) / 2;
                const cropPct = Math.round(cropRatio * 100000);
                srcRectXml = `<a:srcRect l="${cropPct}" r="${cropPct}" t="0" b="0"/>`;
              } else if (imgAspect < boxAspect) {
                // Image is taller than box -> crop top/bottom
                const cropRatio = (1 - imgAspect / boxAspect) / 2;
                const cropPct = Math.round(cropRatio * 100000);
                srcRectXml = `<a:srcRect l="0" r="0" t="${cropPct}" b="${cropPct}"/>`;
              }
            } else {
              // Contain mode: scale proportionally to fit inside slot box without cropping
              if (imgAspect > boxAspect) {
                picW = boxW;
                picH = Math.round(boxW / imgAspect);
                picX = boxX;
                picY = boxY + Math.round((boxH - picH) / 2);
              } else {
                picH = boxH;
                picW = Math.round(boxH * imgAspect);
                picY = boxY;
                picX = boxX + Math.round((boxW - picW) / 2);
              }
            }
          }

          const picId = 2000 + prodIdx;
          const picLocksXml = imageFit === "cover" ? "" : `<a:picLocks noChangeAspect="1"/>`;
          picsXml += `<p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:nvPicPr><p:cNvPr id="${picId}" name="Picture ${picId}"/><p:cNvPicPr>${picLocksXml}</p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${imgRelId}"/>${srcRectXml}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${picX}" y="${picY}"/><a:ext cx="${picW}" cy="${picH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
        }
      } else if (slot) {
        // Clear empty slots on the final slide
        const emptyTxBody = `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>`;
        const updatedSlot = slot.rawXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, () => emptyTxBody);
        slideXml = slideXml.replace(slot.rawXml, () => updatedSlot);
      }
    }

    if (picsXml) {
      slideXml = slideXml.replace("</p:spTree>", `${picsXml}</p:spTree>`);
    }

    zip.file(`ppt/slides/${outSlideName}`, slideXml);
    zip.file(`ppt/slides/_rels/${outRelsName}`, serializeXmlDocument(sRelsDoc));

    // Register in presentation.xml.rels
    const presRelId = `rId${nextPresRId++}`;
    const relElem = presRelsDoc.createElementNS("http://schemas.openxmlformats.org/package/2006/relationships", "Relationship");
    relElem.setAttribute("Id", presRelId);
    relElem.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide");
    relElem.setAttribute("Target", `slides/${outSlideName}`);
    presRelsRoot.appendChild(relElem);

    // Register in presentation.xml
    if (sldIdLst) {
      const sldElem = presDoc.createElementNS("http://schemas.openxmlformats.org/presentationml/2006/main", "p:sldId");
      sldElem.setAttribute("id", String(nextSldId++));
      sldElem.setAttribute("r:id", presRelId);
      sldIdLst.appendChild(sldElem);
    }

    // Register in [Content_Types].xml
    const overElem = ctDoc.createElementNS("http://schemas.openxmlformats.org/package/2006/content-types", "Override");
    overElem.setAttribute("PartName", `/ppt/slides/${outSlideName}`);
    overElem.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.presentationml.slide+xml");
    ctRoot.appendChild(overElem);

    currentSlideNumber++;
  }

  // 3. Emit Post-Slides (e.g. Closing / Contact slide)
  for (const post of postSlideData) {
    const outSlideName = `slide${currentSlideNumber}.xml`;
    const outRelsName = `slide${currentSlideNumber}.xml.rels`;

    zip.file(`ppt/slides/${outSlideName}`, post.xml);
    zip.file(`ppt/slides/_rels/${outRelsName}`, post.rels);

    // Register in presentation.xml.rels
    const presRelId = `rId${nextPresRId++}`;
    const relElem = presRelsDoc.createElementNS("http://schemas.openxmlformats.org/package/2006/relationships", "Relationship");
    relElem.setAttribute("Id", presRelId);
    relElem.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide");
    relElem.setAttribute("Target", `slides/${outSlideName}`);
    presRelsRoot.appendChild(relElem);

    // Register in presentation.xml
    if (sldIdLst) {
      const sldElem = presDoc.createElementNS("http://schemas.openxmlformats.org/presentationml/2006/main", "p:sldId");
      sldElem.setAttribute("id", String(nextSldId++));
      sldElem.setAttribute("r:id", presRelId);
      sldIdLst.appendChild(sldElem);
    }

    // Register in [Content_Types].xml
    const overElem = ctDoc.createElementNS("http://schemas.openxmlformats.org/package/2006/content-types", "Override");
    overElem.setAttribute("PartName", `/ppt/slides/${outSlideName}`);
    overElem.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.presentationml.slide+xml");
    ctRoot.appendChild(overElem);

    currentSlideNumber++;
  }

  // Remove any obsolete slides from zip if template had more slides than output
  const allCurrentSlides = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k));
  for (const k of allCurrentSlides) {
    const num = parseInt(k.match(/slide(\d+)/i)?.[1] || "0", 10);
    if (num >= currentSlideNumber) {
      zip.remove(k);
      zip.remove(`ppt/slides/_rels/slide${num}.xml.rels`);
    }
  }

  zip.file("[Content_Types].xml", serializeXmlDocument(ctDoc));
  zip.file("ppt/_rels/presentation.xml.rels", serializeXmlDocument(presRelsDoc));
  zip.file("ppt/presentation.xml", serializeXmlDocument(presDoc));

  onProgress?.("validating", 85, "Serializing package & validating OpenXML integrity…");

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  // Pre-Delivery Structural Integrity Validation (Checks 1-10)
  const validation = await validatePptxPackage(blob, {
    slideCount: totalSlideCount,
    hasImages: products.some(p => Boolean(p.image || p.imageLink))
  });

  if (!validation.valid) {
    const errorDetails = validation.errors.join("; ");
    throw new Error(`Presentation failed integrity validation: ${errorDetails}`);
  }

  onProgress?.("complete", 100, `Successfully generated and validated ${totalSlideCount} slides (${products.length} products).`);

  return {
    blob,
    validation,
    totalProducts: products.length,
    slideCount: totalSlideCount,
    byteSize: blob.size
  };
}
