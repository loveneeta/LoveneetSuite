/**
 * Loveneet Suite — OpenXML PPTX Integrity Validator
 * Performs pre-download structural validation on generated presentations.
 * Verifies OOXML compliance, schema bounds (ST_SlideId), relationship integrity,
 * media content-types, and XML well-formedness before delivering files to users.
 */

import JSZip from "jszip";

export interface PptxValidationResult {
  valid: boolean;
  slideCount: number;
  mediaCount: number;
  totalSize: number;
  errors: string[];
  warnings: string[];
  diagnostics: {
    contentTypesPresent: boolean;
    presentationXmlPresent: boolean;
    relsPresent: boolean;
    slideIdsValid: boolean;
    relationshipsIntact: boolean;
    mediaTypesDeclared: boolean;
    xmlWellFormed: boolean;
  };
}

/**
 * Validates a generated or uploaded PPTX file against essential OpenXML packaging rules.
 */
export async function validatePptxPackage(
  packageSource: JSZip | Blob | ArrayBuffer | Uint8Array
): Promise<PptxValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let zip: JSZip;
  let totalSize = 0;

  try {
    if (packageSource instanceof JSZip) {
      zip = packageSource;
    } else if (packageSource instanceof Blob) {
      totalSize = packageSource.size;
      const buf = await packageSource.arrayBuffer();
      zip = await JSZip.loadAsync(buf);
    } else {
      totalSize = packageSource.byteLength;
      zip = await JSZip.loadAsync(packageSource);
    }
  } catch (loadErr: any) {
    return {
      valid: false,
      slideCount: 0,
      mediaCount: 0,
      totalSize,
      errors: [`Package is not a valid ZIP/OOXML archive: ${loadErr.message || String(loadErr)}`],
      warnings,
      diagnostics: {
        contentTypesPresent: false,
        presentationXmlPresent: false,
        relsPresent: false,
        slideIdsValid: false,
        relationshipsIntact: false,
        mediaTypesDeclared: false,
        xmlWellFormed: false,
      },
    };
  }

  // 1. Core OOXML Parts Check
  const hasContentTypes = Boolean(zip.file("[Content_Types].xml"));
  const hasRootRels = Boolean(zip.file("_rels/.rels"));
  const hasPresXml = Boolean(zip.file("ppt/presentation.xml"));
  const hasPresRels = Boolean(zip.file("ppt/_rels/presentation.xml.rels"));

  if (!hasContentTypes) errors.push("Missing core part: [Content_Types].xml");
  if (!hasRootRels) errors.push("Missing root relationships: _rels/.rels");
  if (!hasPresXml) errors.push("Missing presentation descriptor: ppt/presentation.xml");
  if (!hasPresRels) errors.push("Missing presentation relationships: ppt/_rels/presentation.xml.rels");

  // 2. Validate PresentationML Schema & ST_SlideId bounds
  let slideIdsValid = true;
  let slideCount = 0;

  if (hasPresXml) {
    const presXml = await zip.file("ppt/presentation.xml")!.async("text");
    const sldIdMatches = [...presXml.matchAll(/<p:sldId\b([^>]*)\/?>/g)];
    slideCount = sldIdMatches.length;

    if (slideCount === 0) {
      warnings.push("Presentation contains no <p:sldId> slide entries in <p:sldIdLst>.");
    }

    for (const match of sldIdMatches) {
      const attrs = match[1];
      const idMatch = attrs.match(/\bid="(\d+)"/);
      if (idMatch) {
        const val = parseInt(idMatch[1], 10);
        // ECMA-376 ST_SlideId: 256 <= id < 2147483648 (maxExclusive=2147483648)
        if (val < 256 || val >= 2147483648) {
          slideIdsValid = false;
          errors.push(
            `Invalid Slide ID: id="${val}". OpenXML schema ST_SlideId requires 256 <= id < 2147483648 (values >= 2^31 cause PowerPoint unreadable corruption).`
          );
        }
      } else {
        slideIdsValid = false;
        errors.push("Missing required 'id' attribute on <p:sldId> tag.");
      }
    }
  }

  // 3. Media & Content-Type Declarations Check
  let mediaTypesDeclared = true;
  const mediaFiles = Object.keys(zip.files).filter(k => k.startsWith("ppt/media/") && !k.endsWith("/"));
  const mediaCount = mediaFiles.length;

  if (hasContentTypes) {
    const ctXml = await zip.file("[Content_Types].xml")!.async("text");
    for (const mediaPath of mediaFiles) {
      const ext = mediaPath.split(".").pop()?.toLowerCase() || "";
      const hasExtDefault = ctXml.includes(`Extension="${ext}"`) || ctXml.includes(`Extension="${ext.toUpperCase()}"`);
      const hasPartOverride = ctXml.includes(`PartName="/${mediaPath}"`);
      if (!hasExtDefault && !hasPartOverride) {
        mediaTypesDeclared = false;
        errors.push(
          `Media part '${mediaPath}' has undeclared extension '${ext}' in [Content_Types].xml. PowerPoint requires all media formats to be registered.`
        );
      }
    }
  }

  // 4. Slide Relationships & Part Consistency Check
  let relationshipsIntact = true;
  const slideFiles = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k));

  if (hasPresRels) {
    const presRelsXml = await zip.file("ppt/_rels/presentation.xml.rels")!.async("text");
    for (const slidePath of slideFiles) {
      const slideRelTarget = slidePath.replace("ppt/", "");
      if (!presRelsXml.includes(`Target="${slideRelTarget}"`)) {
        warnings.push(`Slide file '${slidePath}' is not referenced in ppt/_rels/presentation.xml.rels.`);
      }
    }
  }

  for (const slidePath of slideFiles) {
    const relsPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const relsFile = zip.file(relsPath);
    if (!relsFile) {
      relationshipsIntact = false;
      errors.push(`Missing relationship file for slide: '${relsPath}'.`);
      continue;
    }

    const relsXml = await relsFile.async("text");
    // Check slideLayout relationship
    if (!relsXml.includes("/relationships/slideLayout")) {
      warnings.push(`Slide '${slidePath}' has no slideLayout relationship in '${relsPath}'.`);
    }

    // Check that all relative targets exist in the zip
    const targetMatches = [...relsXml.matchAll(/\bTarget="([^"]+)"/g)].map(x => x[1]);
    for (const target of targetMatches) {
      if (target.startsWith("http://") || target.startsWith("https://")) continue;
      // Resolve path relative to ppt/slides/
      const resolved = resolvePackagePath("ppt/slides", target);
      if (!zip.files[resolved]) {
        relationshipsIntact = false;
        errors.push(`Broken relationship in '${relsPath}': Target '${target}' (resolved to '${resolved}') does not exist.`);
      }
    }
  }

  // 5. XML Syntax & Well-Formedness Check
  let xmlWellFormed = true;
  for (const [name, file] of Object.entries(zip.files)) {
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      const text = await file.async("text");
      const syntaxError = checkXmlSyntaxBasic(name, text);
      if (syntaxError) {
        xmlWellFormed = false;
        errors.push(syntaxError);
      }
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    slideCount,
    mediaCount,
    totalSize,
    errors,
    warnings,
    diagnostics: {
      contentTypesPresent: hasContentTypes,
      presentationXmlPresent: hasPresXml,
      relsPresent: hasRootRels && hasPresRels,
      slideIdsValid,
      relationshipsIntact,
      mediaTypesDeclared,
      xmlWellFormed,
    },
  };
}

/**
 * Resolves a relative OpenXML relationship target against a base directory.
 */
function resolvePackagePath(baseDir: string, relativePath: string): string {
  const parts = (baseDir ? baseDir.split("/") : []).concat(relativePath.split("/"));
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

/**
 * Fast well-formedness syntax check for OpenXML XML documents.
 */
function checkXmlSyntaxBasic(fileName: string, xml: string): string | null {
  if (!xml || xml.trim().length === 0) {
    return `Empty XML part detected: '${fileName}'.`;
  }
  if (!xml.includes("<") || !xml.includes(">")) {
    return `Malformed XML part: '${fileName}' has no tag delimiters.`;
  }

  // Check for mismatched root tags
  const openTags = [];
  const tagRegex = /<(\/?)([\w:.-]+)([^>]*?)(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml)) !== null) {
    const isClosing = match[1] === "/";
    const tagName = match[2];
    const isSelfClosing = match[4] === "/" || match[0].endsWith("/>");

    if (tagName.startsWith("?") || tagName.startsWith("!")) continue;

    if (!isClosing && !isSelfClosing) {
      openTags.push(tagName);
    } else if (isClosing) {
      const last = openTags.pop();
      if (last !== tagName) {
        return `XML syntax error in '${fileName}': Mismatched tag </${tagName}>, expected </${last}>.`;
      }
    }
  }

  if (openTags.length > 0) {
    return `XML syntax error in '${fileName}': Unclosed tags: ${openTags.slice(-5).join(", ")}.`;
  }

  return null;
}
