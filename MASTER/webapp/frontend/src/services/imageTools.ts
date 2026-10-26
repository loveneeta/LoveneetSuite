import JSZip from "jszip";
import ExcelJS from "exceljs";

function cleanFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().replace(/^\.+|\.+$/g, "") || "unnamed";
}

export function canvasToBmpBlob(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext("2d");
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

export async function convertImagesLocally(
  files: File[],
  outputFormat: string,
  quality: number,
  targetWidth?: number,
  targetHeight?: number
): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder("converted_images");
  const usedNames = new Set<string>();

  const fmt = outputFormat.toLowerCase().replace(/^\./, "");
  const ext = fmt === "jpeg" ? ".jpg" : `.${fmt}`;

  for (const file of files) {
    try {
      let naturalWidth = 0;
      let naturalHeight = 0;
      let drawableSource: ImageBitmap | HTMLImageElement;

      if ("createImageBitmap" in window) {
        try {
          drawableSource = await createImageBitmap(file);
          naturalWidth = drawableSource.width;
          naturalHeight = drawableSource.height;
        } catch {
          drawableSource = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
          });
          naturalWidth = (drawableSource as HTMLImageElement).naturalWidth;
          naturalHeight = (drawableSource as HTMLImageElement).naturalHeight;
        }
      } else {
        drawableSource = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
        naturalWidth = (drawableSource as HTMLImageElement).naturalWidth;
        naturalHeight = (drawableSource as HTMLImageElement).naturalHeight;
      }

      const canvas = document.createElement("canvas");
      const w = targetWidth && targetWidth > 0 ? targetWidth : naturalWidth;
      const h = targetHeight && targetHeight > 0 ? targetHeight : naturalHeight;
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      if (fmt === "jpg" || fmt === "jpeg" || fmt === "bmp") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(drawableSource as any, 0, 0, w, h);

      let blob: Blob | null = null;
      if (fmt === "bmp") {
        blob = canvasToBmpBlob(canvas);
      } else {
        const mimeType = fmt === "png" ? "image/png" : (fmt === "webp" ? "image/webp" : "image/jpeg");
        blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, mimeType, quality / 100)
        );
      }

      if (blob) {
        const stem = file.name.replace(/\.[^/.]+$/, "");
        let targetName = `${stem}${ext}`;
        let n = 1;
        while (usedNames.has(targetName.toLowerCase())) {
          targetName = `${stem}_${n}${ext}`;
          n++;
        }
        usedNames.add(targetName.toLowerCase());
        folder?.file(targetName, blob);
      }
    } catch (err) {
      console.warn("Failed to convert image:", file.name, err);
      folder?.file(file.name, file);
    }
  }

  return await zip.generateAsync({ type: "blob" });
}

export async function organizeImagesLocally(
  excelFile: File,
  archiveFile: File,
  modeStr: string
): Promise<Blob> {
  const mode = parseInt(modeStr, 10) || 2;
  const inZip = await JSZip.loadAsync(await archiveFile.arrayBuffer());
  const outZip = new JSZip();
  const outFolder = outZip.folder("organized_images");

  // Map all image files inside the source zip by lowercase filename
  const zipImages = new Map<string, JSZip.JSZipObject>();
  inZip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir) {
      const fileName = relativePath.split("/").pop() || relativePath;
      zipImages.set(fileName.toLowerCase(), zipEntry);
    }
  });

  // Load Excel workbook
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await excelFile.arrayBuffer());

  let copied = 0;
  let skipped = 0;
  const usedDestPaths = new Set<string>();

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header row

      const getVal = (col: number): string => {
        const v = row.getCell(col).value;
        if (v === null || v === undefined) return "";
        if (typeof v === "object" && "text" in v) return String((v as any).text).trim();
        if (typeof v === "object" && "result" in v) return String((v as any).result).trim();
        return String(v).trim();
      };

      // Col 5 is image reference
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

      // Determine target folder path
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

      // Determine target filename
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

  // Add report
  outFolder?.file(
    "organizer_report.txt",
    `Loveneet Suite Image Organizer Report\n===================================\nCopied: ${copied}\nSkipped: ${skipped}\nTotal processed: ${copied + skipped}\n`
  );

  return await outZip.generateAsync({ type: "blob" });
}
