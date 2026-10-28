/**
 * Loveneet Suite — OpenXML PPTX Structural Validator
 * Implements strict Phase 5 pre-download validation:
 * 1. Non-empty
 * 2. ZIP integrity & magic bytes
 * 3. No duplicate entries; required parts present
 * 4. All XML and .rels parts parse (well-formed)
 * 5. Content type exists for every part (Default or Override)
 * 6. Every internal relationship target exists; rIds unique per .rels
 * 7. Shape IDs unique per slide
 * 8. sldIdLst matches presentation.xml.rels & ECMA-376 bounds
 * 9. Reopen with independent parser pass
 * 10. Slide count equals expected; image relationships present for slides with images
 * 
 * NOTE: This is structural and OpenXML packaging validation, not a guarantee of Microsoft PowerPoint application behavior.
 */

import JSZip from "jszip";
import { parseXmlDocument } from "./xmlHelper.ts";

export interface ExpectedPresentationDetails {
  slideCount?: number;
  hasImages?: boolean;
}

export interface PptxValidationResult {
  valid: boolean;
  slideCount: number;
  mediaCount: number;
  totalSize: number;
  sha256: string;
  errors: string[];
  warnings: string[];
  diagnostics: {
    nonEmpty: boolean;
    zipIntegrity: boolean;
    noDuplicateEntries: boolean;
    requiredPartsPresent: boolean;
    xmlWellFormed: boolean;
    contentTypesDeclared: boolean;
    relationshipsIntact: boolean;
    shapeIdsUnique: boolean;
    sldIdLstMatchesRels: boolean;
    independentReaderPassed: boolean;
    expectedSlideCountMatched: boolean;
    imageRelationshipsValid: boolean;
  };
}

/**
 * Computes SHA-256 hash across Browser and Node environments.
 */
export async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    } catch {}
  }
  // Fallback for node crypto if subtle not available
  try {
    const cryptoModName = "crypto";
    const nodeCrypto = await import(/* @vite-ignore */ cryptoModName);
    return nodeCrypto.createHash("sha256").update(Buffer.from(buffer)).digest("hex");
  } catch {
    return "";
  }
}

/**
 * Comprehensive Pre-Download OpenXML Presentation Validator.
 */
export async function validatePptx(
  bytes: Blob | ArrayBuffer | Uint8Array,
  expected?: ExpectedPresentationDetails
): Promise<PptxValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let rawBuffer: ArrayBuffer;
  if (bytes instanceof Blob) {
    rawBuffer = await bytes.arrayBuffer();
  } else if (bytes instanceof Uint8Array) {
    rawBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } else {
    rawBuffer = bytes;
  }

  const totalSize = rawBuffer.byteLength;
  const sha256 = await computeSha256(rawBuffer);

  const diagnostics = {
    nonEmpty: false,
    zipIntegrity: false,
    noDuplicateEntries: false,
    requiredPartsPresent: false,
    xmlWellFormed: false,
    contentTypesDeclared: false,
    relationshipsIntact: false,
    shapeIdsUnique: false,
    sldIdLstMatchesRels: false,
    independentReaderPassed: false,
    expectedSlideCountMatched: false,
    imageRelationshipsValid: false,
  };

  // 1. Non-empty check
  if (!rawBuffer || totalSize < 100) {
    errors.push(`Check 1 Failed: Presentation buffer is empty or truncated (${totalSize} bytes).`);
    return {
      valid: false,
      slideCount: 0,
      mediaCount: 0,
      totalSize,
      sha256,
      errors,
      warnings,
      diagnostics
    };
  }
  diagnostics.nonEmpty = true;

  // 2. ZIP integrity & magic bytes check
  const u8 = new Uint8Array(rawBuffer);
  if (u8[0] !== 0x50 || u8[1] !== 0x4B || u8[2] !== 0x03 || u8[3] !== 0x04) {
    errors.push(`Check 2 Failed: File does not start with ZIP magic bytes PK\\x03\\x04 (got 0x${u8.slice(0, 4).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")}).`);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(rawBuffer);
    diagnostics.zipIntegrity = true;
  } catch (err: any) {
    errors.push(`Check 2 Failed: ZIP archive integrity failure: ${err.message || String(err)}.`);
    return {
      valid: false,
      slideCount: 0,
      mediaCount: 0,
      totalSize,
      sha256,
      errors,
      warnings,
      diagnostics
    };
  }

  const fileKeys = Object.keys(zip.files);

  // 3. Duplicate ZIP entries & Required parts check
  const seenLower = new Map<string, string>();
  let hasDuplicate = false;
  for (const k of fileKeys) {
    const lk = k.toLowerCase();
    if (seenLower.has(lk)) {
      hasDuplicate = true;
      errors.push(`Check 3 Failed: Duplicate ZIP entry (case clash): "${k}" conflicts with "${seenLower.get(lk)}".`);
    }
    seenLower.set(lk, k);
  }
  diagnostics.noDuplicateEntries = !hasDuplicate;

  const requiredParts = [
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels"
  ];
  let missingReq = false;
  for (const req of requiredParts) {
    if (!zip.file(req)) {
      missingReq = true;
      errors.push(`Check 3 Failed: Missing mandatory OpenXML part "${req}".`);
    }
  }
  diagnostics.requiredPartsPresent = !missingReq;

  // 4. Well-Formedness: Parse all XML and .rels parts with DOM
  let xmlParseFailed = false;
  const parsedDocs = new Map<string, Document>();

  for (const name of fileKeys) {
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      const text = await zip.file(name)!.async("text");
      try {
        const doc = parseXmlDocument(text);
        parsedDocs.set(name, doc);

        // Check for stray text content between elements in element-only XML parts
        if (name === "[Content_Types].xml" || name.endsWith(".rels") || name === "ppt/presentation.xml") {
          const root = doc.documentElement;
          if (root) {
            for (let i = 0; i < root.childNodes.length; i++) {
              const node = root.childNodes[i];
              if (node.nodeType === 3 /* TEXT_NODE */) {
                const val = (node.nodeValue || "").trim();
                if (val.length > 0) {
                  xmlParseFailed = true;
                  errors.push(`Check 4 Failed: Stray raw text outside XML elements in "${name}": "${val.slice(0, 100)}".`);
                }
              }
            }
          }
        }
      } catch (parseErr: any) {
        xmlParseFailed = true;
        errors.push(`Check 4 Failed: XML parse error in part "${name}": ${parseErr.message || String(parseErr)}.`);
      }
    }
  }
  diagnostics.xmlWellFormed = !xmlParseFailed;

  // 5. Content type declaration check
  let ctDeclared = true;
  const ctDoc = parsedDocs.get("[Content_Types].xml");
  const defaultExts = new Set<string>();
  const overrideParts = new Set<string>();

  if (ctDoc) {
    const defaults = ctDoc.getElementsByTagName("Default");
    for (let i = 0; i < defaults.length; i++) {
      const ext = defaults[i].getAttribute("Extension");
      if (ext) defaultExts.add(ext.toLowerCase());
    }

    const overrides = ctDoc.getElementsByTagName("Override");
    for (let i = 0; i < overrides.length; i++) {
      const part = overrides[i].getAttribute("PartName");
      if (part) overrideParts.add(part.toLowerCase());
    }

    // Verify all parts in ZIP (excluding .rels and [Content_Types].xml) have content type
    for (const name of fileKeys) {
      if (name.endsWith("/") || name.endsWith(".rels") || name === "[Content_Types].xml") continue;
      const partName = `/${name.toLowerCase()}`;
      const ext = name.split(".").pop()?.toLowerCase() || "";
      if (!overrideParts.has(partName) && !defaultExts.has(ext)) {
        ctDeclared = false;
        errors.push(`Check 5 Failed: Part "${name}" has no matching Default extension (.${ext}) or Override PartName in [Content_Types].xml.`);
      }
    }
  }
  diagnostics.contentTypesDeclared = ctDeclared;

  // 6. Relationship Target Integrity & Unique rIds
  let relsIntact = true;
  for (const name of fileKeys) {
    if (name.endsWith(".rels")) {
      const relDoc = parsedDocs.get(name);
      if (relDoc) {
        const rels = relDoc.getElementsByTagName("Relationship");
        const seenRIds = new Set<string>();

        for (let i = 0; i < rels.length; i++) {
          const rId = rels[i].getAttribute("Id");
          const target = rels[i].getAttribute("Target");

          if (!rId) {
            relsIntact = false;
            errors.push(`Check 6 Failed: Relationship missing 'Id' attribute in "${name}".`);
          } else {
            if (seenRIds.has(rId)) {
              relsIntact = false;
              errors.push(`Check 6 Failed: Duplicate relationship Id="${rId}" in "${name}".`);
            }
            seenRIds.add(rId);
          }

          if (target && !target.startsWith("http://") && !target.startsWith("https://")) {
            // Resolve relative target from the directory of the parent part
            const baseDir = getRelsSourceDir(name);
            const resolved = resolveTarget(baseDir, target);
            if (!zip.file(resolved)) {
              relsIntact = false;
              errors.push(`Check 6 Failed: In "${name}", relationship ${rId} points to non-existent target "${target}" (resolved to "${resolved}").`);
            }
          }
        }
      }
    }
  }
  diagnostics.relationshipsIntact = relsIntact;

  // 7. Shape IDs unique per slide
  let shapesUnique = true;
  const slideFiles = fileKeys.filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k));
  slideFiles.sort((a, b) => {
    const na = parseInt(a.match(/slide(\d+)/i)?.[1] || "0", 10);
    const nb = parseInt(b.match(/slide(\d+)/i)?.[1] || "0", 10);
    return na - nb;
  });

  for (const sf of slideFiles) {
    const sDoc = parsedDocs.get(sf);
    if (sDoc) {
      const cNvPrs = sDoc.getElementsByTagName("p:cNvPr");
      const seenIds = new Set<string>();
      for (let i = 0; i < cNvPrs.length; i++) {
        const idVal = cNvPrs[i].getAttribute("id");
        if (idVal) {
          if (seenIds.has(idVal)) {
            shapesUnique = false;
            errors.push(`Check 7 Failed: Duplicate shape id="${idVal}" found inside slide "${sf}".`);
          }
          seenIds.add(idVal);
        }
      }
    }
  }
  diagnostics.shapeIdsUnique = shapesUnique;

  // 8. sldIdLst matches presentation.xml.rels
  let sldIdMatchesRels = true;
  let slideCount = slideFiles.length;
  const presDoc = parsedDocs.get("ppt/presentation.xml");
  const presRelsDoc = parsedDocs.get("ppt/_rels/presentation.xml.rels");

  if (presDoc && presRelsDoc) {
    const sldIdNodes = presDoc.getElementsByTagName("p:sldId");
    slideCount = sldIdNodes.length;
    const presRelNodes = presRelsDoc.getElementsByTagName("Relationship");
    const presSlideRelIds = new Set<string>();

    for (let i = 0; i < presRelNodes.length; i++) {
      const type = presRelNodes[i].getAttribute("Type");
      const id = presRelNodes[i].getAttribute("Id");
      if (type && type.endsWith("/relationships/slide") && id) {
        presSlideRelIds.add(id);
      }
    }

    if (slideCount !== presSlideRelIds.size) {
      sldIdMatchesRels = false;
      errors.push(`Check 8 Failed: Count of <p:sldId> in presentation.xml (${slideCount}) does not match slide relationships in presentation.xml.rels (${presSlideRelIds.size}).`);
    }

    for (let i = 0; i < sldIdNodes.length; i++) {
      const idVal = parseInt(sldIdNodes[i].getAttribute("id") || "0", 10);
      const rId = sldIdNodes[i].getAttribute("r:id") || "";

      // ECMA-376 bounds: 256 <= id < 2147483648
      if (idVal < 256 || idVal >= 2147483648) {
        sldIdMatchesRels = false;
        errors.push(`Check 8 Failed: Slide ID id="${idVal}" violates ECMA-376 ST_SlideId bounds [256, 2147483647].`);
      }

      if (!presSlideRelIds.has(rId)) {
        sldIdMatchesRels = false;
        errors.push(`Check 8 Failed: <p:sldId r:id="${rId}"> does not match any slide relationship in presentation.xml.rels.`);
      }
    }
  }
  diagnostics.sldIdLstMatchesRels = sldIdMatchesRels;

  // 9. Reopen with independent reader pass
  let independentPassed = true;
  try {
    const freshZip = await JSZip.loadAsync(rawBuffer);
    const freshKeys = Object.keys(freshZip.files);
    if (freshKeys.length !== fileKeys.length) {
      independentPassed = false;
      errors.push(`Check 9 Failed: Independent parser pass key mismatch (${freshKeys.length} vs ${fileKeys.length}).`);
    }
  } catch (err: any) {
    independentPassed = false;
    errors.push(`Check 9 Failed: Independent parser pass failed to read archive: ${err.message || String(err)}.`);
  }
  diagnostics.independentReaderPassed = independentPassed;

  // 10. Slide count equals expected & image relationships present
  let expectedMatched = true;
  if (expected?.slideCount !== undefined) {
    if (slideCount !== expected.slideCount) {
      expectedMatched = false;
      errors.push(`Check 10 Failed: Slide count mismatch. Expected ${expected.slideCount} slides, but presentation contains ${slideCount}.`);
    }
  }
  diagnostics.expectedSlideCountMatched = expectedMatched;

  // Verify image relationships on slides containing pictures
  let imageRelsValid = true;
  const mediaFiles = fileKeys.filter(k => /^ppt\/media\//i.test(k) && !k.endsWith("/"));
  for (const sf of slideFiles) {
    const sDoc = parsedDocs.get(sf);
    if (sDoc) {
      const blips = sDoc.getElementsByTagName("a:blip");
      if (blips.length > 0) {
        const sNum = sf.match(/slide(\d+)/i)?.[1];
        const relPath = `ppt/slides/_rels/slide${sNum}.xml.rels`;
        const rDoc = parsedDocs.get(relPath);
        if (!rDoc) {
          imageRelsValid = false;
          errors.push(`Check 10 Failed: Slide "${sf}" contains ${blips.length} image blips but has no relationships part "${relPath}".`);
        } else {
          const relNodes = rDoc.getElementsByTagName("Relationship");
          const relIds = new Set<string>();
          for (let i = 0; i < relNodes.length; i++) {
            relIds.add(relNodes[i].getAttribute("Id") || "");
          }
          for (let i = 0; i < blips.length; i++) {
            const embed = blips[i].getAttribute("r:embed");
            if (embed && !relIds.has(embed)) {
              imageRelsValid = false;
              errors.push(`Check 10 Failed: Slide "${sf}" references image embed r:id="${embed}" which is missing from "${relPath}".`);
            }
          }
        }
      }
    }
  }
  diagnostics.imageRelationshipsValid = imageRelsValid;

  const valid = errors.length === 0;

  return {
    valid,
    slideCount,
    mediaCount: mediaFiles.length,
    totalSize,
    sha256,
    errors,
    warnings,
    diagnostics
  };
}

/**
 * Backward-compatible alias for existing code.
 */
export const validatePptxPackage = validatePptx;

function getRelsSourceDir(relsName: string): string {
  // If root package relationships: "_rels/.rels" -> root directory ""
  if (relsName === "_rels/.rels") return "";
  // For part relationships, e.g. "ppt/_rels/presentation.xml.rels" -> source part is "ppt/presentation.xml" -> source dir is "ppt"
  // "ppt/slides/_rels/slide1.xml.rels" -> source part is "ppt/slides/slide1.xml" -> source dir is "ppt/slides"
  return relsName.replace(/(^|\/)_rels\/[^/]+$/, "");
}

function resolveTarget(baseDir: string, target: string): string {
  if (target.startsWith("/")) {
    target = target.slice(1);
    baseDir = "";
  }
  const parts = (baseDir ? baseDir.split("/") : []).concat(target.split("/"));
  const resolved: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") {
      resolved.pop();
    } else {
      resolved.push(p);
    }
  }
  return resolved.join("/");
}
