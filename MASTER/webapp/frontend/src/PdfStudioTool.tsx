import React, { useMemo, useState } from "react";
import { FileText, Upload, Download, LockKeyhole, Sparkles, ShieldCheck, Files, FileImage, FileSpreadsheet, FileType, RotateCw, Scissors, Eraser, ScanText, WandSparkles, X, CheckCircle2, AlertCircle } from "lucide-react";
import "./pdf-studio.css";

type Tool = { id:string; name:string; description:string; category:string; accept?:string; multiple?:boolean; fields?:string[]; disabled?:boolean };
const tools:Tool[]=[
{id:"merge",name:"Merge PDF",description:"Combine multiple PDF files into one document.",category:"Organize PDF",multiple:true},
{id:"split",name:"Split PDF",description:"Split a PDF into one file per page.",category:"Organize PDF"},
{id:"remove-pages",name:"Remove pages",description:"Delete selected pages from a PDF.",category:"Organize PDF",fields:["pages"]},
{id:"extract-pages",name:"Extract pages",description:"Create a PDF containing selected pages.",category:"Organize PDF",fields:["pages"]},
{id:"organize-pages",name:"Organize PDF",description:"Reorder pages using a page sequence.",category:"Organize PDF",fields:["order"]},
{id:"scan-to-pdf",name:"Scan to PDF",description:"Create a PDF from image scans.",category:"Organize PDF",accept:"image/*",multiple:true},
{id:"compress",name:"Compress PDF",description:"Optimize PDF streams and embedded images.",category:"Optimize PDF"},
{id:"repair",name:"Repair PDF",description:"Rebuild and clean recoverable PDF structures.",category:"Optimize PDF"},
{id:"ocr",name:"OCR PDF",description:"Extract selectable text from text-based PDF pages.",category:"Optimize PDF"},
{id:"image-to-pdf",name:"JPG to PDF",description:"Combine JPG and image files into a PDF.",category:"Convert to PDF",accept:"image/*",multiple:true},
{id:"word-to-pdf",name:"WORD to PDF",description:"Convert DOCX using local LibreOffice.",category:"Convert to PDF",accept:".docx"},
{id:"pptx-to-pdf",name:"POWERPOINT to PDF",description:"Convert PPTX using local LibreOffice.",category:"Convert to PDF",accept:".pptx"},
{id:"excel-to-pdf",name:"EXCEL to PDF",description:"Convert XLSX using local LibreOffice.",category:"Convert to PDF",accept:".xlsx"},
{id:"html-to-pdf",name:"HTML to PDF",description:"Create a basic text-layout PDF from HTML.",category:"Convert to PDF",accept:".html,.htm,.txt"},
{id:"pdf-to-jpg",name:"PDF to JPG",description:"Render PDF pages as high-quality JPG images.",category:"Convert from PDF",fields:["pages","scale"]},
{id:"pdf-to-word",name:"PDF to WORD",description:"Extract PDF text into an editable DOCX file.",category:"Convert from PDF"},
{id:"pdf-to-pptx",name:"PDF to POWERPOINT",description:"Create one slide per PDF page.",category:"Convert from PDF"},
{id:"pdf-to-excel",name:"PDF to EXCEL",description:"Export page text into an Excel workbook.",category:"Convert from PDF"},
{id:"pdf-to-pdfa",name:"PDF to PDF/A",description:"Archival conversion; requires Ghostscript validation.",category:"Convert from PDF",disabled:true},
{id:"rotate",name:"Rotate PDF",description:"Rotate selected pages by 90, 180 or 270 degrees.",category:"Edit PDF",fields:["angle","pages"]},
{id:"watermark",name:"Add watermark",description:"Stamp text across selected PDF pages.",category:"Edit PDF",fields:["text","pages"]},
{id:"page-numbers",name:"Add page numbers",description:"Stamp page numbers at the bottom of each page.",category:"Edit PDF",fields:["pages"]},
{id:"crop",name:"Crop PDF",description:"Crop page margins consistently.",category:"Edit PDF",fields:["margin","pages"]},
{id:"redact",name:"Redact PDF",description:"Permanently redact matching selectable text.",category:"PDF Security",fields:["text"]},
{id:"forms",name:"PDF Forms",description:"Inspect interactive form fields and their current values.",category:"Edit PDF"},
{id:"sign",name:"Sign PDF",description:"Digital and drawn signing workflow is planned; not simulated.",category:"PDF Security",disabled:true},
{id:"unlock",name:"Unlock PDF",description:"Remove password protection when you know the password.",category:"PDF Security",fields:["password"]},
{id:"protect",name:"Protect PDF",description:"Encrypt a PDF with a new password.",category:"PDF Security",fields:["newPassword"]},
{id:"compare",name:"Compare PDF",description:"Compare extracted text page by page across two PDFs.",category:"PDF Security",multiple:true},
{id:"ai-summarizer",name:"AI Summarizer",description:"Local AI is not configured. Files are never sent to a cloud AI service.",category:"PDF Intelligence",disabled:true},
{id:"translate",name:"Translate PDF",description:"Local translation model is not configured.",category:"PDF Intelligence",disabled:true},
{id:"pdf-to-markdown",name:"PDF to Markdown",description:"Extract page text into a Markdown document.",category:"PDF Intelligence"}
];
const groups=["Organize PDF","Optimize PDF","Convert to PDF","Convert from PDF","Edit PDF","PDF Security","PDF Intelligence"];
const icons=[FileText,ShieldCheck,FileImage,FileType,ScanText,LockKeyhole,Sparkles];
export default function PdfStudioTool(){
 const [selected,setSelected]=useState("merge"),[files,setFiles]=useState<File[]>([]),[pages,setPages]=useState(""),[order,setOrder]=useState("1,2,3"),[angle,setAngle]=useState("90"),[scale,setScale]=useState("1.5"),[text,setText]=useState("CONFIDENTIAL"),[margin,setMargin]=useState("24"),[password,setPassword]=useState(""),[newPassword,setNewPassword]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState<{type:string;message:string}|null>(null);
 const tool=tools.find(t=>t.id===selected)!;
 const pickAccept=tool.accept || ".pdf,application/pdf";
 const choose=(id:string)=>{setSelected(id);setFiles([]);setNotice(null);setPages("");};
 const run=async()=>{if(tool.disabled){setNotice({type:"error",message:"This feature is not enabled in the local-only edition."});return;}if(!files.length){setNotice({type:"error",message:"Select the required file(s) first."});return;}
  setBusy(true);setNotice(null);
  try{const fd=new FormData();files.forEach(f=>fd.append("files",f));const options:any={pages,order,angle:Number(angle),scale:Number(scale),text,margin:Number(margin),password,newPassword};fd.append("options",JSON.stringify(options));
   const res=await fetch("/api/pdf-tools/"+selected,{method:"POST",body:fd});if(!res.ok){let message="PDF operation failed ("+res.status+")";try{message=(await res.json()).detail||message}catch{}throw new Error(message);}
   const blob=await res.blob();const disposition=res.headers.get("content-disposition")||"";const match=disposition.match(/filename="?([^";]+)"?/i);const filename=match?.[1]||selected+"_output.pdf";const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);setNotice({type:"success",message:"Completed. Your output download has started."});
  }catch(e:any){setNotice({type:"error",message:e.message||"Could not process this PDF."});}finally{setBusy(false);}
 };
 const fields=useMemo(()=>tool.fields||[],[tool]);
 return <div className="pdfstudio">
  <div className="pdfstudio-intro"><div><span className="pdfstudio-kicker"><ShieldCheck size={14}/> LOCAL DOCUMENT WORKSPACE</span><h2>PDF Studio</h2><p>PDF processing runs on your Loveneet Suite server. Files are not sent to online PDF services.</p></div><div className="pdfstudio-local"><LockKeyhole size={18}/><span><b>Local-only processing</b><small>No cloud PDF APIs</small></span></div></div>
  {notice&&<div className={"pdfstudio-notice "+notice.type}><span>{notice.type==="success"?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>}</span>{notice.message}<button onClick={()=>setNotice(null)}><X size={16}/></button></div>}
  <div className="pdfstudio-groups">{groups.map((group,i)=>{const Icon=icons[i];return <section className="pdfstudio-group" key={group}><header><span className={"pdfstudio-group-icon tone-"+i}><Icon size={18}/></span><div><h3>{group}</h3><small>{tools.filter(t=>t.category===group).length} tools</small></div></header><div className="pdfstudio-toolgrid">{tools.filter(t=>t.category===group).map(t=><button key={t.id} className={"pdfstudio-tool "+(selected===t.id?"selected":"")+(t.disabled?" disabled":"")} onClick={()=>choose(t.id)}><b>{t.name}</b><span>{t.description}</span>{t.disabled&&<small>Not configured</small>}</button>)}</div></section>})}</div>
  <section className="pdfstudio-workspace"><div className="pdfstudio-work-head"><div><span className="pdfstudio-kicker">SELECTED WORKFLOW</span><h3>{tool.name}</h3><p>{tool.description}</p></div><span className="pdfstudio-count">{files.length} file(s)</span></div>
   {tool.disabled&&<div className="pdfstudio-hint">This operation is intentionally unavailable in the local-only release. No document will be uploaded to a third-party service.</div>}
   <label className="pdfstudio-drop"><input type="file" accept={pickAccept} multiple={!!tool.multiple} onChange={e=>setFiles(Array.from(e.target.files||[]))}/><Upload size={24}/><b>Choose {tool.multiple?"file(s)":"a file"}</b><span>{files.length?files.map(f=>f.name).join(" · "):"Select files from this device"}</span><small>{tool.multiple?"Multiple files supported": "One file per operation"} · Max 100 MB per file</small></label>
   {!!fields.length&&<div className="pdfstudio-options">
    {fields.includes("pages")&&<label>Page numbers / ranges<input value={pages} onChange={e=>setPages(e.target.value)} placeholder="e.g. 1,3-5 (blank = all pages)"/></label>}
    {fields.includes("order")&&<label>New page order<input value={order} onChange={e=>setOrder(e.target.value)} placeholder="e.g. 3,1,2"/></label>}
    {fields.includes("angle")&&<label>Rotation<select value={angle} onChange={e=>setAngle(e.target.value)}><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></label>}
    {fields.includes("scale")&&<label>Render scale<select value={scale} onChange={e=>setScale(e.target.value)}><option value="1">Standard</option><option value="1.5">High</option><option value="2">Very high</option><option value="3">Print quality</option></select></label>}
    {fields.includes("text")&&<label>{selected==="redact"?"Exact text to redact":"Watermark text"}<input value={text} onChange={e=>setText(e.target.value)} placeholder="Enter text"/></label>}
    {fields.includes("margin")&&<label>Crop margin (points)<input type="number" min="0" max="200" value={margin} onChange={e=>setMargin(e.target.value)}/></label>}
    {fields.includes("password")&&<label>Current PDF password<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>}
    {fields.includes("newPassword")&&<label>New PDF password<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label>}
   </div>}
   <div className="pdfstudio-actions"><span>Original files are not modified.</span><button onClick={run} disabled={busy||tool.disabled}>{busy?"Processing locally…":"Run "+tool.name}<Download size={16}/></button></div>
  </section>
  <footer className="pdfstudio-foot">Local processing depends on the selected operation and installed server components. Verify sensitive redactions and converted files before distribution.</footer>
 </div>;
}
