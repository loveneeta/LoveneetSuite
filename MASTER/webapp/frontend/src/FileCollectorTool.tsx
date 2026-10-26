import React, { useState, useMemo, useRef } from "react";
import {
  FolderSync,
  FolderSearch,
  FolderCheck,
  FolderOpen,
  FolderTree,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  LoaderCircle,
  Copy,
  FileText,
  Search,
  X,
  ShieldCheck,
  ExternalLink,
  Layers,
  Sparkles,
  RefreshCw,
  Eye,
  FileCheck2,
  FileSpreadsheet
} from "lucide-react";
import JSZip from "jszip";
import "./file-collector.css";

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
  fileBlob?: File;
}

export default function FileCollectorTool() {
  // Mode: "desktop" (FastAPI local filesystem) or "browser" (HTML5 webkitdirectory / JSZip)
  const [activeTab, setActiveTab] = useState<"desktop" | "browser">("desktop");

  // Inputs
  const [inputFolder, setInputFolder] = useState<string>("");
  const [outputFolder, setOutputFolder] = useState<string>("");
  const [includeSubfolders, setIncludeSubfolders] = useState<boolean>(true);
  const [includeHidden, setIncludeHidden] = useState<boolean>(false);
  const [prefixSubfolders, setPrefixSubfolders] = useState<boolean>(true);
  const [duplicateMode, setDuplicateMode] = useState<"rename" | "skip" | "overwrite">("rename");

  // Scanned State
  const [scannedFiles, setScannedFiles] = useState<ScannedFileItem[]>([]);
  const [totalFound, setTotalFound] = useState<number>(0);
  const [totalDuplicates, setTotalDuplicates] = useState<number>(0);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>("");

  // Collection State
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

  // Status message
  const [alertNotice, setAlertNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Overwrite confirmation modal
  const [showOverwriteModal, setShowOverwriteModal] = useState<boolean>(false);

  // Browser mode uploaded files
  const [browserFiles, setBrowserFiles] = useState<File[]>([]);
  const cancelRequestedRef = useRef<boolean>(false);

  // Helper to suggest output directory when input changes
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
    setCollectionDone(false);
  };

  // Modern Directory Picker for Chrome/Edge (File System Access API)
  const handlePickDirectory = async (forTarget: "input" | "output") => {
    if ("showDirectoryPicker" in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        if (forTarget === "input") {
          handleInputChange(dirHandle.name);
          setAlertNotice({
            type: "info",
            text: `Selected folder: "${dirHandle.name}". If running with the local backend, you can also paste the full local path (e.g. C:\\Users\\...\\${dirHandle.name}).`
          });
        } else {
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

  // Scan files via local backend API
  const handleScanDesktop = async () => {
    if (!inputFolder.trim()) {
      setAlertNotice({ type: "error", text: "Please enter or select an input folder path." });
      return;
    }

    setIsScanning(true);
    setAlertNotice(null);
    setCollectionDone(false);
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
          duplicate_mode: duplicateMode
        })
      });

      if (!res.ok) {
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
      setTotalDuplicates(data.total_duplicates || 0);
      if (data.output_folder) {
        setOutputFolder(data.output_folder);
      }
      setAlertNotice({
        type: "success",
        text: `Scan complete: Found ${data.total_found} file(s) across subfolders. Ready to collect.`
      });
    } catch (err: any) {
      setAlertNotice({
        type: "error",
        text: err.message || "Failed to scan folder. Ensure the backend server is running and folder path is correct."
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Execute collection via local backend
  const handleStartCollection = async () => {
    if (duplicateMode === "overwrite") {
      setShowOverwriteModal(true);
      return;
    }
    await executeCollection();
  };

  const executeCollection = async () => {
    setShowOverwriteModal(false);
    if (!inputFolder.trim()) {
      setAlertNotice({ type: "error", text: "Please specify an input folder." });
      return;
    }

    setIsCollecting(true);
    cancelRequestedRef.current = false;
    setCollectionDone(false);
    setCollectionErrors([]);
    setCollectProgress({
      copied: 0,
      skipped: 0,
      failed: 0,
      total: totalFound || scannedFiles.length || 1,
      currentFile: "Starting collection...",
      percent: 10
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
          duplicate_mode: duplicateMode
        })
      });

      if (!res.ok) {
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
      setCollectionDone(true);
      setAlertNotice({
        type: "success",
        text: `Collection finished! ${data.copied} file(s) copied safely into "${data.output_folder}".`
      });
    } catch (err: any) {
      setAlertNotice({
        type: "error",
        text: err.message || "Collection failed. Check folder write permissions."
      });
    } finally {
      setIsCollecting(false);
    }
  };

  // Open output folder in Windows Explorer
  const handleOpenFolder = async () => {
    const target = lastOutputFolder || outputFolder;
    if (!target) return;
    try {
      const res = await fetch("/api/collector/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: target })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Could not open folder (Status ${res.status})`);
      }
      setAlertNotice({
        type: "info",
        text: `Opened "${target}" in File Explorer.`
      });
    } catch (err: any) {
      setAlertNotice({
        type: "info",
        text: `Output directory: ${target}. (Note: opening in Explorer is only supported when running the local backend server).`
      });
    }
  };

  // Export error / processing report
  const handleExportReport = () => {
    const lines = [
      "==================================================",
      "Loveneet Suite — File Collector Processing Report",
      `Date: ${new Date().toLocaleString()}`,
      `Input Folder: ${inputFolder}`,
      `Output Folder: ${lastOutputFolder || outputFolder}`,
      `Prefix with Subfolders: ${prefixSubfolders ? "Enabled" : "Disabled"}`,
      `Duplicate Handling: ${duplicateMode}`,
      "==================================================",
      "",
      `Total Found: ${totalFound}`,
      `Successfully Copied: ${collectProgress.copied}`,
      `Duplicates Skipped: ${collectProgress.skipped}`,
      `Failed Operations: ${collectProgress.failed}`,
      ""
    ];

    if (collectionErrors.length > 0) {
      lines.push("--- FAILURES & WARNINGS ---");
      collectionErrors.forEach((e, idx) => {
        lines.push(`${idx + 1}. File: ${e.file}`);
        lines.push(`   Error: ${e.error}`);
      });
      lines.push("");
    }

    lines.push("--- SCANNED & PROCESSED FILES ---");
    scannedFiles.forEach((item, idx) => {
      lines.push(
        `[${idx + 1}] ${item.relative_path} -> ${item.target_filename} (${item.status})`
      );
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    saveAs(blob, "file_collector_report.txt");
  };

  // Browser Mode (Dropzone / webkitdirectory)
  const handleBrowserFolderSelect = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const allFiles = Array.from(filesList);
    setBrowserFiles(allFiles);

    // Compute preview client-side using identical rules
    const usedNames = new Set<string>();
    const items: ScannedFileItem[] = [];
    let dups = 0;

    for (const f of allFiles) {
      const relPath = (f as any).webkitRelativePath || f.name;
      const parts = relPath.split("/").filter(Boolean);

      // Check hidden
      const isHidden = parts.some((p: string) => p.startsWith("."));
      if (!includeHidden && isHidden) continue;

      const filename = parts[parts.length - 1];
      const subfolders = parts.slice(1, -1); // exclude root folder from prefix!

      let baseName = filename;
      if (prefixSubfolders && subfolders.length > 0) {
        baseName = `${subfolders.join("-")}-${filename}`;
      }

      const stem = baseName.lastIndexOf(".") !== -1 ? baseName.substring(0, baseName.lastIndexOf(".")) : baseName;
      const ext = baseName.lastIndexOf(".") !== -1 ? baseName.substring(baseName.lastIndexOf(".")) : "";

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
            const cand = `${stem} (${i})${ext}`;
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
        fileBlob: f
      });
    }

    setScannedFiles(items);
    setTotalFound(items.length);
    setTotalDuplicates(dups);
    setAlertNotice({
      type: "success",
      text: `Loaded ${items.length} file(s) from selected folder. Ready to export.`
    });
  };

  // Browser Mode ZIP export
  const handleBrowserZipExport = async () => {
    if (!scannedFiles.length) return;
    setIsCollecting(true);
    setCollectionDone(false);
    try {
      const zip = new JSZip();
      let count = 0;
      for (const item of scannedFiles) {
        if (item.status === "duplicate_skipped") continue;
        if (item.fileBlob) {
          zip.file(item.target_filename, item.fileBlob);
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

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "Collected_Files.zip");
      setCollectionDone(true);
      setAlertNotice({
        type: "success",
        text: `Successfully collected ${count} file(s) into "Collected_Files.zip"!`
      });
    } catch (err: any) {
      setAlertNotice({
        type: "error",
        text: `Browser ZIP export failed: ${err.message}`
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
      {/* Feature Badges */}
      <div className="collector-badges">
        <span className="collector-badge">
          <Copy size={13} /> Copy-Only (Safe)
        </span>
        <span className="collector-badge">
          <FolderTree size={13} /> Subfolder Prefixing
        </span>
        <span className="collector-badge">
          <ShieldCheck size={13} /> Zero Overwrite Protection
        </span>
        <span className="collector-badge">
          <Layers size={13} /> Universal File Support
        </span>
      </div>

      {/* Main Configuration Panel */}
      <section className="collector-panel">
        <div className="collector-panel-head">
          <div className="collector-step-num">01</div>
          <div>
            <h3>Folder & Collection Settings</h3>
            <p>
              Select an input directory to scan. Files from all nested folders will be collected and flattened into the destination folder.
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
          <>
            {/* Input & Output Inputs */}
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
                    placeholder="e.g. C:\Users\Username\Products"
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
                    placeholder="e.g. C:\Users\Username\Products\Collected_Files"
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
          </>
        ) : (
          /* Browser Folder Dropzone */
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
              <small>e.g. Chairs-Wooden-Chair01.abc</small>
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

        {/* Action Controls */}
        <div className="collector-actions">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {activeTab === "desktop" ? (
              <button
                type="button"
                className="collector-btn-secondary"
                disabled={isScanning || isCollecting || !inputFolder.trim()}
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
                (activeTab === "desktop" && (!inputFolder.trim() || isScanning)) ||
                (activeTab === "browser" && scannedFiles.length === 0)
              }
              onClick={activeTab === "desktop" ? handleStartCollection : handleBrowserZipExport}
            >
              {isCollecting ? (
                <>
                  <LoaderCircle className="spinner" size={16} /> Collecting Files…
                </>
              ) : (
                <>
                  <Copy size={16} /> Start Collection
                </>
              )}
            </button>

            {isCollecting && (
              <button
                type="button"
                className="collector-btn-danger"
                onClick={() => {
                  cancelRequestedRef.current = true;
                  setIsCollecting(false);
                  setAlertNotice({ type: "info", text: "Collection cancelled by user." });
                }}
              >
                <X size={15} /> Cancel
              </button>
            )}
          </div>

          {/* Quick Stats or Output Indicator */}
          {totalFound > 0 && (
            <div style={{ fontSize: 12.5, color: "#94a3b8" }}>
              <strong style={{ color: "#f8fafc" }}>{totalFound}</strong> eligible files found
              {totalDuplicates > 0 && (
                <span style={{ color: "#fbbf24", marginLeft: 8 }}>
                  ({totalDuplicates} duplicate names managed)
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

      {/* Collection Progress & Post-Collection Actions */}
      {(isCollecting || collectionDone) && (
        <section className="collector-panel">
          <div className="collector-progress-wrap">
            <div className="collector-progress-info">
              <div>
                <strong>{collectionDone ? "Collection Finished" : "Copying Files..."}</strong>
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

            {/* Counters */}
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
                  <FileText size={16} /> Export Error / Processing Report
                </button>
                <button
                  type="button"
                  className="collector-btn-secondary"
                  onClick={() => {
                    setCollectionDone(false);
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
                Review source paths and how files will be named in the destination folder. Original files are never modified.
              </p>
            </div>
          </div>

          <div className="collector-table-wrap">
            <div className="collector-table-controls">
              <div className="collector-table-search">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filter scanned files..."
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
