import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ExcelJS from "exceljs";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Tesseract from "tesseract.js";
import { Images, FolderTree, Presentation, LayoutDashboard, Upload, Download, CheckCircle2, AlertCircle, Menu, X, Sparkles, FileSpreadsheet, Settings, FileText, Trash2, AlertTriangle, LoaderCircle, Files, LockKeyhole, FolderSync } from "lucide-react";
const saveAs = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); };
import "./style.css";
import "./pdf-excel.css";
import ExcelToPptTool from "./ExcelToPptTool";
import PptExcelTool from "./PptExcelTool";
import FileCollectorTool from "./FileCollectorTool";
import { isDesktop, storageAdapter, syncService, updateService, UpdateStatus } from "./services/platform";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerUrl;

const CUSTOMER_NAME = "Noble Art And Craft House";
const IMPORT_HEADERS = ["Customer Name","SO/NO (Sales Orders)","SO Quantities (Multi Qty e.g. 600, 400)","Item Code","Dimension Unit","Length","Width","Height","Ply / Board","Flute Type","Joint (inch)","Deckle Margin (inch)","Flap Type","Overlap Length (inch)","Total Quantity","Wastage %","Setup Cost","Tooling Cost","Printing Required (Yes/No)","Printing / Box","Punching / Box","Lamination / Box","Pasting / Box","Transport / Box","Other / Box","Factory Overhead %","Paper Combo Name"];
const DEFAULTS: Record<string,string|number> = {"Dimension Unit":"inch","Flute Type":"B/C","Joint (inch)":2,"Deckle Margin (inch)":2,"Overlap Length (inch)":1,"Wastage %":6,"Setup Cost":0,"Tooling Cost":0,"Printing Required (Yes/No)":"yes","Printing / Box":0,"Punching / Box":0,"Lamination / Box":0,"Pasting / Box":0,"Transport / Box":0,"Other / Box":0,"Factory Overhead %":5,"Paper Combo Name":"18/140+18/100+18/140+18/100+18/140+18/100+18/140"};
type RowData = {SO:string;QTY:string;ITEM:string;L:string;W:string;H:string;INCH:string;PLY:string;TYPE:string;source:string;confidence:"high"|"review";[key:string]:any};
const blank = (source:string):RowData => ({SO:"",QTY:"",ITEM:"",L:"",W:"",H:"",INCH:"INCH",PLY:"",TYPE:"",source,confidence:"review"});
const getTemplateValues = (r:RowData):Record<string,string|number> => {
 const values:Record<string,string|number> = {"Customer Name":CUSTOMER_NAME,"SO/NO (Sales Orders)":r["SO/NO (Sales Orders)"] ?? r.SO.replace(/^SO\//i,""),"SO Quantities (Multi Qty e.g. 600, 400)":r["SO Quantities (Multi Qty e.g. 600, 400)"] ?? r.QTY,"Item Code":r["Item Code"] ?? r.ITEM,"Dimension Unit":r["Dimension Unit"] ?? r.INCH ?? "inch","Length":r.Length ?? r.L,"Width":r.Width ?? r.W,"Height":r.Height ?? r.H,"Ply / Board":r["Ply / Board"] ?? r.PLY,"Flap Type":r["Flap Type"] ?? (/^(DF|SF)$/i.test(r.TYPE) ? r.TYPE.toUpperCase() : ""),"Total Quantity":r["Total Quantity"] ?? r.QTY};
 for(const [key,value] of Object.entries(DEFAULTS)) if(values[key]===undefined||values[key]===null||values[key]==="") values[key]=value;
 for(const h of IMPORT_HEADERS) if(r[h]!==undefined) values[h]=r[h];
 return values;
};
function parseText(text:string,fileName:string):RowData[] {
 const normalized=text.replace(/\u00a0/g," ").replace(/[“”]/g,'"').replace(/[×✕]/g,"x").replace(/\s+/g," ").trim();
 const so=(normalized.match(/\bSO\s*\/\s*\d{6,}\b/i)?.[0]||normalized.match(/\bSO\s*\/\s*[A-Z0-9-]+\b/i)?.[0]||"").replace(/\s+/g,"");
 const matches=[...normalized.matchAll(/\[?\s*Box\s*-\s*\d+\s*\]?/ig)];
 const chunks:string[]=[];
 if(matches.length){for(let i=0;i<matches.length;i++){const from=matches[i].index??0,to=i+1<matches.length?(matches[i+1].index??normalized.length):normalized.length;chunks.push(normalized.slice(from,to));}}
 else chunks.push(...text.split(/(?=\b\d+(?:,\d{3})*(?:\.\d+)?\s*PCS\b)/i).filter(Boolean));
 const rows:RowData[]=[];
 for(const chunk of chunks){
  const qtyMatch=chunk.match(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:PCS|PC|PIECES)\b/i);
  const itemMatch=chunk.match(/\bITEM\s*:\s*([A-Z0-9-]+)/i);
  const plyMatch=chunk.match(/\b([357])\s*[- ]?\s*PLY\b/i);
  const sizeMatch=chunk.match(/\bSize\s*:\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  const allDims=[...chunk.matchAll(/(\d+(?:\.\d+)?)\s*(?:x|\*)\s*(\d+(?:\.\d+)?)\s*(?:x|\*)\s*(\d+(?:\.\d+)?)/ig)];
  let type="";
  const suffixType=chunk.match(/\[\s*\d+(?:\.\d+)?\s*\]\s*["']?\s*(DF|SF)\b/i)||chunk.match(/["']\s*(DF|SF)\s*["']/i);
  if(suffixType) type=suffixType[1].toUpperCase(); else if(/Triangle\s*Box\s*\(\s*B\s*\)/i.test(chunk)) type="Triangle Box (B)"; else if(/Triangle\s*Box\s*\(\s*C\s*\)/i.test(chunk)) type="Triangle Box (C)"; else if(/Triangle\s*Box/i.test(chunk)) type=(chunk.match(/Triangle\s*Box\s*\([^)]*\)/i)?.[0]||"Triangle Box"); else if(/\bSF\b/i.test(chunk)) type="SF";
  const dims=sizeMatch||allDims[0],row=blank(fileName);
  row.SO=so;row.QTY=qtyMatch?qtyMatch[1].replace(/,/g,"").replace(/\.000$/,""):"";row.ITEM=itemMatch?itemMatch[1].toUpperCase():"";row.L=dims?.[1]||"";row.W=dims?.[2]||"";row.H=dims?.[3]||"";row.INCH="INCH";row.PLY=plyMatch?plyMatch[1]:"";row.TYPE=type;
  row.confidence=(row.SO&&row.QTY&&row.ITEM&&row.L&&row.W&&row.H&&row.PLY&&row.TYPE)?"high":"review";
  if(row.QTY||row.ITEM||row.PLY||row.L) rows.push(row);
 }
 const unique=new Map<string,RowData>();rows.forEach(r=>unique.set([r.source,r.SO,r.ITEM,r.QTY,r.L,r.W,r.H,r.PLY,r.TYPE].join("|"),r));return [...unique.values()];
}
async function pdfText(file:File,setStatus:(s:string)=>void):Promise<string>{
 const doc=await (pdfjsLib as any).getDocument({data:await file.arrayBuffer()}).promise;let all="";
 for(let p=1;p<=doc.numPages;p++){setStatus(file.name+": reading page "+p+" of "+doc.numPages);const page=await doc.getPage(p),content=await page.getTextContent(),pageText=content.items.map((x:any)=>x.str||"").join("\n");if(pageText.replace(/\s/g,"").length>30)all+="\n"+pageText;else{setStatus(file.name+": OCR page "+p+" of "+doc.numPages);const viewport=page.getViewport({scale:1.8}),canvas=document.createElement("canvas");canvas.width=viewport.width;canvas.height=viewport.height;const ctx=canvas.getContext("2d");if(!ctx)throw Error("Could not create PDF page canvas.");await page.render({canvasContext:ctx,viewport}).promise;const result=await Tesseract.recognize(canvas,"eng");all+="\n"+result.data.text;}}
 return all;
}
function PdfExcelTool(){
 const [files,setFiles]=useState<File[]>([]),[rows,setRows]=useState<RowData[]>([]),[status,setStatus]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 const reviewCount=useMemo(()=>rows.filter(r=>r.confidence==="review").length,[rows]);
 const addFiles=(list:FileList|null)=>{if(!list)return;setFiles(prev=>[...prev,...Array.from(list).filter(f=>f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf"))]);setDone(false);};
 const convert=async()=>{if(!files.length)return;setBusy(true);setRows([]);setDone(false);try{const all:RowData[]=[];for(const file of files){const text=await pdfText(file,setStatus),parsed=parseText(text,file.name);if(!parsed.length)all.push({...blank(file.name),confidence:"review"});else all.push(...parsed);}setRows(all);setDone(true);setStatus("Finished: "+all.length+" item rows extracted.");
for(const r of all){
  storageAdapter.savePoRecord({
    sourceFile: r.source,
    soNumber: r.SO,
    itemCode: r.ITEM,
    qty: r.QTY,
    length: r.L,
    width: r.W,
    height: r.H,
    ply: r.PLY,
    boxType: r.TYPE,
    confidence: r.confidence,
    rawPayload: r
  });
}}catch(e:any){setStatus("Conversion failed: "+(e?.message||"Unknown error"));}finally{setBusy(false);}};
 const updateRow=(idx:number,key:string,value:string)=>setRows(prev=>prev.map((r,i)=>i===idx?{...r,[key]:value,confidence:"review"}:r));
 const makeWorkbook=async(data:RowData[],title:string)=>{const wb=new ExcelJS.Workbook();wb.creator="PDF to Excel Converter";const ws=wb.addWorksheet("Bulk Calculation Template");ws.addRow([...IMPORT_HEADERS]);data.forEach(r=>{const values=getTemplateValues(r);ws.addRow(IMPORT_HEADERS.map(h=>values[h]??""));});ws.views=[{state:"frozen",ySplit:1}];ws.autoFilter={from:"A1",to:"AA"+(data.length+1)};ws.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};ws.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF2678B8"}};ws.getRow(1).alignment={horizontal:"center",vertical:"middle",wrapText:true};ws.getRow(1).height=42;[28,22,32,16,15,12,12,12,15,14,14,20,14,20,16,12,12,12,26,16,16,18,16,18,14,20,48].forEach((w,i)=>ws.getColumn(i+1).width=w);const buf=await wb.xlsx.writeBuffer();saveAs(new Blob([buf]),title);};
 const exportSeparate=async()=>{for(let i=0;i<files.length;i++){const data=rows.filter(r=>r.source===files[i].name);if(data.length)await makeWorkbook(data,files[i].name.replace(/\.pdf$/i,"")+".xlsx");}};
 return <main className="pdf-shell">
  <section className="pdf-hero"><div><p className="pdf-eyebrow">PURCHASE ORDER WORKFLOW</p><h2>Turn PDF purchase orders into the 27-column Excel template.</h2><p>Upload multiple quotations, extract SO numbers, quantities, item codes, dimensions, ply and DF/SF type. Review rows before exporting the Box App bulk calculation workbook.</p></div><div className="pdf-hero-icon"><FileText size={48}/><span>PDF → XLSX</span></div></section>
  <section className="pdf-panel"><div className="pdf-section-title"><div><h3>1. Select PDF files</h3><p>Text PDFs and scanned pages (OCR) are supported.</p></div><span className="pdf-count">{files.length} selected</span></div>
   <label className="pdf-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files);}}><input type="file" accept="application/pdf,.pdf" multiple onChange={e=>addFiles(e.target.files)}/><span className="pdf-upload-icon"><Upload size={25}/></span><strong>Drop PDF files here or browse</strong><small>Multiple PDFs supported · Processed inside this browser</small></label>
   {files.length>0&&<div className="pdf-files">{files.map((f,i)=><div className="pdf-file" key={i}><FileText size={17}/><span>{f.name}</span><small>{(f.size/1024).toFixed(0)} KB</small><button type="button" className="pdf-icon-btn" onClick={()=>setFiles(prev=>prev.filter((_,j)=>j!==i))} aria-label="Remove file"><Trash2 size={15}/></button></div>)}</div>}
   <button type="button" className="pdf-primary" disabled={!files.length||busy} onClick={convert}>{busy?<><LoaderCircle className="pdf-spin" size={17}/> Converting…</>:<><FileSpreadsheet size={17}/> Convert to Excel</>}</button>{status&&<p className="pdf-status" role="status">{status}</p>}
  </section>
  {rows.length>0&&<section className="pdf-panel"><div className="pdf-section-title"><div><h3>2. Review extracted items</h3><p>Edit any of the 27 template columns before exporting.</p></div><span className={"pdf-count "+(reviewCount?"review":"complete")}>{reviewCount?reviewCount+" need review":"Rows ready to export"}</span></div>
   <div className="pdf-notice"><AlertTriangle size={17}/><span>Extraction is heuristic. Verify item codes, quantities and dimensions against each source PDF before importing the workbook.</span></div>
   <div className="pdf-table-wrap"><table className="pdf-table"><thead><tr>{IMPORT_HEADERS.map(h=><th key={h}>{h}</th>)}<th>CHECK</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i} className={r.confidence==="review"?"pdf-needs-review":""}>{IMPORT_HEADERS.map(h=>{const vals=getTemplateValues(r);return <td key={h}><input value={String(vals[h]??"")} onChange={e=>updateRow(i,h,e.target.value)} aria-label={h+" row "+(i+1)}/></td>})}<td>{r.confidence==="review"?<span className="pdf-review-tag">Review</span>:<span className="pdf-good-tag">OK</span>}</td></tr>)}</tbody></table></div>
   <div className="pdf-export-row"><button type="button" className="pdf-secondary" onClick={()=>makeWorkbook(rows,"Combined_Quotation_Items.xlsx")}><Download size={16}/> Export combined template</button><button type="button" className="pdf-primary" onClick={exportSeparate}><Files size={16}/> Export separate Excel files</button></div>
  </section>}
  <footer className="pdf-footer">Exports the exact 27-column Box App Bulk Calculation Template. <span>Always verify extracted values before use.</span></footer>
 </main>;
}

const tools = [{id:"dashboard",name:"Overview",icon:LayoutDashboard},{id:"collector",name:"File Collector",icon:FolderSync},{id:"convert",name:"Image Converter",icon:Images},{id:"organize",name:"Image Organizer",icon:FolderTree},{id:"ppt",name:"PowerPoint Exporter",icon:Presentation},{id:"pdf-excel",name:"PO PDF to Excel",icon:FileSpreadsheet},{id:"excel-ppt",name:"Excel to Catalogue PPT",icon:Presentation},{id:"ppt-excel",name:"PPT to Excel with Images",icon:Presentation}];
function App(){
 const [page,setPage]=useState("dashboard"),[mobile,setMobile]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(null);
 const [isOnline,setIsOnline]=useState(typeof navigator!=="undefined"?navigator.onLine:true);
 const [showSettingsModal,setShowSettingsModal]=useState(false);
 const [dbStats,setDbStats]=useState<any>(null);
 const [updateState,setUpdateState]=useState<UpdateStatus|null>(null);
 const [isCheckingUpdate,setIsCheckingUpdate]=useState(false);

 React.useEffect(()=>{
   const onOn=()=>setIsOnline(true), onOff=()=>setIsOnline(false);
   window.addEventListener("online",onOn);
   window.addEventListener("offline",onOff);
   updateService.getStatus().then(setUpdateState);
   const unsub=updateService.onStatusChange(s=>setUpdateState(s));
   return ()=>{
     window.removeEventListener("online",onOn);
     window.removeEventListener("offline",onOff);
     unsub();
   };
 },[]);
 const openSettings=async()=>{
   const stats=await storageAdapter.getStats();
   setDbStats(stats);
   const u=await updateService.getStatus();
   setUpdateState(u);
   setShowSettingsModal(true);
 };
 const handleCheckForUpdates=async()=>{
   setIsCheckingUpdate(true);
   const res=await updateService.checkForUpdates();
   setIsCheckingUpdate(false);
   const updated=await updateService.getStatus();
   setUpdateState(updated);
   if(updated.status==="available"){
     setNotice({type:"success",text:`Update v${updated.latestVersion} is available! Click Download Update in Settings.`});
   }else if(updated.status==="not-available"){
     setNotice({type:"success",text:"Loveneet Suite is completely up to date!"});
   }else if(updated.status==="error"){
     setNotice({type:"error",text:`Update check error: ${updated.error||"Could not connect to release server"}`});
   }
 };
 const handleDownloadUpdate=async()=>{
   const res=await updateService.downloadUpdate();
   if(!res.success&&res.error){
     setNotice({type:"error",text:`Download failed: ${res.error}`});
   }
 };
 const handleInstallAndRestart=()=>{
   if(window.confirm("Loveneet Suite will restart to finish installing this update. Are you ready to proceed?")){
     updateService.quitAndInstall();
   }
 };
 const handleBackup=async()=>{
   const res=await storageAdapter.backupDatabase();
   if(res.success){ setNotice({type:"success",text:"Database backup saved successfully!"}); }
 };
 const handleRestore=async()=>{
   const res=await storageAdapter.restoreDatabase();
   if(res.success){
     const stats=await storageAdapter.getStats();
     setDbStats(stats);
     setNotice({type:"success",text:"Database restored successfully!"});
   }
 };
 const [images,setImages]=useState([]),[format,setFormat]=useState("jpg"),[quality,setQuality]=useState(90),[width,setWidth]=useState(""),[height,setHeight]=useState("");
 const [excel,setExcel]=useState([]),[archive,setArchive]=useState([]),[mode,setMode]=useState("2");
 const [ppts,setPpts]=useState([]),[jpg,setJpg]=useState(true),[png,setPng]=useState(false),[webp,setWebp]=useState(true),[pq,setPq]=useState(95);
 const active=tools.find(t=>t.id===page)||tools[0];
 function picker(label,accept,multiple,files,onChange,hint){return <label className="dropzone"><input type="file" accept={accept} multiple={multiple} onChange={e=>onChange(Array.from(e.target.files||[]))}/><span className="upload-icon"><Upload size={20}/></span><strong>{label}</strong><span className="muted">{files.length?files.map(f=>f.name).join(" · "):"Click to browse your device"}</span><small>{hint}</small></label>}
 function field(label,child){return <label className="field"><span>{label}</span>{child}</label>}
 async function run(path,data,filename){setBusy(true);setNotice(null);try{const res=await fetch(path,{method:"POST",body:data});if(!res.ok){let msg="Request failed ("+res.status+")";try{msg=(await res.json()).detail||msg}catch{}throw Error(msg)}const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice({type:"success",text:"Finished. Your ZIP download has started."})}catch(e){setNotice({type:"error",text:e.message||"Request failed"})}finally{setBusy(false)}}
 function convert(e){e.preventDefault();if(!images.length)return setNotice({type:"error",text:"Choose at least one image."});if(Boolean(width)!==Boolean(height))return setNotice({type:"error",text:"Enter both resize dimensions or leave both empty."});const d=new FormData();images.forEach(f=>d.append("files",f));d.append("output_format",format);d.append("quality",String(quality));if(width&&height){d.append("width",width);d.append("height",height)}run("/api/convert",d,"converted_images.zip")}
 function organize(e){e.preventDefault();if(!excel[0]||!archive[0])return setNotice({type:"error",text:"Choose an Excel workbook and an images ZIP archive."});const d=new FormData();d.append("excel",excel[0]);d.append("image_archive",archive[0]);d.append("mode",mode);run("/api/organize",d,"organized_images.zip")}
 function exportPpt(e){e.preventDefault();if(!ppts.length)return setNotice({type:"error",text:"Choose at least one PowerPoint file."});const d=new FormData();ppts.forEach(f=>d.append("files",f));d.append("export_jpg",String(jpg));d.append("export_png",String(png));d.append("export_webp",String(webp));d.append("quality",String(pq));run("/api/ppt-export",d,"powerpoint_exports.zip")}
 function nav(id){setPage(id);setMobile(false);setNotice(null)}
 return <div className="app-shell">{mobile&&<button className="scrim" onClick={()=>setMobile(false)}/>}<aside className={"sidebar "+(mobile?"open":"")}><div className="brand"><div className="brand-mark">L<span>.</span></div><div><strong>LOVENEET</strong><small>BUSINESS SUITE</small></div><button className="mobile-close" onClick={()=>setMobile(false)}><X size={18}/></button></div><div className="nav-label">WORKSPACE</div><nav>{tools.map(t=><button key={t.id} className={"nav-item "+(page===t.id?"active":"")} onClick={()=>nav(t.id)}><t.icon size={18}/><span>{t.name}</span></button>)}</nav><div className="sidebar-bottom"><div className="secure-note"><Sparkles size={16}/><div><strong>Made for your workflow</strong><small>Web edition · local server</small></div></div><button className="nav-item" onClick={openSettings}><Settings size={18}/><span>Settings & Database</span></button><div className="version">WEB EDITION · 1.1</div></div></aside>
 <main className="main-area"><header className="topbar"><button className="mobile-menu" onClick={()=>setMobile(true)}><Menu size={20}/></button><div className="breadcrumb">Loveneet Suite <span>/</span> <strong>{active.name}</strong></div>{isDesktop() ? (
  <div className={"top-status " + (isOnline ? "online" : "offline")}>
    <span className={"status-dot " + (isOnline ? "online" : "offline")}/>
    {isOnline ? "Desktop · Online" : "Desktop · Offline (Local Mode)"}
  </div>
) : (
  <div className={"top-status " + (isOnline ? "" : "offline")}>
    <span className={"status-dot " + (isOnline ? "" : "offline")}/>
    {isOnline ? "Web workspace" : "Web (Offline)"}
  </div>
)}</header><div className="page-wrap"><div className="page-heading"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>{page==="dashboard"?"Good work starts here.":active.name}</h1><p>{page==="dashboard"?"Your product, purchasing and presentation tools, together in one place.":"Upload files, choose settings, and download your results."}</p></div><div className="heading-mark"><Sparkles size={22}/></div></div>
 {notice&&<div className={"notice "+notice.type}><span>{notice.type==="success"?<CheckCircle2 size={19}/>:<AlertCircle size={19}/>}</span><p>{notice.text}</p><button onClick={()=>setNotice(null)}><X size={16}/></button></div>}
 {isDesktop() && (updateState?.status === "available" || updateState?.status === "downloaded") && (
   <div className="notice info" style={{background:"#1e1b4b",border:"1px solid #4338ca",display:"flex",alignItems:"center",gap:10}}>
     <Sparkles size={18} color="#818cf8"/>
     <p style={{margin:0,flex:1}}>
       {updateState.status === "available"
         ? `A new desktop version (v${updateState.latestVersion}) is available!`
         : `Update v${updateState.latestVersion} has been downloaded and is ready to install.`}
     </p>
     {updateState.status === "available" ? (
       <button type="button" className="collector-btn-primary" style={{padding:"4px 10px",fontSize:12}} onClick={openSettings}>View in Settings</button>
     ) : (
       <button type="button" className="collector-btn-primary" style={{padding:"4px 10px",fontSize:12,background:"#16a34a"}} onClick={handleInstallAndRestart}>Restart & Update</button>
     )}
   </div>
 )}
 {page==="pdf-excel"&&<PdfExcelTool/>}{page==="excel-ppt"&&<ExcelToPptTool/>}{page==="ppt-excel"&&<PptExcelTool/>}{page==="collector"&&<FileCollectorTool/>}
 {page==="dashboard"&&<><section className="welcome-card"><div><div className="welcome-pill"><span className="status-dot"/> WORKSPACE READY</div><h2>From product files<br/>to <em>presentation-ready.</em></h2><p>Choose a tool to start. Files upload only when you run a task.</p><button className="primary-btn" onClick={()=>nav("convert")}>Convert images <Images size={17}/></button></div><div className="art-orbit"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-core"><Images size={42}/></div><div className="float-chip chip-one"><FileSpreadsheet size={17}/></div><div className="float-chip chip-two"><Presentation size={17}/></div><div className="float-chip chip-three"><FolderTree size={17}/></div></div></section><div className="section-head"><div><h2>Tools</h2><p>Choose a workflow to get started</p></div><span className="tool-count">07 TOOLS</span></div><section className="tool-grid">{tools.filter(t=>t.id!=="dashboard").map((t,i)=><button className="tool-card" key={t.id} onClick={()=>nav(t.id)}><div className={"tool-icon tone-"+(i%3)}><t.icon size={22}/></div><span className="card-arrow">↗</span><h3>{t.name}</h3><p>{({"convert":"Batch convert and resize product images","organize":"Organize images using Excel product data","ppt":"Export presentation slides as images","pdf-excel":"Extract purchase-order and quotation rows into a 27-column Excel template","excel-ppt":"Generate product catalogue slides from Excel data and embedded images","ppt-excel":"Extract presentation text, tables and images into a custom Excel workbook","collector":"Flatten nested folders and collect files with subfolder prefix naming"} as Record<string,string>)[t.id]}</p><span className="open-tool">Open tool →</span></button>)}</section><div className="privacy-foot"><span><CheckCircle2 size={16}/> PDF extraction runs locally in your browser</span><span>LOVENEET SUITE</span></div></>}
 {page==="convert"&&<form className="workspace-grid" onSubmit={convert}><section className="panel"><div className="panel-title"><span className="step">01</span><div><h2>Choose images</h2><p>Select one or more images from your device.</p></div></div>{picker("Choose image files","image/*",true,images,setImages,"JPG, PNG, WEBP, BMP, TIFF")}</section><section className="panel"><div className="panel-title"><span className="step">02</span><div><h2>Conversion settings</h2><p>Choose the output format and quality.</p></div></div><div className="form-grid">{field("Output format",<select value={format} onChange={e=>setFormat(e.target.value)}><option value="jpg">JPG</option><option value="png">PNG</option><option value="webp">WEBP</option><option value="bmp">BMP</option><option value="tiff">TIFF</option></select>)}{field("Quality",<div className="range-line"><input type="range" min="10" max="100" value={quality} onChange={e=>setQuality(+e.target.value)}/><strong>{quality}%</strong></div>)}{field("Resize width (px)",<input type="number" min="1" max="12000" placeholder="Original" value={width} onChange={e=>setWidth(e.target.value)}/>)}{field("Resize height (px)",<input type="number" min="1" max="12000" placeholder="Original" value={height} onChange={e=>setHeight(e.target.value)}/>)}</div><div className="hint-box">Enter both dimensions to resize. Leave both blank to preserve original dimensions.</div></section><div className="action-bar"><span>{images.length} image file(s) selected</span><button className="primary-btn" disabled={busy}>{busy?"Processing…":"Convert & download ZIP"} <Download size={17}/></button></div></form>}
 {page==="organize"&&<form className="workspace-grid" onSubmit={organize}><section className="panel"><div className="panel-title"><span className="step">01</span><div><h2>Product spreadsheet</h2><p>Upload your Excel product data and image paths.</p></div></div>{picker("Choose Excel workbook",".xlsx,.xlsm",false,excel,setExcel,"XLSX or XLSM")}</section><section className="panel"><div className="panel-title"><span className="step">02</span><div><h2>Source images archive</h2><p>Zip your source image folder before uploading.</p></div></div>{picker("Choose images ZIP",".zip,application/zip",false,archive,setArchive,"Image filenames must match paths in Excel")}</section><section className="panel full-panel"><div className="panel-title"><span className="step">03</span><div><h2>Folder structure</h2><p>Select the sorting strategy.</p></div></div><div className="mode-options">{[["1","Nested folders","Use Excel columns G to Q."],["2","KEEP / DELETE + collection","Sort into KEEP or DELETE, then collection."],["3","KEEP / DELETE + custom levels","Sort into KEEP or DELETE, then column H."]].map(m=><label key={m[0]} className={"mode-option "+(mode===m[0]?"selected":"")}><input type="radio" value={m[0]} checked={mode===m[0]} onChange={e=>setMode(e.target.value)}/><span className="radio-dot"/><span><strong>{m[1]}</strong><small>{m[2]}</small></span></label>)}</div><div className="hint-box">This first migration uses the desktop app’s default Excel column mapping. Images are copied into folders and packaged for download; originals are not deleted.</div></section><div className="action-bar"><span>Output is a downloadable ZIP</span><button className="primary-btn" disabled={busy}>{busy?"Organizing…":"Organize & download ZIP"} <Download size={17}/></button></div></form>}
 {page==="ppt"&&<form className="workspace-grid" onSubmit={exportPpt}><section className="panel"><div className="panel-title"><span className="step">01</span><div><h2>Choose presentations</h2><p>Upload PowerPoint files.</p></div></div>{picker("Choose PowerPoint files",".ppt,.pptx",true,ppts,setPpts,"PPT / PPTX · LibreOffice required on server")}</section><section className="panel"><div className="panel-title"><span className="step">02</span><div><h2>Export formats</h2><p>Select output formats.</p></div></div><div className="check-options"><label><input type="checkbox" checked={jpg} onChange={e=>setJpg(e.target.checked)}/> High-quality JPG</label><label><input type="checkbox" checked={png} onChange={e=>setPng(e.target.checked)}/> PNG</label><label><input type="checkbox" checked={webp} onChange={e=>setWebp(e.target.checked)}/> WEBP</label></div>{field("WEBP quality",<div className="range-line"><input type="range" min="10" max="100" value={pq} onChange={e=>setPq(+e.target.value)}/><strong>{pq}%</strong></div>)}<div className="hint-box">Slide rendering runs on the server using LibreOffice and PyMuPDF. Text before a “|” may be used as a filename.</div></section><div className="action-bar"><span>{ppts.length} presentation(s) selected</span><button className="primary-btn" disabled={busy}>{busy?"Exporting…":"Export slides & download ZIP"} <Download size={17}/></button></div></form>}
 <footer className="footer">
  <span>Loveneet Suite · {isDesktop() ? "Windows Desktop Edition" : "Web Edition"}</span>
  <span>Built for product workflows · Offline-first</span>
</footer>
{showSettingsModal && (
  <div className="collector-modal-backdrop" onClick={()=>setShowSettingsModal(false)}>
    <div className="collector-modal" style={{maxWidth:540}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h3><Settings size={20} color="#38bdf8"/> Application Settings & Local Database</h3>
        <button type="button" onClick={()=>setShowSettingsModal(false)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer"}}><X size={18}/></button>
      </div>
      <div style={{fontSize:13,color:"#cbd5e1",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:"#141e33",border:"1px solid #1e293b",borderRadius:8,padding:12}}>
          <strong>Platform Runtime:</strong> {isDesktop() ? "Windows Desktop Application (Electron + SQLite)" : "Web Browser (Vercel)"}
          <br/>
          <strong>Connectivity Status:</strong> {isOnline ? "Online — Connected" : "Offline — Local Mode"}
        </div>
        {dbStats && (
          <div style={{background:"#141e33",border:"1px solid #1e293b",borderRadius:8,padding:12}}>
            <strong>Local SQLite Database:</strong>
            <div style={{fontSize:11.5,color:"#94a3b8",fontFamily:"monospace",marginTop:4,wordBreak:"break-all"}}>
              {dbStats.path || dbStats.storageType}
            </div>
            {dbStats.tables && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:8,fontSize:12}}>
                {Object.entries(dbStats.tables).map(([t,c])=>(
                  <div key={t} style={{color:"#94a3b8"}}>• {t}: <strong style={{color:"#f8fafc"}}>{String(c)}</strong></div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{background:"#141e33",border:"1px solid #1e293b",borderRadius:8,padding:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <strong><Sparkles size={16} color="#38bdf8"/> Desktop Software Updates</strong>
            <span style={{fontSize:11,color:"#94a3b8"}}>
              {isDesktop() ? `Desktop v${updateState?.currentVersion || "1.1.0"}` : "Web v1.1.0"}
            </span>
          </div>

          {!isOnline && (
            <div style={{background:"#2e1065",color:"#e9d5ff",padding:"6px 10px",borderRadius:6,fontSize:12,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <AlertCircle size={14}/> Offline — Connect to internet to check for software updates.
            </div>
          )}

          <div style={{fontSize:12,color:"#cbd5e1",display:"flex",flexDirection:"column",gap:3,marginBottom:10}}>
            <div>Current Version: <strong>{updateState?.currentVersion || "1.1.0"}</strong></div>
            <div>Latest Release: <strong style={{color:updateState?.status==="available"?"#38bdf8":"#f8fafc"}}>{updateState?.latestVersion ? `v${updateState.latestVersion}` : "Up to date"}</strong></div>
            {updateState?.lastChecked && (
              <div style={{fontSize:11,color:"#94a3b8"}}>
                Last checked: {new Date(updateState.lastChecked).toLocaleTimeString()}
              </div>
            )}
          </div>

          {updateState?.status === "downloading" && updateState.progress && (
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#94a3b8",marginBottom:4}}>
                <span>Downloading update: {updateState.progress.percent}%</span>
                <span>{Math.round((updateState.progress.transferred || 0)/(1024*1024))}MB / {Math.round((updateState.progress.total || 0)/(1024*1024))}MB</span>
              </div>
              <div style={{width:"100%",height:6,background:"#0f172a",borderRadius:3,overflow:"hidden"}}>
                <div style={{width:`${updateState.progress.percent}%`,height:"100%",background:"#38bdf8",transition:"width 0.3s"}}/>
              </div>
            </div>
          )}

          {updateState?.status === "error" && (
            <div style={{background:"#450a0a",color:"#fca5a5",padding:"6px 10px",borderRadius:6,fontSize:12,marginBottom:8}}>
              Update status: {updateState.error}
            </div>
          )}

          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:4}}>
            {isDesktop() ? (
              <>
                {updateState?.status === "available" && (
                  <button type="button" className="collector-btn-primary" onClick={handleDownloadUpdate}>
                    <Download size={14}/> Download Update v{updateState.latestVersion}
                  </button>
                )}
                {updateState?.status === "downloaded" && (
                  <button type="button" className="collector-btn-primary" style={{background:"#16a34a"}} onClick={handleInstallAndRestart}>
                    <RefreshCw size={14}/> Install & Restart App
                  </button>
                )}
                {(updateState?.status === "idle" || updateState?.status === "not-available" || updateState?.status === "error") && (
                  <button type="button" className="collector-btn-secondary" disabled={isCheckingUpdate || !isOnline} onClick={handleCheckForUpdates}>
                    <RefreshCw size={14} className={isCheckingUpdate ? "spin" : ""}/> {isCheckingUpdate ? "Checking..." : "Check for Updates"}
                  </button>
                )}
                {updateState?.status === "error" && (
                  <button type="button" className="collector-btn-secondary" onClick={handleCheckForUpdates}>
                    Retry
                  </button>
                )}
              </>
            ) : (
              <div style={{fontSize:12,color:"#94a3b8"}}>
                Web version is automatically continuously updated on Vercel.
              </div>
            )}
            <a
              href="https://github.com/loveneeta/LoveneetSuite/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              style={{fontSize:11.5,color:"#38bdf8",textDecoration:"none",marginLeft:"auto"}}
            >
              Manual Download ↗
            </a>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:6}}>
          {isDesktop() && (
            <>
              <button type="button" className="collector-btn-secondary" onClick={handleBackup}><Download size={15}/> Backup Database</button>
              <button type="button" className="collector-btn-secondary" onClick={handleRestore}><Upload size={15}/> Restore Database</button>
            </>
          )}
          <button type="button" className="collector-btn-primary" style={{marginLeft:"auto"}} onClick={()=>setShowSettingsModal(false)}>Close</button>
        </div>
      </div>
    </div>
  </div>
)}</div></main></div>
}
createRoot(document.getElementById("root")).render(<App/>);
