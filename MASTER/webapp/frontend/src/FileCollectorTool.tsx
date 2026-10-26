import React, { useState, useMemo, useRef } from "react";
import {
  FolderSync,
  FolderSearch,
  FolderOpen,
  FolderTree,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  LoaderCircle,
  Copy,
  FileText,
  Search,
  X,
  ShieldCheck,
  Layers,
  Sparkles,
  RefreshCw,
  Sliders,
  Zap,
  HardDrive
} from "lucide-react";
import JSZip from "jszip";
import "./file-collector.css";
import { isDesktop, fileAdapter, storageAdapter } from "./services/platform";

const saveAs = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface ScannedFileItem {
  source_path: string;
  relative_path: string;
  target_filename: string;
  size: number;
  status: "eligible" | "duplicate_renamed" | "duplicate_skipped" | "overwrite";
  is_image?: boolean;
  image_format?: string | null;
  fileBlob?: File;
}

interface CompressionStats {
  enabled: boolean;
  total_images: number;
  compressed: number;
  skipped: number;
  unsupported: number;
  non_images: number;
  orig_bytes: number;
  final_bytes: number;
  saved_bytes: number;
  saved_pct: number;
}

// Client-side image compression using Canvas
async function compressImageInBrowser(
  file: File,
  options: {
    mode: "reduce" | "target" | "resize";
    targetBytes: number;
    quality: number;
    resizeMode: "original" | "custom" | "scale";
    maxWidth?: number;
    maxHeight?: number;
    scalePct?: number;
    preserveAspect?: boolean;
    outputFormat: "original" | "jpg" | "png" | "webp";
    skipBelowTarget?: boolean;
  }
): Promise<{ blob: Blob; status: "compressed" | "skipped" | "preserved" | "failed" }> {
  if (options.skipBelowTarget && file.size <= options.targetBytes && options.mode === "target") {
    return { blob: file, status: "skipped" };
  }

  try {
    const bmp = await createImageBitmap(file);
    let w = bmp.width;
    let h = bmp.height;

    if (options.resizeMode === "scale" && options.scalePct && options.scalePct < 100) {
      w = Math.max(1, Math.floor(w * (options.scalePct / 100)));
      h = Math.max(1, Math.floor(h * (options.scalePct / 100)));
    } else if (options.resizeMode === "custom" && (options.maxWidth || options.maxHeight)) {
      const mw = options.maxWidth || w;
      const mh = options.maxHeight || h;
      if (options.preserveAspect) {
        const ratio = Math.min(mw / w, mh / h);
        w = Math.max(1, Math.floor(w * ratio));
        h = Math.max(1, Math.floor(h * ratio));
      } else {
        w = mw;
        h = mh;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, status: "failed" };

    let mime = "image/jpeg";
    if (options.outputFormat === "png") mime = "image/png";
    else if (options.outputFormat === "webp") mime = "image/webp";
    else if (options.outputFormat === "original") {
      if (file.type === "image/png") mime = "image/png";
      else if (file.type === "image/webp") mime = "image/webp";
      else mime = "image/jpeg";
    }

    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bmp, 0, 0, w, h);

    const getBlob = (q: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, q));

    let resBlob: Blob | null = null;
    if (options.mode === "target" && options.targetBytes > 0) {
      let q = options.quality / 100;
      resBlob = await getBlob(q);
      if (resBlob && resBlob.size > options.targetBytes) {
        for (let attempt = 0; attempt < 4; attempt++) {
          q = Math.max(0.15, q - 0.2);
          const trial = await getBlob(q);
          if (trial) {
            resBlob = trial;
            if (trial.size <= options.targetBytes) break;
          }
        }
      }
    } else {
      resBlob = await getBlob(options.quality / 100);
    }

    if (!resBlob || resBlob.size >= file.size) {
      return { blob: file, status: "preserved" };
    }
    return { blob: resBlob, status: "compressed" };
  } catch (e) {
    return { blob: file, status: "failed" };
  }
}

export default function FileCollectorTool() {
  // Mode: "desktop" (Direct Disk / Local) or "browser" (Dropzone Upload / ZIP)
  const [activeTab, setActiveTab] = useState<"desktop" | "browser">("desktop");

  // Input & Output Folder Paths
  const [inputFolder, setInputFolder] = useState<string>("");
  const [outputFolder, setOutputFolder] = useState<string>("");
  const [includeSubfolders, setIncludeSubfolders] = useState<boolean>(true);
  const [includeHidden, setIncludeHidden] = useState<boolean>(false);
  const [prefixSubfolders, setPrefixSubfolders] = useState<boolean>(true);
  const [duplicateMode, setDuplicateMode] = useState<"rename" | "skip" | "overwrite">("rename");

  // Bulk Image Compression Settings
  const [enableCompression, setEnableCompression] = useState<boolean>(false);
  const [compressionMode, setCompressionMode] = useState<"reduce" | "target" | "resize">("reduce");
  const [targetSize, setTargetSize] = useState<number>(200);
  const [targetUnit, setTargetUnit] = useState<"KB" | "MB">("KB");
  const [quality, setQuality] = useState<number>(80);
  const [resizeMode, setResizeMode] = useState<"original" | "custom" | "scale">("original");
  const [maxWidth, setMaxWidth] = useState<string>("");
  const [maxHeight, setMaxHeight] = useState<string>("");
  const [scalePct, setScalePct] = useState<number>(100);
  const [outputFormat, setOutputFormat] = useState<"original" | "jpg" | "png" | "webp">("original");
  const [preserveAspect, setPreserveAspect] = useState<boolean>(true);
  const [skipBelowTarget, setSkipBelowTarget] = useState<boolean>(true);

  // Scanned Files State
  const [scannedFiles, setScannedFiles] = useState<ScannedFileItem[]>([]);
  const [totalFound, setTotalFound] = useState<number>(0);
  const [totalImages, setTotalImages] = useState<number>(0);
  const [totalDuplicates, setTotalDuplicates] = useState<number>(0);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>("");

  // Collection Execution State
  const [isCollecting, setIsCollecting] = useState<boolean>(false);
  const [collectProgress, setCollectProgress] = useState<{
    copied: number;
    skipped: number;
    failed: number;
    total: number;
    currentFile: string;
    percent: number;
  }>({ copied: 0, skipped: 0, failed: 0, total: 0, currentFile: "", percent: 0 });
  const [collectionDone, setCollectionDone] = useState<boolean>(false);
  const [collectionErrors, setCollectionErrors] = useState<Array<{ file: string; error: string }>>([]);
  const [lastOutputFolder, setLastOutputFolder] = useState<string>("");
  const [compressionStats, setCompressionStats] = useState<CompressionStats | null>(null);

  // Status Notice
  const [alertNotice, setAlertNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Overwrite Confirmation Modal
  const [showOverwriteModal, setShowOverwriteModal] = useState<boolean>(false);

  // Native File System Directory Handles for direct disk read/write
  const inputDirHandleRef = useRef<any>(null);
  const outputDirHandleRef = useRef<any>(null);
  const cancelRequestedRef = useRef<boolean>(false);
  const [browserFiles, setBrowserFiles] = useState<File[]>([]);

  // Helper to suggest default output directory
  const handleInputChange = (val: string) => {
    setInputFolder(val);
    if (!outputFolder || outputFolder.endsWith("Collected_Files")) {
      const sep = val.includes("/") ? "/" : "\\";
      const clean = val.replace(/[\\/]+$/, "");
      if (clean) {
        setOutputFolder(`${clean}${sep}Collected_Files`);
      } else {
        setOutputFolder("");
      }
    }
    setScannedFiles([]);
    setTotalFound(0);
    setTotalImages(0);
    setCollectionDone(false);
  };

  // Directory Picker (Native Electron on Desktop / File System Access API on Web)
  const handlePickDirectory = async (forTarget: "input" | "output") => {
    if (isDesktop()) {
      const selected = await fileAdapter.pickDirectory(
        forTarget === "input" ? "Select Input Folder" : "Select Output Folder"
      );
      if (selected) {
        if (forTarget === "input") {
          handleInputChange(selected);
          setAlertNotice({
            type: "info",
            text: `Selected folder: "${selected}". Click "Scan Files" or "Start Collection" to process.`
          });
        } else {
          setOutputFolder(selected);
        }
      }
      return;
    }

    if ("showDirectoryPicker" in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({
          mode: "readwrite"
        });
        if (forTarget === "input") {
          inputDirHandleRef.current = dirHandle;
          handleInputChange(dirHandle.name);
          setAlertNotice({
            type: "info",
            text: `Selected folder: "${dirHandle.name}". Click "Scan Files" or "Start Collection" to process directly on your disk.`
          });
        } else {
          outputDirHandleRef.current = dirHandle;
          setOutputFolder(dirHandle.name);
        }
      } catch (err: any) {
        // User cancelled picker
      }
    } else {
      setAlertNotice({
        type: "info",
        text: "Please type or paste the folder path directly into the input field."
      });
    }
  };

  // Build compression configuration payload
  const getCompressionPayload = () => ({
    mode: compressionMode,
    target_size: targetSize,
    target_unit: targetUnit,
    quality: quality,
    resize_mode: resizeMode,
    max_width: maxWidth ? parseInt(maxWidth, 10) : null,
    max_height: maxHeight ? parseInt(maxHeight, 10) : null,
    scale_pct: scalePct,
    preserve_aspect: preserveAspect,
    output_format: outputFormat,
    skip_below_target: skipBelowTarget
  });

  // Scan files from Directory Handle
  const scanFromDirectoryHandle = async (dirHandle: any) => {
    const items: ScannedFileItem[] = [];
    const usedNames = new Set<string>();
    let dups = 0;
    let imgs = 0;

    const imgExts = new Set([
      "jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "gif", "ico", "heic", "heif", "avif"
    ]);

    async function walk(currentHandle: any, currentPathParts: string[]) {
      for await (const entry of currentHandle.values()) {
        if (entry.name === "Collected_Files") continue;
        if (!includeHidden && entry.name.startsWith(".")) continue;

        if (entry.kind === "file") {
          try {
            const file: File = await entry.getFile();
            const ext = file.name.lastIndexOf(".") !== -1 ? file.name.substring(file.name.lastIndexOf(".") + 1).toLowerCase() : "";
            const isImg = imgExts.has(ext);
            if (isImg) imgs++;

            let filename = file.name;
            if (enableCompression && isImg && outputFormat !== "original") {
              const stem = filename.lastIndexOf(".") !== -1 ? filename.substring(0, filename.lastIndexOf(".")) : filename;
              filename = `${stem}.${outputFormat}`;
            }

            let baseName = filename;
            if (prefixSubfolders && currentPathParts.length > 0) {
              baseName = `${currentPathParts.join("-")}-${filename}`;
            }

            const stem = baseName.lastIndexOf(".") !== -1 ? baseName.substring(0, baseName.lastIndexOf(".")) : baseName;
            const finalExt = baseName.lastIndexOf(".") !== -1 ? baseName.substring(baseName.lastIndexOf(".")) : "";

            const lower = baseName.toLowerCase();
            let targetName = baseName;
            let status: ScannedFileItem["status"] = "eligible";

            if (!usedNames.has(lower)) {
              usedNames.add(lower);
            } else {
              dups++;
              if (duplicateMode === "skip") {
                status = "duplicate_skipped";
              } else if (duplicateMode === "overwrite") {
                status = "overwrite";
              } else {
                let i = 1;
                while (true) {
                  const cand = `${stem} (${i})${finalExt}`;
                  if (!usedNames.has(cand.toLowerCase())) {
                    usedNames.add(cand.toLowerCase());
                    targetName = cand;
                    status = "duplicate_renamed";
                    break;
                  }
                  i++;
                }
              }
            }

            const relPath = [...currentPathParts, file.name].join("/");
            items.push({
              source_path: relPath,
              relative_path: relPath,
              target_filename: targetName,
              size: file.size,
              status,
              is_image: isImg,
              fileBlob: file
            });
          } catch (e) {}
        } else if (entry.kind === "directory" && includeSubfolders) {
          await walk(entry, [...currentPathParts, entry.name]);
        }
      }
    }

    await walk(dirHandle, []);
    setScannedFiles(items);
    setTotalFound(items.length);
    setTotalImages(imgs);
    setTotalDuplicates(dups);
    return items;
  };

  // Scan files handler
  const handleScanDesktop = async () => {
    setIsScanning(true);
    setAlertNotice(null);
    setCollectionDone(false);

    // Desktop Native Scanner
    if (isDesktop()) {
      let targetInput = inputFolder.trim();
      if (!targetInput) {
        const picked = await fileAdapter.pickDirectory("Select Input Folder to Scan");
        if (picked) {
          targetInput = picked;
          handleInputChange(picked);
        } else {
          setIsScanning(false);
          return;
        }
      }

      try {
        const targetOut = outputFolder.trim() || `${targetInput.replace(/[\\/]+$/, "")}\\Collected_Files`;
        const res = await (window as any).electronAPI.collector.scan({
          inputFolder: targetInput,
          outputFolder: targetOut,
          includeSubfolders,
          includeHidden,
          prefixSubfolders,
          duplicateMode
        });
        setScannedFiles(res.files || []);
        setTotalFound(res.total_found || 0);
        setTotalImages(res.total_images || 0);
        setTotalDuplicates(res.total_duplicates || 0);
        if (res.output_folder) {
          setOutputFolder(res.output_folder);
        }
        setAlertNotice({
          type: "success",
          text: `Scan complete: Found ${res.total_found} file(s) on your disk. Ready to collect.`
        });
      } catch (err: any) {
        setAlertNotice({ type: "error", text: `Desktop scan failed: ${err.message}` });
      } finally {
        setIsScanning(false);
      }
      return;
    }

    // If browser holds a native DirectoryHandle
    if (inputDirHandleRef.current) {
      try {
        const items = await scanFromDirectoryHandle(inputDirHandleRef.current);
        setAlertNotice({
          type: "success",
          text: `Scan complete: Found ${items.length} file(s) directly on your disk. Ready to collect.`
        });
      } catch (err: any) {
        setAlertNotice({ type: "error", text: `Scan failed: ${err.message}` });
      } finally {
        setIsScanning(false);
      }
      return;
    }

    // Otherwise, check if user provided a path
    if (!inputFolder.trim()) {
      setIsScanning(false);
      if ("showDirectoryPicker" in window) {
        await handlePickDirectory("input");
      } else {
        setAlertNotice({ type: "error", text: "Please enter or browse an input folder." });
      }
      return;
    }

    // Try backend API scan
    try {
      const res = await fetch("/api/collector/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_folder: inputFolder.trim(),
          output_folder: outputFolder.trim() || undefined,
          include_subfolders: includeSubfolders,
          include_hidden: includeHidden,
          prefix_subfolders: prefixSubfolders,
          duplicate_mode: duplicateMode,
          enable_compression: enableCompression,
          compression: getCompressionPayload()
        })
      });

      if (!res.ok) {
        // If 405 or 400 because cloud server doesn't have local drive
        if ("showDirectoryPicker" in window) {
          setAlertNotice({
            type: "info",
            text: "Opening directory picker so your browser can access this folder directly..."
          });
          await handlePickDirectory("input");
          return;
        }
        let msg = `Scan failed (Status ${res.status})`;
        try {
          const err = await res.json();
          if (err.detail) msg = err.detail;
        } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      setScannedFiles(data.files || []);
      setTotalFound(data.total_found || 0);
      setTotalImages(data.total_images || 0);
      setTotalDuplicates(data.total_duplicates || 0);
      if (data.output_folder) {
        setOutputFolder(data.output_folder);
      }
      setAlertNotice({
        type: "success",
        text: `Scan complete: Found ${data.total_found} file(s). Ready to collect.`
      });
    } catch (err: any) {
      if ("showDirectoryPicker" in window) {
        setAlertNotice({
          type: "info",
          text: "To process your local drive in the web browser, click 'Browse' to grant folder access."
        });
      } else {
        setAlertNotice({ type: "error", text: err.message || "Failed to scan folder." });
      }
    } finally {
      setIsScanning(false);
    }
  };

  // Start Collection with optional Overwrite confirmation
  const handleStartCollection = async () => {
    if (duplicateMode === "overwrite") {
      setShowOverwriteModal(true);
      return;
    }
    await executeCollection();
  };

  // Direct Disk Collection using File System Access API
  const executeDirectDiskCollection = async (dirHandle: any) => {
    setIsCollecting(true);
    cancelRequestedRef.current = false;
    setCollectionDone(false);
    setCollectionErrors([]);

    let filesToCollect = scannedFiles;
    if (filesToCollect.length === 0) {
      filesToCollect = await scanFromDirectoryHandle(dirHandle);
    }

    if (filesToCollect.length === 0) {
      setIsCollecting(false);
      setAlertNotice({ type: "error", text: "No eligible files found to collect." });
      return;
    }

    try {
      // 1. Get or create output folder handle
      let outHandle = outputDirHandleRef.current;
      if (!outHandle) {
        outHandle = await dirHandle.getDirectoryHandle("Collected_Files", { create: true });
      }

      let copied = 0;
      let skipped = 0;
      let failed = 0;
      let compCount = 0;
      let origBytes = 0;
      let finalBytes = 0;
      let nonImgs = 0;
      const errorsList: Array<{ file: string; error: string }> = [];

      const targetBytesVal =
        targetUnit === "MB" ? targetSize * 1024 * 1024 : targetSize * 1024;

      for (let i = 0; i < filesToCollect.length; i++) {
        if (cancelRequestedRef.current) break;
        const item = filesToCollect[i];

        if (item.status === "duplicate_skipped") {
          skipped++;
          continue;
        }
        if (!item.fileBlob) {
          failed++;
          continue;
        }

        origBytes += item.fileBlob.size;
        let blobToSave: Blob = item.fileBlob;

        try {
          if (enableCompression && item.is_image) {
            const compRes = await compressImageInBrowser(item.fileBlob, {
              mode: compressionMode,
              targetBytes: targetBytesVal,
              quality,
              resizeMode,
              maxWidth: maxWidth ? parseInt(maxWidth, 10) : undefined,
              maxHeight: maxHeight ? parseInt(maxHeight, 10) : undefined,
              scalePct,
              preserveAspect,
              outputFormat,
              skipBelowTarget
            });
            blobToSave = compRes.blob;
            if (compRes.status === "compressed") compCount++;
          } else if (!item.is_image) {
            nonImgs++;
          }

          finalBytes += blobToSave.size;

          // Write file directly to local disk
          const destFileHandle = await outHandle.getFileHandle(item.target_filename, {
            create: true
          });
          const writable = await destFileHandle.createWritable();
          await writable.write(blobToSave);
          await writable.close();

          copied++;
        } catch (copyErr: any) {
          failed++;
          errorsList.push({ file: item.relative_path, error: copyErr.message || "Failed to write file" });
        }

        const pct = Math.round(((i + 1) / filesToCollect.length) * 100);
        setCollectProgress({
          copied,
          skipped,
          failed,
          total: filesToCollect.length,
          currentFile: item.target_filename,
          percent: pct
        });
      }

      setCollectionErrors(errorsList);
      setLastOutputFolder(`${dirHandle.name}/Collected_Files`);

      if (enableCompression) {
        setCompressionStats({
          enabled: true,
          total_images: totalImages,
          compressed: compCount,
          skipped: totalImages - compCount,
          unsupported: 0,
          non_images: nonImgs,
          orig_bytes: origBytes,
          final_bytes: finalBytes,
          saved_bytes: Math.max(0, origBytes - finalBytes),
          saved_pct: origBytes > 0 ? Math.round(((origBytes - finalBytes) / origBytes) * 100) : 0
        });
      }

      setCollectionDone(true);
      setAlertNotice({
        type: "success",
        text: `Collection finished! ${copied} file(s) saved directly into "Collected_Files" on your disk.`
      });
    } catch (err: any) {
      setAlertNotice({
        type: "error",
        text: `Direct disk collection failed: ${err.message}`
      });
    } finally {
      setIsCollecting(false);
    }
  };

  const executeCollection = async () => {
    setShowOverwriteModal(false);

    // Desktop Native Collection
    if (isDesktop()) {
      let targetInput = inputFolder.trim();
      if (!targetInput) {
        const picked = await fileAdapter.pickDirectory("Select Input Folder");
        if (picked) {
          targetInput = picked;
          handleInputChange(picked);
        } else {
          setAlertNotice({ type: "error", text: "Please select an input folder." });
          return;
        }
      }

      setIsCollecting(true);
      cancelRequestedRef.current = false;
      setCollectionDone(false);
      setCollectionErrors([]);
      setCompressionStats(null);
      setCollectProgress({
        copied: 0,
        skipped: 0,
        failed: 0,
        total: totalFound || scannedFiles.length || 1,
        currentFile: "Collecting files locally on disk...",
        percent: 15
      });

      const targetOut = outputFolder.trim() || `${targetInput.replace(/[\\/]+$/, "")}\\Collected_Files`;

      try {
        const res = await (window as any).electronAPI.collector.collect({
          inputFolder: targetInput,
          outputFolder: targetOut,
          includeSubfolders,
          includeHidden,
          prefixSubfolders,
          duplicateMode,
          enableCompression,
          compression: getCompressionPayload()
        });

        const outDir = res.output_folder || targetOut;
        setLastOutputFolder(outDir);
        setCollectProgress({
          copied: res.copied || 0,
          skipped: res.skipped || 0,
          failed: res.failed || 0,
          total: res.total || 0,
          currentFile: "Completed",
          percent: 100
        });
        setCollectionErrors((res.errors || []).map((e: any) => ({ file: e.file || e.name || "File", error: e.error })));
        if (res.compression_stats) {
          setCompressionStats(res.compression_stats);
        }
        setCollectionDone(true);
        setAlertNotice({
          type: "success",
          text: `Collection finished! ${res.copied} file(s) saved directly into "${outDir}".`
        });

        // Store collection job in local SQLite database
        await storageAdapter.saveCollectionJob({
          inputFolder: targetInput,
          outputFolder: outDir,
          totalFiles: res.total || 0,
          copiedCount: res.copied || 0,
          skippedCount: res.skipped || 0,
          failedCount: res.failed || 0,
          compressionEnabled: enableCompression,
          status: "completed"
        });
      } catch (err: any) {
        setAlertNotice({ type: "error", text: `Collection failed: ${err.message}` });
      } finally {
        if (unsubProgress) {
          try { unsubProgress(); } catch (_) {}
        }
        setIsCollecting(false);
      }
      return;
    }

    // If we have a native directory handle (or can open one)
    if (inputDirHandleRef.current) {
      await executeDirectDiskCollection(inputDirHandleRef.current);
      return;
    }

    if (!inputFolder.trim()) {
      if ("showDirectoryPicker" in window) {
        try {
          const dirHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
          inputDirHandleRef.current = dirHandle;
          setInputFolder(dirHandle.name);
          await executeDirectDiskCollection(dirHandle);
          return;
        } catch (e) {
          return;
        }
      }
      setAlertNotice({ type: "error", text: "Please specify an input folder." });
      return;
    }

    // Server-side Collection
    setIsCollecting(true);
    cancelRequestedRef.current = false;
    setCollectionDone(false);
    setCollectionErrors([]);
    setCompressionStats(null);
    setCollectProgress({
      copied: 0,
      skipped: 0,
      failed: 0,
      total: totalFound || scannedFiles.length || 1,
      currentFile: enableCompression ? "Compressing & collecting..." : "Collecting files...",
      percent: 15
    });

    try {
      const targetOut = outputFolder.trim() || `${inputFolder.replace(/[\\/]+$/, "")}/Collected_Files`;
      const res = await fetch("/api/collector/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_folder: inputFolder.trim(),
          output_folder: targetOut,
          include_subfolders: includeSubfolders,
          include_hidden: includeHidden,
          prefix_subfolders: prefixSubfolders,
          duplicate_mode: duplicateMode,
          enable_compression: enableCompression,
          compression: getCompressionPayload()
        })
      });

      if (!res.ok) {
        if ("showDirectoryPicker" in window) {
          setIsCollecting(false);
          setAlertNotice({
            type: "info",
            text: "Cloud server cannot access your local drive directly. Select the folder via the browser picker to save directly to disk."
          });
          const dirHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
          inputDirHandleRef.current = dirHandle;
          setInputFolder(dirHandle.name);
          await executeDirectDiskCollection(dirHandle);
          return;
        }
        let msg = `Collection failed (Status ${res.status})`;
        try {
          const err = await res.json();
          if (err.detail) msg = err.detail;
        } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      setCollectProgress({
        copied: data.copied || 0,
        skipped: data.skipped || 0,
        failed: data.failed || 0,
        total: data.total || 0,
        currentFile: "Completed",
        percent: 100
      });
      setCollectionErrors(data.errors || []);
      setLastOutputFolder(data.output_folder || targetOut);
      if (data.compression) {
        setCompressionStats(data.compression);
      }
      setCollectionDone(true);
      setAlertNotice({
        type: "success",
        text: `Collection finished! ${data.copied} file(s) collected safely into "${data.output_folder}".`
      });
    } catch (err: any) {
      setAlertNotice({
        type: "error",
        text: err.message || "Collection failed."
      });
    } finally {
      setIsCollecting(false);
    }
  };

  // Open output folder
  const handleOpenFolder = async () => {
    const target = lastOutputFolder || outputFolder;
    if (!target) return;
    if (isDesktop()) {
      try {
        await (window as any).electronAPI.fs.openPath(target);
        setAlertNotice({
          type: "info",
          text: `Opened "${target}" in Windows File Explorer.`
        });
      } catch (e: any) {
        setAlertNotice({
          type: "error",
          text: `Could not open folder: ${e.message}`
        });
      }
      return;
    }
    try {
      const res = await fetch("/api/collector/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: target })
      });
      if (!res.ok) {
        throw new Error("Local folder opener not supported in web mode.");
      }
      setAlertNotice({
        type: "info",
        text: `Opened "${target}" in File Explorer.`
      });
    } catch (err: any) {
      setAlertNotice({
        type: "info",
        text: `Files are saved in "${target}". You can open this folder directly in your File Explorer.`
      });
    }
  };

  // Export report
  const handleExportReport = () => {
    const lines = [
      "==================================================",
      "Loveneet Suite — File Collector & Compression Report",
      `Date: ${new Date().toLocaleString()}`,
      `Input Folder: ${inputFolder}`,
      `Output Folder: ${lastOutputFolder || outputFolder}`,
      `Prefix with Subfolders: ${prefixSubfolders ? "Enabled" : "Disabled"}`,
      `Duplicate Handling: ${duplicateMode}`,
      `Image Compression: ${enableCompression ? "ENABLED" : "Disabled"}`,
      "==================================================",
      ""
    ];

    if (enableCompression && compressionStats) {
      lines.push("--- COMPRESSION DASHBOARD METRICS ---");
      lines.push(`Total Images Processed: ${compressionStats.total_images}`);
      lines.push(`Images Compressed: ${compressionStats.compressed}`);
      lines.push(`Images Skipped (Below Target): ${compressionStats.skipped}`);
      lines.push(`Unsupported or Failed Images: ${compressionStats.unsupported}`);
      lines.push(`Non-Image Files Copied: ${compressionStats.non_images}`);
      lines.push(`Original Total Size: ${formatBytes(compressionStats.orig_bytes)}`);
      lines.push(`Compressed Total Size: ${formatBytes(compressionStats.final_bytes)}`);
      lines.push(
        `Space Saved: ${formatBytes(compressionStats.saved_bytes)} (${compressionStats.saved_pct}%)`
      );
      lines.push("");
    } else {
      lines.push(`Total Found: ${totalFound}`);
      lines.push(`Successfully Copied: ${collectProgress.copied}`);
      lines.push(`Duplicates Skipped: ${collectProgress.skipped}`);
      lines.push(`Failed Operations: ${collectProgress.failed}`);
      lines.push("");
    }

    if (collectionErrors.length > 0) {
      lines.push("--- ERRORS & WARNINGS ---");
      collectionErrors.forEach((e, idx) => {
        lines.push(`${idx + 1}. File: ${e.file}`);
        lines.push(`   Error: ${e.error}`);
      });
      lines.push("");
    }

    lines.push("--- SCANNED & PROCESSED FILES ---");
    scannedFiles.forEach((item, idx) => {
      lines.push(
        `[${idx + 1}] ${item.relative_path} -> ${item.target_filename} (${item.status}${
          item.is_image ? ", image" : ", document"
        })`
      );
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    saveAs(blob, "file_collector_compression_report.txt");
  };

  // Browser Mode (Dropzone / webkitdirectory)
  const handleBrowserFolderSelect = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const allFiles = Array.from(filesList);
    setBrowserFiles(allFiles);

    const usedNames = new Set<string>();
    const items: ScannedFileItem[] = [];
    let dups = 0;
    let imgCount = 0;

    const imgExts = new Set([
      "jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "gif", "ico", "avif"
    ]);

    for (const f of allFiles) {
      const relPath = (f as any).webkitRelativePath || f.name;
      const parts = relPath.split("/").filter(Boolean);

      const isHidden = parts.some((p: string) => p.startsWith("."));
      if (!includeHidden && isHidden) continue;

      let filename = parts[parts.length - 1];
      const subfolders = parts.slice(1, -1);
      const ext = filename.lastIndexOf(".") !== -1 ? filename.substring(filename.lastIndexOf(".") + 1).toLowerCase() : "";
      const isImg = imgExts.has(ext);
      if (isImg) imgCount++;

      if (enableCompression && isImg && outputFormat !== "original") {
        const stem = filename.lastIndexOf(".") !== -1 ? filename.substring(0, filename.lastIndexOf(".")) : filename;
        filename = `${stem}.${outputFormat}`;
      }

      let baseName = filename;
      if (prefixSubfolders && subfolders.length > 0) {
        baseName = `${subfolders.join("-")}-${filename}`;
      }

      const stem = baseName.lastIndexOf(".") !== -1 ? baseName.substring(0, baseName.lastIndexOf(".")) : baseName;
      const finalExt = baseName.lastIndexOf(".") !== -1 ? baseName.substring(baseName.lastIndexOf(".")) : "";

      const lower = baseName.toLowerCase();
      let targetName = baseName;
      let status: ScannedFileItem["status"] = "eligible";

      if (!usedNames.has(lower)) {
        usedNames.add(lower);
      } else {
        dups++;
        if (duplicateMode === "skip") {
          status = "duplicate_skipped";
        } else if (duplicateMode === "overwrite") {
          status = "overwrite";
        } else {
          let i = 1;
          while (true) {
            const cand = `${stem} (${i})${finalExt}`;
            if (!usedNames.has(cand.toLowerCase())) {
              usedNames.add(cand.toLowerCase());
              targetName = cand;
              status = "duplicate_renamed";
              break;
            }
            i++;
          }
        }
      }

      items.push({
        source_path: relPath,
        relative_path: relPath,
        target_filename: targetName,
        size: f.size,
        status,
        is_image: isImg,
        fileBlob: f
      });
    }

    setScannedFiles(items);
    setTotalFound(items.length);
    setTotalImages(imgCount);
    setTotalDuplicates(dups);
    setAlertNotice({
      type: "success",
      text: `Loaded ${items.length} file(s) (${imgCount} images). Ready to collect.`
    });
  };

  // Browser Mode ZIP export
  const handleBrowserZipExport = async () => {
    if (!scannedFiles.length) return;
    setIsCollecting(true);
    setCollectionDone(false);
    try {
      const zip = new JSZip();
      const collectedList: { filename: string; blob: Blob }[] = [];
      let count = 0;
      let origBytes = 0;
      let finalBytes = 0;
      let compCount = 0;

      const targetBytesVal = targetUnit === "MB" ? targetSize * 1024 * 1024 : targetSize * 1024;

      for (const item of scannedFiles) {
        if (item.status === "duplicate_skipped") continue;
        if (item.fileBlob) {
          origBytes += item.fileBlob.size;
          let blobToSave: Blob = item.fileBlob;

          if (enableCompression && item.is_image) {
            const compRes = await compressImageInBrowser(item.fileBlob, {
              mode: compressionMode,
              targetBytes: targetBytesVal,
              quality,
              resizeMode,
              maxWidth: maxWidth ? parseInt(maxWidth, 10) : undefined,
              maxHeight: maxHeight ? parseInt(maxHeight, 10) : undefined,
              scalePct,
              preserveAspect,
              outputFormat,
              skipBelowTarget
            });
            blobToSave = compRes.blob;
            if (compRes.status === "compressed") compCount++;
          }

          finalBytes += blobToSave.size;
          zip.file(item.target_filename, blobToSave);
          collectedList.push({ filename: item.target_filename, blob: blobToSave });
          count++;
          setCollectProgress({
            copied: count,
            skipped: scannedFiles.length - count,
            failed: 0,
            total: scannedFiles.length,
            currentFile: item.target_filename,
            percent: Math.round((count / scannedFiles.length) * 100)
          });
        }
      }

      if (collectedList.length === 1) {
        saveAs(collectedList[0].blob, collectedList[0].filename);
      } else if (collectedList.length === 2) {
        saveAs(collectedList[0].blob, collectedList[0].filename);
        setTimeout(() => saveAs(collectedList[1].blob, collectedList[1].filename), 350);
      } else {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, "Collected_Files.zip");
      }

      if (enableCompression) {
        setCompressionStats({
          enabled: true,
          total_images: totalImages,
          compressed: compCount,
          skipped: totalImages - compCount,
          unsupported: 0,
          non_images: scannedFiles.length - totalImages,
          orig_bytes: origBytes,
          final_bytes: finalBytes,
          saved_bytes: Math.max(0, origBytes - finalBytes),
          saved_pct: origBytes > 0 ? Math.round(((origBytes - finalBytes) / origBytes) * 100) : 0
        });
      }

      setCollectionDone(true);
      setAlertNotice({
        type: "success",
        text: collectedList.length === 1
          ? `Successfully collected "${collectedList[0].filename}". Downloaded directly!`
          : collectedList.length === 2
          ? `Successfully collected 2 files. Both downloaded directly!`
          : `Successfully collected ${count} file(s) into "Collected_Files.zip"!`
      });
    } catch (err: any) {
      setAlertNotice({
        type: "error",
        text: `Browser export failed: ${err.message}`
      });
    } finally {
      setIsCollecting(false);
    }
  };

  // Filtered preview files
  const filteredPreview = useMemo(() => {
    if (!searchFilter.trim()) return scannedFiles;
    const q = searchFilter.toLowerCase();
    return scannedFiles.filter(
      (f) =>
        f.target_filename.toLowerCase().includes(q) ||
        f.relative_path.toLowerCase().includes(q)
    );
  }, [scannedFiles, searchFilter]);

  return (
    <div className="collector-tool">
      {/* Top Feature Badges */}
      <div className="collector-badges">
        <span className="collector-badge">
          <Copy size={13} /> Safe Copy-Only
        </span>
        <span className="collector-badge">
          <FolderTree size={13} /> Subfolder Prefixing
        </span>
        <span className="collector-badge">
          <ShieldCheck size={13} /> Duplicate Protection
        </span>
        <span className="collector-badge">
          <Zap size={13} /> Bulk Image Compression
        </span>
        <span className="collector-badge">
          <Layers size={13} /> Universal Format Engine
        </span>
      </div>

      {/* Main Configuration Panel */}
      <section className="collector-panel">
        <div className="collector-panel-head">
          <div className="collector-step-num">01</div>
          <div>
            <h3>Folder & Collection Settings</h3>
            <p>
              Recursively scan nested subfolders and flatten all files into a single destination folder. Originals are never modified or deleted.
            </p>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="collector-tabs">
          <button
            type="button"
            className={`collector-tab-btn ${activeTab === "desktop" ? "active" : ""}`}
            onClick={() => setActiveTab("desktop")}
          >
            <FolderSync size={16} /> Local Desktop Mode (Direct Disk)
          </button>
          <button
            type="button"
            className={`collector-tab-btn ${activeTab === "browser" ? "active" : ""}`}
            onClick={() => setActiveTab("browser")}
          >
            <Upload size={16} /> Browser Upload & ZIP Mode
          </button>
        </div>

        {activeTab === "desktop" ? (
          <div className="collector-grid">
            <div className="collector-field">
              <label>
                <span>Input Folder</span>
                <small style={{ color: "#64748b" }}>Source directory</small>
              </label>
              <div className="collector-input-group">
                <input
                  type="text"
                  className="collector-input"
                  placeholder="Click Browse or enter e.g. D:\MyFolder"
                  value={inputFolder}
                  onChange={(e) => handleInputChange(e.target.value)}
                />
                <button
                  type="button"
                  className="collector-btn-secondary"
                  onClick={() => handlePickDirectory("input")}
                  title="Browse Folder"
                >
                  <FolderOpen size={15} /> Browse
                </button>
              </div>
            </div>

            <div className="collector-field">
              <label>
                <span>Output Folder</span>
                <small style={{ color: "#64748b" }}>Defaults to Collected_Files</small>
              </label>
              <div className="collector-input-group">
                <input
                  type="text"
                  className="collector-input"
                  placeholder="Defaults to Collected_Files"
                  value={outputFolder}
                  onChange={(e) => setOutputFolder(e.target.value)}
                />
                <button
                  type="button"
                  className="collector-btn-secondary"
                  onClick={() => handlePickDirectory("output")}
                  title="Browse Destination"
                >
                  <FolderOpen size={15} /> Browse
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 18 }}>
            <label className="collector-dropzone">
              <input
                type="file"
                // @ts-ignore
                webkitdirectory="true"
                // @ts-ignore
                directory="true"
                multiple
                onChange={(e) => handleBrowserFolderSelect(e.target.files)}
              />
              <div className="collector-drop-icon">
                <Upload size={22} />
              </div>
              <strong style={{ fontSize: 14, color: "#f8fafc" }}>
                Click to browse folder or drop folder here
              </strong>
              <small style={{ color: "#94a3b8" }}>
                {browserFiles.length > 0
                  ? `${browserFiles.length} file(s) selected from browser`
                  : "All nested subfolders will be scanned in your browser"}
              </small>
            </label>
          </div>
        )}

        {/* Options & Toggles Grid */}
        <div className="collector-options-grid">
          <label className="collector-toggle">
            <input
              type="checkbox"
              checked={includeSubfolders}
              onChange={(e) => setIncludeSubfolders(e.target.checked)}
            />
            <div className="collector-toggle-label">
              <strong>Include Subfolders</strong>
              <small>Recursively scan all nested folder depths</small>
            </div>
          </label>

          <label className="collector-toggle">
            <input
              type="checkbox"
              checked={prefixSubfolders}
              onChange={(e) => setPrefixSubfolders(e.target.checked)}
            />
            <div className="collector-toggle-label">
              <strong>Prefix with Subfolder Names</strong>
              <small>e.g. Chairs-Wooden-Chair01.jpg</small>
            </div>
          </label>

          <label className="collector-toggle">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(e) => setIncludeHidden(e.target.checked)}
            />
            <div className="collector-toggle-label">
              <strong>Include Hidden Files</strong>
              <small>Dotfiles or hidden system files</small>
            </div>
          </label>

          <div className="collector-select-wrap">
            <label htmlFor="dup-select">Duplicate Filename Handling</label>
            <select
              id="dup-select"
              className="collector-select"
              value={duplicateMode}
              onChange={(e) => setDuplicateMode(e.target.value as any)}
            >
              <option value="rename">Auto Rename (e.g. Chair01 (1).jpg)</option>
              <option value="skip">Skip Duplicates</option>
              <option value="overwrite">Overwrite (Requires Confirmation)</option>
            </select>
          </div>
        </div>

        {/* Image Compression Feature Toggle */}
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <label className="collector-toggle" style={{ display: "inline-flex" }}>
            <input
              type="checkbox"
              checked={enableCompression}
              onChange={(e) => setEnableCompression(e.target.checked)}
            />
            <div className="collector-toggle-label">
              <strong style={{ fontSize: 13.5, color: enableCompression ? "#38bdf8" : "#f1f5f9" }}>
                Enable Bulk Image Compression
              </strong>
              <small>
                Compress JPG, PNG, WebP, HEIC/HEIF, BMP, GIF, TIFF while preserving documents unchanged
              </small>
            </div>
          </label>
        </div>

        {/* Compression Settings Section (Shown when enabled) */}
        {enableCompression && (
          <div className="compression-box">
            <div className="compression-box-head">
              <div className="compression-box-title">
                <Sliders size={18} color="#38bdf8" />
                <div>
                  <strong>Image Compression & Optimization Options</strong>
                  <small>Customize target sizes, quality, dimensions, and formats</small>
                </div>
              </div>
              <span className="collector-badge" style={{ borderColor: "#0284c7" }}>
                Pillow & HEIF Engine
              </span>
            </div>

            {/* Compression Modes */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: "#cbd5e1", marginBottom: 6, display: "block" }}>
                Compression Mode
              </label>
              <div className="compression-modes">
                <label className={`compression-mode-card ${compressionMode === "reduce" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="comp-mode"
                    value="reduce"
                    checked={compressionMode === "reduce"}
                    onChange={() => setCompressionMode("reduce")}
                  />
                  <div>
                    <strong>1. Reduce File Size</strong>
                    <small>Maximize size savings while retaining high visual fidelity</small>
                  </div>
                </label>

                <label className={`compression-mode-card ${compressionMode === "target" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="comp-mode"
                    value="target"
                    checked={compressionMode === "target"}
                    onChange={() => setCompressionMode("target")}
                  />
                  <div>
                    <strong>2. Target Size Goal</strong>
                    <small>Attempt to reach a target size (e.g. 200 KB) per image</small>
                  </div>
                </label>

                <label className={`compression-mode-card ${compressionMode === "resize" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="comp-mode"
                    value="resize"
                    checked={compressionMode === "resize"}
                    onChange={() => setCompressionMode("resize")}
                  />
                  <div>
                    <strong>3. Resize + Compress</strong>
                    <small>Downscale dimensions and apply optimization</small>
                  </div>
                </label>
              </div>
            </div>

            {/* Detailed Controls Grid */}
            <div className="compression-settings-grid">
              <div className="collector-field">
                <label>
                  <span>Target File Size</span>
                  <small style={{ color: "#64748b" }}>Goal size</small>
                </label>
                <div className="compression-input-row">
                  <input
                    type="number"
                    min="10"
                    max="50000"
                    className="collector-input"
                    value={targetSize}
                    onChange={(e) => setTargetSize(Math.max(1, parseInt(e.target.value, 10) || 10))}
                  />
                  <select
                    className="collector-select"
                    value={targetUnit}
                    onChange={(e) => setTargetUnit(e.target.value as any)}
                  >
                    <option value="KB">KB</option>
                    <option value="MB">MB</option>
                  </select>
                </div>
              </div>

              <div className="collector-field">
                <label>
                  <span>Image Quality</span>
                  <small style={{ color: "#64748b" }}>10% - 100%</small>
                </label>
                <div className="compression-slider-wrap">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={quality}
                    onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                  />
                  <strong>{quality}%</strong>
                </div>
              </div>

              <div className="collector-field">
                <label>
                  <span>Resize Dimensions</span>
                  <small style={{ color: "#64748b" }}>Resolution control</small>
                </label>
                <select
                  className="collector-select"
                  value={resizeMode}
                  onChange={(e) => setResizeMode(e.target.value as any)}
                >
                  <option value="original">Original Dimensions</option>
                  <option value="scale">Percentage Scale (%)</option>
                  <option value="custom">Custom Maximum Width/Height</option>
                </select>
              </div>

              <div className="collector-field">
                <label>
                  <span>Output Format</span>
                  <small style={{ color: "#64748b" }}>Where supported</small>
                </label>
                <select
                  className="collector-select"
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as any)}
                >
                  <option value="original">Keep Original Format</option>
                  <option value="jpg">Convert to JPG (.jpg)</option>
                  <option value="png">Convert to PNG (.png)</option>
                  <option value="webp">Convert to WebP (.webp)</option>
                </select>
              </div>
            </div>

            {resizeMode === "scale" && (
              <div className="collector-field" style={{ maxWidth: 320 }}>
                <label>
                  <span>Scale Percentage</span>
                  <small style={{ color: "#64748b" }}>e.g. 50% = half resolution</small>
                </label>
                <div className="compression-slider-wrap">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={scalePct}
                    onChange={(e) => setScalePct(parseInt(e.target.value, 10))}
                  />
                  <strong>{scalePct}%</strong>
                </div>
              </div>
            )}

            {resizeMode === "custom" && (
              <div className="compression-input-row" style={{ maxWidth: 360 }}>
                <div className="collector-field" style={{ flex: 1 }}>
                  <label>Max Width (px)</label>
                  <input
                    type="number"
                    className="collector-input"
                    placeholder="e.g. 1920"
                    value={maxWidth}
                    onChange={(e) => setMaxWidth(e.target.value)}
                  />
                </div>
                <div className="collector-field" style={{ flex: 1 }}>
                  <label>Max Height (px)</label>
                  <input
                    type="number"
                    className="collector-input"
                    placeholder="e.g. 1080"
                    value={maxHeight}
                    onChange={(e) => setMaxHeight(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", paddingTop: 4 }}>
              <label className="collector-toggle">
                <input
                  type="checkbox"
                  checked={preserveAspect}
                  onChange={(e) => setPreserveAspect(e.target.checked)}
                />
                <div className="collector-toggle-label">
                  <strong>Preserve Aspect Ratio</strong>
                  <small>Never distort image proportions</small>
                </div>
              </label>

              <label className="collector-toggle">
                <input
                  type="checkbox"
                  checked={skipBelowTarget}
                  onChange={(e) => setSkipBelowTarget(e.target.checked)}
                />
                <div className="collector-toggle-label">
                  <strong>Skip Images Already Below Target</strong>
                  <small>Avoid re-compressing small images</small>
                </div>
              </label>

              <label className="collector-toggle">
                <input type="checkbox" checked={true} readOnly disabled />
                <div className="collector-toggle-label">
                  <strong>Keep Originals (Safe Copy)</strong>
                  <small>Source files are never modified</small>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="collector-actions">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {activeTab === "desktop" ? (
              <button
                type="button"
                className="collector-btn-secondary"
                disabled={isScanning || isCollecting}
                onClick={handleScanDesktop}
              >
                {isScanning ? (
                  <>
                    <LoaderCircle className="spinner" size={16} /> Scanning Files…
                  </>
                ) : (
                  <>
                    <FolderSearch size={16} /> Scan Files
                  </>
                )}
              </button>
            ) : null}

            <button
              type="button"
              className="collector-btn-primary"
              disabled={
                isCollecting ||
                (activeTab === "browser" && scannedFiles.length === 0)
              }
              onClick={activeTab === "desktop" ? handleStartCollection : handleBrowserZipExport}
            >
              {isCollecting ? (
                <>
                  <LoaderCircle className="spinner" size={16} />{" "}
                  {enableCompression ? "Collecting & Compressing…" : "Collecting Files…"}
                </>
              ) : (
                <>
                  <Copy size={16} />{" "}
                  {enableCompression ? "Start Collection & Compression" : "Start Collection"}
                </>
              )}
            </button>

            {isCollecting && (
              <button
                type="button"
                className="collector-btn-danger"
                onClick={() => {
                  cancelRequestedRef.current = true;
                  if (isDesktop()) {
                    (window as any).electronAPI?.collector?.cancel?.();
                  }
                  setIsCollecting(false);
                  setAlertNotice({ type: "info", text: "Operation cancelled by user." });
                }}
              >
                <X size={15} /> Cancel
              </button>
            )}
          </div>

          {totalFound > 0 && (
            <div style={{ fontSize: 12.5, color: "#94a3b8" }}>
              <strong style={{ color: "#f8fafc" }}>{totalFound}</strong> total files (
              <span style={{ color: "#38bdf8" }}>{totalImages} images</span>)
              {totalDuplicates > 0 && (
                <span style={{ color: "#fbbf24", marginLeft: 8 }}>
                  · {totalDuplicates} duplicates auto-numbered
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Alert Notice Banner */}
      {alertNotice && (
        <div className={`collector-alert alert-${alertNotice.type}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {alertNotice.type === "success" && <CheckCircle2 size={18} />}
            {alertNotice.type === "error" && <AlertCircle size={18} />}
            {alertNotice.type === "info" && <Sparkles size={18} />}
            <span>{alertNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setAlertNotice(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Progress & Post-Processing Panel */}
      {(isCollecting || collectionDone) && (
        <section className="collector-panel">
          <div className="collector-progress-wrap">
            <div className="collector-progress-info">
              <div>
                <strong>
                  {collectionDone
                    ? enableCompression
                      ? "Collection & Compression Finished"
                      : "Collection Finished"
                    : enableCompression
                    ? "Processing & Compressing Images..."
                    : "Copying Files..."}
                </strong>
                <span style={{ marginLeft: 10, color: "#94a3b8", fontSize: 12 }}>
                  {collectProgress.currentFile}
                </span>
              </div>
              <strong style={{ color: collectionDone ? "#34d399" : "#38bdf8" }}>
                {collectProgress.percent}%
              </strong>
            </div>

            <div className="collector-progress-bar">
              <div
                className={`collector-progress-fill ${collectionDone ? "done" : ""}`}
                style={{ width: `${collectProgress.percent}%` }}
              />
            </div>

            {/* Standard KPI Counters */}
            <div className="collector-kpi-grid" style={{ marginTop: 8, marginBottom: 0 }}>
              <div className="collector-kpi-card kpi-blue">
                <span>Total Files</span>
                <strong>{collectProgress.total || totalFound}</strong>
              </div>
              <div className="collector-kpi-card kpi-green">
                <span>Copied</span>
                <strong>{collectProgress.copied}</strong>
              </div>
              <div className="collector-kpi-card kpi-amber">
                <span>Skipped</span>
                <strong>{collectProgress.skipped}</strong>
              </div>
              <div className="collector-kpi-card kpi-rose">
                <span>Failed</span>
                <strong>{collectProgress.failed}</strong>
              </div>
            </div>

            {/* Dedicated Compression Dashboard */}
            {enableCompression && compressionStats && (
              <div className="compression-kpi-summary">
                <div className="compression-savings-banner">
                  <h4>
                    <Zap size={18} color="#10b981" /> Compression Dashboard Summary
                  </h4>
                  <div className="compression-savings-badge">
                    Space Saved: {formatBytes(compressionStats.saved_bytes)} ({compressionStats.saved_pct}%)
                  </div>
                </div>

                <div className="collector-kpi-grid" style={{ marginBottom: 0 }}>
                  <div className="collector-kpi-card">
                    <span>Total Images</span>
                    <strong>{compressionStats.total_images}</strong>
                  </div>
                  <div className="collector-kpi-card kpi-green">
                    <span>Compressed</span>
                    <strong>{compressionStats.compressed}</strong>
                  </div>
                  <div className="collector-kpi-card kpi-amber">
                    <span>Skipped (&lt; Target)</span>
                    <strong>{compressionStats.skipped}</strong>
                  </div>
                  <div className="collector-kpi-card kpi-rose">
                    <span>Unsupported / Failed</span>
                    <strong>{compressionStats.unsupported}</strong>
                  </div>
                  <div className="collector-kpi-card">
                    <span>Documents Copied</span>
                    <strong>{compressionStats.non_images}</strong>
                  </div>
                  <div className="collector-kpi-card">
                    <span>Original Size</span>
                    <strong style={{ fontSize: 18 }}>{formatBytes(compressionStats.orig_bytes)}</strong>
                  </div>
                  <div className="collector-kpi-card">
                    <span>Compressed Size</span>
                    <strong style={{ fontSize: 18, color: "#34d399" }}>
                      {formatBytes(compressionStats.final_bytes)}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons Post-Completion */}
            {collectionDone && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                {activeTab === "desktop" && (
                  <button
                    type="button"
                    className="collector-btn-success"
                    onClick={handleOpenFolder}
                  >
                    <FolderOpen size={16} /> Open Output Folder
                  </button>
                )}
                <button
                  type="button"
                  className="collector-btn-secondary"
                  onClick={handleExportReport}
                >
                  <FileText size={16} /> Export Full Processing Report
                </button>
                <button
                  type="button"
                  className="collector-btn-secondary"
                  onClick={() => {
                    setCollectionDone(false);
                    setCompressionStats(null);
                    setCollectProgress({ copied: 0, skipped: 0, failed: 0, total: 0, currentFile: "", percent: 0 });
                  }}
                >
                  <RefreshCw size={15} /> Collect Another
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Scanned Files Preview Table */}
      {scannedFiles.length > 0 && (
        <section className="collector-panel">
          <div className="collector-panel-head">
            <div className="collector-step-num">02</div>
            <div>
              <h3>Scanned Files Preview ({scannedFiles.length})</h3>
              <p>
                Review source paths and target output filenames. Images will be optimized according to your compression preferences.
              </p>
            </div>
          </div>

          <div className="collector-table-wrap">
            <div className="collector-table-controls">
              <div className="collector-table-search">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filter scanned files by name or path..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
                {searchFilter && (
                  <button
                    type="button"
                    onClick={() => setSearchFilter("")}
                    style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer" }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Showing {filteredPreview.length} of {scannedFiles.length}
              </div>
            </div>

            <div className="collector-table-scroll">
              <table className="collector-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Status</th>
                    <th style={{ width: 90 }}>Type</th>
                    <th>Source Relative Path</th>
                    <th>Target Output Filename</th>
                    <th style={{ width: 100, textAlign: "right" }}>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreview.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        {item.status === "eligible" && (
                          <span className="collector-tag tag-eligible">Eligible</span>
                        )}
                        {item.status === "duplicate_renamed" && (
                          <span className="collector-tag tag-renamed">Renamed</span>
                        )}
                        {item.status === "duplicate_skipped" && (
                          <span className="collector-tag tag-skipped">Skipped</span>
                        )}
                        {item.status === "overwrite" && (
                          <span className="collector-tag tag-overwrite">Overwrite</span>
                        )}
                      </td>
                      <td>
                        {item.is_image ? (
                          <span className="collector-tag tag-renamed" style={{ fontSize: 10 }}>
                            Image
                          </span>
                        ) : (
                          <span className="collector-tag" style={{ background: "#1e293b", color: "#94a3b8", fontSize: 10 }}>
                            File
                          </span>
                        )}
                      </td>
                      <td style={{ color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>
                        {item.relative_path}
                      </td>
                      <td style={{ color: "#f8fafc", fontWeight: 600, fontFamily: "ui-monospace, monospace" }}>
                        {item.target_filename}
                      </td>
                      <td style={{ textAlign: "right", color: "#94a3b8" }}>
                        {formatBytes(item.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Confirmation Modal for Overwrite */}
      {showOverwriteModal && (
        <div className="collector-modal-backdrop">
          <div className="collector-modal">
            <h3>
              <AlertTriangle size={20} color="#fbbf24" /> Confirm Overwrite Mode
            </h3>
            <p>
              You selected <strong>Overwrite</strong> duplicate handling. Any files in the output destination folder that share the same filename will be replaced.
            </p>
            <p style={{ color: "#e2e8f0" }}>
              Original source files will remain untouched. Are you sure you want to proceed?
            </p>
            <div className="collector-modal-actions">
              <button
                type="button"
                className="collector-btn-secondary"
                onClick={() => setShowOverwriteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="collector-btn-primary"
                style={{ background: "#dc2626" }}
                onClick={executeCollection}
              >
                Yes, Overwrite & Collect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
