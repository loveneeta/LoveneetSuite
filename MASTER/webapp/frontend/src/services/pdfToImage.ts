import * as pdfjsLib from "pdfjs-dist";

// Ensure PDF.js worker is properly wired in browser environments
if (typeof window !== "undefined" && !(pdfjsLib as any).GlobalWorkerOptions?.workerSrc) {
  try {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch (_) {}
}

export interface PdfExtractedPage {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  pageNumber: number;
  totalPages: number;
  sourcePdfName: string;
}

export interface PdfRenderOptions {
  dpi?: number; // 72, 150, 200, 300 (default: 200 for crystal-sharp text & graphics)
  pageRange?: string; // e.g. "all", "1-5", "1,3,5"
  onProgress?: (progress: { current: number; total: number; message: string; percent: number }) => void;
}

/**
 * Parses user page range input like "1-3, 5, 8-10" into a Set of 1-based page numbers.
 */
export function parsePageRange(rangeStr: string | undefined, totalPages: number): Set<number> {
  const result = new Set<number>();
  if (!rangeStr || rangeStr.trim().toLowerCase() === "all" || rangeStr.trim() === "") {
    for (let i = 1; i <= totalPages; i++) result.add(i);
    return result;
  }

  const parts = rangeStr.split(/[,;\s]+/);
  for (const part of parts) {
    if (!part) continue;
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = Math.max(1, parseInt(startStr, 10) || 1);
      const end = Math.min(totalPages, parseInt(endStr, 10) || totalPages);
      for (let i = start; i <= end; i++) {
        result.add(i);
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        result.add(page);
      }
    }
  }

  if (result.size === 0) {
    for (let i = 1; i <= totalPages; i++) result.add(i);
  }

  return result;
}

/**
 * Extracts and renders pages of a PDF document into high-resolution image Files.
 * Defaults to 200 DPI for crisp text, line art, and illustrations.
 */
export async function renderPdfToImageFiles(
  pdfFile: File,
  options: PdfRenderOptions = {}
): Promise<PdfExtractedPage[]> {
  const { dpi = 200, pageRange = "all", onProgress } = options;

  // 72 DPI is standard PDF point unit
  const scale = Math.max(0.5, Math.min(6.0, dpi / 72));
  const buffer = await pdfFile.arrayBuffer();

  const loadingTask = (pdfjsLib as any).getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false
  });

  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;
  const targetPages = parsePageRange(pageRange, totalPages);
  const pagesToRender = Array.from(targetPages).sort((a, b) => a - b);

  const results: PdfExtractedPage[] = [];
  const stem = pdfFile.name.replace(/\.[^/.]+$/, "");

  let renderedCount = 0;
  const totalToRender = pagesToRender.length;

  for (const pageNum of pagesToRender) {
    renderedCount++;
    const progressPercent = Math.round((renderedCount / totalToRender) * 100);

    if (onProgress) {
      onProgress({
        current: renderedCount,
        total: totalToRender,
        message: `Rendering "${pdfFile.name}" (Page ${pageNum} of ${totalPages}) at ${dpi} DPI...`,
        percent: progressPercent
      });
    }

    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // In-memory canvas
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext("2d", {
      colorSpace: "srgb",
      willReadFrequently: false
    });

    if (!ctx) {
      throw new Error(`Failed to initialize 2D context for PDF page ${pageNum}`);
    }

    // High quality bicubic filtering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Draw opaque white backdrop so transparent PDF pages render cleanly
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    await page.render(renderContext).promise;

    // Export to lossless PNG as intermediate master image
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error(`Failed to export canvas blob for page ${pageNum}`));
      }, "image/png");
    });

    // Clean padding for page numbers (e.g. stem_page_01.png)
    const padDigits = Math.max(2, String(totalPages).length);
    const pageStr = String(pageNum).padStart(padDigits, "0");
    const filename = totalPages === 1 && totalToRender === 1
      ? `${stem}.png`
      : `${stem}_page_${pageStr}.png`;

    const imageFile = new File([blob], filename, {
      type: "image/png",
      lastModified: Date.now()
    });

    const previewUrl = URL.createObjectURL(blob);

    results.push({
      file: imageFile,
      previewUrl,
      width: canvas.width,
      height: canvas.height,
      pageNumber: pageNum,
      totalPages,
      sourcePdfName: pdfFile.name
    });
  }

  return results;
}
