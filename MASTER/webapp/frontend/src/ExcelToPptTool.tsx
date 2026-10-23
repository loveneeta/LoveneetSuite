import React, { useState } from "react";
import ExcelJS from "exceljs";
import { FileSpreadsheet, Presentation, Upload, Download, LoaderCircle, Plus, RotateCcw, Image as ImageIcon } from "lucide-react";
import "./excel-ppt.css";

type Slot = { img: number[]; text: number[] };
type Mapping = { code: string; description: string; price: string; length: string; width: string; height: string; image: string };
type SlideRatio = "16:9" | "4:3" | "A4 Landscape" | "A4 Portrait";
const DEFAULT_LAYOUT: Slot[] = [
  { img: [80, 130, 230, 230], text: [40, 310, 350, 390] },
  { img: [450, 130, 600, 230], text: [430, 310, 760, 390] }
];
const THREE_LAYOUT: Slot[] = [
  { img: [25, 85, 225, 235], text: [15, 260, 250, 345] },
  { img: [290, 85, 490, 235], text: [280, 260, 515, 345] },
  { img: [555, 85, 755, 235], text: [545, 260, 780, 345] }
];
const ROLE_LABELS: Record<keyof Mapping, string> = {
  code: "SKU / Product code", description: "Description / Product name", price: "Price", length: "Length", width: "Width", height: "Height", image: "Embedded image column"
};
const initialMapping: Mapping = { code: "", description: "", price: "", length: "", width: "", height: "", image: "" };

export default function ExcelToPptTool() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>(initialMapping);
  const [count, setCount] = useState<2 | 3>(2);
  const [layout, setLayout] = useState<Slot[]>(DEFAULT_LAYOUT);
  const [fontSize, setFontSize] = useState(18);
  const [fontName, setFontName] = useState("Arial");
  const [fontColor, setFontColor] = useState("000000");
  const [background, setBackground] = useState("FFFFFF");
  const [ratio, setRatio] = useState<SlideRatio>("16:9");
  const [autoCenter, setAutoCenter] = useState(true);
  const [headerText, setHeaderText] = useState("PRODUCT COLLECTION");
  const [showHeader, setShowHeader] = useState(true);
  const [showRule, setShowRule] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const chooseFile = async (next: File | null) => {
    setFile(next); setHeaders([]); setStatus("");
    if (!next) return;
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await next.arrayBuffer());
      const sheet = workbook.worksheets[0];
      const names = sheet ? (sheet.getRow(1).values as Array<unknown>).slice(1).map(v => String(v ?? "").trim()).filter(Boolean) : [];
      setHeaders(names);
      const find = (...needles: string[]) => names.find(h => needles.some(n => h.toLowerCase() === n || h.toLowerCase().includes(n))) ?? "";
      setMapping({ code: find("sku", "item code", "product code", "code"), description: find("description", "product name", "product"), price: find("price", "mrp", "rate"), length: find("length", " l"), width: find("width", "breadth", " w"), height: find("height", " h"), image: find("image", "photo", "picture") });
      setStatus(names.length ? `Loaded ${names.length} column headers. Confirm the mapping below.` : "No column headers found in the first worksheet.");
    } catch { setStatus("Could not read this workbook. Please upload a valid .xlsx file."); }
  };

  const changeCount = (next: 2 | 3) => { setCount(next); setLayout(next === 2 ? DEFAULT_LAYOUT.map(s => ({ img: [...s.img], text: [...s.text] })) : THREE_LAYOUT.map(s => ({ img: [...s.img], text: [...s.text] }))); };
  const changeCoord = (slotIndex: number, section: "img" | "text", coordIndex: number, raw: string) => {
    const value = Number(raw);
    setLayout(prev => prev.map((slot, i) => i !== slotIndex ? slot : ({ ...slot, [section]: slot[section].map((v, j) => j === coordIndex ? value : v) })));
  };
  const resetLayout = () => { changeCount(count); setRatio("16:9"); setAutoCenter(true); };
  const ratioValue = ratio === "4:3" ? 4 / 3 : ratio === "A4 Landscape" ? 297 / 210 : ratio === "A4 Portrait" ? 210 / 297 : 16 / 9;
  const alignImageToText = () => setLayout(prev => prev.map(slot => { const width = slot.img[2] - slot.img[0]; const center = (slot.text[0] + slot.text[2]) / 2; const left = Math.max(0, Math.min(800 - width, Math.round(center - width / 2))); return { ...slot, img: [left, slot.img[1], left + width, slot.img[3]] }; }));
  const generate = async () => {
    if (!file) { setStatus("Choose an Excel workbook first."); return; }
    if (!mapping.code) { setStatus("Select the product code / SKU column. Rows without a code are skipped."); return; }
    setBusy(true); setStatus("Generating product catalogue PowerPoint…");
    try {
      const body = new FormData();
      body.append("excel", file);
      body.append("mapping", JSON.stringify(mapping));
      body.append("layout", JSON.stringify(layout));
      body.append("style", JSON.stringify({ font_size: fontSize, font_name: fontName, font_color: fontColor.replace("#", ""), background_color: background.replace("#", ""), aspect_ratio: ratio, auto_center_image: autoCenter, header_text: headerText, show_header: showHeader, show_rule: showRule }));
      if (logoFile) body.append("logo", logoFile);
      const response = await fetch("/api/excel-to-ppt", { method: "POST", body });
      if (!response.ok) { let message = `Generation failed (${response.status})`; try { message = (await response.json()).detail || message; } catch {} throw new Error(message); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = file.name.replace(/\.xlsx?$/i, "") + "_catalogue.pptx";
      document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatus("PowerPoint generated and downloaded successfully.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unexpected error while generating PowerPoint."); }
    finally { setBusy(false); }
  };

  return <main className="excel-ppt">
    <header className="ep-head"><div className="ep-mark"><Presentation size={23}/></div><div><h2>Excel to Product Catalogue PPT</h2><p>Generate product slides from an Excel workbook with embedded images.</p></div></header>
    <section className="ep-intro"><div><span>PRODUCT CATALOGUE WORKFLOW</span><h3>Turn your product spreadsheet into a presentation.</h3><p>Map your Excel columns, choose 2 or 3 products per slide, adjust image/text placement, and download a PowerPoint catalogue.</p></div><FileSpreadsheet size={44}/></section>
    <section className="ep-panel"><div className="ep-title"><div><b>01</b><div><h3>Upload Excel workbook</h3><p>Supports .xlsx with product details and images embedded in worksheet cells.</p></div></div></div>
      <label className="ep-drop"><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => void chooseFile(e.target.files?.[0] ?? null)}/><Upload size={24}/><strong>{file ? file.name : "Choose an Excel workbook"}</strong><small>{file ? `${(file.size / 1024).toFixed(0)} KB · ${headers.length} columns detected` : "Click to browse your device"}</small></label>
      {headers.length > 0 && <div className="ep-mapping"><div className="ep-title"><div><b>02</b><div><h3>Column mapping</h3><p>Auto-detected where possible; verify each field before generating.</p></div></div></div><div className="ep-map-grid">{(Object.keys(ROLE_LABELS) as Array<keyof Mapping>).map(key => <label key={key}><span>{ROLE_LABELS[key]}{key === "code" ? " *" : ""}</span><select value={mapping[key]} onChange={e => setMapping(prev => ({ ...prev, [key]: e.target.value }))}><option value="">— Not mapped —</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}</select></label>)}</div><p className="ep-hint"><ImageIcon size={15}/> Product photos must be embedded in the Excel worksheet and anchored in the mapped image column. Rows without a product code are skipped.</p></div>}
    </section>
    <section className="ep-panel"><div className="ep-title"><div><b>03</b><div><h3>Slide layout and styling</h3><p>Choose a slide shape, align images automatically, and add a heading, divider line and corner logo.</p></div></div></div>
      <div className="ep-layout-options"><label className="ep-ratio-picker"><span>Slide shape</span><select value={ratio} onChange={e => setRatio(e.target.value as SlideRatio)}><option>16:9</option><option>4:3</option><option>A4 Landscape</option><option>A4 Portrait</option></select></label><button type="button" className={count === 2 ? "selected" : ""} onClick={() => changeCount(2)}>2 products per slide</button><button type="button" className={count === 3 ? "selected" : ""} onClick={() => changeCount(3)}>3 products per slide</button><button type="button" className="ep-align-button" onClick={alignImageToText}><ImageIcon size={14}/> Center images to text</button><button type="button" className="ep-reset" onClick={resetLayout}><RotateCcw size={14}/> Reset layout</button></div>
      <div className="ep-visual-guide">
        <div className="ep-visual-heading"><div><h4>Visual slide preview</h4><p>See where your products will appear. Blue = image area; amber = product details.</p></div><span>16:9 SLIDE</span></div>
        <div className="ep-visual-canvas" style={{ backgroundColor: `#${background.replace("#", "")}`, aspectRatio: String(ratioValue) }}>
          {showHeader && <div className="ep-preview-header" style={{color:`#${fontColor.replace("#","")}`}}>{headerText || "Your heading"}{logoFile && <span className="ep-preview-logo">{logoFile.name.slice(0,18)}</span>}</div>}
          {showRule && <div className="ep-preview-rule"/>}
          {layout.map((slot, i) => <React.Fragment key={i}>
            <div className="ep-visual-rect ep-visual-image" style={{ left: `${slot.img[0] / 8}%`, top: `${slot.img[1] / 4.5}%`, width: `${(slot.img[2] - slot.img[0]) / 8}%`, height: `${(slot.img[3] - slot.img[1]) / 4.5}%` }}>
              <ImageIcon size={18}/><strong>Product {i + 1} image</strong><small>{slot.img[2]-slot.img[0]} × {slot.img[3]-slot.img[1]}</small>
            </div>
            <div className="ep-visual-rect ep-visual-text" style={{ left: `${slot.text[0] / 8}%`, top: `${slot.text[1] / 4.5}%`, width: `${(slot.text[2] - slot.text[0]) / 8}%`, height: `${(slot.text[3] - slot.text[1]) / 4.5}%`, color: `#${fontColor.replace("#", "")}` }}>
              <strong>Product {i + 1} details</strong><span>SKU / Name</span><span>Dimensions</span><span>Price</span>
            </div>
          </React.Fragment>)}
        </div>
        <div className="ep-visual-legend"><span><i className="ep-legend-blue"/> Image placement</span><span><i className="ep-legend-amber"/> Text placement</span><span>Adjust the values below to move or resize each area.</span></div>
      </div>
      <div className="ep-slots">{layout.map((slot, i) => <div className="ep-slot" key={i}><h4>Product slot {i + 1}</h4><div className="ep-coord-head"><span>Image rectangle (x1, y1, x2, y2)</span></div><div className="ep-coords">{slot.img.map((v, j) => <label key={j}><span>{["X1", "Y1", "X2", "Y2"][j]}</span><input type="number" min="0" max={j % 2 === 0 ? 800 : 450} value={v} onChange={e => changeCoord(i, "img", j, e.target.value)}/></label>)}</div><div className="ep-coord-head"><span>Text rectangle (x1, y1, x2, y2)</span></div><div className="ep-coords">{slot.text.map((v, j) => <label key={j}><span>{["X1", "Y1", "X2", "Y2"][j]}</span><input type="number" min="0" max={j % 2 === 0 ? 800 : 450} value={v} onChange={e => changeCoord(i, "text", j, e.target.value)}/></label>)}</div></div>)}</div>
      <div className="ep-template-options"><div className="ep-template-title"><h4>Header & brand template</h4><p>Add a heading, a divider line and an optional logo in the top corner.</p></div><label className="ep-header-field"><span>Heading text</span><input type="text" value={headerText} onChange={e => setHeaderText(e.target.value)} placeholder="e.g. Beyond Wood — New Collection"/></label><div className="ep-template-toggles"><label><input type="checkbox" checked={showHeader} onChange={e => setShowHeader(e.target.checked)}/> Show heading</label><label><input type="checkbox" checked={showRule} onChange={e => setShowRule(e.target.checked)}/> Show divider line</label><label><input type="checkbox" checked={autoCenter} onChange={e => setAutoCenter(e.target.checked)}/> Auto-center images over text boxes on export</label></div><label className="ep-logo-upload"><Upload size={16}/><span>{logoFile ? logoFile.name : "Upload brand logo (PNG, JPG or SVG)"}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => setLogoFile(e.target.files?.[0] ?? null)}/></label></div>
      <div className="ep-style-grid"><label><span>Font size</span><input type="number" min="8" max="48" value={fontSize} onChange={e => setFontSize(Number(e.target.value))}/></label><label><span>Font family</span><select value={fontName} onChange={e => setFontName(e.target.value)}><option>Arial</option><option>Calibri</option><option>Manrope</option><option>Times New Roman</option></select></label><label><span>Font color</span><input type="color" value={`#${fontColor.replace("#", "")}`} onChange={e => setFontColor(e.target.value)}/></label><label><span>Slide background</span><input type="color" value={`#${background.replace("#", "")}`} onChange={e => setBackground(e.target.value)}/></label></div>
    </section>
    <div className="ep-action"><span>{file ? "Ready to generate after confirming column mapping." : "Upload a workbook to begin."}</span><button type="button" disabled={!file || busy} onClick={() => void generate()}>{busy ? <><LoaderCircle className="ep-spin" size={17}/> Generating…</> : <><Download size={17}/> Generate & download PPTX</>}</button></div>
    {status && <p className="ep-status" role="status">{status}</p>}
    <p className="ep-foot">The workbook is processed by the Suite API for PowerPoint generation. Confirm that embedded images and product details are correct before publishing.</p>
  </main>;
}
