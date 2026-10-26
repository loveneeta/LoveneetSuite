import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Upload,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Image as ImageIcon,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Layers,
  Lock,
  Unlock,
  Info,
  RefreshCw
} from "lucide-react";
import {
  ImageCompressionOptions,
  CompressedImageResult,
  compressSingleImage,
  convertImagesLocally,
  formatBytes
} from "./services/imageTools";

interface ImageFileInfo {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

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

export default function ImageConverterTool() {
  const [files, setFiles] = useState<ImageFileInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [outputFormat, setOutputFormat] = useState<"jpg" | "png" | "webp" | "bmp" | "tiff">("jpg");
  const [mode, setMode] = useState<"balanced" | "target" | "percentage" | "lossless">("balanced");
  const [quality, setQuality] = useState<number>(92);
  const [targetSize, setTargetSize] = useState<number>(500);
  const [targetUnit, setTargetUnit] = useState<"KB" | "MB">("KB");
  const [percentReduction, setPercentReduction] = useState<number>(50);

  // Resizing options (Default: OFF, aspect ratio lock ON)
  const [enableResize, setEnableResize] = useState<boolean>(false);
  const [preserveAspect, setPreserveAspect] = useState<boolean>(true);
  const [resizeWidth, setResizeWidth] = useState<string>("");
  const [resizeHeight, setResizeHeight] = useState<string>("");

  // Live preview state
  const [previewResult, setPreviewResult] = useState<CompressedImageResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  // Batch conversion state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number; filename: string; percent: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read dimensions when files are selected
  const handleFilesAdded = async (newFiles: FileList | File[]) => {
    setStatusMessage(null);
    const addedList: ImageFileInfo[] = [];

    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|bmp|tiff?|heic|heif)$/i.test(file.name)) {
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      const dims = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = previewUrl;
      });

      addedList.push({
        file,
        previewUrl,
        width: dims.width,
        height: dims.height
      });
    }

    if (addedList.length > 0) {
      setFiles((prev) => [...prev, ...addedList]);
      if (files.length === 0) {
        setSelectedIndex(0);
      }
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
    if (selectedIndex >= index && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleClearAll = () => {
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setSelectedIndex(0);
    setPreviewResult(null);
    setStatusMessage(null);
  };

  const activeImage = files[selectedIndex] || null;

  // Auto-calculate width/height when ratio is locked
  const handleWidthChange = (val: string) => {
    setResizeWidth(val);
    if (preserveAspect && activeImage && activeImage.width > 0 && activeImage.height > 0) {
      const numW = parseInt(val, 10);
      if (!isNaN(numW) && numW > 0) {
        const calculatedH = Math.round((numW * activeImage.height) / activeImage.width);
        setResizeHeight(String(calculatedH));
      } else if (val === "") {
        setResizeHeight("");
      }
    }
  };

  const handleHeightChange = (val: string) => {
    setResizeHeight(val);
    if (preserveAspect && activeImage && activeImage.width > 0 && activeImage.height > 0) {
      const numH = parseInt(val, 10);
      if (!isNaN(numH) && numH > 0) {
        const calculatedW = Math.round((numH * activeImage.width) / activeImage.height);
        setResizeWidth(String(calculatedW));
      } else if (val === "") {
        setResizeWidth("");
      }
    }
  };

  const applyScalePreset = (percent: number) => {
    if (!activeImage || activeImage.width <= 0) return;
    const targetW = Math.round((activeImage.width * percent) / 100);
    const targetH = Math.round((activeImage.height * percent) / 100);
    setEnableResize(true);
    setResizeWidth(String(targetW));
    setResizeHeight(String(targetH));
  };

  // Build current compression options
  const currentOptions: ImageCompressionOptions = useMemo(() => {
    return {
      outputFormat,
      mode,
      quality,
      targetSize,
      targetUnit,
      percentReduction,
      enableResize,
      resizeWidth: enableResize && resizeWidth ? parseInt(resizeWidth, 10) : undefined,
      resizeHeight: enableResize && resizeHeight ? parseInt(resizeHeight, 10) : undefined,
      preserveAspect,
      lossless: mode === "lossless"
    };
  }, [
    outputFormat,
    mode,
    quality,
    targetSize,
    targetUnit,
    percentReduction,
    enableResize,
    resizeWidth,
    resizeHeight,
    preserveAspect
  ]);

  // Generate live before-and-after preview for active image
  useEffect(() => {
    if (!activeImage) {
      setPreviewResult(null);
      return;
    }

    let isSubscribed = true;
    setPreviewLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await compressSingleImage(activeImage.file, currentOptions);
        if (isSubscribed) {
          setPreviewResult(res);
        }
      } catch (err: any) {
        console.warn("Live preview failed:", err);
      } finally {
        if (isSubscribed) {
          setPreviewLoading(false);
        }
      }
    }, 200);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [activeImage, currentOptions]);

  // Batch convert all files
  const handleBatchConvert = async () => {
    if (files.length === 0) {
      setStatusMessage({ type: "error", text: "Please select at least one image to convert." });
      return;
    }

    setIsProcessing(true);
    setStatusMessage(null);
    setProgress({ current: 0, total: files.length, filename: "Starting...", percent: 0 });

    try {
      const rawFiles = files.map((f) => f.file);
      const { zipBlob, results } = await convertImagesLocally(
        rawFiles,
        currentOptions,
        (p) => setProgress(p)
      );

      const totalOrig = results.reduce((sum, r) => sum + r.originalSize, 0);
      const totalComp = results.reduce((sum, r) => sum + r.compressedSize, 0);
      const savedPct = totalOrig > 0 ? Math.max(0, Math.round(((totalOrig - totalComp) / totalOrig) * 100)) : 0;

      if (results.length === 1) {
        // Single file: download directly without ZIP
        saveAs(results[0].blob, results[0].targetFilename);
        setStatusMessage({
          type: "success",
          text: `Success! Converted "${results[0].targetFilename}". Reduced size by ${savedPct}% (${formatBytes(totalOrig)} → ${formatBytes(totalComp)}). Downloaded directly.`
        });
      } else if (results.length === 2) {
        // 2 files: download both directly without ZIP
        saveAs(results[0].blob, results[0].targetFilename);
        setTimeout(() => {
          saveAs(results[1].blob, results[1].targetFilename);
        }, 350);
        setStatusMessage({
          type: "success",
          text: `Success! Converted 2 images ("${results[0].targetFilename}", "${results[1].targetFilename}"). Reduced size by ${savedPct}% (${formatBytes(totalOrig)} → ${formatBytes(totalComp)}). Both downloaded directly.`
        });
      } else {
        // More than 2 files: package into ZIP
        saveAs(zipBlob, "converted_images.zip");
        setStatusMessage({
          type: "success",
          text: `Success! Converted ${results.length} images to ${outputFormat.toUpperCase()}. Reduced total size by ${savedPct}% (${formatBytes(totalOrig)} → ${formatBytes(totalComp)}). Downloaded as converted_images.zip.`
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Conversion failed. Please try again."
      });
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const getQualityGuidance = (q: number) => {
    if (q >= 95) return { title: "Maximum Studio Quality", desc: "Virtually indistinguishable from original. Recommended for master product photos & fine textures." };
    if (q >= 90) return { title: "Very High (Recommended)", desc: "Optimal balance of rich colour fidelity, fine edge sharpness, and solid file size reduction." };
    if (q >= 80) return { title: "High Quality", desc: "Great visual sharpness with noticeable file size savings. Excellent for web catalogues." };
    if (q >= 70) return { title: "Medium Quality", desc: "Standard web compression. Suitable when smaller download size is a priority." };
    return { title: "Compact Mode", desc: "Aggressive compression. May introduce minor compression artifacts in flat or highly detailed regions." };
  };

  const guidance = getQualityGuidance(quality);

  return (
    <div className="converter-shell">
      {/* Hero header */}
      <section className="converter-hero">
        <div className="converter-hero-text">
          <p className="converter-eyebrow">Offline-First Image Optimization Engine</p>
          <h2>Format-Aware Image Converter & Smart Compression</h2>
          <p>
            Preserve authentic sRGB colours, full dynamic range, EXIF orientation, and sharp details while drastically reducing file sizes.
            Converts 100% locally in your browser or desktop app with zero cloud uploads or third-party servers.
          </p>
        </div>
        <div className="converter-hero-badge">
          <Sparkles size={20} color="#38bdf8" />
          <span>True Color<br />Engine</span>
        </div>
      </section>

      {/* Main 2-column configuration layout */}
      <div className="converter-grid">
        {/* Left Column: Input files & settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Step 1: File selection */}
          <section className="converter-card">
            <div className="converter-card-head">
              <div className="converter-card-title">
                <span className="converter-step-num">01</span>
                <h3>Choose Images</h3>
              </div>
              {files.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#f87171",
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  <Trash2 size={13} /> Clear all
                </button>
              )}
            </div>

            <div
              className="converter-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleFilesAdded(e.dataTransfer.files);
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,.heic,.heif"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFilesAdded(e.target.files);
                  }
                }}
              />
              <div className="converter-drop-icon">
                <Upload size={20} />
              </div>
              <strong style={{ fontSize: 13, color: "#f1f5f9" }}>Click to select or drag images here</strong>
              <small style={{ fontSize: 11.5, color: "#64748b" }}>
                Supports JPG, PNG, WEBP, BMP, TIFF, HEIC · Multi-file batch selection
              </small>
            </div>

            {files.length > 0 && (
              <div className="converter-file-list">
                {files.map((item, idx) => (
                  <div
                    key={idx}
                    className={`converter-file-item ${idx === selectedIndex ? "active" : ""}`}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <div className="converter-file-name">
                      <ImageIcon size={14} color={idx === selectedIndex ? "#38bdf8" : "#64748b"} />
                      <span>{item.file.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        {item.width > 0 ? `${item.width}×${item.height} · ` : ""}
                        {formatBytes(item.file.size)}
                      </span>
                      <button
                        type="button"
                        className="converter-remove-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(idx);
                        }}
                        title="Remove file"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Step 2: Format & Compression Settings */}
          <section className="converter-card">
            <div className="converter-card-head">
              <div className="converter-card-title">
                <span className="converter-step-num">02</span>
                <h3>Conversion & Compression Strategy</h3>
              </div>
            </div>

            {/* Output format */}
            <div className="converter-field">
              <label className="converter-field-label">
                <span>Output Format</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  {outputFormat === "jpg"
                    ? "Best for photographs & product shots"
                    : outputFormat === "webp"
                    ? "Modern web standard (compact + alpha)"
                    : outputFormat === "png"
                    ? "Lossless full-colour with transparency"
                    : outputFormat === "bmp"
                    ? "Standard uncompressed bitmap"
                    : "High-depth uncompressed TIFF"}
                </span>
              </label>
              <select
                className="converter-select"
                value={outputFormat}
                onChange={(e) => {
                  const fmt = e.target.value as any;
                  setOutputFormat(fmt);
                  if (fmt === "png" || fmt === "bmp" || fmt === "tiff") {
                    setMode("lossless");
                  } else if (mode === "lossless") {
                    setMode("balanced");
                  }
                }}
              >
                <option value="jpg">JPG / JPEG (Standard photo format with sRGB & EXIF)</option>
                <option value="webp">WEBP (Modern high-efficiency format with transparency)</option>
                <option value="png">PNG (Lossless 32-bit transparent format)</option>
                <option value="bmp">BMP (Windows Bitmap format)</option>
                <option value="tiff">TIFF (Archival TIFF format)</option>
              </select>
            </div>

            {/* Mode selector */}
            <div className="converter-field">
              <label className="converter-field-label">
                <span>Optimization Mode</span>
              </label>
              <div className="converter-modes">
                <button
                  type="button"
                  className={`converter-mode-btn ${mode === "balanced" ? "active" : ""}`}
                  onClick={() => setMode("balanced")}
                >
                  <Sparkles size={16} />
                  <div>
                    <strong>Balanced Quality</strong>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>Preserves fine visual details (92%)</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`converter-mode-btn ${mode === "target" ? "active" : ""}`}
                  onClick={() => setMode("target")}
                >
                  <Sliders size={16} />
                  <div>
                    <strong>Target File Size</strong>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>e.g. 500 KB bounded search</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`converter-mode-btn ${mode === "percentage" ? "active" : ""}`}
                  onClick={() => setMode("percentage")}
                >
                  <Layers size={16} />
                  <div>
                    <strong>Percentage Reduction</strong>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>e.g. 50% or 70% smaller</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`converter-mode-btn ${mode === "lossless" ? "active" : ""}`}
                  onClick={() => setMode("lossless")}
                >
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>Lossless Mode</strong>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>Exact pixel preservation</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Target Size Options */}
            {mode === "target" && (
              <div className="converter-field" style={{ background: "#0a1120", padding: 12, borderRadius: 8, border: "1px solid #1a253c" }}>
                <label className="converter-field-label">
                  <span>Target File Size</span>
                  <span style={{ fontSize: 11, color: "#38bdf8" }}>Bounded quality floor (≥45%) prevents degradation</span>
                </label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="number"
                    min="10"
                    max="50000"
                    className="converter-input"
                    style={{ flex: 1 }}
                    value={targetSize}
                    onChange={(e) => setTargetSize(Math.max(1, parseInt(e.target.value, 10) || 0))}
                  />
                  <select
                    className="converter-select"
                    style={{ width: 100 }}
                    value={targetUnit}
                    onChange={(e) => setTargetUnit(e.target.value as any)}
                  >
                    <option value="KB">KB</option>
                    <option value="MB">MB</option>
                  </select>
                </div>
              </div>
            )}

            {/* Percentage Reduction Options */}
            {mode === "percentage" && (
              <div className="converter-field" style={{ background: "#0a1120", padding: 12, borderRadius: 8, border: "1px solid #1a253c" }}>
                <label className="converter-field-label">
                  <span>Target Size Reduction</span>
                  <strong style={{ color: "#38bdf8" }}>{percentReduction}% smaller</strong>
                </label>
                <div className="converter-slider-line">
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="5"
                    value={percentReduction}
                    onChange={(e) => setPercentReduction(parseInt(e.target.value, 10))}
                  />
                </div>
                <small style={{ fontSize: 11, color: "#94a3b8" }}>
                  Reduces the file size while maintaining pixel dimensions and colour accuracy.
                </small>
              </div>
            )}

            {/* Quality Slider (for Balanced mode) */}
            {mode === "balanced" && (
              <div className="converter-quality-box">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 12, color: "#f1f5f9" }}>Compression Quality</strong>
                  <span className="converter-quality-badge">{quality}%</span>
                </div>
                <div className="converter-slider-line">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={quality}
                    onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                  />
                </div>
                <div className="converter-quality-desc">
                  <strong style={{ color: "#38bdf8" }}>{guidance.title}:</strong> {guidance.desc}
                </div>
              </div>
            )}

            {/* Step 3: Resizing (OFF by default, aspect ratio locked) */}
            <div className="converter-resize-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#f1f5f9" }}>
                  <input
                    type="checkbox"
                    checked={enableResize}
                    onChange={(e) => {
                      setEnableResize(e.target.checked);
                      if (e.target.checked && activeImage && !resizeWidth && !resizeHeight) {
                        setResizeWidth(String(activeImage.width));
                        setResizeHeight(String(activeImage.height));
                      }
                    }}
                  />
                  <span>Enable Image Resizing</span>
                </label>
                {enableResize && (
                  <button
                    type="button"
                    onClick={() => setPreserveAspect(!preserveAspect)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: preserveAspect ? "#38bdf8" : "#94a3b8",
                      fontSize: 11.5,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    {preserveAspect ? <Lock size={13} /> : <Unlock size={13} />}
                    <span>{preserveAspect ? "Aspect Ratio Locked" : "Free Ratio"}</span>
                  </button>
                )}
              </div>

              {!enableResize ? (
                <div style={{ fontSize: 11.5, color: "#64748b" }}>
                  Resizing is currently <strong>disabled</strong>. The original dimensions and aspect ratio will be preserved 100%.
                </div>
              ) : (
                <>
                  <div className="converter-dim-grid">
                    <div>
                      <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>Width (px)</label>
                      <input
                        type="number"
                        min="1"
                        max="16000"
                        className="converter-input"
                        placeholder="Width"
                        value={resizeWidth}
                        onChange={(e) => handleWidthChange(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>Height (px)</label>
                      <input
                        type="number"
                        min="1"
                        max="16000"
                        className="converter-input"
                        placeholder="Height"
                        value={resizeHeight}
                        onChange={(e) => handleHeightChange(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="converter-presets">
                    <span style={{ fontSize: 11, color: "#64748b", alignSelf: "center" }}>Scale Presets:</span>
                    <button type="button" className="converter-preset-btn" onClick={() => applyScalePreset(100)}>100%</button>
                    <button type="button" className="converter-preset-btn" onClick={() => applyScalePreset(75)}>75%</button>
                    <button type="button" className="converter-preset-btn" onClick={() => applyScalePreset(50)}>50%</button>
                    <button type="button" className="converter-preset-btn" onClick={() => applyScalePreset(25)}>25%</button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Live Before-and-After Inspection */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="converter-card" style={{ height: "100%" }}>
            <div className="converter-card-head">
              <div className="converter-card-title">
                <span className="converter-step-num">03</span>
                <h3>Before & After Live Inspection</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsZoomed(!isZoomed)}
                style={{
                  background: isZoomed ? "#1e293b" : "transparent",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  color: isZoomed ? "#38bdf8" : "#94a3b8",
                  padding: "4px 8px",
                  fontSize: 11.5,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}
              >
                {isZoomed ? <ZoomOut size={13} /> : <ZoomIn size={13} />}
                <span>{isZoomed ? "Reset Zoom" : "1:1 Zoom"}</span>
              </button>
            </div>

            {!activeImage ? (
              <div style={{ minHeight: 280, display: "grid", placeItems: "center", color: "#64748b", textAlign: "center", padding: 30 }}>
                <div>
                  <ImageIcon size={38} color="#1e293b" style={{ margin: "0 auto 12px" }} />
                  <p style={{ margin: 0, fontSize: 13 }}>Select an image from Step 1 to inspect live before-and-after results.</p>
                </div>
              </div>
            ) : (
              <div className="converter-preview-wrap">
                <div className="converter-preview-grid">
                  {/* Original Card */}
                  <div className="converter-preview-box">
                    <h4>
                      <span>Original</span>
                      <span style={{ color: "#64748b" }}>{activeImage.file.name.split(".").pop()?.toUpperCase()}</span>
                    </h4>
                    <div className={`converter-img-container ${isZoomed ? "zoom" : ""}`}>
                      <img src={activeImage.previewUrl} alt="Original Preview" />
                    </div>
                    <div className="converter-stat-row">
                      <span>Dimensions:</span>
                      <strong>{activeImage.width > 0 ? `${activeImage.width} × ${activeImage.height} px` : "Unknown"}</strong>
                    </div>
                    <div className="converter-stat-row">
                      <span>File Size:</span>
                      <strong>{formatBytes(activeImage.file.size)}</strong>
                    </div>
                  </div>

                  {/* Compressed Card */}
                  <div className="converter-preview-box">
                    <h4>
                      <span>Compressed Result</span>
                      <span style={{ color: "#38bdf8" }}>{outputFormat.toUpperCase()}</span>
                    </h4>
                    <div className={`converter-img-container ${isZoomed ? "zoom" : ""}`}>
                      {previewLoading ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "#38bdf8", fontSize: 12 }}>
                          <RefreshCw size={20} className="spin" />
                          <span>Generating preview...</span>
                        </div>
                      ) : previewResult ? (
                        <img src={previewResult.previewUrl} alt="Compressed Preview" />
                      ) : (
                        <span style={{ color: "#64748b", fontSize: 12 }}>Preview pending</span>
                      )}
                    </div>
                    <div className="converter-stat-row">
                      <span>Dimensions:</span>
                      <strong>
                        {previewResult && previewResult.outputWidth > 0
                          ? `${previewResult.outputWidth} × ${previewResult.outputHeight} px`
                          : activeImage.width > 0
                          ? `${activeImage.width} × ${activeImage.height} px`
                          : "Preserved"}
                      </strong>
                    </div>
                    <div className="converter-stat-row">
                      <span>File Size:</span>
                      <strong style={{ color: "#38bdf8" }}>
                        {previewResult ? formatBytes(previewResult.compressedSize) : "Calculating..."}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Savings and details */}
                {previewResult && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0b111e", padding: "10px 14px", borderRadius: 8, border: "1px solid #1a243a" }}>
                    <div className="converter-savings-badge">
                      {previewResult.percentReduction > 0 ? `-${previewResult.percentReduction}% file size reduction` : "Original size preserved"}
                    </div>
                    <button
                      type="button"
                      onClick={() => saveAs(previewResult.blob, previewResult.targetFilename)}
                      style={{
                        background: "transparent",
                        border: "1px solid #253350",
                        borderRadius: 6,
                        color: "#f1f5f9",
                        fontSize: 12,
                        padding: "5px 10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 5
                      }}
                    >
                      <Download size={13} /> Save this image
                    </button>
                  </div>
                )}

                {/* Alpha transparency note */}
                {outputFormat === "jpg" && activeImage.file.type.includes("png") && (
                  <div className="converter-warning-note">
                    <Info size={16} style={{ flexShrink: 0 }} />
                    <span>
                      <strong>Notice:</strong> JPEG does not support transparency. Transparent areas in this PNG will be cleanly filled with pure white.
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Notifications */}
      {statusMessage && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: statusMessage.type === "success" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
            border: `1px solid ${statusMessage.type === "success" ? "#059669" : "#dc2626"}`,
            color: statusMessage.type === "success" ? "#34d399" : "#f87171"
          }}
        >
          {statusMessage.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Action Bar */}
      <div className="converter-action-bar">
        <div>
          <strong style={{ fontSize: 13, color: "#f1f5f9" }}>
            {files.length} {files.length === 1 ? "image" : "images"} selected
          </strong>
          <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>
            Total original size: {formatBytes(files.reduce((sum, f) => sum + f.file.size, 0))}
          </span>
        </div>

        {isProcessing && progress ? (
          <div className="converter-progress-line">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#94a3b8" }}>
              <span>Processing {progress.filename} ({progress.current}/{progress.total})</span>
              <strong style={{ color: "#38bdf8" }}>{progress.percent}%</strong>
            </div>
            <div className="converter-progress-track">
              <div className="converter-progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="converter-btn-primary"
            disabled={files.length === 0 || isProcessing}
            onClick={handleBatchConvert}
          >
            <Download size={16} />
            <span>
              {files.length <= 1
                ? "Convert & Download Image"
                : files.length === 2
                ? "Convert & Download Images (2 files)"
                : "Convert & Download ZIP"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
