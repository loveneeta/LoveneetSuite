/**
 * Loveneet Suite — Professional OpenXML PowerPoint Catalogue Generator
 * Produces 100% compliant, fully editable presentations from Excel spreadsheets and PPT templates.
 * Enforces strict ECMA-376 schema bounds (ST_SlideId), media declarations, and XML integrity.
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";
import { validatePptxPackage, PptxValidationResult } from "./pptxValidator";

export interface Slot {
  img: number[]; // [left, top, right, bottom] in 800x450 scale
  text: number[]; // [left, top, right, bottom] in 800x450 scale
}

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
  logoFile?: File | null;
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
    onProgress
  } = options;

  onProgress?.("parsing", 10, "Parsing Excel workbook & extracting product records…");

  // 1. Parse Excel Workbook
  const excelBuf = excelFileOrBuf instanceof ArrayBuffer ? excelFileOrBuf : await excelFileOrBuf.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excelBuf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No worksheets found in the Excel workbook.");

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
    console.warn("Could not read embedded worksheet images:", e);
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
      if (k === target || k.includes(target) || target.includes(k)) return v;
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
    throw new Error("Product Code / SKU column could not be identified. Please confirm column mapping.");
  }

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
    throw new Error("No product records found in the Excel sheet. Ensure the mapped SKU column contains data.");
  }

  onProgress?.("template", 25, `Loaded ${products.length} products. Loading PowerPoint base template…`);

  // 2. Load Presentation Template
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
    throw new Error("The PowerPoint template is missing essential files (presentation.xml, rels, or content types).");
  }

  // Ensure all common media extension defaults are declared in [Content_Types].xml
  const mediaDefaults = [
    { ext: "jpeg", type: "image/jpeg" },
    { ext: "jpg", type: "image/jpeg" },
    { ext: "png", type: "image/png" },
    { ext: "webp", type: "image/webp" },
    { ext: "gif", type: "image/gif" }
  ];

  for (const { ext, type } of mediaDefaults) {
    if (!contentTypesStr.includes(`Extension="${ext}"`) && !contentTypesStr.includes(`Extension="${ext.toUpperCase()}"`)) {
      contentTypesStr = contentTypesStr.replace(
        "<Types ",
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="${ext}" ContentType="${type}"/>`
      ).replace(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      );
    }
  }

  // Slide dimensions
  const sldSzMatch = presXmlStr.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/i);
  const cx = sldSzMatch ? parseInt(sldSzMatch[1], 10) : 12192000;
  const cy = sldSzMatch ? parseInt(sldSzMatch[2], 10) : 6858000;

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
  const totalSlides = Math.ceil(products.length / slotsCount);

  // STRICT ECMA-376 ST_SlideId compliance:
  // Must only match <p:sldId\b[^>]*\bid="(\d+)" and filter to [256, 2147483647]
  const existingSldIds = [...presXmlStr.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"/g)]
    .map(x => parseInt(x[1], 10))
    .filter(val => val >= 256 && val < 2147483648);
  let nextSldId = existingSldIds.length > 0 ? Math.max(...existingSldIds) + 1 : 256;

  // Strict relationship ID calculation for presentation.xml.rels
  const presRIdMatches = [...presRelsStr.matchAll(/Id="rId(\d+)"/g)].map(x => parseInt(x[1], 10));
  let nextPresRId = Math.max(...presRIdMatches, 0) + 1;

  onProgress?.("media", 40, `Generating ${totalSlides} slides and processing product images…`);

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

    let nextSlideRId = Math.max(...[...slideRels.matchAll(/Id="rId(\d+)"/g)].map(x => parseInt(x[1], 10)), 0) + 1;
    let picsXml = "";

    for (let slotIdx = 0; slotIdx < slotsCount; slotIdx++) {
      const prodIdx = (sIdx - 1) * slotsCount + slotIdx;
      const prod = products[prodIdx];
      const slot = slotShapes[slotIdx];
      const userSlot = customLayout && customLayout[slotIdx];

      if (prod && (slot || userSlot)) {
        const dimStr = [prod.dim_cm, prod.dim_in].filter(Boolean).join(" | ");
        const szMain = Math.round((fontSize || 14) * 100);
        const szSub = Math.max(700, szMain - 200);
        const fontNameClean = escapeXml(fontName || "Calibri");
        const fontColorXml = fontColor ? `<a:srgbClr val="${fontColor.replace("#", "")}"/>` : "";

        const newTxBody = `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" b="1" sz="${szMain}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>${escapeXml(prod.code)} | </a:t></a:r><a:r><a:rPr lang="en-US" b="0" sz="${szMain}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>${escapeXml(prod.description)}</a:t></a:r></a:p>${dimStr ? `<a:p><a:r><a:rPr lang="en-US" b="1" sz="${szSub}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>${escapeXml(dimStr)}</a:t></a:r></a:p>` : ""}${prod.price ? `<a:p><a:r><a:rPr lang="en-US" b="1" sz="${szSub}"><a:latin typeface="${fontNameClean}"/>${fontColorXml}</a:rPr><a:t>PRICE : ${escapeXml(prod.price)}</a:t></a:r></a:p>` : ""}</p:txBody>`;

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
          const imgFilename = `prod_img_${sIdx}_${slotIdx}.${imgExt}`;
          zip.file(`ppt/media/${imgFilename}`, imgBuffer);

          const imgRelId = `rId${nextSlideRId++}`;
          const relEntry = `<Relationship Id="${imgRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgFilename}"/>`;
          slideRels = slideRels.replace("</Relationships>", `${relEntry}</Relationships>`);

          let picX = slot ? slot.offX : Math.round((slotIdx * 260 / 800) * cx);
          let picY = slot ? Math.max(700000, slot.offY - 4400000) : Math.round((80 / 450) * cy);
          let picW = slot ? slot.extCx : Math.round((220 / 800) * cx);
          let picH = slot ? Math.max(1000000, slot.offY - picY - 100000) : Math.round((180 / 450) * cy);

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
        // Clear empty slots on the final slide
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
      const partName = `/ppt/slides/${slideName}`;
      if (!contentTypesStr.includes(`PartName="${partName}"`)) {
        const ctEntry = `<Override PartName="${partName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
        contentTypesStr = contentTypesStr.replace("</Types>", `${ctEntry}</Types>`);
      }

      const presRelId = `rId${nextPresRId++}`;
      if (!presRelsStr.includes(`Target="slides/${slideName}"`)) {
        const presRelEntry = `<Relationship Id="${presRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${slideName}"/>`;
        presRelsStr = presRelsStr.replace("</Relationships>", `${presRelEntry}</Relationships>`);
      }

      const sldIdVal = nextSldId++;
      const sldEntry = `<p:sldId id="${sldIdVal}" r:id="${presRelId}"/>`;
      presXmlStr = presXmlStr.replace("</p:sldIdLst>", `${sldEntry}</p:sldIdLst>`);
    }
  }

  zip.file("[Content_Types].xml", contentTypesStr);
  zip.file("ppt/_rels/presentation.xml.rels", presRelsStr);
  zip.file("ppt/presentation.xml", presXmlStr);

  onProgress?.("validating", 85, "Serializing package & validating OpenXML integrity…");

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  // Pre-Delivery Structural Integrity Validation
  const validation = await validatePptxPackage(blob);

  if (!validation.valid) {
    const errorDetails = validation.errors.join("; ");
    throw new Error(`Presentation failed integrity validation: ${errorDetails}`);
  }

  onProgress?.("complete", 100, `Successfully generated and validated ${totalSlides} slides (${products.length} products).`);

  return {
    blob,
    validation,
    totalProducts: products.length,
    slideCount: totalSlides,
    byteSize: blob.size
  };
}
