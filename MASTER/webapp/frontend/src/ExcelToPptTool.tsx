import React, { useState, useEffect } from "react";
import ExcelJS from "exceljs";
import {
  FileSpreadsheet,
  Presentation,
  Upload,
  Download,
  LoaderCircle,
  RotateCcw,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Save,
  Trash2,
  Layout,
  Sparkles,
  Info
} from "lucide-react";
import { storageAdapter } from "./services/platform";
import "./excel-ppt.css";

type Slot = { img: number[]; text: number[] };
type Mapping = {
  code: string;
  description: string;
  dim_cm: string;
  dim_in: string;
  price: string;
  length: string;
  width: string;
  height: string;
  image: string;
};
type SlideRatio = "16:9" | "4:3" | "A4 Landscape" | "A4 Portrait";

type TemplateSlot = {
  slot_index: number;
  text_elem_id: string;
  text_elem_name: string;
  text_rect: number[];
  img_rect: number[];
  template_text: string;
};

type TemplateSlideInfo = {
  slide_index: number;
  layout_name: string;
  elements: Array<{
    id: string;
    name: string;
    type: string;
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
    font_name: string;
    font_size: number;
    font_bold: boolean;
    font_color: string;
    is_product_candidate: boolean;
  }>;
  slots_count: number;
  slots: TemplateSlot[];
  is_product_slide: boolean;
};

type TemplateInspection = {
  slide_width_in: number;
  slide_height_in: number;
  aspect_ratio: string;
  total_slides: number;
  slides: TemplateSlideInfo[];
  recommended_product_slide: number;
};

type MappingProfile = {
  name: string;
  mapping: Mapping;
  imageFit: "contain" | "cover";
  selectedSlideIndex: number;
};

const DEFAULT_LAYOUT: Slot[] = [
  { img: [80, 130, 230, 230], text: [40, 310, 350, 390] },
  { img: [450, 130, 600, 230], text: [430, 310, 760, 390] }
];
const THREE_LAYOUT: Slot[] = [
  { img: [25, 85, 225, 235], text: [15, 260, 250, 345] },
  { img: [290, 85, 490, 235], text: [280, 260, 515, 345] },
  { img: [555, 85, 755, 235], text: [545, 260, 780, 345] }
];

const ROLE_DEFINITIONS: Array<{
  key: keyof Mapping;
  label: string;
  type: string;
  required: boolean;
  hint: string;
}> = [
  { key: "code", label: "SKU / Product Code", type: "Text Run (Bold)", required: true, hint: "Primary product identifier" },
  { key: "description", label: "Product Description", type: "Text Run", required: false, hint: "Item name or description" },
  { key: "dim_cm", label: "Product Dimension (CM)", type: "Text Line (Bold)", required: false, hint: "Dimensions in centimeters" },
  { key: "dim_in", label: "Dimension (Inch)", type: "Text Line (Bold)", required: false, hint: "Dimensions in inches" },
  { key: "price", label: "Price / Rate", type: "Text Line (Bold)", required: false, hint: "Product pricing" },
  { key: "image", label: "Product Picture", type: "Cell Image (PNG/JPG)", required: false, hint: "Embedded image in sheet" },
  { key: "length", label: "Length (Fallback)", type: "Number", required: false, hint: "Used if Dim CM not provided" },
  { key: "width", label: "Width (Fallback)", type: "Number", required: false, hint: "Used if Dim CM not provided" },
  { key: "height", label: "Height (Fallback)", type: "Number", required: false, hint: "Used if Dim CM not provided" }
];

const initialMapping: Mapping = {
  code: "",
  description: "",
  dim_cm: "",
  dim_in: "",
  price: "",
  length: "",
  width: "",
  height: "",
  image: ""
};

export default function ExcelToPptTool() {
  // File states
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Array<Record<string, any>>>([]);
  const [mapping, setMapping] = useState<Mapping>(initialMapping);

  // Template states
  const [useCustomTemplate, setUseCustomTemplate] = useState<boolean>(true);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateInfo, setTemplateInfo] = useState<TemplateInspection | null>(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState<number>(0);
  const [inspectingTemplate, setInspectingTemplate] = useState<boolean>(false);

  // Profiles
  const [profiles, setProfiles] = useState<MappingProfile[]>([]);
  const [currentProfileName, setCurrentProfileName] = useState<string>("");
  const [selectedProfileIndex, setSelectedProfileIndex] = useState<string>("");

  // Built-in mode layout states
  const [count, setCount] = useState<2 | 3>(3);
  const [layout, setLayout] = useState<Slot[]>(THREE_LAYOUT);
  const [fontSize, setFontSize] = useState<number>(18);
  const [fontName, setFontName] = useState<string>("Arial");
  const [fontColor, setFontColor] = useState<string>("000000");
  const [background, setBackground] = useState<string>("FFFFFF");
  const [ratio, setRatio] = useState<SlideRatio>("16:9");
  const [autoCenter, setAutoCenter] = useState<boolean>(true);
  const [imageFit, setImageFit] = useState<"contain" | "cover">("contain");
  const [headerText, setHeaderText] = useState<string>("PRODUCT COLLECTION");
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [showRule, setShowRule] = useState<boolean>(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Live preview pagination
  const [previewSlideIndex, setPreviewSlideIndex] = useState<number>(0);

  // Status & processing
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  // Load saved profiles from storageAdapter on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await storageAdapter.getSetting<MappingProfile[]>("excel_ppt_profiles", []);
        if (Array.isArray(saved) && saved.length > 0) {
          setProfiles(saved);
        }
      } catch (err) {
        console.warn("Could not load mapping profiles:", err);
      }
    })();
  }, []);

  const saveCurrentProfile = async () => {
    const name = currentProfileName.trim() || `Profile ${profiles.length + 1}`;
    const newProfile: MappingProfile = {
      name,
      mapping: { ...mapping },
      imageFit,
      selectedSlideIndex
    };
    const updated = [...profiles.filter(p => p.name.toLowerCase() !== name.toLowerCase()), newProfile];
    setProfiles(updated);
    setCurrentProfileName("");
    await storageAdapter.setSetting("excel_ppt_profiles", updated);
    setStatus(`Saved profile "${name}" successfully.`);
  };

  const loadProfile = (name: string) => {
    const p = profiles.find(item => item.name === name);
    if (!p) return;
    setMapping({ ...p.mapping });
    setImageFit(p.imageFit);
    setSelectedSlideIndex(p.selectedSlideIndex);
    setSelectedProfileIndex(name);
    setStatus(`Loaded profile "${name}".`);
  };

  const deleteProfile = async (name: string) => {
    const updated = profiles.filter(p => p.name !== name);
    setProfiles(updated);
    if (selectedProfileIndex === name) setSelectedProfileIndex("");
    await storageAdapter.setSetting("excel_ppt_profiles", updated);
    setStatus(`Deleted profile "${name}".`);
  };

  // Handle Excel Upload
  const chooseFile = async (next: File | null) => {
    setFile(next);
    setHeaders([]);
    setSampleRows([]);
    setStatus("");
    if (!next) return;
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await next.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        setStatus("No worksheets found in this workbook.");
        return;
      }

      // Collect headers from row 1 and row 2 (supports multi-row headers)
      const r1 = (sheet.getRow(1).values as Array<unknown> || []).slice(1).map(v => String(v ?? "").trim()).filter(Boolean);
      let colNames = [...r1];
      if (r1.length < 3 && sheet.rowCount >= 2) {
        const r2 = (sheet.getRow(2).values as Array<unknown> || []).slice(1).map(v => String(v ?? "").trim()).filter(Boolean);
        colNames = Array.from(new Set([...r1, ...r2]));
      }
      setHeaders(colNames);

      // Extract sample data rows (up to 30 rows for live preview)
      const dataRows: Array<Record<string, any>> = [];
      const startRow = sheet.rowCount >= 3 && !sheet.getRow(2).getCell(1).value ? 3 : 2;
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber >= startRow && dataRows.length < 30) {
          const rowObj: Record<string, any> = {};
          colNames.forEach((hdr) => {
            // Find column index matching header in row 1 or 2
            let cIndex = -1;
            const r1Vals = sheet.getRow(1).values as Array<unknown>;
            const r2Vals = sheet.getRow(2).values as Array<unknown>;
            if (r1Vals) {
              const idx = r1Vals.findIndex(v => String(v ?? "").trim().toLowerCase() === hdr.toLowerCase());
              if (idx > 0) cIndex = idx;
            }
            if (cIndex === -1 && r2Vals) {
              const idx = r2Vals.findIndex(v => String(v ?? "").trim().toLowerCase() === hdr.toLowerCase());
              if (idx > 0) cIndex = idx;
            }
            if (cIndex > 0) {
              const val = row.getCell(cIndex).value;
              rowObj[hdr] = val !== null && val !== undefined ? String(val).trim() : "";
            }
          });
          if (Object.values(rowObj).some(Boolean)) {
            dataRows.push(rowObj);
          }
        }
      });
      setSampleRows(dataRows);

      // Intelligent Auto-Mapping
      const findCol = (...needles: string[]) =>
        colNames.find(h => needles.some(n => h.toLowerCase() === n.toLowerCase() || h.toLowerCase().includes(n.toLowerCase()))) ?? "";

      const autoMapped: Mapping = {
        code: findCol("buyer code", "sku", "item code", "product code", "code"),
        description: findCol("description", "product name", "product", "item name", "desc"),
        dim_cm: findCol("product dimension (cm)", "dimension (cm)", "dimensions (cm)", "dimension cm", "size cm", "size (cm)"),
        dim_in: findCol("carton dimension (inch)", "dimension (inch)", "dimensions (inch)", "dimension in", "size in", "size (inch)"),
        price: findCol("price", "mrp", "rate", "cost", "qyt"),
        length: findCol("length", " l", "len"),
        width: findCol("width", "breadth", " w", "wid"),
        height: findCol("height", " h", "hgt"),
        image: findCol("image", "photo", "picture", "img", "product image")
      };
      setMapping(autoMapped);
      setStatus(`Loaded ${colNames.length} columns and ${dataRows.length} product rows from Excel.`);
    } catch {
      setStatus("Could not read this workbook. Please upload a valid .xlsx file.");
    }
  };

  // Handle PPT Template Upload & Inspection
  const chooseTemplate = async (next: File | null) => {
    setTemplateFile(next);
    setTemplateInfo(null);
    if (!next) return;
    setInspectingTemplate(true);
    setStatus("Inspecting PowerPoint template structure & branding…");
    try {
      const formData = new FormData();
      formData.append("file", next);
      const res = await fetch("/api/ppt-template/inspect", {
        method: "POST",
        body: formData
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data: TemplateInspection = await res.json();
      setTemplateInfo(data);
      setSelectedSlideIndex(data.recommended_product_slide || 0);

      const activeSlide = data.slides[data.recommended_product_slide || 0];
      const slotsDetected = activeSlide ? activeSlide.slots_count : 3;
      if (slotsDetected === 2 || slotsDetected === 3) {
        setCount(slotsDetected as 2 | 3);
      }
      setStatus(`Template inspected successfully: ${data.total_slides} slide(s), ${slotsDetected} product slots per slide.`);
    } catch (e: any) {
      setStatus(`Could not inspect PowerPoint template: ${e.message}`);
    } finally {
      setInspectingTemplate(false);
    }
  };

  // Helpers for Preview Values
  const getPreviewVal = (colName: string): string => {
    if (!colName || sampleRows.length === 0) return "—";
    const val = sampleRows[0][colName];
    return val ? String(val) : "—";
  };

  // Calculate products per slide
  const activeSlideInfo = templateInfo?.slides[selectedSlideIndex];
  const productsPerSlide = useCustomTemplate && activeSlideInfo ? (activeSlideInfo.slots_count || 3) : count;
  const totalPreviewSlides = sampleRows.length > 0 ? Math.ceil(sampleRows.length / productsPerSlide) : 1;

  // Change slide preview page
  const prevSlide = () => setPreviewSlideIndex(p => Math.max(0, p - 1));
  const nextSlide = () => setPreviewSlideIndex(p => Math.min(totalPreviewSlides - 1, p + 1));

  // Current slide products
  const currentSlideProducts = sampleRows.slice(
    previewSlideIndex * productsPerSlide,
    (previewSlideIndex + 1) * productsPerSlide
  );

  // Layout change handlers for Built-in Mode
  const changeCount = (next: 2 | 3) => {
    setCount(next);
    setLayout(next === 2 ? DEFAULT_LAYOUT.map(s => ({ img: [...s.img], text: [...s.text] })) : THREE_LAYOUT.map(s => ({ img: [...s.img], text: [...s.text] })));
  };
  const resetLayout = () => {
    changeCount(count);
    setRatio("16:9");
    setAutoCenter(true);
  };
  const ratioValue = ratio === "4:3" ? 4 / 3 : ratio === "A4 Landscape" ? 297 / 210 : ratio === "A4 Portrait" ? 210 / 297 : 16 / 9;

  // Generate Presentation
  const generate = async () => {
    if (!file) {
      setStatus("Choose an Excel workbook first.");
      return;
    }
    if (!mapping.code) {
      setStatus("Select the product code / SKU column. Rows without a code are skipped.");
      return;
    }
    setBusy(true);
    setStatus("Generating high-fidelity PowerPoint presentation…");
    try {
      const body = new FormData();
      body.append("excel", file);
      body.append("mapping", JSON.stringify(mapping));
      body.append("layout", JSON.stringify(layout));
      body.append(
        "style",
        JSON.stringify({
          font_size: fontSize,
          font_name: fontName,
          font_color: fontColor.replace("#", ""),
          background_color: background.replace("#", ""),
          aspect_ratio: ratio,
          auto_center_image: autoCenter,
          image_fit: imageFit,
          header_text: headerText,
          show_header: showHeader,
          show_rule: showRule,
          selected_slide_index: selectedSlideIndex
        })
      );
      if (useCustomTemplate && templateFile) {
        body.append("template_pptx", templateFile);
      }
      if (logoFile) {
        body.append("logo", logoFile);
      }

      const response = await fetch("/api/excel-to-ppt", { method: "POST", body });
      if (!response.ok) {
        let message = `Generation failed (${response.status})`;
        try {
          message = (await response.json()).detail || message;
        } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.xlsx?$/i, "") + (useCustomTemplate && templateFile ? "_catalogue_custom.pptx" : "_catalogue.pptx");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatus("PowerPoint generated and downloaded successfully with original design preserved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected error while generating PowerPoint.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="excel-ppt">
      {/* Intro Header */}
      <section className="ep-intro">
        <div>
          <span>EXCEL TO POWERPOINT CATALOGUE</span>
          <h3>Generate Complete Presentations from Excel Data</h3>
          <p>
            Upload your custom PowerPoint template (e.g. <code>sop ppt.pptx</code>) or use our standard layout.
            Map your spreadsheet fields, preview live populated slides, and download an editable presentation preserving typography, vector branding, and borders.
          </p>
        </div>
        <FileSpreadsheet size={48} />
      </section>

      {/* Step 1: Excel Upload */}
      <section className="ep-panel">
        <div className="ep-title">
          <div>
            <b>01</b>
            <div>
              <h3>Upload Excel Workbook</h3>
              <p>Supports <code>.xlsx</code> sheets with product details and cell-anchored product images.</p>
            </div>
          </div>
          {file && (
            <span className="ep-badge ep-badge-success">
              <CheckCircle2 size={13} /> {headers.length} Columns · {sampleRows.length}+ Rows
            </span>
          )}
        </div>
        <label className="ep-drop">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => void chooseFile(e.target.files?.[0] ?? null)}
          />
          <Upload size={26} />
          <strong>{file ? file.name : "Click or drag an Excel workbook (.xlsx)"}</strong>
          <small>{file ? `${(file.size / 1024).toFixed(0)} KB · Ready to map` : "Supports multi-row headers and embedded cell photos"}</small>
        </label>
      </section>

      {/* Step 2: PowerPoint Template Selection */}
      <section className="ep-panel">
        <div className="ep-title">
          <div>
            <b>02</b>
            <div>
              <h3>PowerPoint Template Selection</h3>
              <p>Import a custom company template (e.g. <code>sop ppt.pptx</code>) or use the built-in clean layout.</p>
            </div>
          </div>
          <div className="ep-tab-switch">
            <button
              type="button"
              className={useCustomTemplate ? "active" : ""}
              onClick={() => setUseCustomTemplate(true)}
            >
              <Sparkles size={14} /> Custom PPT Template (.pptx)
            </button>
            <button
              type="button"
              className={!useCustomTemplate ? "active" : ""}
              onClick={() => setUseCustomTemplate(false)}
            >
              <Layout size={14} /> Built-in Standard Layout
            </button>
          </div>
        </div>

        {useCustomTemplate ? (
          <div className="ep-template-upload-box">
            <label className="ep-drop ep-drop-template">
              <input
                type="file"
                accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={e => void chooseTemplate(e.target.files?.[0] ?? null)}
              />
              {inspectingTemplate ? (
                <LoaderCircle className="ep-spin" size={28} />
              ) : (
                <Presentation size={28} />
              )}
              <strong>{templateFile ? templateFile.name : "Upload PowerPoint Base Template (.pptx)"}</strong>
              <small>
                {templateFile
                  ? `${(templateFile.size / 1024).toFixed(0)} KB · Template Loaded`
                  : "Upload sop ppt.pptx to preserve vector logo, divider line, typography and Noble Selections branding"}
              </small>
            </label>

            {templateInfo && (
              <div className="ep-template-summary-card">
                <div className="ep-summary-header">
                  <div>
                    <h4>Template Structure Detected</h4>
                    <p>
                      Dimensions: <b>{templateInfo.slide_width_in}″ × {templateInfo.slide_height_in}″</b> ({templateInfo.aspect_ratio} widescreen)
                      · Total Slides: <b>{templateInfo.total_slides}</b>
                    </p>
                  </div>
                  <span className="ep-badge ep-badge-blue">
                    {templateInfo.slides[selectedSlideIndex]?.slots_count || 3} Product Slots / Slide
                  </span>
                </div>

                {templateInfo.slides.length > 1 && (
                  <div className="ep-slide-selector">
                    <span>Select Product Page Layout Slide:</span>
                    <select
                      value={selectedSlideIndex}
                      onChange={e => setSelectedSlideIndex(Number(e.target.value))}
                    >
                      {templateInfo.slides.map((s, idx) => (
                        <option key={idx} value={idx}>
                          Slide {idx + 1} ({s.layout_name}) — {s.slots_count} Product Slots
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="ep-branding-tags">
                  <span className="ep-tag-item">
                    <CheckCircle2 size={12} /> Fixed Vector Logo (Group 2) Preserved
                  </span>
                  <span className="ep-tag-item">
                    <CheckCircle2 size={12} /> Fixed Header "NOBLE SELECTIONS" Preserved
                  </span>
                  <span className="ep-tag-item">
                    <CheckCircle2 size={12} /> Horizontal Divider Rule Preserved
                  </span>
                  <span className="ep-tag-item">
                    <CheckCircle2 size={12} /> Exact Font Typography & Formatting Maintained
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="ep-builtin-info">
            <p>
              Using Built-in standard template. You can customize slide shape, heading text, divider line,
              and upload an optional brand logo in Step 4 below.
            </p>
          </div>
        )}
      </section>

      {/* Step 3: Interactive Visual Mapping Table */}
      {headers.length > 0 && (
        <section className="ep-panel">
          <div className="ep-title">
            <div>
              <b>03</b>
              <div>
                <h3>Interactive Column Mapping & Field Assignment</h3>
                <p>Assign Excel spreadsheet columns to PowerPoint elements. Verify preview values before generation.</p>
              </div>
            </div>
            {/* Profile Management Controls */}
            <div className="ep-profile-bar">
              {profiles.length > 0 && (
                <select
                  value={selectedProfileIndex}
                  onChange={e => loadProfile(e.target.value)}
                  className="ep-profile-select"
                >
                  <option value="">— Load Saved Profile —</option>
                  {profiles.map(p => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                placeholder="New profile name…"
                value={currentProfileName}
                onChange={e => setCurrentProfileName(e.target.value)}
                className="ep-profile-input"
              />
              <button
                type="button"
                onClick={saveCurrentProfile}
                className="ep-btn-subtle"
                title="Save mapping configuration for future re-use"
              >
                <Save size={13} /> Save Profile
              </button>
              {selectedProfileIndex && (
                <button
                  type="button"
                  onClick={() => deleteProfile(selectedProfileIndex)}
                  className="ep-btn-subtle ep-btn-danger"
                  title="Delete selected profile"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="ep-table-container">
            <table className="ep-mapping-table">
              <thead>
                <tr>
                  <th>PPT Element / Role</th>
                  <th>Element Type</th>
                  <th>Assigned Excel Column</th>
                  <th>Sample Value (Row 1)</th>
                  <th>Mapping Status</th>
                </tr>
              </thead>
              <tbody>
                {ROLE_DEFINITIONS.map(def => {
                  const mappedCol = mapping[def.key];
                  const previewVal = getPreviewVal(mappedCol);
                  const isMapped = Boolean(mappedCol);

                  return (
                    <tr key={def.key} className={isMapped ? "row-mapped" : def.required ? "row-required" : ""}>
                      <td className="cell-role">
                        <strong>{def.label}</strong>
                        {def.required && <span className="req-star">*</span>}
                        <small>{def.hint}</small>
                      </td>
                      <td className="cell-type">
                        <span className="ep-type-pill">{def.type}</span>
                      </td>
                      <td className="cell-select">
                        <select
                          value={mappedCol}
                          onChange={e => setMapping(prev => ({ ...prev, [def.key]: e.target.value }))}
                        >
                          <option value="">— Not mapped —</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="cell-preview">
                        <code>{def.key === "image" && isMapped ? "[Embedded Cell Image]" : previewVal}</code>
                      </td>
                      <td className="cell-status">
                        {isMapped ? (
                          <span className="status-pill status-mapped">
                            <CheckCircle2 size={12} /> Mapped
                          </span>
                        ) : def.required ? (
                          <span className="status-pill status-required">
                            <AlertCircle size={12} /> Required
                          </span>
                        ) : (
                          <span className="status-pill status-optional">Optional</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Fixed Template Elements (Shown when custom template is active) */}
                {useCustomTemplate && (
                  <>
                    <tr className="row-fixed">
                      <td className="cell-role">
                        <strong>Fixed Header: "NOBLE SELECTIONS"</strong>
                        <small>Static corporate branding shape</small>
                      </td>
                      <td className="cell-type">
                        <span className="ep-type-pill">Template Text</span>
                      </td>
                      <td className="cell-select">
                        <span className="cell-static-label">— Static Shape —</span>
                      </td>
                      <td className="cell-preview">
                        <code>NOBLE SELECTIONS (11pt ZCOOL)</code>
                      </td>
                      <td className="cell-status">
                        <span className="status-pill status-preserved">Preserved</span>
                      </td>
                    </tr>
                    <tr className="row-fixed">
                      <td className="cell-role">
                        <strong>Horizontal Divider Rule</strong>
                        <small>Divider connector line</small>
                      </td>
                      <td className="cell-type">
                        <span className="ep-type-pill">Template Line</span>
                      </td>
                      <td className="cell-select">
                        <span className="cell-static-label">— Static Shape —</span>
                      </td>
                      <td className="cell-preview">
                        <code>Connector 17 (Y=7.14″)</code>
                      </td>
                      <td className="cell-status">
                        <span className="status-pill status-preserved">Preserved</span>
                      </td>
                    </tr>
                    <tr className="row-fixed">
                      <td className="cell-role">
                        <strong>Vector Logo (Group 2)</strong>
                        <small>Corporate emblem at top-right</small>
                      </td>
                      <td className="cell-type">
                        <span className="ep-type-pill">Group Shape</span>
                      </td>
                      <td className="cell-select">
                        <span className="cell-static-label">— Static Shape —</span>
                      </td>
                      <td className="cell-preview">
                        <code>Group 2 (X=11.84″, Y=0.39″)</code>
                      </td>
                      <td className="cell-status">
                        <span className="status-pill status-preserved">Preserved</span>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Step 4: Product Image Fitting & Slide Controls */}
      <section className="ep-panel">
        <div className="ep-title">
          <div>
            <b>04</b>
            <div>
              <h3>Image Fitting & Presentation Settings</h3>
              <p>Configure how images scale inside slots and adjust layout parameters.</p>
            </div>
          </div>
        </div>

        {/* Image Fitting Option Cards */}
        <div className="ep-template-title">
          <h4>Product Image Fitting Mode</h4>
          <p>Strictly preserves original image aspect ratio. Never distorts or squashes product photos.</p>
        </div>
        <div className="ep-fit-options">
          <label className={imageFit === "contain" ? "selected" : ""}>
            <input
              type="radio"
              name="imageFit"
              checked={imageFit === "contain"}
              onChange={() => setImageFit("contain")}
            />
            <span className="ep-fit-icon ep-fit-contain" />
            <strong>Shrink & Fit (Contain)</strong>
            <small>Preserves whole image without cropping. Centers cleanly in image area.</small>
          </label>
          <label className={imageFit === "cover" ? "selected" : ""}>
            <input
              type="radio"
              name="imageFit"
              checked={imageFit === "cover"}
              onChange={() => setImageFit("cover")}
            />
            <span className="ep-fit-icon ep-fit-cover" />
            <strong>Crop & Fit (Cover)</strong>
            <small>Fills the entire product box. Edges trimmed symmetrically.</small>
          </label>
        </div>

        {/* If Built-in Mode, show font and layout controls */}
        {!useCustomTemplate && (
          <div className="ep-builtin-controls">
            <div className="ep-layout-options">
              <label className="ep-ratio-picker">
                <span>Slide shape</span>
                <select value={ratio} onChange={e => setRatio(e.target.value as SlideRatio)}>
                  <option>16:9</option>
                  <option>4:3</option>
                  <option>A4 Landscape</option>
                  <option>A4 Portrait</option>
                </select>
              </label>
              <button
                type="button"
                className={count === 2 ? "selected" : ""}
                onClick={() => changeCount(2)}
              >
                2 products per slide
              </button>
              <button
                type="button"
                className={count === 3 ? "selected" : ""}
                onClick={() => changeCount(3)}
              >
                3 products per slide
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={autoCenter}
                className={`ep-align-button ep-toggle ${autoCenter ? "is-on" : "is-off"}`}
                onClick={() => setAutoCenter(v => !v)}
              >
                <span className="ep-toggle-track">
                  <span className="ep-toggle-thumb" />
                </span>
                <span>Center images to text</span>
                <small>{autoCenter ? "ON" : "OFF"}</small>
              </button>
              <button type="button" className="ep-reset" onClick={resetLayout}>
                <RotateCcw size={14} /> Reset layout
              </button>
            </div>

            <div className="ep-template-options">
              <div className="ep-template-title">
                <h4>Header & Brand Template</h4>
                <p>Add a heading, a divider line and an optional corner logo.</p>
              </div>
              <label className="ep-header-field">
                <span>Heading text</span>
                <input
                  type="text"
                  value={headerText}
                  onChange={e => setHeaderText(e.target.value)}
                  placeholder="e.g. Beyond Wood — New Collection"
                />
              </label>
              <div className="ep-template-toggles">
                <label>
                  <input type="checkbox" checked={showHeader} onChange={e => setShowHeader(e.target.checked)} /> Show heading
                </label>
                <label>
                  <input type="checkbox" checked={showRule} onChange={e => setShowRule(e.target.checked)} /> Show divider line
                </label>
                <label>
                  <input type="checkbox" checked={autoCenter} onChange={e => setAutoCenter(e.target.checked)} /> Auto-center images over text
                </label>
              </div>
              <label className="ep-logo-upload">
                <Upload size={16} />
                <span>{logoFile ? logoFile.name : "Upload brand logo (PNG, JPG or SVG)"}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={e => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="ep-style-grid">
              <label>
                <span>Font size</span>
                <input type="number" min="8" max="48" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} />
              </label>
              <label>
                <span>Font family</span>
                <select value={fontName} onChange={e => setFontName(e.target.value)}>
                  <option>Arial</option>
                  <option>Calibri</option>
                  <option>Manrope</option>
                  <option>Times New Roman</option>
                </select>
              </label>
              <label>
                <span>Font color</span>
                <input type="color" value={`#${fontColor.replace("#", "")}`} onChange={e => setFontColor(e.target.value)} />
              </label>
              <label>
                <span>Slide background</span>
                <input type="color" value={`#${background.replace("#", "")}`} onChange={e => setBackground(e.target.value)} />
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Step 5: Live Slide Preview with Pager */}
      <section className="ep-panel">
        <div className="ep-title">
          <div>
            <b>05</b>
            <div>
              <h3>Live Interactive Slide Preview</h3>
              <p>Visualizing generated slide with actual Excel data, exact layout geometry, and brand elements.</p>
            </div>
          </div>
          <div className="ep-preview-pager">
            <button
              type="button"
              onClick={prevSlide}
              disabled={previewSlideIndex === 0}
              className="ep-pager-btn"
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span className="ep-pager-info">
              Slide <b>{previewSlideIndex + 1}</b> of <b>{totalPreviewSlides}</b>
            </span>
            <button
              type="button"
              onClick={nextSlide}
              disabled={previewSlideIndex >= totalPreviewSlides - 1}
              className="ep-pager-btn"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Visual Slide Canvas */}
        <div className="ep-live-slide-wrapper">
          <div
            className="ep-live-slide-canvas"
            style={{
              aspectRatio: useCustomTemplate ? "16 / 9" : String(ratioValue),
              backgroundColor: useCustomTemplate ? "#ffffff" : `#${background.replace("#", "")}`
            }}
          >
            {/* Top Bar / Fixed Template Branding */}
            {useCustomTemplate ? (
              <>
                <div className="ep-preview-top-brand">
                  <div className="ep-preview-noble-brand">NOBLE SELECTIONS</div>
                  <div className="ep-preview-vector-logo">
                    <span className="logo-icon">NS</span>
                    <span className="logo-sub">EST. 1988</span>
                  </div>
                </div>
                <div className="ep-preview-template-rule" />
              </>
            ) : (
              <>
                {showHeader && (
                  <div className="ep-preview-header" style={{ color: `#${fontColor.replace("#", "")}` }}>
                    {headerText || "Your heading"}
                    {logoFile && <span className="ep-preview-logo">{logoFile.name.slice(0, 18)}</span>}
                  </div>
                )}
                {showRule && <div className="ep-preview-rule" />}
              </>
            )}

            {/* Product Slots */}
            <div className={`ep-preview-slots-grid slots-${productsPerSlide}`}>
              {Array.from({ length: productsPerSlide }).map((_, slotIdx) => {
                const prod = currentSlideProducts[slotIdx];
                if (!prod) {
                  return (
                    <div key={slotIdx} className="ep-preview-slot-card slot-empty">
                      <div className="ep-slot-placeholder-img">
                        <small>Empty Slot (End of Catalogue)</small>
                      </div>
                    </div>
                  );
                }

                const skuVal = prod[mapping.code] || "SKU-00000";
                const descVal = prod[mapping.description] || "Product Description";
                const cmVal = prod[mapping.dim_cm] || (prod[mapping.length] && prod[mapping.width] && prod[mapping.height] ? `${prod[mapping.length]} x ${prod[mapping.width]} x ${prod[mapping.height]} CM` : "00.00 x 00.00 x 00.00 CM");
                const inVal = prod[mapping.dim_in] || "00.00 x 00.00 x 00.00 IN";
                const priceVal = prod[mapping.price] ? `PRICE : ${prod[mapping.price]}` : "";

                return (
                  <div key={slotIdx} className="ep-preview-slot-card">
                    <div className="ep-slot-image-box">
                      <div className="ep-slot-image-placeholder">
                        <ImageIcon size={32} />
                        <span>Product Photo</span>
                        <small>{imageFit === "contain" ? "Shrink & Fit" : "Crop & Fit"}</small>
                      </div>
                    </div>

                    <div className="ep-slot-info-box">
                      <div className="ep-info-line-1">
                        <b>{skuVal}</b> | <span>{descVal}</span>
                      </div>
                      <div className="ep-info-line-2">
                        <span>{cmVal}</span> | <span>{inVal}</span>
                      </div>
                      {priceVal && <div className="ep-info-line-3">{priceVal}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ep-preview-legend-row">
          <span>
            <Info size={14} /> Slide preview rendered in 16:9 widescreen format with actual records from your spreadsheet.
          </span>
          <span className="ep-legend-badge">
            {sampleRows.length} Total Records Loaded
          </span>
        </div>
      </section>

      {/* Action Generation Bar */}
      <div className="ep-action">
        <div>
          <strong>Ready to Generate</strong>
          <span>
            {file
              ? `Processing ${sampleRows.length || "all"} product items using ${useCustomTemplate && templateFile ? `template "${templateFile.name}"` : "built-in layout"}.`
              : "Upload an Excel workbook to begin."}
          </span>
        </div>
        <button
          type="button"
          disabled={!file || busy}
          onClick={() => void generate()}
          className="ep-btn-generate"
        >
          {busy ? (
            <>
              <LoaderCircle className="ep-spin" size={18} /> Generating Presentation…
            </>
          ) : (
            <>
              <Download size={18} /> Generate & Download PPTX
            </>
          )}
        </button>
      </div>

      {status && (
        <p className="ep-status" role="status">
          {status}
        </p>
      )}

      <p className="ep-foot">
        All templates and spreadsheets are processed locally by the Suite API. Vector graphics, text fonts,
        cell images, and custom branding rules are preserved.
      </p>
    </main>
  );
}
