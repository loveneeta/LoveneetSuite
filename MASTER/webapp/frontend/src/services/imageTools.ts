import JSZip from "jszip";
import ExcelJS from "exceljs";

export interface ImageCompressionOptions {
  outputFormat: "jpg" | "png" | "webp" | "bmp" | "tiff";
  mode: "balanced" | "target" | "percentage" | "lossless";
  quality: number; // 10 to 100
  targetSize: number; // e.g. 500
  targetUnit: "KB" | "MB";
  percentReduction: number; // e.g. 50
  enableResize: boolean;
  resizeWidth?: number;
  resizeHeight?: number;
  preserveAspect: boolean;
  lossless?: boolean;
}

export interface CompressedImageResult {
  file: File;
  targetFilename: string;
  blob: Blob;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  originalWidth: number;
  originalHeight: number;
  outputWidth: number;
  outputHeight: number;
  percentReduction: number;
  status: "success" | "skipped" | "fallback" | "error";
  message?: string;
  isLossless: boolean;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function cleanFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().replace(/^\.+|\.+$/g, "") || "unnamed";
}

export function canvasToBmpBlob(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
  if (!ctx) throw new Error("Canvas context creation failed");
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // BMP Header
  view.setUint16(0, 0x424d, false); // 'BM'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, 54, true);

  // DIB Header (BITMAPINFOHEADER)
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  const pixels = new Uint8Array(buffer, 54);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcRow * width + x) * 4;
      const dstIdx = y * rowSize + x * 3;
      pixels[dstIdx] = data[srcIdx + 2];     // Blue
      pixels[dstIdx + 1] = data[srcIdx + 1]; // Green
      pixels[dstIdx + 2] = data[srcIdx];     // Red
    }
  }

  return new Blob([buffer], { type: "image/bmp" });
}

async function renderCanvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  qualityRatio: number
): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      mimeType,
      qualityRatio
    );
  });
}

/**
 * Loads an image file preserving EXIF orientation and native color space.
 */
async function loadDrawableImage(file: File): Promise<{
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const isHeic = ext === "heic" || ext === "heif" || file.type.includes("heic") || file.type.includes("heif");

  // Attempt createImageBitmap with EXIF orientation and color profile preservation
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, {
        colorSpaceConversion: "default",
        imageOrientation: "from-image",
        premultiplyAlpha: "default"
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => {
          try { bitmap.close(); } catch (_) {}
        }
      };
    } catch (bitmapErr) {
      if (isHeic) {
        throw new Error(
          `HEIC/HEIF image "${file.name}" cannot be decoded by your current browser/system. Please install the Windows HEIF Image Extension or convert it to JPG/PNG before uploading.`
        );
      }
    }
  }

  // Fallback to HTMLImageElement
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => {
        if (isHeic) {
          reject(new Error(
            `HEIC/HEIF image "${file.name}" requires native HEIF decoder support. Please export as JPG/PNG or install Windows HEIF extensions.`
          ));
        } else {
          reject(new Error(`Could not decode image "${file.name}". Format may be unsupported or corrupted.`));
        }
      };
      el.src = objectUrl;
    });

    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => {
        URL.revokeObjectURL(objectUrl);
      }
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

/**
 * Core image compression and conversion engine with color preservation and target size optimization.
 */
export async function compressSingleImage(
  file: File,
  options: ImageCompressionOptions
): Promise<CompressedImageResult> {
  const {
    outputFormat = "jpg",
    mode = "balanced",
    quality = 92,
    targetSize = 500,
    targetUnit = "KB",
    percentReduction = 50,
    enableResize = false,
    resizeWidth,
    resizeHeight,
    preserveAspect = true,
    lossless = false
  } = options;

  const stem = file.name.replace(/\.[^/.]+$/, "");
  const fmt = outputFormat.toLowerCase().replace(/^\./, "");
  const ext = fmt === "jpeg" ? ".jpg" : `.${fmt}`;
  const targetFilename = `${stem}${ext}`;

  const { source, width: origW, height: origH, cleanup } = await loadDrawableImage(file);

  try {
    // 1. Calculate output dimensions
    let outW = origW;
    let outH = origH;

    if (enableResize) {
      if (resizeWidth && resizeHeight) {
        if (preserveAspect) {
          const ratio = Math.min(resizeWidth / origW, resizeHeight / origH);
          outW = Math.max(1, Math.round(origW * ratio));
          outH = Math.max(1, Math.round(origH * ratio));
        } else {
          outW = Math.max(1, Math.round(resizeWidth));
          outH = Math.max(1, Math.round(resizeHeight));
        }
      } else if (resizeWidth && !resizeHeight) {
        outW = Math.max(1, Math.round(resizeWidth));
        outH = preserveAspect ? Math.max(1, Math.round(origH * (resizeWidth / origW))) : origH;
      } else if (!resizeWidth && resizeHeight) {
        outH = Math.max(1, Math.round(resizeHeight));
        outW = preserveAspect ? Math.max(1, Math.round(origW * (resizeHeight / origH))) : origW;
      }
    }

    // 2. Setup Canvas with explicit sRGB color space
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext("2d", {
      colorSpace: "srgb",
      willReadFrequently: false
    });

    if (!ctx) {
      throw new Error("Unable to initialize canvas 2D rendering context.");
    }

    // High quality bicubic filtering to preserve sharp edges and avoid blurring
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // 3. Color and Transparency handling
    const isJpg = fmt === "jpg" || fmt === "jpeg";
    const isPng = fmt === "png";
    const isWebp = fmt === "webp";
    const isBmp = fmt === "bmp";
    const isTiff = fmt === "tiff";

    if (isJpg) {
      // JPEG does not support transparency; draw white background cleanly without color fringing
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
    } else {
      // PNG and WebP: Preserve exact transparency! No background fill!
      ctx.clearRect(0, 0, outW, outH);
    }

    // Draw the image
    ctx.drawImage(source as any, 0, 0, outW, outH);

    // 4. Encode according to format and compression mode
    let mimeType = "image/jpeg";
    if (isPng || isTiff) mimeType = "image/png";
    else if (isWebp) mimeType = "image/webp";
    else if (isBmp) mimeType = "image/bmp";

    const isLosslessSelected = lossless || mode === "lossless" || (isPng && mode !== "target");
    let resultBlob: Blob | null = null;
    let message: string | undefined;

    if (isBmp) {
      resultBlob = canvasToBmpBlob(canvas);
    } else if (isLosslessSelected && isPng) {
      // PNG is lossless
      resultBlob = await renderCanvasToBlob(canvas, "image/png", 1.0);
    } else if (isLosslessSelected && isWebp) {
      // Lossless WebP
      resultBlob = await renderCanvasToBlob(canvas, "image/webp", 1.0);
    } else if (mode === "balanced") {
      // High Quality / Balanced mode: slider represents actual visual quality (e.g. 92%)
      const qFactor = Math.max(0.2, Math.min(1.0, quality / 100));
      resultBlob = await renderCanvasToBlob(canvas, mimeType, qFactor);
    } else if (mode === "target" || mode === "percentage") {
      // Target File Size Mode
      let targetBytes = targetSize * (targetUnit === "MB" ? 1048576 : 1024);
      if (mode === "percentage") {
        const pct = Math.max(5, Math.min(95, percentReduction));
        targetBytes = Math.round(file.size * (1 - pct / 100));
      }

      if (isPng) {
        // PNG cannot be lossily tuned via quality parameter; encode lossless
        resultBlob = await renderCanvasToBlob(canvas, "image/png", 1.0);
        if (resultBlob && resultBlob.size > targetBytes) {
          message = `PNG is a lossless format and preserved exact pixel values (${formatBytes(resultBlob.size)}). Select WebP or JPG, or enable Resizing to reach ${formatBytes(targetBytes)}.`;
        }
      } else {
        // Progressive bounded search for JPG and WebP
        // Initial test at high quality (95%)
        const initialBlob = await renderCanvasToBlob(canvas, mimeType, 0.95);
        if (initialBlob && initialBlob.size <= targetBytes) {
          resultBlob = initialBlob;
          message = `Target reached at pristine 95% quality.`;
        } else {
          // Binary search bounded between 0.45 and 0.95 to PREVENT visual quality degradation/color crush
          let lowQ = 0.45;
          let highQ = 0.95;
          let bestCandidate = initialBlob || (await renderCanvasToBlob(canvas, mimeType, 0.85));

          for (let iter = 0; iter < 5; iter++) {
            const midQ = (lowQ + highQ) / 2;
            const trialBlob = await renderCanvasToBlob(canvas, mimeType, midQ);
            if (!trialBlob) break;

            if (trialBlob.size <= targetBytes) {
              bestCandidate = trialBlob;
              lowQ = midQ; // Try to get higher quality while still under target
            } else {
              highQ = midQ; // Needs more compression
              bestCandidate = trialBlob;
            }
          }

          resultBlob = bestCandidate;
          if (resultBlob && resultBlob.size > targetBytes) {
            message = `Achieved ${formatBytes(resultBlob.size)} at minimum safe visual quality (45%) to prevent color banding and blur. Enable Resizing to reduce file size further.`;
          }
        }
      }
    }

    if (!resultBlob) {
      throw new Error(`Failed to encode image to ${outputFormat.toUpperCase()}.`);
    }

    const previewUrl = URL.createObjectURL(resultBlob);
    const percentReduction = Math.round(((file.size - resultBlob.size) / file.size) * 100);

    return {
      file,
      targetFilename,
      blob: resultBlob,
      previewUrl,
      originalSize: file.size,
      compressedSize: resultBlob.size,
      originalWidth: origW,
      originalHeight: origH,
      outputWidth: outW,
      outputHeight: outH,
      percentReduction,
      status: "success",
      message,
      isLossless: isLosslessSelected
    };
  } finally {
    cleanup();
  }
}

/**
 * Batch convert an array of image files, packing them into a downloadable ZIP.
 */
export async function convertImagesLocally(
  files: File[],
  options: ImageCompressionOptions,
  onProgress?: (progress: { current: number; total: number; filename: string; percent: number }) => void
): Promise<{ zipBlob: Blob; results: CompressedImageResult[] }> {
  const zip = new JSZip();
  const folder = zip.folder("converted_images");
  const usedNames = new Set<string>();
  const results: CompressedImageResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: files.length,
        filename: file.name,
        percent: Math.round(((i + 1) / files.length) * 100)
      });
    }

    try {
      const res = await compressSingleImage(file, options);
      results.push(res);

      // Handle duplicate names in zip
      const stem = res.targetFilename.replace(/\.[^/.]+$/, "");
      const ext = res.targetFilename.includes(".") ? `.${res.targetFilename.split(".").pop()}` : "";
      let finalName = res.targetFilename;
      let counter = 1;
      while (usedNames.has(finalName.toLowerCase())) {
        finalName = `${stem}_${counter}${ext}`;
        counter++;
      }
      usedNames.add(finalName.toLowerCase());

      folder?.file(finalName, res.blob);
    } catch (err: any) {
      console.warn("Conversion failed for file:", file.name, err);
      // Fallback: preserve original file in zip
      folder?.file(file.name, file);
      results.push({
        file,
        targetFilename: file.name,
        blob: file,
        previewUrl: "",
        originalSize: file.size,
        compressedSize: file.size,
        originalWidth: 0,
        originalHeight: 0,
        outputWidth: 0,
        outputHeight: 0,
        percentReduction: 0,
        status: "fallback",
        message: err.message || "Failed to convert",
        isLossless: false
      });
    }

    // Non-blocking yield to event loop
    await new Promise((r) => setTimeout(r, 0));
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  return { zipBlob, results };
}

/**
 * Image Organizer functionality (preserves existing workflow).
 */
export async function organizeImagesLocally(
  excelFile: File,
  archiveFile: File,
  modeStr: string
): Promise<Blob> {
  const mode = parseInt(modeStr, 10) || 2;
  const inZip = await JSZip.loadAsync(await archiveFile.arrayBuffer());
  const outZip = new JSZip();
  const outFolder = outZip.folder("organized_images");

  const zipImages = new Map<string, JSZip.JSZipObject>();
  inZip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir) {
      const fileName = relativePath.split("/").pop() || relativePath;
      zipImages.set(fileName.toLowerCase(), zipEntry);
    }
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await excelFile.arrayBuffer());

  let copied = 0;
  let skipped = 0;
  const usedDestPaths = new Set<string>();

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const getVal = (col: number): string => {
        const v = row.getCell(col).value;
        if (v === null || v === undefined) return "";
        if (typeof v === "object" && "text" in v) return String((v as any).text).trim();
        if (typeof v === "object" && "result" in v) return String((v as any).result).trim();
        return String(v).trim();
      };

      const cell5 = row.getCell(5);
      let rawImage = "";
      if (cell5.hyperlink) {
        rawImage = cell5.hyperlink;
      } else {
        rawImage = getVal(5);
      }

      if (!rawImage) {
        skipped++;
        return;
      }

      const lookupName = rawImage.replace(/\\/g, "/").split("/").pop()?.trim().toLowerCase() || "";
      const sourceZipEntry = zipImages.get(lookupName);
      if (!sourceZipEntry) {
        skipped++;
        return;
      }

      let folderParts: string[] = [];
      if (mode === 1) {
        for (let c = 7; c <= 17; c++) {
          const part = cleanFolderName(getVal(c));
          if (part && part !== "unnamed") folderParts.push(part);
        }
      } else if (mode === 2) {
        const col7 = getVal(7).toUpperCase();
        const action = col7.includes("DELETE") ? "DELETE" : "KEEP";
        const collection = cleanFolderName(getVal(17)) || "SOLE";
        folderParts = [action, collection];
      } else {
        const col7 = getVal(7).toUpperCase();
        const action = col7.includes("DELETE") ? "DELETE" : "KEEP";
        const customCol = cleanFolderName(getVal(8)) || "UNCATEGORIZED";
        folderParts = [action, customCol];
      }

      if (folderParts.length === 0) folderParts = ["UNCATEGORIZED"];

      const namingCols = [3, 10, 11, 13, 14, 12, 15, 16, 26];
      const nameParts: string[] = [];
      for (const c of namingCols) {
        const val = cleanFolderName(getVal(c)).replace(/\s+/g, "-");
        if (val && val !== "unnamed") nameParts.push(val);
      }

      const ext = lookupName.includes(".") ? `.${lookupName.split(".").pop()}` : ".jpg";
      const stem = nameParts.length > 0 ? nameParts.join("_") : `unnamed_${rowNumber}`;
      let targetFilename = `${stem}${ext}`;

      const fullDirPath = folderParts.join("/");
      let fullDest = `${fullDirPath}/${targetFilename}`.toLowerCase();
      let n = 1;
      while (usedDestPaths.has(fullDest)) {
        targetFilename = `${stem}_${n}${ext}`;
        fullDest = `${fullDirPath}/${targetFilename}`.toLowerCase();
        n++;
      }
      usedDestPaths.add(fullDest);

      outFolder?.folder(fullDirPath)?.file(targetFilename, sourceZipEntry.async("arraybuffer"));
      copied++;
    });
  }

  outFolder?.file(
    "organizer_report.txt",
    `Loveneet Suite Image Organizer Report\n===================================\nCopied: ${copied}\nSkipped: ${skipped}\nTotal processed: ${copied + skipped}\n`
  );

  return await outZip.generateAsync({ type: "blob" });
}
