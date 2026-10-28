import React, { useState } from "react";
import {
  FileImage,
  Upload,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  LoaderCircle,
  ScanText,
  Sparkles,
  CheckCircle2,
  FileSpreadsheet,
  X,
  Layers,
  Image as ImageIcon,
  Eye,
  RefreshCw,
  FolderOpen,
  Filter,
  ShieldCheck,
  Tag
} from "lucide-react";
import "./ppt-excel.css";

type Img = {
  id: string;
  name: string;
  mime: string;
  data: string;
  ocrText?: string;
  isLogo?: boolean;
  role?: "product" | "logo" | "footer";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

export type ExtractedProduct = {
  id: string;
  itemCode: string;
  name: string;
  material: string;
  length: string;
  width: string;
  height: string;
  lengthCm?: string;
  widthCm?: string;
  heightCm?: string;
  lengthIn?: string;
  widthIn?: string;
  heightIn?: string;
  cbm?: string;
  price?: string;
  currency?: string;
  description: string;
  primaryImage: Img | null;
  candidateImages: Img[];
  rawText: string;
  values?: Record<string, string>;
};

type Slide = {
  slideNumber: number;
  sourceFile: string;
  title: string;
  text: string[];
  tables: string[][][];
  images: Img[];
  preview?: string;
  products?: ExtractedProduct[];
};

type Col = { id: string; header: string; type: "text" | "image" };
type Row = {
  id: string;
  slideNumber: number;
  sourceFile: string;
  values: Record<string, string>;
  images: Record<string, Img | null>;
  productId?: string;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const uri = (i: Img) => `data:${i.mime};base64,${i.data}`;

const PRESETS: Record<string, string[]> = {
  "🛋️ Furniture & Products": [
    "Product Name",
    "Item Code",
    "Material",
    "Length",
    "Width",
    "Height",
    "Description",
    "Product Image"
  ],
  "📦 Packaging & Box App": [
    "Item Code",
    "Length",
    "Width",
    "Height",
    "Ply",
    "Type",
    "CBM",
    "Product Image"
  ],
  "🏷️ Price & Quotation": [
    "Item Code",
    "Product Name",
    "Price",
    "Currency",
    "Material",
    "Product Image"
  ],
  "📑 Slide Summaries": [
    "Slide Title",
    "Summary / Notes",
    "Tables",
    "Slide Image"
  ]
};

const initialCols = PRESETS["🛋️ Furniture & Products"].map((h, i) => ({
  id: "c" + i,
  header: h,
  type: (/image|photo|picture/i.test(h) ? "image" : "text") as "text" | "image"
}));

const BANNER_RE = /^(?:NOBLE\s*SELECTIONS?.*|COLLECTION\s*\d*.*|CATALOG(?:UE)?.*|SPRING\s*\d+.*|FEBRUARY\s*FAIR.*|FAIR\s*\d+.*|AUTUMN\s*\d+.*|SUMMER\s*\d+.*|WINTER\s*\d+.*|PAGE\s*\d+.*|SLIDE\s*\d+.*)$/i;

const MATERIAL_RE = /\b(?:mango\s*wood|sheesham(?:\s*wood)?|indian\s*rosewood|acacia(?:\s*wood)?|oak(?:\s*wood)?|pine(?:\s*wood)?|bamboo|teak(?:\s*wood)?|metal|iron|wrought\s*iron|cast\s*iron|mild\s*steel|stainless\s*steel|brass|copper|aluminum|marble|travertine|granite|quartz|solid\s*wood|wood|mdf|plywood|cane|rattan|wicker|fabric|leather|velvet|linen|cotton|glass|mirror|ceramic|terracotta|bone\s*inlay|mother\s*of\s*pearl|resin|terrazzo|jute)\b/i;

const DIM_REGEX = /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*(CM|CMS|CENTIMETERS?|INCH(?:ES)?|IN))?/gi;

function getProductValue(p: ExtractedProduct, header: string): string {
  const h = header.toLowerCase();
  if (/sku|item\s*code|product\s*code|model\s*(?:no|number)?/.test(h)) return p.itemCode || "";
  if (/product\s*name|item\s*name|^name$|title/.test(h)) return p.name || "";
  if (/material|wood\s*type|finish/.test(h)) return p.material || "";
  if (/cbm|cubic/.test(h)) return p.cbm || "";
  if (/price|cost|retail|wholesale|trade/.test(h)) {
    if (/currency|curr\b/.test(h)) return p.currency || "";
    return p.price || "";
  }
  const unitIn = /\bin\b|inch/.test(h);
  const unitCm = /\bcm\b|centimeter/.test(h);
  if (/length|^l\b/.test(h)) return unitIn ? (p.lengthIn || p.length) : unitCm ? (p.lengthCm || p.length) : p.length;
  if (/width|^w\b/.test(h)) return unitIn ? (p.widthIn || p.width) : unitCm ? (p.widthCm || p.width) : p.width;
  if (/height|^h\b/.test(h)) return unitIn ? (p.heightIn || p.height) : unitCm ? (p.heightCm || p.height) : p.height;
  if (/description|details|features/.test(h)) return p.description || "";
  return p.values?.[header] || "";
}

function parseProductFields(lines: string[]) {
  const raw = lines.map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  const all = raw.join(" | ");
  const fields: Record<string, string> = {};

  const skuLine = raw.find(
    x =>
      /^\s*\d{4,10}\s*(?:[|–—:-])/.test(x) ||
      /\b(?:SKU|ITEM\s*CODE|MODEL)\s*[:#-]?\s*[A-Z0-9-]{3,}\b/i.test(x)
  );
  if (skuLine) {
    const m = skuLine.match(/^\s*(\d{4,10})\s*(?:[|–—:-])/);
    const labeled = skuLine.match(/\b(?:SKU|ITEM\s*CODE|MODEL)\s*[:#-]?\s*([A-Z0-9-]{3,})\b/i);
    fields.sku = m?.[1] || labeled?.[1] || "";
  }

  const dims: { unit: string; values: string[] }[] = [];
  const dimRe =
    /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*(CM|CMS|CENTIMETERS?|INCH(?:ES)?|IN)\b)?/gi;
  for (const line of raw) {
    let m: RegExpExecArray | null;
    while ((m = dimRe.exec(line)) !== null) {
      const unit = (
        m[4] ||
        (/\bCM\b/i.test(line) ? "CM" : /\bIN(?:CH(?:ES)?)?\b/i.test(line) ? "IN" : "")
      ).toUpperCase();
      dims.push({
        unit: unit.startsWith("C") ? "CM" : unit.startsWith("I") ? "IN" : "",
        values: [m[1], m[2], m[3]]
      });
    }
    dimRe.lastIndex = 0;
  }
  const cm = dims.find(d => d.unit === "CM");
  const inch = dims.find(d => d.unit === "IN");
  const unitless = dims.find(d => !d.unit);
  const dimension = (d: { unit: string; values: string[] } | undefined, index: number) =>
    d?.values[index] || "";

  fields.lengthCm = dimension(cm || (!inch ? unitless : undefined), 0);
  fields.widthCm = dimension(cm || (!inch ? unitless : undefined), 1);
  fields.heightCm = dimension(cm || (!inch ? unitless : undefined), 2);
  fields.lengthIn = dimension(inch, 0);
  fields.widthIn = dimension(inch, 1);
  fields.heightIn = dimension(inch, 2);

  const cbm = all.match(/\bCBM\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  fields.cbm = cbm?.[1] || "";

  const priceRe =
    /(?:\b(?:price|retail|wholesale|trade|cost|usd|eur|gbp|inr|aud|aed)\b\s*[:=-]?\s*)?([₹$€£])?\s*(\d+(?:[.,]\d{1,4})?)\s*(USD|EUR|GBP|INR|AUD|AED|\$|€|£|₹)?/gi;
  const prices: { value: string; currency: string; label: string }[] = [];
  for (const line of raw) {
    if (!/\b(price|retail|wholesale|trade|cost)\b|[$€£₹]/i.test(line)) continue;
    let m: RegExpExecArray | null;
    while ((m = priceRe.exec(line)) !== null) {
      const value = m[2]?.replace(",", ".");
      if (!value || !/[0-9]/.test(value)) continue;
      const before = line.slice(Math.max(0, m.index - 18), m.index);
      if (/\b(?:CM|IN|CBM)\s*$/i.test(before)) continue;
      const curr = (m[3] || m[1] || "").toUpperCase();
      const currency =
        ({ $: "USD", "€": "EUR", "£": "GBP", "₹": "INR" } as Record<string, string>)[curr] || curr;
      const label = (line.match(/\b(price|retail|wholesale|trade|cost)\b/i) || [])[1] || "";
      if (!prices.some(p => p.value === value && p.currency === currency && p.label === label)) {
        prices.push({ value, currency, label });
      }
    }
    priceRe.lastIndex = 0;
  }
  fields.prices = JSON.stringify(prices);

  const materialLine = raw.find(x =>
    /\b(?:mango wood|sheesham|acacia|oak|pine|bamboo|teak|metal|iron|marble|travertine|wood|fabric|leather|glass|stainless steel)\b/i.test(
      x
    )
  );
  fields.material = materialLine ? materialLine.replace(/^material\s*[:=-]\s*/i, "") : "";

  const titleLine = raw.find(
    x =>
      !/(?:\d+(?:\.\d+)?\s*[x×*]\s*\d|\bCBM\b|\b(?:price|retail|wholesale|trade|cost)\b|\b(?:CM|INCHES?)\b|\b(?:mango wood|sheesham|acacia|oak|pine|bamboo|teak|metal|iron|marble|wood|fabric)\b)/i.test(
        x
      ) && x.length > 1
  );
  fields.name = titleLine
    ? titleLine
        .replace(/^\s*\d{4,10}\s*[|–—:-]\s*/, "")
        .replace(/^\s*(?:product\s*name|name)\s*[:=-]\s*/i, "")
        .trim()
    : "";
  fields.description = raw.filter(x => x !== titleLine && !/^\s*\d{4,10}\s*[|–—:-]/.test(x)).join(" | ");
  fields.raw = all;
  return fields;
}

function suggest(lines: string[], header: string) {
  const h = header.toLowerCase();
  const p = parseProductFields(lines);
  if (/sku|item\s*code|product\s*code|model\s*(?:no|number)?/.test(h)) return p.sku || "";
  if (/product\s*name|item\s*name|^name$|title/.test(h)) return p.name || "";
  if (/material|wood\s*type/.test(h)) return p.material || "";
  if (/cbm|cubic/.test(h)) return p.cbm || "";
  if (/price|cost|retail|wholesale|trade/.test(h)) {
    const prices = JSON.parse(p.prices || "[]") as { value: string; currency: string; label: string }[];
    const n = Number((h.match(/\b(\d+)\b/) || [])[1] || 1) - 1;
    const price = prices[n];
    if (/currency|curr\b/.test(h)) return price?.currency || "";
    return price?.value || "";
  }
  const unitIn = /\bin\b|inch/.test(h);
  const unitCm = /\bcm\b|centimeter/.test(h);
  if (/length|^l\b/.test(h)) return unitIn ? p.lengthIn : unitCm ? p.lengthCm : p.lengthCm || p.lengthIn;
  if (/width|^w\b/.test(h)) return unitIn ? p.widthIn : unitCm ? p.widthCm : p.widthCm || p.widthIn;
  if (/height|^h\b/.test(h)) return unitIn ? p.heightIn : unitCm ? p.heightCm : p.heightCm || p.heightIn;
  if (/description|details|features/.test(h)) return p.description;

  const re =
    h.includes("name") || h.includes("title")
      ? /product\s*name|item\s*name|title|name\s*:/i
      : h.includes("code") || h.includes("sku") || h.includes("model")
      ? /item\s*code|sku|model|code\s*:/i
      : h.includes("material") || h.includes("wood")
      ? /material|made of|wood|metal|fabric/i
      : h.includes("length")
      ? /length|\bL\s*[:=]/i
      : h.includes("width")
      ? /width|\bW\s*[:=]/i
      : h.includes("height")
      ? /height|\bH\s*[:=]/i
      : null;
  const line = re && lines.find(x => re.test(x));
  return line ? line.replace(/^\s*[^:：=]{1,35}\s*[:：=]\s*/, "").trim() || line.trim() : "";
}

function getProfiles(): Record<string, Col[]> {
  try {
    return JSON.parse(
      typeof localStorage !== "undefined" ? localStorage.getItem("pptExcelProfiles") || "{}" : "{}"
    );
  } catch {
    return {};
  }
}

export default function PptExcelTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [sel, setSel] = useState(0);
  const [cols, setCols] = useState<Col[]>(initialCols);
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<"slide" | "product">("product");
  const [source, setSource] = useState(true);
  const [embed, setEmbed] = useState(true);
  const [filterLogos, setFilterLogos] = useState(true);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ocr, setOcr] = useState(false);
  const [profile, setProfile] = useState("");
  const [activePreset, setActivePreset] = useState("🛋️ Furniture & Products");

  const cur = slides[sel];
  const lines = cur ? [...cur.text, ...cur.tables.flat(2), ...cur.images.map(x => x.ocrText || "")].filter(Boolean) : [];

  function makeRows(list: Slide[], currentCols = cols, currentMode = mode, shouldFilter = filterLogos) {
    const out: Row[] = [];
    list.forEach(s => {
      const usableImages = shouldFilter
        ? s.images.filter(im => !im.isLogo)
        : s.images;
      const fallbackImg = usableImages[0] || s.images[0] || null;

      // In product mode, use smart multi-product extraction if products exist
      if (currentMode === "product" && s.products && s.products.length > 0) {
        s.products.forEach(p => {
          const values: Record<string, string> = {};
          const images: Record<string, Img | null> = {};

          currentCols.forEach(c => {
            if (c.type === "image") {
              const assignedImg = p.primaryImage;
              images[c.id] = shouldFilter && assignedImg?.isLogo ? fallbackImg : (assignedImg || fallbackImg);
            } else {
              values[c.id] = getProductValue(p, c.header);
            }
          });

          out.push({
            id: uid(),
            slideNumber: s.slideNumber,
            sourceFile: s.sourceFile,
            productId: p.id,
            values,
            images
          });
        });
      } else {
        // Fallback for slide-mode or slides without detected products
        const txt = [...s.text, ...s.tables.flat(2), ...s.images.map(x => x.ocrText || "")].filter(Boolean);
        const imgList = currentMode === "product"
          ? (usableImages.length ? usableImages : [null])
          : [null];

        imgList.forEach(im => {
          const values: Record<string, string> = {};
          const images: Record<string, Img | null> = {};

          currentCols.forEach(c => {
            values[c.id] = c.type === "text" ? suggest(txt, c.header) : "";
            images[c.id] = c.type === "image" ? (im || fallbackImg) : null;
          });

          out.push({
            id: uid(),
            slideNumber: s.slideNumber,
            sourceFile: s.sourceFile,
            values,
            images
          });
        });
      }
    });
    setRows(out);
  }

  const applyPreset = (presetName: string) => {
    setActivePreset(presetName);
    const headers = PRESETS[presetName] || [];
    const newCols: Col[] = headers.map((h, i) => ({
      id: "c" + i,
      header: h,
      type: /image|photo|picture/i.test(h) ? "image" : "text"
    }));
    setCols(newCols);
    if (slides.length > 0) {
      makeRows(slides, newCols, mode, filterLogos);
    }
  };

  const toggleImageRole = (slideNumber: number, imageId: string) => {
    const updated = slides.map(s => {
      if (s.slideNumber !== slideNumber) return s;
      return {
        ...s,
        images: s.images.map(im => {
          if (im.id !== imageId) return im;
          const nextIsLogo = !im.isLogo;
          return {
            ...im,
            isLogo: nextIsLogo,
            role: nextIsLogo ? "logo" : "product"
          };
        })
      };
    });
    setSlides(updated);
    makeRows(updated, cols, mode, filterLogos);
  };

  async function processPresentation() {
    if (!files.length) return;
    setBusy(true);
    setError("");
    setSlides([]);
    setRows([]);
    setProgress({ current: 0, total: 1 });

    try {
      const JSZip = (await import("jszip")).default;
      const all: Slide[] = [];

      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(".pptx")) {
          throw new Error(
            `${file.name}: Browser extraction requires .pptx format. Please open the presentation in PowerPoint and use Save As (.pptx), then retry.`
          );
        }

        setStatus(`Reading ${file.name} locally…`);
        const zip = await JSZip.loadAsync(file);

        // Read presentation dimensions for position heuristics (e.g. 16:9 is 12192000 x 6858000 EMUs)
        let sldWidth = 12192000, sldHeight = 6858000;
        const presXmlText = await zip.file("ppt/presentation.xml")?.async("text");
        if (presXmlText) {
          const pxml = new DOMParser().parseFromString(presXmlText, "application/xml");
          const sldSz = pxml.getElementsByTagNameNS("*", "sldSz")[0];
          if (sldSz) {
            sldWidth = Number(sldSz.getAttribute("cx") || sldWidth);
            sldHeight = Number(sldSz.getAttribute("cy") || sldHeight);
          }
        }

        const slideNames = Object.keys(zip.files)
          .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));

        if (!slideNames.length) {
          throw new Error(`${file.name}: No slides found in this presentation.`);
        }

        setProgress({ current: 0, total: slideNames.length });

        type RawImgItem = {
          embedId: string;
          targetPath: string;
          x: number;
          y: number;
          w: number;
          h: number;
        };

        type TextShapeItem = {
          x: number;
          y: number;
          w: number;
          h: number;
          paras: string[];
        };

        const slideRawData: {
          slideIdx: number;
          shapes: TextShapeItem[];
          tables: string[][][];
          items: RawImgItem[];
        }[] = [];

        const imageFileSlideCounts = new Map<string, Set<number>>();

        for (let ix = 0; ix < slideNames.length; ix++) {
          const path = slideNames[ix];
          const xmlText = await zip.file(path)!.async("text");
          const xml = new DOMParser().parseFromString(xmlText, "application/xml");

          if (xml.querySelector("parsererror")) {
            throw new Error("Could not parse slide XML: " + path);
          }

          // Parse shapes with coordinates and paragraphs
          const shapes: TextShapeItem[] = [];
          const spNodes = Array.from(xml.getElementsByTagNameNS("*", "sp"));
          spNodes.forEach(sp => {
            let x = 0, y = 0, w = 0, h = 0;
            const xfrm = sp.getElementsByTagNameNS("*", "xfrm")[0];
            if (xfrm) {
              const off = xfrm.getElementsByTagNameNS("*", "off")[0];
              const ext = xfrm.getElementsByTagNameNS("*", "ext")[0];
              if (off) {
                x = Number(off.getAttribute("x") || 0);
                y = Number(off.getAttribute("y") || 0);
              }
              if (ext) {
                w = Number(ext.getAttribute("cx") || 0);
                h = Number(ext.getAttribute("cy") || 0);
              }
            }

            // Check parent group offset if shape x, y are relative to group
            let parent = sp.parentElement;
            while (parent && parent !== xml.documentElement) {
              if (parent.localName === "grpSp") {
                const grpXfrm = parent.getElementsByTagNameNS("*", "xfrm")[0];
                if (grpXfrm) {
                  const grpOff = grpXfrm.getElementsByTagNameNS("*", "off")[0];
                  if (grpOff) {
                    const gx = Number(grpOff.getAttribute("x") || 0);
                    const gy = Number(grpOff.getAttribute("y") || 0);
                    if (gx > 0 && x === 0) x = gx;
                    if (gy > 0 && y === 0) y = gy;
                  }
                }
                break;
              }
              parent = parent.parentElement;
            }

            const paras: string[] = [];
            Array.from(sp.getElementsByTagNameNS("*", "p")).forEach(p => {
              const ptxt = Array.from(p.getElementsByTagNameNS("*", "t"))
                .map(t => t.textContent || "")
                .join("")
                .trim();
              if (ptxt) paras.push(ptxt);
            });

            if (paras.length > 0) {
              shapes.push({ x, y, w, h, paras });
            }
          });

          // Tables
          const tables: string[][][] = [];
          Array.from(xml.getElementsByTagNameNS("*", "tbl")).forEach(tbl => {
            const table: string[][] = [];
            Array.from(tbl.getElementsByTagNameNS("*", "tr")).forEach(tr =>
              table.push(
                Array.from(tr.getElementsByTagNameNS("*", "tc")).map(tc =>
                  Array.from(tc.getElementsByTagNameNS("*", "t"))
                    .map(t => t.textContent || "")
                    .join("")
                    .trim()
                )
              )
            );
            if (table.length) tables.push(table);
          });

          // Slide relationships
          const relPath = path.replace("slides/", "slides/_rels/") + ".rels";
          const relText = await zip.file(relPath)?.async("text");
          const rels = new Map<string, string>();
          if (relText) {
            const relXml = new DOMParser().parseFromString(relText, "application/xml");
            Array.from(relXml.getElementsByTagNameNS("*", "Relationship")).forEach(r => {
              const id = r.getAttribute("Id");
              const target = r.getAttribute("Target");
              const type = r.getAttribute("Type") || "";
              if (id && target && !type.endsWith("/slideLayout") && !type.endsWith("/notesSlide")) {
                rels.set(id, target);
              }
            });
          }

          // Picture & Blip nodes with coordinates
          const rawItems: RawImgItem[] = [];
          const blipNodes = Array.from(xml.getElementsByTagNameNS("*", "blip"));

          blipNodes.forEach(blipNode => {
            const embed = blipNode.getAttributeNS(
              "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
              "embed"
            );
            if (!embed) return;
            const target = rels.get(embed);
            if (!target) return;

            const imagePath = target.startsWith("/")
              ? target.slice(1)
              : ("ppt/slides/" + target)
                  .split("/")
                  .reduce((a, p) => {
                    if (p === "..") a.pop();
                    else if (p !== ".") a.push(p);
                    return a;
                  }, [] as string[])
                  .join("/");

            let x = 0, y = 0, w = 0, h = 0;
            let currNode: Node | null = blipNode;
            while (currNode && currNode !== xml) {
              if (currNode.nodeType === 1) {
                const el = currNode as Element;
                const xfrm = el.getElementsByTagNameNS("*", "xfrm")[0];
                if (xfrm) {
                  const off = xfrm.getElementsByTagNameNS("*", "off")[0];
                  const ext = xfrm.getElementsByTagNameNS("*", "ext")[0];
                  if (off) {
                    x = Number(off.getAttribute("x") || 0);
                    y = Number(off.getAttribute("y") || 0);
                  }
                  if (ext) {
                    w = Number(ext.getAttribute("cx") || 0);
                    h = Number(ext.getAttribute("cy") || 0);
                  }
                  break;
                }
              }
              currNode = currNode.parentNode;
            }

            // Also check if inside a group shape with offset
            let pNode: Node | null = blipNode;
            while (pNode && pNode !== xml) {
              if (pNode.nodeType === 1 && (pNode as Element).localName === "grpSp") {
                const grpEl = pNode as Element;
                const grpXfrm = grpEl.getElementsByTagNameNS("*", "xfrm")[0];
                if (grpXfrm) {
                  const grpOff = grpXfrm.getElementsByTagNameNS("*", "off")[0];
                  const grpExt = grpXfrm.getElementsByTagNameNS("*", "ext")[0];
                  if (grpOff && (x === 0 || y === 0)) {
                    x = Number(grpOff.getAttribute("x") || 0);
                    y = Number(grpOff.getAttribute("y") || 0);
                  }
                  if (grpExt && (w === 0 || h === 0)) {
                    w = Number(grpExt.getAttribute("cx") || 0);
                    h = Number(grpExt.getAttribute("cy") || 0);
                  }
                }
                break;
              }
              pNode = pNode.parentNode;
            }

            rawItems.push({
              embedId: embed,
              targetPath: imagePath,
              x,
              y,
              w,
              h
            });

            if (!imageFileSlideCounts.has(imagePath)) {
              imageFileSlideCounts.set(imagePath, new Set());
            }
            imageFileSlideCounts.get(imagePath)!.add(ix + 1);
          });

          slideRawData.push({
            slideIdx: ix + 1,
            shapes,
            tables,
            items: rawItems
          });

          setProgress({ current: ix + 1, total: slideNames.length });
        }

        // Second pass: load image binary data and filter logos
        for (const slideData of slideRawData) {
          const images: Img[] = [];

          for (let im = 0; im < slideData.items.length; im++) {
            const item = slideData.items[im];
            const imageFile = zip.file(item.targetPath);
            if (!imageFile) continue;

            const ext = (item.targetPath.split(".").pop() || "png").toLowerCase();
            const data = await imageFile.async("base64");
            const mime =
              ({
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                png: "image/png",
                gif: "image/gif",
                bmp: "image/bmp",
                svg: "image/svg+xml",
                tif: "image/tiff",
                tiff: "image/tiff"
              } as Record<string, string>)[ext] || "image/png";

            const relX = sldWidth > 0 ? item.x / sldWidth : 0;
            const relY = sldHeight > 0 ? item.y / sldHeight : 0;
            const relW = sldWidth > 0 ? item.w / sldWidth : 0;
            const relH = sldHeight > 0 ? item.h / sldHeight : 0;

            // Heuristics to exclude logos, headers, footers & divider lines
            const isTopRightCorner = relY < 0.22 && relX > 0.65 && relW < 0.35 && relH < 0.25;
            const isTopLeftCorner = relY < 0.22 && relX < 0.28 && relW < 0.35 && relH < 0.25;
            const isFooter = relY > 0.82;
            const isDividerLine = relH < 0.025 || (relW > 0.4 && relH < 0.035) || (item.h > 0 && item.h < 50000);
            const slideCountForImg = imageFileSlideCounts.get(item.targetPath)?.size || 1;
            const isRepeatedAcrossSlides = slideNames.length >= 2 && slideCountForImg >= 2;

            const isLogo = isTopRightCorner || isTopLeftCorner || isFooter || isDividerLine || isRepeatedAcrossSlides;
            const role = isFooter || isDividerLine ? "footer" : isLogo ? "logo" : "product";

            // Avoid duplicate identical target images on same slide
            if (!images.some(existing => existing.name === item.targetPath.split("/").pop())) {
              images.push({
                id: "s" + slideData.slideIdx + "i" + (im + 1),
                name: item.targetPath.split("/").pop() || `image_${im}.${ext}`,
                mime,
                data,
                isLogo,
                role,
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h
              });
            }
          }

          // Intelligent Product Segmentation on Slide
          const usablePhotos = images.filter(img => !img.isLogo && img.role === "product");
          const candidatePhotos = usablePhotos.length > 0 ? usablePhotos : images;

          let collectionName = "";
          let slideMaterial = "";

          // Check collection names and slide-wide material notes
          slideData.shapes.forEach(s => {
            const joined = s.paras.join(" ").trim();
            if (/^[A-Z0-9a-z\s]+collection$/i.test(joined)) {
              collectionName = joined;
            }
            const matM = joined.match(MATERIAL_RE);
            if (matM && !slideMaterial) {
              slideMaterial = matM[0].replace(/^[a-z]/, c => c.toUpperCase());
            }
          });

          const extractedProducts: ExtractedProduct[] = [];

          slideData.shapes.forEach(s => {
            const paras = s.paras;
            const joined = paras.join(" ").trim();
            if (BANNER_RE.test(joined) || /^[A-Z0-9a-z\s]+collection$/i.test(joined)) {
              return;
            }

            let itemCode = "";
            let name = "";
            let l = "", w = "", h = "";
            let lIn = "", wIn = "", hIn = "";
            let desc = "";
            let mat = slideMaterial;

            paras.forEach(p => {
              // 1. Code | Name pattern: e.g. "69210 | Coffee table"
              const codeNameM = p.match(/^\s*([A-Z0-9\/-]+(?:\s*\/[A-Z0-9\/-]+)?)\s*\|\s*([^|]+)$/);
              if (codeNameM) {
                itemCode = codeNameM[1].trim();
                name = codeNameM[2].trim();
                return;
              }

              // 2. Dimensions pattern: e.g. "140 x 60 x 42 CM | 55 x 23 x 16 IN"
              const allDims = [...p.matchAll(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*(CM|CMS|INCH(?:ES)?|IN))?/gi)];
              if (allDims.length > 0) {
                l = allDims[0][1];
                w = allDims[0][2];
                h = allDims[0][3];
                if (allDims.length > 1) {
                  lIn = allDims[1][1];
                  wIn = allDims[1][2];
                  hIn = allDims[1][3];
                }
                const parts = p.split("|");
                if (parts.length > 1) {
                  desc = parts.slice(1).join(" | ").trim();
                }
                return;
              }

              // 3. Material check
              const pMatM = p.match(MATERIAL_RE);
              if (pMatM && (!name || pMatM[0].toLowerCase() !== name.toLowerCase())) {
                mat = pMatM[0].replace(/^[a-z]/, c => c.toUpperCase());
              }

              // 4. Labeled fields
              if (/^(?:item\s*code|sku|code|model)\s*[:=-]\s*(.*)$/i.test(p)) {
                itemCode = p.replace(/^(?:item\s*code|sku|code|model)\s*[:=-]\s*/i, "").trim();
              } else if (/^(?:product\s*name|name|title)\s*[:=-]\s*(.*)$/i.test(p)) {
                name = p.replace(/^(?:product\s*name|name|title)\s*[:=-]\s*/i, "").trim();
              } else if (/^(?:material|finish|wood|timber)\s*[:=-]\s*(.*)$/i.test(p)) {
                mat = p.replace(/^(?:material|finish|wood|timber)\s*[:=-]\s*/i, "").trim();
              } else if (!name && !BANNER_RE.test(p) && p.length > 2 && !/^(?:Price|Cost|USD|\$)/i.test(p)) {
                name = p;
              }
            });

            if (itemCode || (name && (l || w || h))) {
              // Pair with closest image using spatial Euclidean distance
              let bestImg: Img | null = null;
              let minDist = Infinity;
              const scX = s.x + s.w / 2;
              const scY = s.y + s.h / 2;

              candidatePhotos.forEach(im => {
                const icX = (im.x || 0) + (im.w || 0) / 2;
                const icY = (im.y || 0) + (im.h || 0) / 2;
                const dist = Math.pow(scX - icX, 2) + Math.pow(scY - icY, 2);
                if (dist < minDist) {
                  minDist = dist;
                  bestImg = im;
                }
              });

              // Clean description: include collection and secondary imperial dimensions if present
              const fullDesc = [collectionName, desc].filter(Boolean).join(" · ").trim();

              extractedProducts.push({
                id: uid(),
                slideNumber: slideData.slideIdx,
                sourceFile: file.name,
                itemCode,
                name,
                material: mat,
                length: l,
                width: w,
                height: h,
                lengthCm: l,
                widthCm: w,
                heightCm: h,
                lengthIn: lIn || l,
                widthIn: wIn || w,
                heightIn: hIn || h,
                description: fullDesc,
                primaryImage: bestImg || candidatePhotos[0] || null,
                candidateImages: candidatePhotos,
                rawText: paras.join(" | ")
              });
            }
          });

          // Single-product slide handling
          if (extractedProducts.length === 0 && (slideData.shapes.length > 0 || candidatePhotos.length > 0)) {
            const allTextLines = slideData.shapes.flatMap(s => s.paras).filter(t => !BANNER_RE.test(t));
            if (allTextLines.length > 0 || candidatePhotos.length > 0) {
              const pf = parseProductFields(allTextLines);
              let cleanName = pf.name;
              if (BANNER_RE.test(cleanName)) {
                cleanName = allTextLines.find(line => !BANNER_RE.test(line) && line.length > 2) || `Product Slide ${slideData.slideIdx}`;
              }

              let heroImg = candidatePhotos[0] || null;
              let maxArea = 0;
              candidatePhotos.forEach(im => {
                const area = (im.w || 0) * (im.h || 0);
                if (area > maxArea) {
                  maxArea = area;
                  heroImg = im;
                }
              });

              extractedProducts.push({
                id: uid(),
                slideNumber: slideData.slideIdx,
                sourceFile: file.name,
                itemCode: pf.sku || "",
                name: cleanName,
                material: pf.material || slideMaterial,
                length: pf.lengthCm || pf.lengthIn || "",
                width: pf.widthCm || pf.widthIn || "",
                height: pf.heightCm || pf.heightIn || "",
                lengthCm: pf.lengthCm,
                widthCm: pf.widthCm,
                heightCm: pf.heightCm,
                lengthIn: pf.lengthIn,
                widthIn: pf.widthIn,
                heightIn: pf.heightIn,
                cbm: pf.cbm,
                description: collectionName ? `${collectionName} · ${pf.description}` : pf.description,
                primaryImage: heroImg,
                candidateImages: candidatePhotos,
                rawText: allTextLines.join(" | ")
              });
            }
          }

          all.push({
            slideNumber: slideData.slideIdx,
            sourceFile: file.name,
            title: extractedProducts[0]?.name || slideData.shapes[0]?.paras[0] || `Slide ${slideData.slideIdx}`,
            text: slideData.shapes.flatMap(s => s.paras),
            tables: slideData.tables,
            images,
            products: extractedProducts
          });
        }
      }

      setSlides(all);
      setSel(0);
      makeRows(all, cols, mode, filterLogos);

      const totalExtractedProducts = all.reduce((sum, s) => sum + (s.products?.length || 0), 0);
      const logoCount = all.reduce((sum, s) => sum + s.images.filter(im => im.isLogo).length, 0);

      setStatus(
        `✓ Extracted ${all.length} slide(s) · ${totalExtractedProducts} product(s) identified with matched photos (${logoCount} logos/footers automatically filtered).`
      );
    } catch (e: any) {
      setError(e.message || "Could not extract presentation.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function updateCell(row: Row, col: Col, value: string) {
    setRows(prev =>
      prev.map(r => (r.id === row.id ? { ...r, values: { ...r.values, [col.id]: value } } : r))
    );
  }

  function saveProfile() {
    const name = window.prompt("Profile name:");
    if (!name) return;
    try {
      const old = JSON.parse(localStorage.getItem("pptExcelProfiles") || "{}");
      old[name] = cols;
      localStorage.setItem("pptExcelProfiles", JSON.stringify(old));
      setProfile(name);
      setStatus(`Saved profile: ${name}`);
    } catch {
      setError("Could not save profile in this browser.");
    }
  }

  function loadProfile(name: string) {
    setProfile(name);
    try {
      const p = JSON.parse(localStorage.getItem("pptExcelProfiles") || "{}");
      if (p[name]) {
        setCols(p[name]);
        if (slides.length) makeRows(slides, p[name], mode, filterLogos);
      }
    } catch {}
  }

  async function doOcr() {
    if (!cur?.images.length) return;
    setOcr(true);
    try {
      const T = await import("tesseract.js");
      const copy = [...slides];
      for (let i = 0; i < cur.images.length; i++) {
        setStatus(`OCR image ${i + 1} of ${cur.images.length}…`);
        const img = cur.images[i];
        const res = await T.recognize(uri(img), "eng");
        copy[sel] = {
          ...copy[sel],
          images: copy[sel].images.map(x => (x.id === img.id ? { ...x, ocrText: res.data.text.trim() } : x))
        };
      }
      setSlides(copy);
      makeRows(copy, cols, mode, filterLogos);
      setStatus("✓ OCR complete. Review extracted image text.");
    } catch (e: any) {
      setError("OCR failed: " + (e.message || "unknown error"));
    } finally {
      setOcr(false);
    }
  }

  async function exportXlsx() {
    setBusy(true);
    setError("");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Loveneet Suite";
      const ws = wb.addWorksheet("PPT Extract");

      const headers = cols.map(c => c.header || "Column");
      if (source) headers.push("Source File", "Slide Number");
      ws.addRow(headers);
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: headers.length } };
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF263D70" } };
      ws.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      ws.getRow(1).height = 32;

      cols.forEach((c, i) =>
        (ws.getColumn(i + 1).width =
          c.type === "image" ? 22 : Math.min(42, Math.max(15, (c.header || "Column").length + 3)))
      );
      if (source) {
        ws.getColumn(cols.length + 1).width = 30;
        ws.getColumn(cols.length + 2).width = 14;
      }

      for (let ri = 0; ri < rows.length; ri++) {
        const r = rows[ri];
        const vals: any[] = [];
        cols.forEach(c => vals.push(c.type === "image" ? "" : r.values[c.id] || ""));
        if (source) vals.push(r.sourceFile, r.slideNumber);
        ws.addRow(vals);
        const rowNum = ri + 2;

        if (embed) {
          cols.forEach((c, ci) => {
            const im = c.type === "image" ? r.images[c.id] : null;
            if (!im?.data) return;
            try {
              const ext = (im.mime.split("/")[1] || "png").replace("jpeg", "jpg");
              if (!["png", "jpg", "gif"].includes(ext)) return;
              const imageId = wb.addImage({
                base64: "data:" + im.mime + ";base64," + im.data,
                extension: ext as "png" | "jpg" | "gif"
              });
              ws.addImage(imageId, {
                tl: { col: ci, row: rowNum - 1 },
                br: { col: ci + 1, row: rowNum - 0.05 },
                editAs: "oneCell"
              });
              ws.getRow(rowNum).height = 68;
            } catch {}
          });
        }
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "PPT_to_Excel_with_Images.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("✓ Workbook created locally and downloaded.");
    } catch (e: any) {
      setError(e.message || "Export failed");
    } finally {
      setBusy(false);
    }
  }

  const moveCol = (i: number, d: number) =>
    setCols(prev => {
      const n = [...prev];
      const j = i + d;
      if (j < 0 || j >= n.length) return prev;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const totalExtractedImages = slides.reduce((sum, s) => sum + s.images.length, 0);
  const totalLogos = slides.reduce((sum, s) => sum + s.images.filter(im => im.isLogo).length, 0);
  const totalProducts = totalExtractedImages - totalLogos;

  return (
    <section className="pptx-tool">
      {/* Privacy & Feature Badges */}
      <div className="pptx-badges">
        <span className="pptx-badge">
          <Sparkles size={13} /> 100% In-Browser Engine
        </span>
        <span className="pptx-badge">
          <ShieldCheck size={13} /> Zero Cloud Upload
        </span>
        <span className="pptx-badge">
          <Filter size={13} /> Auto-Excludes Corner Logos & Footers
        </span>
        <span className="pptx-badge">
          <ImageIcon size={13} /> Embedded Excel Cell Images
        </span>
      </div>

      {/* Step 1: Upload Presentations */}
      <section className="pptx-panel">
        <div className="pptx-panel-head">
          <span className="pptx-step-num">01</span>
          <div>
            <h3>Select PowerPoint Presentation</h3>
            <p>Upload .pptx files to parse text, structured tables, and product photos.</p>
          </div>
        </div>

        <label
          className={`pptx-drop ${files.length ? "has-files" : ""}`}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            if (e.dataTransfer.files?.length) {
              setFiles(Array.from(e.dataTransfer.files));
            }
          }}
        >
          <input
            type="file"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            multiple
            onChange={e => setFiles(Array.from(e.target.files || []))}
          />
          <div className="pptx-drop-icon">
            <Upload size={24} />
          </div>
          <div className="pptx-drop-content">
            {files.length > 0 ? (
              <>
                <strong className="pptx-file-title">
                  {files.map(f => f.name).join(", ")}
                </strong>
                <small className="pptx-file-sub">
                  {files.length} file(s) · {(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(2)} MB total
                </small>
              </>
            ) : (
              <>
                <strong>Drop .pptx files here or click to browse</strong>
                <small>Client-side processing · No size limits · Safe and instant</small>
              </>
            )}
          </div>
        </label>

        {progress && (
          <div className="pptx-progress-bar">
            <div
              className="pptx-progress-fill"
              style={{
                width: `${Math.round((progress.current / Math.max(1, progress.total)) * 100)}%`
              }}
            />
            <span className="pptx-progress-text">
              Reading slide {progress.current} of {progress.total}…
            </span>
          </div>
        )}

        <div className="pptx-actions-bar">
          <button
            type="button"
            className="pptx-primary"
            disabled={!files.length || busy}
            onClick={processPresentation}
          >
            {busy ? (
              <>
                <LoaderCircle className="pptx-spin" size={16} /> Extracting Slides…
              </>
            ) : (
              <>
                <Layers size={16} /> Extract Slides & Images
              </>
            )}
          </button>
          {status && <span className="pptx-status">{status}</span>}
          {error && <span className="pptx-error">{error}</span>}
        </div>
      </section>

      {/* Step 2: Configure Excel Columns */}
      <section className="pptx-panel">
        <div className="pptx-bar">
          <div className="pptx-panel-head">
            <span className="pptx-step-num">02</span>
            <div>
              <h3>Configure Excel Columns & Logo Filter</h3>
              <p>Choose an industry preset, customize columns, and filter out brand logos and footer lines.</p>
            </div>
          </div>
          <button
            type="button"
            className="pptx-secondary"
            onClick={() => setCols(p => [...p, { id: uid(), header: "New Column", type: "text" }])}
          >
            <Plus size={14} /> Add Column
          </button>
        </div>

        {/* 1-Click Industry Presets */}
        <div className="pptx-presets-row">
          <span className="pptx-presets-label">QUICK PRESETS:</span>
          {Object.keys(PRESETS).map(p => (
            <button
              key={p}
              type="button"
              className={`pptx-preset-btn ${activePreset === p ? "active" : ""}`}
              onClick={() => applyPreset(p)}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Column List */}
        <div className="pptx-cols-grid">
          {cols.map((c, i) => (
            <div className="pptx-col-card" key={c.id}>
              <div className="pptx-col-index">{i + 1}</div>
              <input
                aria-label="Column header"
                value={c.header}
                placeholder="Column header name"
                onChange={e =>
                  setCols(p => p.map(x => (x.id === c.id ? { ...x, header: e.target.value } : x)))
                }
              />
              <select
                value={c.type}
                className={`type-select ${c.type}`}
                onChange={e =>
                  setCols(p =>
                    p.map(x => (x.id === c.id ? { ...x, type: e.target.value as "text" | "image" } : x))
                  )
                }
              >
                <option value="text">📝 Text / Value</option>
                <option value="image">🖼️ Image Cell</option>
              </select>
              <div className="pptx-col-actions">
                <button
                  type="button"
                  onClick={() => moveCol(i, -1)}
                  disabled={!i}
                  title="Move Left"
                  aria-label="Move left"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moveCol(i, 1)}
                  disabled={i === cols.length - 1}
                  title="Move Right"
                  aria-label="Move right"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  className="delete-col"
                  onClick={() => setCols(p => p.filter(x => x.id !== c.id))}
                  title="Delete column"
                  aria-label="Delete column"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Options Box with Logo Filter */}
        <div className="pptx-options-box">
          {/* Logo & Footer Filter Callout */}
          <div className="pptx-filter-banner">
            <label className="pptx-filter-toggle">
              <input
                type="checkbox"
                checked={filterLogos}
                onChange={e => {
                  setFilterLogos(e.target.checked);
                  makeRows(slides, cols, mode, e.target.checked);
                }}
              />
              <div className="pptx-filter-text">
                <strong>🛡️ Filter out Brand Logos, Headers & Footer Lines (Recommended)</strong>
                <small>
                  Automatically ignores images located in the top corners (logos), bottom lines (footers), and images repeated across slides.
                </small>
              </div>
            </label>
            {slides.length > 0 && (
              <span className="pptx-filter-count-badge">
                {filterLogos ? `Filtered ${totalLogos} logo(s)` : "All images included"}
              </span>
            )}
          </div>

          <div className="pptx-mode-radios">
            <label className={mode === "product" ? "selected" : ""}>
              <input
                type="radio"
                checked={mode === "product"}
                onChange={() => {
                  setMode("product");
                  if (slides.length) makeRows(slides, cols, "product", filterLogos);
                }}
              />
              <span>📦 1 Row per Product Photo (Multi-Product Slides)</span>
            </label>
            <label className={mode === "slide" ? "selected" : ""}>
              <input
                type="radio"
                checked={mode === "slide"}
                onChange={() => {
                  setMode("slide");
                  if (slides.length) makeRows(slides, cols, "slide", filterLogos);
                }}
              />
              <span>📑 1 Row per Slide</span>
            </label>
          </div>

          <div className="pptx-checkboxes">
            <label>
              <input
                type="checkbox"
                checked={source}
                onChange={e => setSource(e.target.checked)}
              />
              <span>Include Source File & Slide #</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={embed}
                onChange={e => setEmbed(e.target.checked)}
              />
              <span>Embed Images inside Cells</span>
            </label>
          </div>

          <div className="pptx-profile-actions">
            <button
              type="button"
              className="pptx-secondary"
              onClick={() => makeRows(slides, cols, mode, filterLogos)}
              disabled={!slides.length}
            >
              <RefreshCw size={13} /> Refresh Mappings
            </button>
            <button type="button" className="pptx-secondary" onClick={saveProfile}>
              Save Profile
            </button>
            {Object.keys(getProfiles()).length > 0 && (
              <select
                value={profile}
                className="pptx-profile-select"
                onChange={e => loadProfile(e.target.value)}
              >
                <option value="">Load saved profile…</option>
                {Object.keys(getProfiles()).map(x => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </section>

      {/* Step 3: Slide Browser, Content Inspector & Field Mapping */}
      {slides.length > 0 && (
        <section className="pptx-panel">
          <div className="pptx-panel-head">
            <span className="pptx-step-num">03</span>
            <div>
              <h3>Slide Browser & Content Inspector</h3>
              <p>
                Review extracted text snippets and photos. You can click any image badge to toggle between <strong>Product Photo</strong> and <strong>Brand Logo</strong>.
              </p>
            </div>
          </div>

          <div className="pptx-work">
            {/* Slide List */}
            <aside className="pptx-slides">
              <div className="pptx-slides-header">
                <strong>SLIDES ({slides.length})</strong>
              </div>
              <div className="pptx-slides-scroll">
                {slides.map((s, i) => {
                  const productImagesCount = s.images.filter(im => !im.isLogo).length;
                  return (
                    <button
                      key={s.sourceFile + s.slideNumber + i}
                      type="button"
                      className={`pptx-slide-btn ${sel === i ? "selected" : ""}`}
                      onClick={() => setSel(i)}
                    >
                      <div className="pptx-slide-meta">
                        <span className="pptx-slide-badge">Slide {s.slideNumber}</span>
                        {productImagesCount > 0 && (
                          <span className="pptx-img-pill" title={`${productImagesCount} product photo(s)`}>
                            <ImageIcon size={10} /> {productImagesCount}
                          </span>
                        )}
                      </div>
                      <small className="pptx-slide-title">
                        {s.title.slice(0, 38) || `Slide ${s.slideNumber}`}
                      </small>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Slide Inspector */}
            <div className="pptx-original">
              <div className="pptx-inspect-head">
                <strong>
                  {cur?.sourceFile} · Slide {cur?.slideNumber}
                </strong>
                {cur?.images.length > 0 && (
                  <button
                    type="button"
                    className="pptx-secondary"
                    onClick={doOcr}
                    disabled={ocr}
                  >
                    <ScanText size={13} /> {ocr ? "OCR Running…" : "Run OCR on Images"}
                  </button>
                )}
              </div>

              {/* Extracted Text Chips */}
              <div className="pptx-block">
                <h4>Extracted Text (Click to map to first text column)</h4>
                {lines.length > 0 ? (
                  <div className="pptx-lines">
                    {lines.map((line, i) => (
                      <button
                        key={i}
                        type="button"
                        className="pptx-chip"
                        onClick={() => {
                          const r = rows.find(
                            x => x.slideNumber === cur?.slideNumber && x.sourceFile === cur?.sourceFile
                          );
                          const c = cols.find(x => x.type === "text");
                          if (r && c) updateCell(r, c, line);
                        }}
                        title="Click to copy to primary text column"
                      >
                        {line}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="pptx-empty-note">No text found in slide shapes.</p>
                )}
              </div>

              {/* Gallery of Images in Slide with Logo / Product Badge */}
              {cur?.images.length > 0 && (
                <div className="pptx-block">
                  <div className="pptx-gallery-head">
                    <h4>Slide Images ({cur.images.length})</h4>
                    <small>Click badge to toggle Product vs Logo</small>
                  </div>
                  <div className="pptx-gallery">
                    {cur.images.map(im => (
                      <div
                        key={im.id}
                        className={`pptx-gallery-card ${im.isLogo ? "is-logo-card" : "is-product-card"}`}
                      >
                        <img src={uri(im)} alt={im.name} />
                        <small>{im.name}</small>

                        {/* Interactive Toggle for Logo vs Product */}
                        <button
                          type="button"
                          className={`pptx-role-badge ${im.isLogo ? "role-logo" : "role-product"}`}
                          onClick={() => toggleImageRole(cur.slideNumber, im.id)}
                          title="Click to toggle between Product photo and Brand logo"
                        >
                          {im.isLogo ? "🏷️ Logo (Excluded)" : "📦 Product (Active)"}
                        </button>

                        {im.ocrText && <p className="pptx-ocr-preview">{im.ocrText}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Slide-Level Mapping Inspector */}
            <aside className="pptx-map">
              <div className="pptx-map-head">
                <strong>Mapping · Slide {cur?.slideNumber}</strong>
              </div>
              <div className="pptx-map-scroll">
                {cols.map(c => {
                  const r = rows.find(
                    x => x.slideNumber === cur?.slideNumber && x.sourceFile === cur?.sourceFile
                  );
                  if (!r) return null;
                  return (
                    <div className="pptx-mapfield" key={c.id}>
                      <div className="pptx-mapfield-label">
                        <span>{c.header}</span>
                        <small className={c.type}>{c.type}</small>
                      </div>
                      {c.type === "image" ? (
                        <div className="pptx-image-select-wrap">
                          <select
                            value={r.images[c.id]?.id || ""}
                            onChange={e => {
                              const im = cur?.images.find(x => x.id === e.target.value) || null;
                              setRows(p =>
                                p.map(x =>
                                  x.id === r.id ? { ...x, images: { ...x.images, [c.id]: im } } : x
                                )
                              );
                            }}
                          >
                            <option value="">— No Image —</option>
                            {cur?.images.map(im => (
                              <option key={im.id} value={im.id}>
                                {im.isLogo ? `[Logo] ${im.name}` : `[Photo] ${im.name}`}
                              </option>
                            ))}
                          </select>
                          {r.images[c.id] && (
                            <img
                              src={uri(r.images[c.id]!)}
                              alt="Mapped preview"
                              className="pptx-mapped-thumb"
                            />
                          )}
                        </div>
                      ) : (
                        <input
                          value={r.values[c.id] || ""}
                          onChange={e => updateCell(r, c, e.target.value)}
                          placeholder="Select chip or type value"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        </section>
      )}

      {/* Step 4: Editable Excel Preview & 1-Click Export */}
      {rows.length > 0 && (
        <section className="pptx-panel">
          <div className="pptx-panel-head">
            <span className="pptx-step-num">04</span>
            <div>
              <h3>Excel Spreadsheet Preview ({rows.length} rows)</h3>
              <p>Review and edit rows before generating the final Excel workbook with embedded pictures.</p>
            </div>
          </div>

          <div className="pptx-tablewrap">
            <table>
              <thead>
                <tr>
                  {cols.map(c => (
                    <th key={c.id}>
                      {c.header}
                      <small className="th-type">({c.type})</small>
                    </th>
                  ))}
                  {source && (
                    <>
                      <th>Source File</th>
                      <th>Slide</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={r.id}>
                    {cols.map(c => (
                      <td key={c.id}>
                        {c.type === "image" ? (
                          <div className="pptx-cell-img-wrap">
                            {r.images[c.id] ? (
                              <img
                                className="pptx-cellimg"
                                src={uri(r.images[c.id]!)}
                                alt="Cell product"
                                title="Click to view full image in new tab"
                                onClick={() => {
                                  const win = window.open("");
                                  win?.document.write(`<html><body style="margin:0;background:#0b1120;display:grid;place-items:center;min-height:100vh;"><img src="${uri(r.images[c.id]!)}" style="max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.5);" /></body></html>`);
                                }}
                                style={{ cursor: "pointer" }}
                              />
                            ) : (
                              <span className="pptx-empty-cell">No Image</span>
                            )}
                            {r.images[c.id]?.isLogo && (
                              <span className="pptx-logo-tag">Logo</span>
                            )}
                            {(() => {
                              const s = slides.find(sl => sl.slideNumber === r.slideNumber && sl.sourceFile === r.sourceFile);
                              const usable = s ? (filterLogos ? s.images.filter(im => !im.isLogo) : s.images) : [];
                              if (usable.length > 1) {
                                return (
                                  <select
                                    className="pptx-img-swap-select"
                                    value={r.images[c.id]?.id || ""}
                                    onChange={e => {
                                      const selectedImg = s?.images.find(im => im.id === e.target.value) || null;
                                      setRows(prev =>
                                        prev.map(rowItem =>
                                          rowItem.id === r.id
                                            ? { ...rowItem, images: { ...rowItem.images, [c.id]: selectedImg } }
                                            : rowItem
                                        )
                                      );
                                    }}
                                    title="Switch to another photo from this slide"
                                  >
                                    <option value="">— Swap Photo —</option>
                                    {usable.map((u, ui) => (
                                      <option key={u.id} value={u.id}>
                                        Photo {ui + 1}
                                      </option>
                                    ))}
                                  </select>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        ) : (
                          <input
                            value={r.values[c.id] || ""}
                            onChange={e => updateCell(r, c, e.target.value)}
                            aria-label={`${c.header} row ${ri + 1}`}
                          />
                        )}
                      </td>
                    ))}
                    {source && (
                      <>
                        <td className="pptx-meta-td">{r.sourceFile}</td>
                        <td className="pptx-meta-td">{r.slideNumber}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pptx-export-footer">
            <div className="pptx-export-note">
              <CheckCircle2 size={16} />
              <span>
                <strong>{rows.length} product row(s) ready.</strong> Product photos will be embedded directly inside
                worksheet cells (not external links).
              </span>
            </div>
            <button
              type="button"
              className="pptx-download-btn"
              onClick={exportXlsx}
              disabled={busy}
            >
              {busy ? (
                <>
                  <LoaderCircle className="pptx-spin" size={17} /> Generating…
                </>
              ) : (
                <>
                  <Download size={17} /> Export Excel (.xlsx) with Images
                </>
              )}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
