import React, { useState, useEffect } from "react";
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
  Info
} from "lucide-react";
import { storageAdapter, isDesktop } from "./services/platform";
import "./excel-ppt.css";

type Slot = { img: number[]; text: number[] };
type Mapping = {
  code: string;
  description: string;
  dim_cm: string;
  dim_in: string;
  price: string;
  length: string;
  width: string;
  height: string;
  image: string;
};
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
};

const DEFAULT_LAYOUT: Slot[] = [
  { img: [80, 130, 230, 230], text: [40, 310, 350, 390] },
  { img: [450, 130, 600, 230], text: [430, 310, 760, 390] }
];
const THREE_LAYOUT: Slot[] = [
  { img: [25, 85, 225, 235], text: [15, 260, 250, 345] },
  { img: [290, 85, 490, 235], text: [280, 260, 515, 345] },
  { img: [555, 85, 755, 235], text: [545, 260, 780, 345] }
];

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

function escapeXml(unsafe: any): string {
  if (!unsafe) return "";
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

// 100% Client-Side PPTX Template Inspector (No Server Needed)
async function inspectTemplateClient(fileOrBuf: File | ArrayBuffer): Promise<TemplateInspection> {
  const buf = fileOrBuf instanceof ArrayBuffer ? fileOrBuf : await fileOrBuf.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const presXmlText = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presXmlText) throw new Error("Invalid presentation (missing ppt/presentation.xml)");

  const sldSzMatch = presXmlText.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/i);
  const cx = sldSzMatch ? parseInt(sldSzMatch[1]) : 12192000;
  const cy = sldSzMatch ? parseInt(sldSzMatch[2]) : 6858000;
  const wIn = +(cx / 914400).toFixed(2);
  const hIn = +(cy / 914400).toFixed(2);
  const ratioVal = wIn / Math.max(0.1, hIn);
  const aspectRatio = Math.abs(ratioVal - 16 / 9) < 0.1 ? "16:9" : (Math.abs(ratioVal - 4 / 3) < 0.1 ? "4:3" : `${wIn}:${hIn}`);

  const slideFiles = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k));
  slideFiles.sort((a, b) => {
    const na = parseInt(a.match(/slide(\d+)/i)?.[1] || "0");
    const nb = parseInt(b.match(/slide(\d+)/i)?.[1] || "0");
    return na - nb;
  });

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

      const offX = offM ? parseInt(offM[1]) : 0;
      const offY = offM ? parseInt(offY[2]) : 0;
      const extCx = extM ? parseInt(extM[1]) : 1000000;
      const extCy = extM ? parseInt(extM[2]) : 1000000;

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

// 100% Client-Side PPTX Generator (No Server / Network Needed)
async function generateCustomPptClient(
  excelFile: File,
  templateBuf: ArrayBuffer,
  mapping: Mapping,
  imageFit: "contain" | "cover",
  headerText?: string,
  showHeader: boolean = true,
  showRule: boolean = true,
  selectedSlideIndex: number = 0,
  customLayout?: Slot[],
  autoCenter: boolean = true,
  fontSize: number = 14,
  fontName: string = "Calibri",
  fontColor: string = "000000",
  background: string = "FFFFFF",
  logoFile?: File | null
): Promise<Blob> {
  const excelBuf = await excelFile.arrayBuffer();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excelBuf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No worksheets found in Excel workbook.");

  // Extract cell-anchored images
  const imgByRow = new Map<number, any>();
  try {
    const images = ws.getImages ? ws.getImages() : [];
    for (const img of images) {
      let rowNum = 0;
      if (img.range && img.range.tl) {
        if (typeof img.range.tl.nativeRow === "number") {
          rowNum = img.range.tl.nativeRow + 1;
        } else if (typeof img.range.tl.row === "number") {
          rowNum = img.range.tl.row;
        }
      }
      const media = wb.model?.media?.[img.imageId] || (wb.model?.media || []).find(
        (m: any) => m.index === img.imageId || String(m.index) === String(img.imageId)
      );
      if (media && media.buffer && rowNum > 0) {
        imgByRow.set(rowNum, media);
      }
    }
  } catch (e) {
    console.warn("Could not read embedded images:", e);
  }

  // Header detection (checks row 1 and row 2)
  const headers: Record<string, number> = {};
  const r1 = ws.getRow(1);
  r1.eachCell((cell, colNumber) => {
    if (cell.value) headers[String(cell.value).trim().toLowerCase()] = colNumber;
  });
  if (Object.keys(headers).length < 2 && ws.rowCount >= 2) {
    ws.getRow(2).eachCell((cell, colNumber) => {
      if (cell.value) headers[String(cell.value).trim().toLowerCase()] = colNumber;
    });
  }

  const findColNumber = (name: string): number | null => {
    if (!name) return null;
    const target = name.trim().toLowerCase();
    if (headers[target]) return headers[target];
    for (const [k, v] of Object.entries(headers)) {
      if (k === target || k.includes(target) || target.includes(k)) {
        return v;
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

  const codeCol = getCol("code", "buyer code", "buyer code / sku", "sku", "item code", "product code", "code");
  const descCol = getCol("description", "product description", "description", "product name", "product", "item name", "desc");
  const dimCmCol = getCol("dim_cm", "product dimension (cm)", "dimension (cm)", "dimensions (cm)", "dimension cm", "size cm", "size (cm)");
  const dimInCol = getCol("dim_in", "carton dimension (inch)", "dimension (inch)", "dimensions (inch)", "dimension in", "size in", "size (inch)");
  const priceCol = getCol("price", "price (usd)", "price", "mrp", "rate", "cost");
  const lCol = getCol("length", "length", " l");
  const wCol = getCol("width", "width", "breadth", " w");
  const hCol = getCol("height", "height", " h");
  const imageCol = getCol("image", "product image (embedded)", "product image", "image", "photo", "picture", "img");

  if (!codeCol) {
    throw new Error("Select the product code / SKU column.");
  }

  const products: Array<{
    code: string;
    description: string;
    dim_cm: string;
    dim_in: string;
    price: string;
    image?: any;
    imageLink?: string;
  }> = [];

  const startRow = ws.rowCount >= 3 && !ws.getRow(2).getCell(codeCol).value ? 3 : 2;

  ws.eachRow((row, rIdx) => {
    if (rIdx >= startRow) {
      const codeRaw = row.getCell(codeCol).value;
      if (codeRaw !== null && codeRaw !== undefined && String(codeRaw).trim()) {
        const code = String(codeRaw).trim();
        const desc = descCol ? String(row.getCell(descCol).value || "").trim() : "";
        let d_cm = dimCmCol ? String(row.getCell(dimCmCol).value || "").trim() : "";
        let d_in = dimInCol ? String(row.getCell(dimInCol).value || "").trim() : "";
        const lVal = lCol ? String(row.getCell(lCol).value || "").trim() : "";
        const wVal = wCol ? String(row.getCell(wCol).value || "").trim() : "";
        const hVal = hCol ? String(row.getCell(hCol).value || "").trim() : "";

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

        const priceVal = priceCol ? String(row.getCell(priceCol).value || "").trim() : "";

        // Check embedded image first, then check cell link
        const embeddedImg = imgByRow.get(rIdx);
        let linkVal = "";
        if (!embeddedImg && imageCol) {
          const rawImgCell = row.getCell(imageCol).value;
          if (typeof rawImgCell === "string") {
            linkVal = rawImgCell.trim();
          } else if (rawImgCell && typeof rawImgCell === "object") {
            linkVal = String((rawImgCell as any).hyperlink || (rawImgCell as any).text || "").trim();
          }
        }

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
    throw new Error("No product records found in Excel sheet. Check column mapping.");
  }

  // Load PPTX template
  const zip = await JSZip.loadAsync(templateBuf);
  const slideFiles = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k));
  slideFiles.sort((a, b) => {
    const na = parseInt(a.match(/slide(\d+)/i)?.[1] || "0");
    const nb = parseInt(b.match(/slide(\d+)/i)?.[1] || "0");
    return na - nb;
  });

  const targetIdx = selectedSlideIndex >= 0 && selectedSlideIndex < slideFiles.length ? selectedSlideIndex : 0;
  const baseSlideFile = slideFiles[targetIdx] || "ppt/slides/slide1.xml";
  const baseRelsFile = baseSlideFile.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";

  const slide1XmlBase = await zip.file(baseSlideFile)?.async("text");
  const slide1RelsBase = (await zip.file(baseRelsFile)?.async("text")) ||
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
  let presXmlStr = await zip.file("ppt/presentation.xml")?.async("text");
  let presRelsStr = await zip.file("ppt/_rels/presentation.xml.rels")?.async("text");
  let contentTypesStr = await zip.file("[Content_Types].xml")?.async("text");

  if (!slide1XmlBase || !presXmlStr || !presRelsStr || !contentTypesStr) {
    throw new Error("PowerPoint template is missing core presentation files.");
  }

  // Detect product slots in base slide
  const spRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  const slotShapes: Array<{ rawXml: string; offX: number; offY: number; extCx: number; extCy: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = spRegex.exec(slide1XmlBase)) !== null) {
    const spXml = m[0];
    const texts = [...spXml.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map(t => t[1]).join(" ");
    const isCandidate = /(?:SKU|Item\s*Name|Price|CM|IN|Dimensions?|00\.00)/i.test(texts) || spXml.includes("Text Placeholder");
    if (isCandidate) {
      const offXMatch = spXml.match(/<a:off\s+x="(\d+)"/);
      const offX = offXMatch ? parseInt(offXMatch[1]) : 0;
      const offYMatch = spXml.match(/<a:off\s+x="\d+"\s+y="(\d+)"/);
      const offY = offYMatch ? parseInt(offYMatch[1]) : 0;
      const extCxMatch = spXml.match(/<a:ext\s+cx="(\d+)"/);
      const extCx = extCxMatch ? parseInt(extCxMatch[1]) : 3400000;
      const extCyMatch = spXml.match(/<a:ext\s+cx="\d+"\s+cy="(\d+)"/);
      const extCy = extCyMatch ? parseInt(extCyMatch[1]) : 600000;
      slotShapes.push({ rawXml: spXml, offX, offY, extCx, extCy });
    }
  }
  slotShapes.sort((a, b) => a.offX - b.offX);
  const slotsCount = slotShapes.length || 3;
  const totalSlides = Math.ceil(products.length / slotsCount);

  // Counters
  const sldIdMatches = [...presXmlStr.matchAll(/id="(\d+)"/g)].map(item => parseInt(item[1]));
  let nextSldId = sldIdMatches.length > 0 ? Math.max(...sldIdMatches) + 1 : 256;
  const presRIdMatches = [...presRelsStr.matchAll(/Id="rId(\d+)"/g)].map(item => parseInt(item[1]));
  let nextPresRId = Math.max(...presRIdMatches, 0) + 1;

  for (let sIdx = 1; sIdx <= totalSlides; sIdx++) {
    const slideName = `slide${sIdx}.xml`;
    const relsName = `slide${sIdx}.xml.rels`;
    let slideXml = slide1XmlBase;
    let slideRels = slide1RelsBase;

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

    let nextSlideRId = Math.max(...[...slideRels.matchAll(/Id="rId(\d+)"/g)].map(item => parseInt(item[1])), 0) + 1;
    let picsXml = "";

    // Apply custom background if specified
    if (background && background.toUpperCase().replace("#", "") !== "FFFFFF") {
      const bgHex = background.toUpperCase().replace("#", "");
      const bgXml = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgHex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
      if (!slideXml.includes("<p:bg>")) {
        slideXml = slideXml.replace("<p:spTree>", `${bgXml}<p:spTree>`);
      } else {
        slideXml = slideXml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, bgXml);
      }
    }

    for (let slotIdx = 0; slotIdx < slotsCount; slotIdx++) {
      const prodIdx = (sIdx - 1) * slotsCount + slotIdx;
      const prod = products[prodIdx];
      const slot = slotShapes[slotIdx];
      const userSlot = customLayout && customLayout[slotIdx];

      if (prod && slot) {
        const dimStr = [prod.dim_cm, prod.dim_in].filter(Boolean).join(" | ");
        const szMain = Math.round((fontSize || 14) * 100);
        const szSub = Math.max(700, szMain - 200);
        const fontNameClean = escapeXml(fontName || "Calibri");
        const fontColorXml = fontColor ? `<a:srgbClr val="${fontColor.replace("#", "")}"/>` : "";

        const newTxBody = `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" b="1" sz="${szMain}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>${escapeXml(prod.code)} | </a:t></a:r><a:r><a:rPr lang="en-US" b="0" sz="${szMain}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>${escapeXml(prod.description)}</a:t></a:r></a:p>${dimStr ? `<a:p><a:r><a:rPr lang="en-US" b="1" sz="${szSub}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>${escapeXml(dimStr)}</a:t></a:r></a:p>` : ""}${prod.price ? `<a:p><a:r><a:rPr lang="en-US" b="1" sz="${szSub}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>PRICE : ${escapeXml(prod.price)}</a:t></a:r></a:p>` : ""}</p:txBody>`;
        
        let updatedSlot = slot.rawXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, () => newTxBody);

        // Apply custom coordinates for text box if provided
        if (userSlot) {
          const textOffX = Math.round((userSlot.text[0] / 800) * cx);
          const textOffY = Math.round((userSlot.text[1] / 450) * cy);
          const textExtCx = Math.round(((userSlot.text[2] - userSlot.text[0]) / 800) * cx);
          const textExtCy = Math.round(((userSlot.text[3] - userSlot.text[1]) / 450) * cy);
          updatedSlot = updatedSlot.replace(/<a:off\s+x="\d+"\s+y="\d+"/, `<a:off x="${textOffX}" y="${textOffY}"`);
          updatedSlot = updatedSlot.replace(/<a:ext\s+cx="\d+"\s+cy="\d+"/, `<a:ext cx="${textExtCx}" cy="${textExtCy}"`);
        }

        slideXml = slideXml.replace(slot.rawXml, () => updatedSlot);

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
          const imgFilename = `prod_img_${sIdx}_${slotIdx}.${imgExt}`;
          zip.file(`ppt/media/${imgFilename}`, imgBuffer);

          const imgRelId = `rId${nextSlideRId++}`;
          const relEntry = `<Relationship Id="${imgRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgFilename}"/>`;
          slideRels = slideRels.replace("</Relationships>", `${relEntry}</Relationships>`);

          let picX = slot.offX;
          let picY = Math.max(700000, slot.offY - 4400000);
          let picW = slot.extCx;
          let picH = Math.max(1000000, slot.offY - picY - 100000);

          if (userSlot) {
            let imgLeft = userSlot.img[0];
            const imgW800 = userSlot.img[2] - userSlot.img[0];
            if (autoCenter) {
              const textCenterX = (userSlot.text[0] + userSlot.text[2]) / 2;
              imgLeft = Math.max(0, Math.min(800 - imgW800, Math.round(textCenterX - imgW800 / 2)));
            }
            picX = Math.round((imgLeft / 800) * cx);
            picY = Math.round((userSlot.img[1] / 450) * cy);
            picW = Math.round((imgW800 / 800) * cx);
            picH = Math.round(((userSlot.img[3] - userSlot.img[1]) / 450) * cy);
          }

          const picId = 2000 + prodIdx;

          picsXml += `<p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:nvPicPr><p:cNvPr id="${picId}" name="Picture ${picId}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${imgRelId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${picX}" y="${picY}"/><a:ext cx="${picW}" cy="${picH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
        }
      } else if (slot) {
        const emptyTxBody = `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>`;
        const updatedSlot = slot.rawXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, () => emptyTxBody);
        slideXml = slideXml.replace(slot.rawXml, () => updatedSlot);
      }
    }

    if (picsXml) {
      slideXml = slideXml.replace("</p:spTree>", `${picsXml}</p:spTree>`);
    }

    zip.file(`ppt/slides/${slideName}`, slideXml);
    zip.file(`ppt/slides/_rels/${relsName}`, slideRels);

    if (sIdx > 1) {
      const ctEntry = `<Override PartName="/ppt/slides/${slideName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
      contentTypesStr = contentTypesStr.replace("</Types>", `${ctEntry}</Types>`);

      const presRelId = `rId${nextPresRId++}`;
      const presRelEntry = `<Relationship Id="${presRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${slideName}"/>`;
      presRelsStr = presRelsStr.replace("</Relationships>", `${presRelEntry}</Relationships>`);

      const sldIdVal = nextSldId++;
      const sldEntry = `<p:sldId id="${sldIdVal}" r:id="${presRelId}"/>`;
      presXmlStr = presXmlStr.replace("</p:sldIdLst>", `${sldEntry}</p:sldIdLst>`);
    }
  }

  zip.file("[Content_Types].xml", contentTypesStr);
  zip.file("ppt/_rels/presentation.xml.rels", presRelsStr);
  zip.file("ppt/presentation.xml", presXmlStr);

  return await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  });
}

export default function ExcelToPptTool() {
  // File states
  const [file, setFile] = useState<File | null>(null);
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
  const [fontSize, setFontSize] = useState<number>(18);
  const [fontName, setFontName] = useState<string>("Arial");
  const [fontColor, setFontColor] = useState<string>("000000");
  const [background, setBackground] = useState<string>("FFFFFF");
  const [ratio, setRatio] = useState<SlideRatio>("16:9");
  const [autoCenter, setAutoCenter] = useState<boolean>(true);
  const [imageFit, setImageFit] = useState<"contain" | "cover">("contain");
  const [headerText, setHeaderText] = useState<string>("PRODUCT COLLECTION");
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [showRule, setShowRule] = useState<boolean>(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);

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
    (e.currentTarget.closest(".ep-visual-canvas") as HTMLElement)?.setPointerCapture?.(e.pointerId);
  };

  // Live preview pagination
  const [previewSlideIndex, setPreviewSlideIndex] = useState<number>(0);

  // Status & processing
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

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
      selectedSlideIndex
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
    setStatus(`Loaded profile "${name}".`);
  };

  const deleteProfile = async (name: string) => {
    const updated = profiles.filter(p => p.name !== name);
    setProfiles(updated);
    if (selectedProfileIndex === name) setSelectedProfileIndex("");
    await storageAdapter.setSetting("excel_ppt_profiles", updated);
    setStatus(`Deleted profile "${name}".`);
  };

  // Handle Excel Upload
  const chooseFile = async (next: File | null) => {
    setFile(next);
    setHeaders([]);
    setSampleRows([]);
    setStatus("");
    if (!next) return;
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await next.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        setStatus("No worksheets found in this workbook.");
        return;
      }

      // Extract cell-anchored image thumbnails for live preview
      const imgThumbnails: Record<number, string> = {};
      try {
        const images = sheet.getImages ? sheet.getImages() : [];
        for (const img of images) {
          let rowNum = 0;
          if (img.range && img.range.tl) {
            if (typeof img.range.tl.nativeRow === "number") {
              rowNum = img.range.tl.nativeRow + 1;
            } else if (typeof img.range.tl.row === "number") {
              rowNum = img.range.tl.row;
            }
          }
          const media = workbook.model?.media?.[img.imageId] || (workbook.model?.media || []).find(
            (m: any) => m.index === img.imageId || String(m.index) === String(img.imageId)
          );
          if (media && media.buffer && rowNum > 0) {
            const blob = new Blob([media.buffer], { type: `image/${media.extension || "jpeg"}` });
            imgThumbnails[rowNum] = URL.createObjectURL(blob);
          }
        }
      } catch (e) {
        console.warn("Could not load preview thumbnails:", e);
      }

      // Collect headers from row 1 and row 2 (supports multi-row headers)
      const r1 = (sheet.getRow(1).values as Array<unknown> || []).slice(1).map(v => String(v ?? "").trim()).filter(Boolean);
      let colNames = [...r1];
      if (r1.length < 3 && sheet.rowCount >= 2) {
        const r2 = (sheet.getRow(2).values as Array<unknown> || []).slice(1).map(v => String(v ?? "").trim()).filter(Boolean);
        colNames = Array.from(new Set([...r1, ...r2]));
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
            const r1Vals = sheet.getRow(1).values as Array<unknown>;
            const r2Vals = sheet.getRow(2).values as Array<unknown>;
            if (r1Vals) {
              const idx = r1Vals.findIndex(v => String(v ?? "").trim().toLowerCase() === hdr.toLowerCase());
              if (idx > 0) cIndex = idx;
            }
            if (cIndex === -1 && r2Vals) {
              const idx = r2Vals.findIndex(v => String(v ?? "").trim().toLowerCase() === hdr.toLowerCase());
              if (idx > 0) cIndex = idx;
            }
            if (cIndex > 0) {
              const val = row.getCell(cIndex).value;
              rowObj[hdr] = val !== null && val !== undefined ? String(val).trim() : "";
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
      setStatus(`Loaded ${colNames.length} columns and ${dataRows.length} product rows from Excel (${embeddedCount} embedded photos detected).`);
    } catch {
      setStatus("Could not read this workbook. Please upload a valid .xlsx file.");
    }
  };

  // Download Sample Excel Template with Embedded Photos
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

  // Handle PPT Template Upload & Inspection (100% Offline Client-Side)
  const chooseTemplate = async (next: File | null) => {
    setTemplateFile(next);
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

      const activeSlide = clientData.slides[clientData.recommended_product_slide || 0];
      const slotsDetected = activeSlide ? activeSlide.slots_count : 3;
      if (slotsDetected === 2 || slotsDetected === 3) {
        setCount(slotsDetected as 2 | 3);
      }
      if (activeSlide && activeSlide.slots && activeSlide.slots.length > 0) {
        setLayout(activeSlide.slots.map(s => ({ img: [...s.img_rect], text: [...s.text_rect] })));
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

  // Calculate products per slide
  const activeSlideInfo = templateInfo?.slides[selectedSlideIndex];
  const productsPerSlide = useCustomTemplate && activeSlideInfo ? (activeSlideInfo.slots_count || 3) : count;
  const totalPreviewSlides = sampleRows.length > 0 ? Math.ceil(sampleRows.length / productsPerSlide) : 1;

  // Change slide preview page
  const prevSlide = () => setPreviewSlideIndex(p => Math.max(0, p - 1));
  const nextSlide = () => setPreviewSlideIndex(p => Math.min(totalPreviewSlides - 1, p + 1));

  // Current slide products
  const currentSlideProducts = sampleRows.slice(
    previewSlideIndex * productsPerSlide,
    (previewSlideIndex + 1) * productsPerSlide
  );

  // Layout change handlers for Built-in Mode
  const changeCount = (next: 2 | 3) => {
    setCount(next);
    setLayout(next === 2 ? DEFAULT_LAYOUT.map(s => ({ img: [...s.img], text: [...s.text] })) : THREE_LAYOUT.map(s => ({ img: [...s.img], text: [...s.text] })));
  };
  const resetLayout = () => {
    changeCount(count);
    setRatio("16:9");
    setAutoCenter(true);
  };
  const ratioValue = ratio === "4:3" ? 4 / 3 : ratio === "A4 Landscape" ? 297 / 210 : ratio === "A4 Portrait" ? 210 / 297 : 16 / 9;

  // Generate Presentation (100% Offline Client-Side Engine)
  const generate = async () => {
    if (!file) {
      setStatus("Choose an Excel workbook first.");
      return;
    }
    if (!mapping.code) {
      setStatus("Select the product code / SKU column. Rows without a code are skipped.");
      return;
    }
    setBusy(true);
    setStatus("Generating PowerPoint presentation offline with original design preserved…");

    try {
      const templateBuf = templateFile
        ? await templateFile.arrayBuffer()
        : base64ToArrayBuffer(DEFAULT_PPT_TEMPLATE_B64);

      const blob = await generateCustomPptClient(
        file,
        templateBuf,
        mapping,
        imageFit,
        headerText,
        showHeader,
        showRule,
        selectedSlideIndex,
        layout,
        autoCenter,
        fontSize,
        fontName,
        fontColor,
        background,
        logoFile
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.xlsx?$/i, "") + (templateFile ? "_catalogue_custom.pptx" : "_catalogue.pptx");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatus("PowerPoint presentation generated and downloaded successfully with original design preserved.");
    } catch (error: any) {
      console.error("PPT Generation error:", error);
      setStatus(error instanceof Error ? error.message : "Unexpected error while generating PowerPoint.");
    } finally {
      setBusy(false);
    }
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
            <span className="ep-badge ep-badge-success">
              <CheckCircle2 size={13} /> {headers.length} Columns · {sampleRows.length}+ Rows
            </span>
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
                        if (sl && sl.slots && sl.slots.length > 0) {
                          setLayout(sl.slots.map(s => ({ img: [...s.img_rect], text: [...s.text_rect] })));
                          if (sl.slots_count === 2 || sl.slots_count === 3) {
                            setCount(sl.slots_count as 2 | 3);
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

      {/* Step 3: Interactive Visual Mapping Table */}
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

                {/* Fixed Template Elements (Shown when custom template is active) */}
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

      {/* Step 4: Product Image/Text Positioning, Sizing & Slide Layout */}
      <section className="ep-panel">
        <div className="ep-title">
          <div>
            <b>04</b>
            <div>
              <h3>Slide Layout, Image/Text Positioning & Sizing</h3>
              <p>Visually drag & resize image or text boxes, enter exact pixel coordinates, customize fonts, colors, and layout structure.</p>
            </div>
          </div>
        </div>

        {/* Layout quick bar */}
        <div className="ep-layout-options">
          <label className="ep-ratio-picker">
            <span>Slide shape</span>
            <select value={ratio} onChange={e => setRatio(e.target.value as SlideRatio)}>
              <option>16:9</option>
              <option>4:3</option>
              <option>A4 Landscape</option>
              <option>A4 Portrait</option>
            </select>
          </label>
          <button
            type="button"
            className={count === 2 ? "selected" : ""}
            onClick={() => changeCount(2)}
          >
            2 products per slide
          </button>
          <button
            type="button"
            className={count === 3 ? "selected" : ""}
            onClick={() => changeCount(3)}
          >
            3 products per slide
          </button>
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
            <span>Center images to text</span>
            <small>{autoCenter ? "ON" : "OFF"}</small>
          </button>
          <button type="button" className="ep-reset" onClick={resetLayout}>
            <RotateCcw size={14} /> Reset layout
          </button>
        </div>

        {/* Visual interactive drag canvas */}
        <div className="ep-visual-guide">
          <div className="ep-visual-heading">
            <div>
              <h4>Visual Slide Canvas & Positioning Guide</h4>
              <p>Blue = image placement · Amber = product details placement · Drag boxes to move, drag bottom-right corner to resize</p>
            </div>
            <span>{ratio.toUpperCase()} SLIDE</span>
          </div>

          <div
            className="ep-visual-canvas"
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
              touchAction: "none",
              backgroundColor: `#${background.replace("#", "")}`,
              aspectRatio: String(ratioValue)
            }}
          >
            {showHeader && (
              <div className="ep-preview-header" style={{ color: `#${fontColor.replace("#", "")}` }}>
                {headerText || "Your heading"}
                {logoFile && <span className="ep-preview-logo">{logoFile.name.slice(0, 18)}</span>}
              </div>
            )}
            {showRule && <div className="ep-preview-rule" />}

            {layout.map((slot, i) => {
              const imgW = slot.img[2] - slot.img[0];
              const imgH = slot.img[3] - slot.img[1];
              const textW = slot.text[2] - slot.text[0];
              const textH = slot.text[3] - slot.text[1];
              const imgLeft = autoCenter
                ? Math.max(0, Math.min(800 - imgW, (slot.text[0] + slot.text[2]) / 2 - imgW / 2))
                : slot.img[0];

              return (
                <React.Fragment key={i}>
                  <div
                    className="ep-visual-rect ep-visual-image"
                    style={{
                      left: `${imgLeft / 8}%`,
                      top: `${slot.img[1] / 4.5}%`,
                      width: `${imgW / 8}%`,
                      height: `${imgH / 4.5}%`,
                      cursor: "move",
                      touchAction: "none"
                    }}
                    onPointerDown={e => beginDrag(e, i, "img", "move")}
                  >
                    <ImageIcon size={18} />
                    <strong>Product {i + 1} Image</strong>
                    <small>{imgW} × {imgH} px</small>
                    <span
                      className="ep-resize-handle"
                      title="Drag corner to resize image area"
                      onPointerDown={e => beginDrag(e, i, "img", "resize")}
                    />
                  </div>

                  <div
                    className="ep-visual-rect ep-visual-text"
                    style={{
                      left: `${slot.text[0] / 8}%`,
                      top: `${slot.text[1] / 4.5}%`,
                      width: `${textW / 8}%`,
                      height: `${textH / 4.5}%`,
                      color: `#${fontColor.replace("#", "")}`,
                      cursor: "move",
                      touchAction: "none"
                    }}
                    onPointerDown={e => beginDrag(e, i, "text", "move")}
                  >
                    <strong>Product {i + 1} Details</strong>
                    <span>SKU / Product Name</span>
                    <span>Dimensions</span>
                    <span>Price</span>
                    <span
                      className="ep-resize-handle"
                      title="Drag corner to resize text area"
                      onPointerDown={e => beginDrag(e, i, "text", "resize")}
                    />
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          <div className="ep-visual-legend">
            <span><i className="ep-legend-blue" /> Image placement</span>
            <span><i className="ep-legend-amber" /> Text details placement</span>
            <span>Drag items directly on canvas, or type exact dimensions and coordinates below.</span>
          </div>
        </div>

        <div className="ep-drag-hint">
          <ImageIcon size={15} /> Drag the blue image boxes or amber text boxes to move them, or drag the bottom-right corner to resize. You can also type exact Width & Height below.
        </div>

        {/* Exact Numeric Coordinate Inputs for Every Slot */}
        <div className="ep-slots">
          {layout.map((slot, i) => {
            const imgWidth = slot.img[2] - slot.img[0];
            const imgHeight = slot.img[3] - slot.img[1];
            const textWidth = slot.text[2] - slot.text[0];
            const textHeight = slot.text[3] - slot.text[1];

            return (
              <div key={i} className="ep-slot">
                <h4>Product {i + 1} Placement</h4>

                <div className="ep-coord-head">Image Area Coordinates & Dimensions</div>
                <div className="ep-coords">
                  <label>
                    <span>Width (px)</span>
                    <input
                      type="number"
                      min="30"
                      max="800"
                      value={imgWidth}
                      onChange={e => {
                        const w = Math.max(30, Number(e.target.value) || 30);
                        setLayout(prev =>
                          prev.map((s, idx) =>
                            idx === i ? { ...s, img: [s.img[0], s.img[1], s.img[0] + w, s.img[3]] } : s
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span>Height (px)</span>
                    <input
                      type="number"
                      min="30"
                      max="450"
                      value={imgHeight}
                      onChange={e => {
                        const h = Math.max(30, Number(e.target.value) || 30);
                        setLayout(prev =>
                          prev.map((s, idx) =>
                            idx === i ? { ...s, img: [s.img[0], s.img[1], s.img[2], s.img[1] + h] } : s
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span>X (Left)</span>
                    <input
                      type="number"
                      min="0"
                      max="800"
                      value={slot.img[0]}
                      onChange={e => {
                        const left = Number(e.target.value) || 0;
                        const iw = slot.img[2] - slot.img[0];
                        setLayout(prev =>
                          prev.map((s, idx) =>
                            idx === i ? { ...s, img: [left, s.img[1], left + iw, s.img[3]] } : s
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span>Y (Top)</span>
                    <input
                      type="number"
                      min="0"
                      max="450"
                      value={slot.img[1]}
                      onChange={e => {
                        const top = Number(e.target.value) || 0;
                        const ih = slot.img[3] - slot.img[1];
                        setLayout(prev =>
                          prev.map((s, idx) =>
                            idx === i ? { ...s, img: [s.img[0], top, s.img[2], top + ih] } : s
                          )
                        );
                      }}
                    />
                  </label>
                </div>

                <div className="ep-coord-head">Text Details Coordinates & Dimensions</div>
                <div className="ep-coords">
                  <label>
                    <span>Width (px)</span>
                    <input
                      type="number"
                      min="30"
                      max="800"
                      value={textWidth}
                      onChange={e => {
                        const w = Math.max(30, Number(e.target.value) || 30);
                        setLayout(prev =>
                          prev.map((s, idx) =>
                            idx === i ? { ...s, text: [s.text[0], s.text[1], s.text[0] + w, s.text[3]] } : s
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span>Height (px)</span>
                    <input
                      type="number"
                      min="30"
                      max="450"
                      value={textHeight}
                      onChange={e => {
                        const h = Math.max(30, Number(e.target.value) || 30);
                        setLayout(prev =>
                          prev.map((s, idx) =>
                            idx === i ? { ...s, text: [s.text[0], s.text[1], s.text[2], s.text[1] + h] } : s
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span>X (Left)</span>
                    <input
                      type="number"
                      min="0"
                      max="800"
                      value={slot.text[0]}
                      onChange={e => {
                        const left = Number(e.target.value) || 0;
                        const tw = slot.text[2] - slot.text[0];
                        setLayout(prev =>
                          prev.map((s, idx) =>
                            idx === i ? { ...s, text: [left, s.text[1], left + tw, s.text[3]] } : s
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span>Y (Top)</span>
                    <input
                      type="number"
                      min="0"
                      max="450"
                      value={slot.text[1]}
                      onChange={e => {
                        const top = Number(e.target.value) || 0;
                        const th = slot.text[3] - slot.text[1];
                        setLayout(prev =>
                          prev.map((s, idx) =>
                            idx === i ? { ...s, text: [s.text[0], top, s.text[2], top + th] } : s
                          )
                        );
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {/* Product Image Fitting Mode */}
        <div className="ep-template-title" style={{ marginTop: "18px" }}>
          <h4>Product Image Fitting Mode</h4>
          <p>Strictly preserves original image aspect ratio. Never distorts or squashes product photos.</p>
        </div>
        <div className="ep-fit-options">
          <label className={imageFit === "contain" ? "selected" : ""}>
            <input
              type="radio"
              name="imageFit"
              checked={imageFit === "contain"}
              onChange={() => setImageFit("contain")}
            />
            <span className="ep-fit-icon ep-fit-contain" />
            <strong>Shrink & Fit (Contain)</strong>
            <small>Preserves whole image without cropping. Centers cleanly in image area.</small>
          </label>
          <label className={imageFit === "cover" ? "selected" : ""}>
            <input
              type="radio"
              name="imageFit"
              checked={imageFit === "cover"}
              onChange={() => setImageFit("cover")}
            />
            <span className="ep-fit-icon ep-fit-cover" />
            <strong>Crop & Fit (Cover)</strong>
            <small>Fills the entire product box. Edges trimmed symmetrically.</small>
          </label>
        </div>

        {/* Header & Brand Template */}
        <div className="ep-template-options">
          <div className="ep-template-title">
            <h4>Header & Brand Template</h4>
            <p>Customize heading text, divider line and upload an optional brand logo.</p>
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
            <label>
              <input type="checkbox" checked={autoCenter} onChange={e => setAutoCenter(e.target.checked)} /> Auto-center images over text
            </label>
          </div>
          <label className="ep-logo-upload">
            <Upload size={16} />
            <span>{logoFile ? logoFile.name : "Upload brand logo (PNG, JPG or SVG)"}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={e => setLogoFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {/* Typography & Color Styling Grid */}
        <div className="ep-style-grid">
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
      </section>

      {/* Step 5: Live Slide Preview with Pager */}
      <section className="ep-panel">
        <div className="ep-title">
          <div>
            <b>05</b>
            <div>
              <h3>Live Interactive Slide Preview</h3>
              <p>Visualizing generated slide with actual Excel data, exact layout geometry, and brand elements.</p>
            </div>
          </div>
          <div className="ep-preview-pager">
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

        {/* Visual Slide Canvas */}
        <div className="ep-live-slide-wrapper">
          <div
            className="ep-live-slide-canvas"
            style={{
              aspectRatio: useCustomTemplate ? "16 / 9" : String(ratioValue),
              backgroundColor: useCustomTemplate ? "#ffffff" : `#${background.replace("#", "")}`
            }}
          >
            {/* Top Bar / Fixed Template Branding */}
            {useCustomTemplate ? (
              <>
                <div className="ep-preview-top-brand">
                  <div className="ep-preview-noble-brand">NOBLE SELECTIONS</div>
                  <div className="ep-preview-vector-logo">
                    <span className="logo-icon">NS</span>
                    <span className="logo-sub">EST. 1988</span>
                  </div>
                </div>
                <div className="ep-preview-template-rule" />
              </>
            ) : (
              <>
                {showHeader && (
                  <div className="ep-preview-header" style={{ color: `#${fontColor.replace("#", "")}` }}>
                    {headerText || "Your heading"}
                    {logoFile && <span className="ep-preview-logo">{logoFile.name.slice(0, 18)}</span>}
                  </div>
                )}
                {showRule && <div className="ep-preview-rule" />}
              </>
            )}

            {/* Product Slots */}
            <div className={`ep-preview-slots-grid slots-${productsPerSlide}`}>
              {Array.from({ length: productsPerSlide }).map((_, slotIdx) => {
                const prod = currentSlideProducts[slotIdx];
                if (!prod) {
                  return (
                    <div key={slotIdx} className="ep-preview-slot-card slot-empty">
                      <div className="ep-slot-placeholder-img">
                        <small>Empty Slot (End of Catalogue)</small>
                      </div>
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
                  <div key={slotIdx} className="ep-preview-slot-card">
                    <div className="ep-slot-image-box">
                      {prod.__thumbnail ? (
                        <img
                          src={prod.__thumbnail}
                          alt={skuVal}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: imageFit,
                            borderRadius: "4px"
                          }}
                        />
                      ) : (
                        <div className="ep-slot-image-placeholder">
                          <ImageIcon size={32} />
                          <span>Product Photo</span>
                          <small>{imageFit === "contain" ? "Shrink & Fit" : "Crop & Fit"}</small>
                        </div>
                      )}
                    </div>

                    <div className="ep-slot-info-box">
                      <div className="ep-info-line-1">
                        <b>{skuVal}</b> | <span>{descVal}</span>
                      </div>
                      {(cmVal || inVal) && (
                        <div className="ep-info-line-2">
                          {[cmVal, inVal].filter(Boolean).map((d, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <span> | </span>}
                              <span>{d}</span>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                      {priceVal && <div className="ep-info-line-3">{priceVal}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ep-preview-legend-row">
          <span>
            <Info size={14} /> Slide preview rendered in 16:9 widescreen format with actual records from your spreadsheet.
          </span>
          <span className="ep-legend-badge">
            {sampleRows.length} Total Records Loaded
          </span>
        </div>
      </section>

      {/* Action Generation Bar */}
      <div className="ep-action">
        <div>
          <strong>Ready to Generate</strong>
          <span>
            {file
              ? `Processing ${sampleRows.length || "all"} product items using ${useCustomTemplate && templateFile ? `template "${templateFile.name}"` : "built-in layout"}.`
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
